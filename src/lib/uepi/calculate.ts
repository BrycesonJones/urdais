/**
 * The daily UEPI calculation: the arithmetic mean of an operating day's valid hourly prices.
 *
 *   UEPI_d = (1/n) * sum p_i
 *
 * Pure, total and independent of any source adapter or database, so the same hours produce the
 * same value and the same digest on any machine. Three properties make that true rather than
 * merely likely: the hours are sorted by UTC instant before anything is read from them, the
 * arithmetic is exact decimal rather than floating point, and the inputs are hashed into the
 * result so a recomputation can be checked rather than trusted.
 *
 * It computes; it does not decide whether the day may be released. That is `evaluateRelease`, and
 * keeping the two apart is what lets a rights-blocked market still have a stored, auditable value.
 */

import { createHash } from "node:crypto";

import { meanDecimal } from "@/lib/uepi/decimal";
import {
  RELEASED_VALUE_DECIMAL_PLACES, SPECIFICATION_DIGEST, SPECIFICATION_VERSION,
} from "@/lib/uepi/methodology";
import type { OperatingDayWindow } from "@/lib/uepi/operating-day";
import {
  UepiDomainError,
  type NormalizedHourlyPrice, type PriceConstruct, type UepiBenchmark, type UepiSeriesId,
} from "@/lib/uepi/types";

export type DailyCalculation = {
  readonly seriesId: UepiSeriesId;
  readonly operatingDate: string;
  /** Decimal string at six places, signed. */
  readonly valueUsdPerMwh: string;
  readonly observationCount: number;
  readonly expectedObservationCount: number;
  readonly hourSpanStartUtc: string;
  readonly hourSpanEndUtc: string;
  /** SHA-256 over the specification version, the series, the date and the ordered inputs. */
  readonly inputDigest: string;
  readonly construct: PriceConstruct;
  readonly specificationVersion: string;
  readonly specificationDigest: string;
};

/** Hours in canonical order: ascending UTC instant. The one order a digest may be taken over. */
export function orderHours(hours: readonly NormalizedHourlyPrice[]): NormalizedHourlyPrice[] {
  return [...hours].sort((left, right) => Date.parse(left.intervalStartUtc) - Date.parse(right.intervalStartUtc));
}

/**
 * The digest of a calculation's inputs.
 *
 * Includes the specification version, because the same hours under a different version are a
 * different claim, and a digest that could not tell them apart would let a version change hide.
 */
export function calculationInputDigest(
  seriesId: string, operatingDate: string, hours: readonly NormalizedHourlyPrice[],
): string {
  const body = orderHours(hours)
    .map((hour) => `${hour.intervalStartUtc}|${hour.priceUsdPerMwh}`)
    .join("\n");
  return createHash("sha256")
    .update(`UEPI/${SPECIFICATION_VERSION}\n${seriesId}\n${operatingDate}\n${body}`)
    .digest("hex");
}

export function calculateDailyValue(
  benchmark: UepiBenchmark,
  window: OperatingDayWindow,
  hours: readonly NormalizedHourlyPrice[],
): DailyCalculation {
  if (hours.length === 0) {
    throw new UepiDomainError(`${benchmark.seriesId} ${window.operatingDate} has no hours to average`);
  }
  const ordered = orderHours(hours);
  for (const hour of ordered) {
    if (hour.seriesId !== benchmark.seriesId) {
      throw new UepiDomainError(
        `${window.operatingDate}: an hour of ${hour.seriesId} cannot enter ${benchmark.seriesId}`);
    }
    if (hour.operatingDate !== window.operatingDate) {
      throw new UepiDomainError(
        `${benchmark.seriesId}: an hour of ${hour.operatingDate} cannot enter ${window.operatingDate}`);
    }
  }

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  return {
    seriesId: benchmark.seriesId,
    operatingDate: window.operatingDate,
    valueUsdPerMwh: meanDecimal(ordered.map((hour) => hour.priceUsdPerMwh), RELEASED_VALUE_DECIMAL_PLACES),
    observationCount: ordered.length,
    expectedObservationCount: window.expectedIntervalCount,
    hourSpanStartUtc: first.intervalStartUtc,
    hourSpanEndUtc: last.intervalEndUtc,
    inputDigest: calculationInputDigest(benchmark.seriesId, window.operatingDate, ordered),
    construct: benchmark.construct,
    specificationVersion: SPECIFICATION_VERSION,
    specificationDigest: SPECIFICATION_DIGEST,
  };
}
