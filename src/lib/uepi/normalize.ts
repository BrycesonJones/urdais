/**
 * Source rows in, canonical hourly observations out.
 *
 * This is the only place a market's own way of describing an hour becomes the shape every later
 * layer reads. The adapters have already done the market-specific reading; what happens here is
 * uniform, and deliberately so -- the daily calculation, the release validator and the store must
 * never need to know which ISO a value came from.
 *
 * Nothing is repaired here. A price that arrives negative stays negative, a zero stays zero, and a
 * row that cannot be placed on the operating day fails the day rather than being nudged onto it.
 */

import { decimalToNumber } from "@/lib/uepi/decimal";
import { PLAUSIBILITY_GUARD_USD_PER_MWH } from "@/lib/uepi/methodology";
import { expectedIntervalStarts, type OperatingDayWindow } from "@/lib/uepi/operating-day";
import type { AdapterParseResult, AdapterRecord } from "@/lib/uepi/source/types";
import { UepiSourceError } from "@/lib/uepi/source/types";
import type { CrossCheck } from "@/lib/uepi/release";
import type { NormalizedHourlyPrice, UepiBenchmark } from "@/lib/uepi/types";

/**
 * How closely a second carrier must agree with the first, per market.
 *
 * These are specification §G.3's tolerances, and they differ because the sources differ: CAISO's
 * MCE and MISO's residual agreed exactly on every artifact examined, SPP's MEC to four decimal
 * places, and NYISO's derived lambda only to a cent because its components are published rounded.
 */
const UNIFORMITY_TOLERANCE: Readonly<Record<string, number>> = {
  "uepi-caiso": 0.0001,
  "uepi-miso": 0.0001,
  "uepi-nyiso": 0.02,
  "uepi-spp": 0.001,
};

export type NormalizationResult = {
  hours: NormalizedHourlyPrice[];
  crossChecks: CrossCheck[];
  /** Observations worth recording that are not failures. */
  warnings: string[];
};

function toObservation(
  benchmark: UepiBenchmark, window: OperatingDayWindow, record: AdapterRecord,
): NormalizedHourlyPrice {
  const startMs = Date.parse(record.intervalStartUtc);
  const qualityNotes: string[] = [];
  let qualityStatus: NormalizedHourlyPrice["qualityStatus"] = "accepted";

  // The guard is about a parse error, not about economics: a price of three million dollars is
  // how a column shift looks, and the day stops for an operator rather than averaging it in.
  if (Math.abs(decimalToNumber(record.benchmarkPrice)) > PLAUSIBILITY_GUARD_USD_PER_MWH) {
    qualityStatus = "suspect";
    qualityNotes.push(
      `${record.benchmarkPrice} $/MWh is beyond the plausibility guard of ${PLAUSIBILITY_GUARD_USD_PER_MWH}`);
  }

  return {
    seriesId: benchmark.seriesId,
    operatingDate: window.operatingDate,
    intervalStartUtc: new Date(startMs).toISOString(),
    intervalEndUtc: new Date(startMs + 3_600_000).toISOString(),
    hourOrdinal: record.hourOrdinal,
    priceUsdPerMwh: record.benchmarkPrice,
    construct: benchmark.construct,
    derivation: benchmark.derivation,
    derivationExpression: benchmark.derivationExpression,
    sourceVersion: record.raw.nativeSourceVersion,
    qualityStatus,
    qualityNotes,
  };
}

/**
 * Normalize one parsed operating day.
 *
 * The instants are validated against the day the market itself defines, rather than trusted: an
 * adapter that drifts by an hour is exactly the defect that would otherwise show up months later
 * as a chart that looks subtly wrong.
 */
export function normalizeOperatingDay(
  benchmark: UepiBenchmark, window: OperatingDayWindow, parsed: AdapterParseResult,
): NormalizationResult {
  if (parsed.seriesId !== benchmark.seriesId) {
    throw new UepiSourceError(benchmark.seriesId, "UNSUPPORTED_SOURCE_ROW",
      `a ${parsed.seriesId} parse cannot be normalized as ${benchmark.seriesId}`);
  }
  if (parsed.operatingDate !== window.operatingDate) {
    throw new UepiSourceError(benchmark.seriesId, "UNSUPPORTED_SOURCE_ROW",
      `a parse of ${parsed.operatingDate} cannot be normalized as ${window.operatingDate}`);
  }

  const expected = new Set(expectedIntervalStarts(window));
  const seen = new Set<string>();
  const hours: NormalizedHourlyPrice[] = [];

  for (const record of parsed.records) {
    const instant = record.intervalStartUtc;
    if (!expected.has(instant)) {
      throw new UepiSourceError(benchmark.seriesId, "INVALID_TIMESTAMP",
        `${instant} is not an hour of ${window.operatingDate} in ${window.timezone}`);
    }
    if (seen.has(instant)) {
      throw new UepiSourceError(benchmark.seriesId, "DUPLICATE_INTERVAL",
        `two canonical rows claim ${instant}`);
    }
    seen.add(instant);
    hours.push(toObservation(benchmark, window, record));
  }

  hours.sort((left, right) => Date.parse(left.intervalStartUtc) - Date.parse(right.intervalStartUtc));
  hours.forEach((hour, index) => { (hour as { hourOrdinal: number }).hourOrdinal = index + 1; });

  const crossChecks: CrossCheck[] = [];
  const tolerance = UNIFORMITY_TOLERANCE[benchmark.seriesId];
  if (tolerance !== undefined && parsed.crossCheckRecords.length > 0) {
    const byInstant = new Map(hours.map((hour) => [hour.intervalStartUtc, decimalToNumber(hour.priceUsdPerMwh)]));
    let maxSpread = 0;
    let compared = 0;
    for (const record of parsed.crossCheckRecords) {
      const carrier = byInstant.get(record.intervalStartUtc);
      if (carrier === undefined) continue;
      compared += 1;
      maxSpread = Math.max(maxSpread, Math.abs(carrier - decimalToNumber(record.benchmarkPrice)));
    }
    crossChecks.push({
      check: "system_component_uniformity",
      maxAbsoluteSpread: maxSpread,
      tolerance,
      detail: `${benchmark.construct === "system_energy_component"
        ? "the system component"
        : "the benchmark"} at a second carrier, compared over ${compared} hours`,
    });
  }

  const warnings = [...parsed.warnings];
  if (parsed.records.length !== window.expectedIntervalCount) {
    warnings.push(
      `${parsed.records.length} canonical rows against ${window.expectedIntervalCount} expected hours`);
  }

  return { hours, crossChecks, warnings };
}
