/**
 * ERCOT: the day-ahead settlement point price for the ERCOT Hub Average 345 kV Hub.
 *
 * `HB_HUBAVG` is ERCOT's own published settlement point, and the specification is explicit that it
 * is stored as published rather than recomputed: the day-ahead hub average is a shift-factor
 * construct, and the simple mean of the four regional hubs differs from it by up to half a cent.
 * The request itself names the settlement point, so the response contains one hub and the adapter
 * never has to filter a footprint of nodes.
 *
 * Daylight saving, measured on the committed artifacts rather than assumed:
 *
 *   Spring forward publishes **23 rows** and omits the hour-ending label entirely -- 8 March 2026
 *   runs 01:00, 02:00, 04:00 … 24:00, with no 03:00.
 *
 *   Fall back publishes **25 rows**, with hour-ending 02:00 printed twice, and the two are told
 *   apart by `DSTFlag`: the daylight-time occurrence carries `true` and the standard-time repeat
 *   carries `false`. On 2 November 2025 those two hours cleared at 48.25 and 46.44.
 *
 * That flag is the whole reason this market is tractable. Without it the repeated hour would be
 * two identical labels and a guess, which is the situation NYISO is actually in.
 */

import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { ercotTokenCache } from "@/lib/uepi/source/auth/ercot-token";
import {
  UepiSourceError,
  type AdapterParseResult, type AdapterRecord, type ArtifactRequest,
  type RejectedRow, type SourceAuthorization, type UepiSourceAdapter,
} from "@/lib/uepi/source/types";
import { expectedIntervalStarts, operatingDayWindow } from "@/lib/uepi/operating-day";

const BENCHMARK = benchmarkFor("uepi-ercot");

/** The ERCOT Hub Average 345 kV Hub. Never HB_NORTH, HB_BUSAVG, HB_PAN or a load zone. */
const CANONICAL_SETTLEMENT_POINT = "HB_HUBAVG";

export const ERCOT_REPORT = "np4-190-cd";
export const ERCOT_ENDPOINT =
  `https://api.ercot.com/api/public-reports/${ERCOT_REPORT}/dam_stlmnt_pnt_prices`;

const REQUIRED_FIELDS = ["deliveryDate", "hourEnding", "settlementPoint", "settlementPointPrice", "DSTFlag"] as const;

type ErcotPayload = {
  fields?: { name?: string }[];
  data?: unknown[][];
  _meta?: { totalRecords?: number; totalPages?: number; currentPage?: number };
};

/**
 * The hour-ending label ERCOT prints for the hour beginning at an instant.
 *
 * It is the *starting* clock hour plus one, and not the wall-clock time an hour later. The two
 * differ on exactly one day a year, and the committed spring-forward artifact is what settles it:
 * the hour that begins 01:00 CST ends at 03:00 CDT by the clock, and ERCOT labels it `02:00`. A
 * label computed from the ending wall-clock would ask that file for an hour it does not contain.
 */
function hourEndingLabel(intervalStartUtc: string): string {
  const startHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: BENCHMARK.operatingTimezone, hour12: false, hour: "2-digit",
  }).format(new Date(intervalStartUtc))) % 24;
  return `${String(startHour + 1).padStart(2, "0")}:00`;
}

/** Whether an instant falls in daylight time in ERCOT's clock, which is what `DSTFlag` reports. */
function isDaylightTime(intervalStartUtc: string): boolean {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: BENCHMARK.operatingTimezone, timeZoneName: "short",
  }).formatToParts(new Date(intervalStartUtc)).find((part) => part.type === "timeZoneName")?.value ?? "";
  return name.includes("DT");
}

export const ercotAdapter: UepiSourceAdapter = {
  seriesId: "uepi-ercot",
  sourceInterfaceSlug: BENCHMARK.sourceInterfaceSlug,
  // As for every other UEPI source: the interface is not production-approved, so the retrieval is
  // recorded as research. Publication is a separate decision taken at read time.
  retrievalPurpose: "research",

  get authorization(): SourceAuthorization {
    return {
      headers: () => ercotTokenCache.authorizationHeaders(),
      invalidate: () => ercotTokenCache.invalidate(),
    };
  },

  artifactsFor(operatingDate: string): ArtifactRequest[] {
    // The settlement point is a query parameter, so ERCOT returns one hub rather than the whole
    // footprint. A page size of 100 covers a 25-hour day with room to notice if that ever changes.
    return [{
      label: "day",
      url: `${ERCOT_ENDPOINT}?deliveryDateFrom=${operatingDate}&deliveryDateTo=${operatingDate}`
        + `&settlementPoint=${CANONICAL_SETTLEMENT_POINT}&size=100`,
    }];
  },

  parse(operatingDate: string, artifacts): AdapterParseResult {
    const artifact = artifacts.get("day");
    if (artifact === undefined) {
      throw new UepiSourceError(this.seriesId, "SOURCE_UNAVAILABLE", `no artifact for ${operatingDate}`);
    }

    let payload: ErcotPayload;
    try {
      payload = JSON.parse(artifact.body.toString("utf8")) as ErcotPayload;
    } catch {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH", "the response is not JSON");
    }

    const fieldNames = (payload.fields ?? []).map((field) => String(field.name ?? ""));
    for (const required of REQUIRED_FIELDS) {
      if (!fieldNames.includes(required)) {
        throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
          `the NP4-190-CD field list is missing '${required}'; it reads ${JSON.stringify(fieldNames)}`);
      }
    }
    // Rows are positional arrays described by `fields`, so the column order is read from the
    // payload rather than assumed. A reordered response is then a non-event instead of a defect.
    const index = Object.fromEntries(
      REQUIRED_FIELDS.map((name) => [name, fieldNames.indexOf(name)]),
    ) as Record<(typeof REQUIRED_FIELDS)[number], number>;

    const rows = payload.data ?? [];
    if (rows.length === 0) {
      throw new UepiSourceError(this.seriesId, "EMPTY_SOURCE", `no rows for ${operatingDate}`);
    }
    const totalPages = payload._meta?.totalPages ?? 1;
    if (totalPages > 1) {
      // One settlement point for one day cannot legitimately paginate. If it ever does, the day is
      // incomplete and must fail rather than average what arrived.
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `the response claims ${totalPages} pages for a single settlement point and day`);
    }

    const window = operatingDayWindow(BENCHMARK, operatingDate);
    const expected = expectedIntervalStarts(window);
    const rejected: RejectedRow[] = [];

    type Candidate = { hourEnding: string; dstFlag: boolean; price: string; rowOrdinal: number; raw: unknown[] };
    const candidates: Candidate[] = [];

    rows.forEach((row, position) => {
      const sourceRow = position + 1;
      const settlementPoint = String(row[index.settlementPoint] ?? "");
      if (settlementPoint !== CANONICAL_SETTLEMENT_POINT) {
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `${settlementPoint} is not the ERCOT Hub Average 345 kV Hub` });
        return;
      }
      const deliveryDate = String(row[index.deliveryDate] ?? "");
      if (deliveryDate !== operatingDate) {
        rejected.push({ sourceRow, reason: "UNSUPPORTED_SOURCE_ROW",
          detail: `delivery date ${deliveryDate} is not ${operatingDate}` });
        return;
      }
      const rawPrice = row[index.settlementPointPrice];
      if (rawPrice === null || rawPrice === undefined || rawPrice === "") {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} has no settlement point price; a blank is never read as zero`);
      }
      if (typeof rawPrice !== "number" || !Number.isFinite(rawPrice)) {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} has a non-numeric settlement point price`);
      }
      candidates.push({
        hourEnding: String(row[index.hourEnding] ?? ""),
        dstFlag: row[index.DSTFlag] === true || String(row[index.DSTFlag]).toLowerCase() === "y",
        // The API returns a JSON number. It is rendered back to a decimal string without
        // reformatting, because the canonical value is a decimal and not a float.
        price: String(rawPrice),
        rowOrdinal: sourceRow,
        raw: row,
      });
    });

    if (candidates.length === 0) {
      throw new UepiSourceError(this.seriesId, "MISSING_CANONICAL_BENCHMARK",
        `the response holds no ${CANONICAL_SETTLEMENT_POINT} rows for ${operatingDate}`);
    }
    if (candidates.length !== expected.length) {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `${candidates.length} rows for an operating day of ${expected.length} hours`);
    }

    // Each expected instant is matched to the row that claims its hour-ending label and its
    // daylight state. On a fall-back day that is the only thing separating two rows labelled
    // 02:00, and matching by label alone would put them in either order.
    const unused = [...candidates];
    const records: AdapterRecord[] = expected.map((intervalStartUtc, position) => {
      const label = hourEndingLabel(intervalStartUtc);
      const daylight = isDaylightTime(intervalStartUtc);
      let found = unused.findIndex((candidate) =>
        candidate.hourEnding === label && candidate.dstFlag === daylight);
      if (found === -1) {
        // Outside a transition, the flag is uninformative and only the label matters.
        found = unused.findIndex((candidate) => candidate.hourEnding === label);
      }
      if (found === -1) {
        throw new UepiSourceError(this.seriesId, "INVALID_TIMESTAMP",
          `no row for hour ending ${label}${daylight ? " (daylight time)" : ""} on ${operatingDate}`);
      }
      const [candidate] = unused.splice(found, 1) as [Candidate];
      return {
        intervalStartUtc,
        hourOrdinal: position + 1,
        benchmarkPrice: candidate.price,
        raw: {
          seriesId: this.seriesId,
          rowOrdinal: candidate.rowOrdinal,
          nativeOperatingDate: operatingDate,
          nativeIntervalLabel: candidate.hourEnding,
          // ERCOT publishes no UTC field; the instant is Urdais's reading of the hour-ending
          // label together with DSTFlag.
          nativeIntervalUtc: null,
          nativeValue: candidate.price,
          nativeComponents: {
            settlementPoint: CANONICAL_SETTLEMENT_POINT,
            hourEnding: candidate.hourEnding,
            DSTFlag: String(candidate.dstFlag),
          },
          nativeSourceVersion: { report: ERCOT_REPORT, dstFlag: String(candidate.dstFlag) },
          rawPayload: Object.fromEntries(fieldNames.map((name, column) => [name, candidate.raw[column] ?? null])),
        },
      };
    });

    return {
      seriesId: this.seriesId,
      operatingDate,
      records,
      // ERCOT publishes the benchmark as a column and the specification asks for no second
      // carrier, so there is nothing to cross-check. An empty list is the honest answer.
      crossCheckRecords: [],
      rejected,
      examinedRowCount: rows.length,
      sourceSchema: {
        fields: fieldNames.join(","),
        report: ERCOT_REPORT,
        settlementPoint: CANONICAL_SETTLEMENT_POINT,
        totalRecords: String(payload._meta?.totalRecords ?? rows.length),
      },
      warnings: [],
    };
  },
};
