/**
 * Market-local modelled periods, and the coverage rule that decides whether one may be used.
 *
 * Peak demand is a local-calendar idea: a balancing authority's summer peak belongs to a local
 * afternoon, not to a UTC hour, and a "year" of load means the local year its operators plan
 * against. Canonical storage is UTC and stays UTC. This module is the one place the two meet.
 *
 * The daylight-saving question, and why it turns out not to be one.
 *
 * A modelled period is the half-open interval of *instants* between local 1 January 00:00 and the
 * next local 1 January 00:00. Both bounds fall in standard time in every zone here, so the
 * interval spans exactly 24 x (365 or 366) hours regardless of how many clock changes lie inside
 * it. Spring-forward does not remove an instant and autumn fall-back does not create one; they
 * relabel instants. The lost and repeated *wall-clock* hours only appear if a series is indexed by
 * local hour labels, which this product never does. Indexing by instant makes both transitions
 * non-events by construction, and `period.test.ts` proves it for real transition dates rather than
 * asserting it.
 *
 * Coverage is never repaired. A missing hour stays missing: no interpolation, no carry-forward, no
 * climatological fill. Methodology 1.0.0 §7 gives the reason -- the scenario is decided by the top
 * of the load distribution, and an invented hour there would move the answer while looking exactly
 * like evidence.
 */

import { PD2_V1_AREAS } from "@/lib/power-delivery/universe";
import {
  FLEXIBLE_CAPACITY_MARKETS, FlexibleCapacityDomainError,
  type FlexibleCapacityMarket, type HourlyLoadPoint, type ModeledPeriod,
} from "@/lib/flexible-capacity/types";

const HOUR_MS = 3_600_000;

/**
 * Zones come from the Power Delivery universe rather than a second list, so a market cannot end up
 * with one zone in ingestion and another in analytics. These are the same values held in
 * `reference.grid_areas.timezone_name`.
 */
export const MARKET_TIMEZONES: Readonly<Record<FlexibleCapacityMarket, string>> =
  Object.fromEntries(PD2_V1_AREAS.map((area) => [area.slug, area.timezone])) as
    Record<FlexibleCapacityMarket, string>;

export function assertMarket(value: string): FlexibleCapacityMarket {
  if (!(FLEXIBLE_CAPACITY_MARKETS as readonly string[]).includes(value)) {
    throw new FlexibleCapacityDomainError(`'${value}' is not one of the seven markets`);
  }
  return value as FlexibleCapacityMarket;
}

/** The zone's offset from UTC at a given instant, in milliseconds. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const field = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    if (found === undefined) throw new FlexibleCapacityDomainError(`zone ${timeZone} produced no ${type}`);
    return Number(found.value);
  };
  // Some engines render midnight as hour 24 rather than 0.
  const hour = field("hour") % 24;
  const asIfUtc = Date.UTC(field("year"), field("month") - 1, field("day"), hour, field("minute"), field("second"));
  return asIfUtc - instantMs;
}

/**
 * The instant at which a local wall-clock time occurs.
 *
 * Only ever called for local 1 January 00:00, which is unambiguous in every zone this product
 * covers -- no US clock change happens in January. The second pass exists so the function stays
 * correct if that assumption is ever widened, resolving the case where the naive guess lands on
 * the other side of a transition from the answer.
 */
export function zonedWallTimeToInstant(
  year: number, month: number, day: number, hour: number, timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour);
  const firstOffset = zoneOffsetMs(guess, timeZone);
  const candidate = guess - firstOffset;
  const secondOffset = zoneOffsetMs(candidate, timeZone);
  return secondOffset === firstOffset ? candidate : guess - secondOffset;
}

/** The local calendar year an instant falls in, for this market. */
export function localYearOf(instantUtc: string, market: FlexibleCapacityMarket): number {
  const timeZone = MARKET_TIMEZONES[market];
  const ms = Date.parse(instantUtc);
  if (Number.isNaN(ms)) throw new FlexibleCapacityDomainError(`'${instantUtc}' is not an instant`);
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date(ms)));
}

/**
 * The modelled period for one market-local calendar year.
 *
 * `expectedObservationCount` is derived from the interval itself rather than assumed to be 8,760,
 * so a leap year is 8,784 without a special case and a zone rule change would be reflected rather
 * than hidden.
 */
export function localYearWindow(market: FlexibleCapacityMarket, localYear: number): ModeledPeriod {
  assertMarket(market);
  if (!Number.isInteger(localYear) || localYear < 2015 || localYear > 2100) {
    throw new FlexibleCapacityDomainError(`local year ${localYear} is outside the supported range`);
  }
  const timezone = MARKET_TIMEZONES[market];
  const startMs = zonedWallTimeToInstant(localYear, 1, 1, 0, timezone);
  const endMs = zonedWallTimeToInstant(localYear + 1, 1, 1, 0, timezone);
  const hours = (endMs - startMs) / HOUR_MS;
  if (!Number.isInteger(hours) || hours <= 0) {
    throw new FlexibleCapacityDomainError(`local year ${localYear} in ${timezone} is not a whole number of hours`);
  }
  return {
    market, localYear, timezone,
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    expectedObservationCount: hours,
  };
}

/** The market-local calendar date (YYYY-MM-DD) an instant falls on. */
export function localDateOf(instantUtc: string, timeZone: string): string {
  const ms = Date.parse(instantUtc);
  if (Number.isNaN(ms)) throw new FlexibleCapacityDomainError(`'${instantUtc}' is not an instant`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms));
}

export type PeakRegionAssessment = {
  /** The local calendar date the observed maximum falls on. */
  readonly localDate: string;
  /** Hours the period contains on that local date: 23, 24 or 25, depending on the clock. */
  readonly expectedHours: number;
  readonly presentHours: number;
  readonly missingHours: number;
  readonly complete: boolean;
};

/**
 * Whether the local calendar day containing the observed maximum is completely present.
 *
 * The coverage floor bounds how many hours are absent; this bounds where. Without it, a year could
 * lose the afternoon of its hottest day, keep a surviving shoulder hour, and set `Peak_ref` from
 * that hour -- a reference lower than the system truly reached, and therefore a headroom figure
 * higher than the evidence supports, with a coverage ratio that still looked healthy.
 *
 * The day is counted in instants, so a spring-forward day legitimately expects 23 hours and a
 * fall-back day 25. Nothing here assumes 24.
 *
 * This is a necessary condition and not a sufficient one: a complete peak day cannot prove that
 * some gap elsewhere in the year did not contain a higher value. That residual is exactly what
 * `maximum_contiguous_gap_hours` covers, and it remains unresolved.
 */
export function assessPeakRegion(
  series: readonly HourlyLoadPoint[], period: ModeledPeriod, peakAtUtc: string,
): PeakRegionAssessment {
  const localDate = localDateOf(peakAtUtc, period.timezone);
  let expectedHours = 0;
  for (let ms = Date.parse(period.startUtc); ms < Date.parse(period.endUtc); ms += HOUR_MS) {
    if (localDateOf(new Date(ms).toISOString(), period.timezone) === localDate) expectedHours += 1;
  }
  const presentHours = series.filter(
    (point) => localDateOf(point.periodStartUtc, period.timezone) === localDate).length;
  return {
    localDate, expectedHours, presentHours,
    missingHours: expectedHours - presentHours,
    complete: presentHours === expectedHours,
  };
}

export type CoverageAssessment = {
  readonly observationCount: number;
  readonly expectedObservationCount: number;
  readonly missingObservationCount: number;
  readonly coverageRatio: number;
  readonly meetsThreshold: boolean;
  readonly threshold: number;
  /** First UTC hour of each contiguous run of missing hours, with its length. */
  readonly gaps: readonly { readonly startUtc: string; readonly hours: number }[];
};

/**
 * Assess a series against its period.
 *
 * Rejects rather than repairs: an out-of-range hour, a duplicate hour, a misaligned instant or a
 * non-finite value is a defect in how the series was assembled, not a data-quality grade. Only
 * *absence* is a coverage question.
 */
export function assessCoverage(
  series: readonly HourlyLoadPoint[], period: ModeledPeriod, threshold: number,
): CoverageAssessment {
  if (!(threshold > 0) || threshold > 1) {
    throw new FlexibleCapacityDomainError(`coverage threshold ${threshold} is not in (0, 1]`);
  }
  const startMs = Date.parse(period.startUtc);
  const endMs = Date.parse(period.endUtc);
  const seen = new Set<number>();
  for (const point of series) {
    const ms = Date.parse(point.periodStartUtc);
    if (Number.isNaN(ms)) throw new FlexibleCapacityDomainError(`'${point.periodStartUtc}' is not an instant`);
    if (ms % HOUR_MS !== 0) throw new FlexibleCapacityDomainError(`${point.periodStartUtc} is not an exact UTC hour`);
    if (ms < startMs || ms >= endMs) {
      throw new FlexibleCapacityDomainError(`${point.periodStartUtc} is outside ${period.startUtc}..${period.endUtc}`);
    }
    if (seen.has(ms)) {
      throw new FlexibleCapacityDomainError(
        `${point.periodStartUtc} appears twice; supersession must be resolved before a scenario runs`);
    }
    if (!Number.isFinite(point.valueMw) || point.valueMw < 0) {
      throw new FlexibleCapacityDomainError(`${point.periodStartUtc} has a non-finite or negative load`);
    }
    seen.add(ms);
  }

  const gaps: { startUtc: string; hours: number }[] = [];
  let run: { startMs: number; hours: number } | null = null;
  for (let ms = startMs; ms < endMs; ms += HOUR_MS) {
    if (seen.has(ms)) {
      if (run !== null) { gaps.push({ startUtc: new Date(run.startMs).toISOString(), hours: run.hours }); run = null; }
      continue;
    }
    if (run === null) run = { startMs: ms, hours: 1 }; else run.hours += 1;
  }
  if (run !== null) gaps.push({ startUtc: new Date(run.startMs).toISOString(), hours: run.hours });

  const observationCount = seen.size;
  const expected = period.expectedObservationCount;
  const coverageRatio = expected === 0 ? 0 : observationCount / expected;
  return {
    observationCount,
    expectedObservationCount: expected,
    missingObservationCount: expected - observationCount,
    coverageRatio,
    meetsThreshold: coverageRatio >= threshold,
    threshold,
    gaps,
  };
}
