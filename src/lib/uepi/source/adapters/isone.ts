/**
 * ISO-NE: the final day-ahead Hub LMP at location 4000.
 *
 * Market Rule 1 §III.2.8 makes the Hub price the arithmetic average of the Hub's nodes, so the ISO
 * has already done the aggregation, and the benchmark is the published `LmpTotal` at that one
 * location. This adapter exists because the authenticated payload has now been observed: until
 * this phase Urdais held only a derived schema, which is why the market was refused rather than
 * implemented.
 *
 * What the observed payload settles, and the specification recorded as unresolved:
 *
 *   **Hour beginning, with an explicit offset.** `BeginDate` reads
 *   `2026-09-23T00:00:00.000-04:00`, so the instant is stated by the source rather than inferred.
 *
 *   **Daylight saving needs no convention at all.** Spring forward returns 23 hours and fall back
 *   25, and on the fall-back day the repeated local hour is disambiguated by the offset itself
 *   (`-04:00` then `-05:00`). This is the only UEPI source that hands over unambiguous instants,
 *   and it is why nothing here counts rows or trusts their order.
 *
 * The field names in the frozen research -- `LmpTotal`, `EnergyComponent`, `CongestionComponent`,
 * `LossComponent` -- are confirmed exactly. Nothing in the payload contradicted the specification.
 */

import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { ISONE_API_BASE, isoneAuthorizationHeaders } from "@/lib/uepi/source/auth/isone-basic";
import { expectedIntervalStarts, operatingDayWindow } from "@/lib/uepi/operating-day";
import {
  UepiSourceError,
  type AdapterParseResult, type AdapterRecord, type ArtifactRequest,
  type RejectedRow, type SourceAuthorization, type UepiSourceAdapter,
} from "@/lib/uepi/source/types";

const BENCHMARK = benchmarkFor("uepi-iso-ne");

/** The internal Hub. Not a load zone, and not a node. */
const CANONICAL_LOCATION_ID = "4000";

type IsoneLmp = {
  BeginDate?: string;
  Location?: { "@LocId"?: string | number; "@LocType"?: string; $?: string };
  LmpTotal?: number;
  EnergyComponent?: number;
  CongestionComponent?: number;
  LossComponent?: number;
};

function compact(operatingDate: string): string {
  return operatingDate.replaceAll("-", "");
}

export const isoneAdapter: UepiSourceAdapter = {
  seriesId: "uepi-iso-ne",
  sourceInterfaceSlug: BENCHMARK.sourceInterfaceSlug,
  retrievalPurpose: "research",

  get authorization(): SourceAuthorization {
    return {
      headers: async () => isoneAuthorizationHeaders(),
      // Basic authentication holds no token to discard: the credential is either right or wrong,
      // and re-presenting it changes nothing. The hook exists to satisfy the interface.
      invalidate: () => {},
    };
  },

  artifactsFor(operatingDate: string): ArtifactRequest[] {
    return [{
      label: "day",
      url: `${ISONE_API_BASE}/hourlylmp/da/final/day/${compact(operatingDate)}/location/${CANONICAL_LOCATION_ID}.json`,
    }];
  },

  parse(operatingDate: string, artifacts): AdapterParseResult {
    const artifact = artifacts.get("day");
    if (artifact === undefined) {
      throw new UepiSourceError(this.seriesId, "SOURCE_UNAVAILABLE", `no artifact for ${operatingDate}`);
    }

    let payload: { HourlyLmps?: { HourlyLmp?: IsoneLmp | IsoneLmp[] } };
    try {
      payload = JSON.parse(artifact.body.toString("utf8")) as typeof payload;
    } catch {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH", "the response is not JSON");
    }
    const container = payload.HourlyLmps;
    if (container === undefined || container.HourlyLmp === undefined) {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `the response has no HourlyLmps.HourlyLmp; its keys are ${JSON.stringify(Object.keys(payload))}`);
    }
    // A single-hour day would arrive as an object rather than an array. Not seen, and cheap to
    // survive.
    const rows = Array.isArray(container.HourlyLmp) ? container.HourlyLmp : [container.HourlyLmp];
    if (rows.length === 0) {
      throw new UepiSourceError(this.seriesId, "EMPTY_SOURCE", `no hourly rows for ${operatingDate}`);
    }

    const window = operatingDayWindow(BENCHMARK, operatingDate);
    const expected = new Set(expectedIntervalStarts(window));
    const rejected: RejectedRow[] = [];
    const records: AdapterRecord[] = [];
    const seen = new Set<string>();

    rows.forEach((row, position) => {
      const sourceRow = position + 1;
      const locationId = String(row.Location?.["@LocId"] ?? "");
      if (locationId !== CANONICAL_LOCATION_ID) {
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `location ${locationId || "(absent)"} is not the internal Hub` });
        return;
      }
      const beginDate = String(row.BeginDate ?? "");
      const beginMs = Date.parse(beginDate);
      if (Number.isNaN(beginMs)) {
        throw new UepiSourceError(this.seriesId, "INVALID_TIMESTAMP",
          `row ${sourceRow} has BeginDate '${beginDate}'`);
      }
      // The offset in BeginDate is what makes this unambiguous; parsing it to an instant is the
      // whole of the timezone handling for this market.
      const intervalStartUtc = new Date(beginMs).toISOString();
      if (!expected.has(intervalStartUtc)) {
        rejected.push({ sourceRow, reason: "UNSUPPORTED_SOURCE_ROW",
          detail: `${beginDate} is not an hour of operating day ${operatingDate}` });
        return;
      }
      if (seen.has(intervalStartUtc)) {
        throw new UepiSourceError(this.seriesId, "DUPLICATE_INTERVAL",
          `two rows claim ${intervalStartUtc}`);
      }
      const total = row.LmpTotal;
      if (total === null || total === undefined) {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} (${beginDate}) has no LmpTotal; a blank is never read as zero`);
      }
      if (typeof total !== "number" || !Number.isFinite(total)) {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} (${beginDate}) has a non-numeric LmpTotal`);
      }
      seen.add(intervalStartUtc);

      records.push({
        intervalStartUtc,
        hourOrdinal: records.length + 1,
        benchmarkPrice: String(total),
        raw: {
          seriesId: this.seriesId,
          rowOrdinal: sourceRow,
          nativeOperatingDate: operatingDate,
          nativeIntervalLabel: beginDate,
          nativeIntervalUtc: intervalStartUtc,
          nativeValue: String(total),
          nativeComponents: {
            LmpTotal: String(total),
            EnergyComponent: String(row.EnergyComponent ?? ""),
            CongestionComponent: String(row.CongestionComponent ?? ""),
            LossComponent: String(row.LossComponent ?? ""),
            LocId: locationId,
            LocType: String(row.Location?.["@LocType"] ?? ""),
            LocName: String(row.Location?.$ ?? ""),
          },
          nativeSourceVersion: { report: "hourlylmp/da/final", location: CANONICAL_LOCATION_ID },
          rawPayload: row as unknown as Record<string, unknown>,
        },
      });
    });

    if (records.length === 0) {
      throw new UepiSourceError(this.seriesId, "MISSING_CANONICAL_BENCHMARK",
        `the response holds no location ${CANONICAL_LOCATION_ID} rows for ${operatingDate}`);
    }

    records.sort((left, right) => Date.parse(left.intervalStartUtc) - Date.parse(right.intervalStartUtc));
    records.forEach((record, position) => { (record as { hourOrdinal: number }).hourOrdinal = position + 1; });

    return {
      seriesId: this.seriesId,
      operatingDate,
      records,
      // The Hub price is already the tariff's node average, and the specification names no second
      // carrier to check it against.
      crossCheckRecords: [],
      rejected,
      examinedRowCount: rows.length,
      sourceSchema: {
        container: "HourlyLmps.HourlyLmp",
        fields: "BeginDate,Location,LmpTotal,EnergyComponent,CongestionComponent,LossComponent",
        report: "hourlylmp/da/final",
        locationId: CANONICAL_LOCATION_ID,
        locationName: String(rows[0]?.Location?.$ ?? ""),
        hourConvention: "hour_beginning_with_offset",
      },
      warnings: [],
    };
  },
};
