/**
 * SPP: the day-ahead marginal energy component for balancing authority SPP.
 *
 * MEC is a published column here, and on the committed artifacts it agrees across more than a
 * thousand settlement locations to four decimal places, which is what makes it the system price
 * rather than a location's price. The two trading hubs are not the footprint and diverge sharply:
 * on 12 April 2026 the North Hub's daily mean LMP was -$0.1083 and the South Hub's -$8.6282 while
 * the day's MEC mean was +$2.7785.
 *
 * Two schema facts, both measured rather than assumed:
 *
 *   The `BAA` column appears in the 12 April 2026 file and is absent from the 8 March 2026 and
 *   2 November 2025 files. **The cutover date is unresolved and is not guessed at**: the adapter
 *   branches on whether the header actually has the column, and refuses any header it does not
 *   recognise rather than reading a legacy shape positionally.
 *
 *   `Interval` is a local hour-ending label and repeats on a fall-back day; `GMTIntervalEnd` is
 *   unique. Keying on the local label would collapse two real hours into one.
 */

import { splitCsvLine } from "@/lib/interconnection-queue/csv/preamble";
import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { operatingDayWindow } from "@/lib/uepi/operating-day";
import {
  UepiSourceError,
  type AdapterParseResult, type AdapterRecord, type ArtifactRequest,
  type RejectedRow, type UepiSourceAdapter,
} from "@/lib/uepi/source/types";

const BENCHMARK = benchmarkFor("uepi-spp");

/** The carrier, and the second location the uniformity check reads. */
const CARRIER_LOCATION = "SPPNORTH_HUB";
const CROSS_CHECK_LOCATION = "SPPSOUTH_HUB";

/** The Integrated Marketplace balancing authority. `SWPW` is the western market and is excluded. */
const CANONICAL_BAA = "SPP";

const MODERN_HEADER = [
  "Interval", "GMTIntervalEnd", "BAA", "Settlement Location", "Pnode", "LMP", "MLC", "MCC", "MEC",
] as const;
const LEGACY_HEADER = [
  "Interval", "GMTIntervalEnd", "Settlement Location", "Pnode", "LMP", "MLC", "MCC", "MEC",
] as const;

/**
 * The column names, reduced to a form that survives SPP's own spelling of them.
 *
 * A thirteen-month production backfill found the same nine columns published three ways: the
 * documented casing, and on 4 June 2026 an all-uppercase header whose fourth column reads
 * `SETTLEMENT_LOCATION` rather than `Settlement Location`. Lowercasing and treating an underscore
 * as a space recognises all of them while still refusing a header with different *columns* --
 * which is the distinction that matters, because the failure this guards against is reading MEC
 * out of the wrong field, not reading it out of a differently-spelled one.
 */
function canonicalColumn(name: string): string {
  return name.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
}

function headerShape(header: readonly string[]): string {
  return header.map(canonicalColumn).join(",");
}

function compact(date: string): string {
  return date.replaceAll("-", "");
}

/**
 * SPP's GMT interval end, in the several ways SPP writes it.
 *
 * Measured across a thirteen-month backfill, the same field appears as `09/23/2026 06:00:00`,
 * `4/1/2026 6:00` and `6/1/2026 06:00`: the seconds and the zero-padding are both optional, and
 * they vary by day rather than by era. The month, day and hour are therefore accepted at one or
 * two digits and the seconds as absent, and nothing else is loosened -- a two-digit year, a
 * day-first ordering or a timezone suffix still fails, because each of those would change which
 * instant the row means.
 */
function parseGmtIntervalEnd(value: string): number {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (match === null) return Number.NaN;
  const [, month, day, year, hour, minute, second] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second ?? "0"));
}

export const sppAdapter: UepiSourceAdapter = {
  seriesId: "uepi-spp",
  sourceInterfaceSlug: BENCHMARK.sourceInterfaceSlug,
  // Commercial publication needs written authorization from an SPP officer, which Urdais does
  // not hold, so this source is retained internally only.
  retrievalPurpose: "research",

  artifactsFor(operatingDate: string): ArtifactRequest[] {
    const [year, month] = operatingDate.split("-");
    return [{
      label: "day",
      url: "https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location"
        + `?path=/${year}/${month}/By_Day/DA-LMP-SL-${compact(operatingDate)}0100.csv`,
    }];
  },

  parse(operatingDate: string, artifacts): AdapterParseResult {
    const artifact = artifacts.get("day");
    if (artifact === undefined) {
      throw new UepiSourceError(this.seriesId, "SOURCE_UNAVAILABLE", `no artifact for ${operatingDate}`);
    }
    const lines = artifact.body.toString("utf8").split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length <= 1) {
      throw new UepiSourceError(this.seriesId, "EMPTY_SOURCE", `${artifact.url} holds no data rows`);
    }

    const header = splitCsvLine(lines[0]!).map((value) => value.trim());
    const joined = header.join(",");
    const shape = headerShape(header);
    const schemaVariant = shape === headerShape(MODERN_HEADER) ? "with_baa"
      : shape === headerShape(LEGACY_HEADER) ? "without_baa"
        : null;
    if (schemaVariant === null) {
      // No positional fallback. A header Urdais has never seen is a schema change to look at, not
      // a shape to guess: reading MEC from the wrong column would be silent and wrong.
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `unrecognised header ${JSON.stringify(joined)}; the adapter knows only `
        + `${JSON.stringify(MODERN_HEADER.join(","))} and ${JSON.stringify(LEGACY_HEADER.join(","))}, `
        + "in any casing and with either spelling of Settlement Location");
    }
    // Columns are located by canonical name, so the uppercase and underscored spellings resolve
    // to the same field rather than to -1.
    const columnIndex = new Map(header.map((name, position) => [canonicalColumn(name), position]));
    const at = (values: string[], column: string) =>
      (values[columnIndex.get(canonicalColumn(column)) ?? -1] ?? "").trim();

    const window = operatingDayWindow(BENCHMARK, operatingDate);
    const dayStart = Date.parse(window.startUtc);
    const dayEnd = Date.parse(window.endUtc);

    const rejected: RejectedRow[] = [];
    const records: AdapterRecord[] = [];
    const crossCheckRecords: AdapterRecord[] = [];
    let examined = 0;
    let westernRowCount = 0;

    for (let index = 1; index < lines.length; index += 1) {
      examined += 1;
      const sourceRow = index + 1;
      const values = splitCsvLine(lines[index]!);
      const location = at(values, "Settlement Location");
      const baa = schemaVariant === "with_baa" ? at(values, "BAA") : null;

      if (baa !== null && baa !== CANONICAL_BAA) {
        westernRowCount += 1;
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `balancing authority ${baa} is not the Integrated Marketplace` });
        continue;
      }
      if (location !== CARRIER_LOCATION && location !== CROSS_CHECK_LOCATION) {
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `${location} is not the carrier or the cross-check location` });
        continue;
      }

      const gmtEnd = at(values, "GMTIntervalEnd");
      const endMs = parseGmtIntervalEnd(gmtEnd);
      if (Number.isNaN(endMs)) {
        throw new UepiSourceError(this.seriesId, "INVALID_TIMESTAMP",
          `row ${sourceRow} has GMTIntervalEnd '${gmtEnd}', which is not MM/DD/YYYY HH:mm:ss`);
      }
      // Hour-ending: the interval begins an hour before the stamp SPP prints.
      const startMs = endMs - 3_600_000;
      if (startMs < dayStart || startMs >= dayEnd) {
        rejected.push({ sourceRow, reason: "UNSUPPORTED_SOURCE_ROW",
          detail: `${gmtEnd} falls outside operating day ${operatingDate}` });
        continue;
      }

      const mec = at(values, "MEC");
      if (mec === "") {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} (${location} ${gmtEnd}) has a blank MEC; a blank is never read as zero`);
      }
      if (!/^-?\d+(\.\d+)?$/.test(mec)) {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} (${location} ${gmtEnd}) has MEC '${mec}', which is not a decimal number`);
      }

      const isCarrier = location === CARRIER_LOCATION;
      const target = isCarrier ? records : crossCheckRecords;
      const intervalStartUtc = new Date(startMs).toISOString();
      if (target.some((existing) => existing.intervalStartUtc === intervalStartUtc)) {
        throw new UepiSourceError(this.seriesId, "DUPLICATE_INTERVAL",
          `${location} has two rows for ${intervalStartUtc}; a repeated local hour is two instants, not one`);
      }
      target.push({
        intervalStartUtc,
        hourOrdinal: target.length + 1,
        benchmarkPrice: mec,
        raw: {
          seriesId: this.seriesId,
          rowOrdinal: sourceRow,
          nativeOperatingDate: operatingDate,
          nativeIntervalLabel: at(values, "Interval"),
          nativeIntervalUtc: new Date(endMs).toISOString(),
          nativeValue: mec,
          nativeComponents: {
            LMP: at(values, "LMP"), MLC: at(values, "MLC"), MCC: at(values, "MCC"), MEC: mec,
            "Settlement Location": location, Pnode: at(values, "Pnode"),
            ...(baa === null ? {} : { BAA: baa }),
          },
          nativeSourceVersion: { schemaVariant, ...(baa === null ? {} : { BAA: baa }) },
          rawPayload: Object.fromEntries(header.map((column, position) => [column, values[position] ?? ""])),
        },
      });
    }

    if (records.length === 0) {
      throw new UepiSourceError(this.seriesId, "MISSING_CANONICAL_BENCHMARK",
        `${artifact.url} holds no ${CARRIER_LOCATION} rows for ${operatingDate}`);
    }

    const warnings: string[] = [];
    if (schemaVariant === "without_baa") {
      // The specification's own rule for the legacy shape: read MEC from the North Hub, because
      // that MEC matched the system MEC on every file examined.
      warnings.push(
        "this file predates the BAA column; MEC is read from the North Hub under the specification's "
        + "legacy rule, and no western rows can be identified or excluded");
    }

    return {
      seriesId: this.seriesId,
      operatingDate,
      records,
      crossCheckRecords,
      rejected,
      examinedRowCount: examined,
      sourceSchema: {
        header: joined,
        schemaVariant,
        carrierLocation: CARRIER_LOCATION,
        crossCheckLocation: CROSS_CHECK_LOCATION,
        westernRowsExcluded: String(westernRowCount),
      },
      warnings,
    };
  },
};
