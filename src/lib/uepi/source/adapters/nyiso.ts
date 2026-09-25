/**
 * NYISO: the day-ahead reference-bus system marginal price, from MIS report P-2A.
 *
 * NYISO publishes no statewide LBMP and no hub. Each of the eleven internal zones is already a
 * load-weighted zonal price, so the market-wide object is the reference-bus lambda the tariff
 * builds every zonal LBMP from, and the specification derives it from one internal zone:
 *
 *   lambda = LBMP - Marginal Cost Losses + Marginal Cost Congestion
 *
 * Measured against the committed artifacts, that residual agrees across internal zones to within
 * one cent, which is rounding rather than a second price. The carrier zone is WEST.
 *
 * The parser's hard problem is not the arithmetic. It is that a fall-back day prints `01:00`
 * twice, with nothing in the row to say which occurrence is which -- verified in the 2 November
 * 2025 artifact, where WEST reads 51.44 and then 50.08 under the same label. Source row order is
 * the only discriminator, so this adapter assigns instants positionally from local midnight and
 * then checks each assignment back against the printed label. A parser that deduplicated on the
 * timestamp string would silently drop an hour; one that averaged the pair would invent a price.
 */

import { splitCsvLine } from "@/lib/interconnection-queue/csv/preamble";
import { readZipDirectory, readZipMember } from "@/lib/power-delivery/planning/xlsx/zip";
import { sumDecimal } from "@/lib/uepi/decimal";
import { expectedIntervalStarts, operatingDayWindow } from "@/lib/uepi/operating-day";
import { benchmarkFor } from "@/lib/uepi/benchmarks";
import {
  UepiSourceError,
  type AdapterRecord, type AdapterParseResult, type ArtifactRequest,
  type RejectedRow, type RetrievedArtifact, type UepiSourceAdapter,
} from "@/lib/uepi/source/types";

const BENCHMARK = benchmarkFor("uepi-nyiso");

/** The eleven internal zones. `H Q`, `NPX`, `O H` and `PJM` are external proxies and never used. */
const INTERNAL_ZONES = new Set([
  "WEST", "GENESE", "CENTRL", "NORTH", "MHK VL", "CAPITL", "HUD VL", "MILLWD", "DUNWOD", "N.Y.C.", "LONGIL",
]);

/** The carrier zone, and the second zone the uniformity check reads. */
const CARRIER_ZONE = "WEST";
const CROSS_CHECK_ZONE = "CENTRL";

const REQUIRED_COLUMNS = [
  "Time Stamp", "Name", "PTID",
  "LBMP ($/MWHr)", "Marginal Cost Losses ($/MWHr)", "Marginal Cost Congestion ($/MWHr)",
] as const;

function compact(date: string): string {
  return date.replaceAll("-", "");
}

/** `MM/DD/YYYY HH:mm` as NYISO prints it, for the label check. */
function nyisoLabel(instantUtc: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BENCHMARK.operatingTimezone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(instantUtc));
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = field("hour") === "24" ? "00" : field("hour");
  return `${field("month")}/${field("day")}/${field("year")} ${hour}:${field("minute")}`;
}

/** The day's rows out of the daily CSV, or out of the monthly archive when the daily URL is gone. */
function dayCsv(operatingDate: string, artifacts: ReadonlyMap<string, RetrievedArtifact>): {
  text: string; artifact: RetrievedArtifact; from: "daily" | "monthly_archive";
} {
  const daily = artifacts.get("daily");
  if (daily !== undefined) return { text: daily.body.toString("utf8"), artifact: daily, from: "daily" };

  const monthly = artifacts.get("monthly");
  if (monthly === undefined) {
    throw new UepiSourceError("uepi-nyiso", "SOURCE_UNAVAILABLE",
      `neither the daily CSV nor the monthly archive was retrieved for ${operatingDate}`);
  }
  const member = `${compact(operatingDate)}damlbmp_zone.csv`;
  const directory = readZipDirectory(monthly.body);
  const entry = directory.get(member);
  if (entry === undefined) {
    throw new UepiSourceError("uepi-nyiso", "SOURCE_UNAVAILABLE",
      `the monthly archive holds no member ${member}; it holds ${[...directory.keys()].slice(0, 3).join(", ")}`);
  }
  return { text: readZipMember(monthly.body, entry).toString("utf8"), artifact: monthly, from: "monthly_archive" };
}

export const nyisoAdapter: UepiSourceAdapter = {
  seriesId: "uepi-nyiso",
  sourceInterfaceSlug: BENCHMARK.sourceInterfaceSlug,
  /**
   * `research`, and not because the rights determination says so.
   *
   * The platform refuses a `production` retrieval from a source interface that is not
   * production-approved, and production approval requires both terms axes to read `permitted`.
   * An ambiguous source cannot reach that state without a legal answer Urdais does not have, so
   * every UEPI retrieval is recorded as research for now. It constrains nothing this phase does:
   * retention and calculation proceed, and whether a value may be *displayed* is decided by
   * `source_use_permissions` at read time, not by the purpose a file was fetched under.
   */
  retrievalPurpose: "research",

  artifactsFor(operatingDate: string): ArtifactRequest[] {
    const month = `${compact(operatingDate).slice(0, 6)}01`;
    return [
      // Recent days are served here; older ones 404, which is ordinary rather than a failure.
      { label: "daily", url: `http://mis.nyiso.com/public/csv/damlbmp/${compact(operatingDate)}damlbmp_zone.csv`, optional: true },
      { label: "monthly", url: `http://mis.nyiso.com/public/csv/damlbmp/${month}damlbmp_zone_csv.zip`, optional: true },
    ];
  },

  parse(operatingDate: string, artifacts): AdapterParseResult {
    const { text, artifact, from } = dayCsv(operatingDate, artifacts);
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length === 0) {
      throw new UepiSourceError(this.seriesId, "EMPTY_SOURCE", `${artifact.url} holds no rows`);
    }

    const header = splitCsvLine(lines[0]!).map((value) => value.trim());
    for (const column of REQUIRED_COLUMNS) {
      if (!header.includes(column)) {
        throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
          `the P-2A header is missing '${column}'; it reads ${JSON.stringify(header)}`);
      }
    }
    const at = (values: string[], column: string) => (values[header.indexOf(column)] ?? "").trim();

    const window = operatingDayWindow(BENCHMARK, operatingDate);
    const expected = expectedIntervalStarts(window);
    const rejected: RejectedRow[] = [];
    const records: AdapterRecord[] = [];
    const crossCheckRecords: AdapterRecord[] = [];
    let examined = 0;

    for (let index = 1; index < lines.length; index += 1) {
      examined += 1;
      const sourceRow = index + 1;
      const values = splitCsvLine(lines[index]!);
      const name = at(values, "Name");
      const stamp = at(values, "Time Stamp");

      if (!INTERNAL_ZONES.has(name)) {
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `${name || "(unnamed)"} is not an internal NYISO zone` });
        continue;
      }
      if (name !== CARRIER_ZONE && name !== CROSS_CHECK_ZONE) {
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `${name} is an internal zone but not the carrier or the cross-check zone` });
        continue;
      }
      if (!stamp.startsWith(`${operatingDate.slice(5, 7)}/${operatingDate.slice(8, 10)}/${operatingDate.slice(0, 4)}`)) {
        rejected.push({ sourceRow, reason: "UNSUPPORTED_SOURCE_ROW",
          detail: `'${stamp}' does not belong to operating day ${operatingDate}` });
        continue;
      }

      const lbmp = at(values, "LBMP ($/MWHr)");
      const losses = at(values, "Marginal Cost Losses ($/MWHr)");
      const congestion = at(values, "Marginal Cost Congestion ($/MWHr)");
      if (lbmp === "" || losses === "" || congestion === "") {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} (${name} ${stamp}) is missing a component; a blank is never read as zero`);
      }

      let lambda: string;
      try {
        // The published congestion column is added after losses are subtracted. The sign is
        // pinned by the files rather than by memory: every other combination disagrees across
        // zones by dollars, and this one agrees to a cent.
        lambda = sumDecimal([
          { value: lbmp, sign: 1 }, { value: losses, sign: -1 }, { value: congestion, sign: 1 },
        ]);
      } catch (error) {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} (${name} ${stamp}) has an unparseable component: ${error instanceof Error ? error.message : String(error)}`);
      }

      const isCarrier = name === CARRIER_ZONE;
      const position = (isCarrier ? records : crossCheckRecords).length;
      const intervalStartUtc = expected[position];
      if (intervalStartUtc === undefined) {
        throw new UepiSourceError(this.seriesId, "DUPLICATE_INTERVAL",
          `${name} has more rows than the ${expected.length} hours of ${operatingDate}`);
      }
      // Positional assignment, checked back against what the file printed. On a fall-back day the
      // two 01:00 rows map to two different instants, and any drift between position and label --
      // a missing hour, a reordered file -- fails here instead of shifting a whole day silently.
      if (nyisoLabel(intervalStartUtc) !== stamp) {
        throw new UepiSourceError(this.seriesId, "INVALID_TIMESTAMP",
          `row ${sourceRow} prints '${stamp}' where position ${position + 1} of ${operatingDate} is '${nyisoLabel(intervalStartUtc)}'`);
      }

      const record: AdapterRecord = {
        intervalStartUtc,
        hourOrdinal: position + 1,
        benchmarkPrice: lambda,
        raw: {
          seriesId: this.seriesId,
          rowOrdinal: sourceRow,
          nativeOperatingDate: operatingDate,
          nativeIntervalLabel: stamp,
          // NYISO publishes no UTC field at all; the instant above is Urdais's reading.
          nativeIntervalUtc: null,
          nativeValue: lbmp,
          nativeComponents: {
            "LBMP ($/MWHr)": lbmp,
            "Marginal Cost Losses ($/MWHr)": losses,
            "Marginal Cost Congestion ($/MWHr)": congestion,
            PTID: at(values, "PTID"),
            Name: name,
          },
          nativeSourceVersion: { artifact: from },
          rawPayload: Object.fromEntries(header.map((column, position2) => [column, values[position2] ?? ""])),
        },
      };
      (isCarrier ? records : crossCheckRecords).push(record);
    }

    if (records.length === 0) {
      throw new UepiSourceError(this.seriesId, "MISSING_CANONICAL_BENCHMARK",
        `${artifact.url} holds no ${CARRIER_ZONE} rows for ${operatingDate}`);
    }

    return {
      seriesId: this.seriesId,
      operatingDate,
      records,
      crossCheckRecords,
      rejected,
      examinedRowCount: examined,
      sourceSchema: {
        header: header.join(","),
        artifact: from,
        carrierZone: CARRIER_ZONE,
        crossCheckZone: CROSS_CHECK_ZONE,
      },
      warnings: records.length === expected.length ? [] : [
        `${records.length} carrier rows against ${expected.length} expected hours for ${operatingDate}`,
      ],
    };
  },
};
