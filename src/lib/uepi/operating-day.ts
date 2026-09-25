/**
 * The market operating day, in instants.
 *
 * A UEPI day is the market's own calendar day in the market's own zone, and it is 23, 24 or 25
 * hours long depending on the clock. That is not an edge case to be tolerated -- it is measured
 * fact for three markets: NYISO's 8 March 2026 file has 23 rows and skips 02:00, its 2 November
 * 2025 file has 25 rows with 01:00 printed twice, and SPP's files for the same two dates behave
 * the same way with the repeats separated only by their GMT interval ends.
 *
 * So the expected hour count is *derived from the zone*, never assumed to be 24. The one market
 * where 24 is guaranteed is MISO, and it is guaranteed for the opposite of the usual reason: MISO
 * publishes Eastern Standard Time all year and does not observe the transitions at all.
 *
 * Note on duplication: `src/lib/flexible-capacity/period.ts` and `src/lib/uavi/snapshot.ts` each
 * carry their own copy of the zone-offset primitive below. Converging the three is a cleanup with
 * its own risk to two shipped products, and it is not this phase's business.
 */

import { UepiDomainError, type UepiBenchmark } from "@/lib/uepi/types";

const HOUR_MS = 3_600_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The zone's offset from UTC at a given instant, in milliseconds. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const field = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    if (found === undefined) throw new UepiDomainError(`zone ${timeZone} produced no ${type}`);
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
 * The second pass resolves the case where the naive guess lands on the other side of a transition
 * from the answer, which is exactly what happens when the requested time is local midnight on a
 * spring-forward day.
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

/** The market-local calendar date (YYYY-MM-DD) an instant falls on. */
export function localDateOf(instantUtc: string, timeZone: string): string {
  const ms = Date.parse(instantUtc);
  if (Number.isNaN(ms)) throw new UepiDomainError(`'${instantUtc}' is not an instant`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms));
}

export type DstTransition = "none" | "spring_forward" | "fall_back";

export type OperatingDayWindow = {
  readonly seriesId: string;
  readonly operatingDate: string;
  readonly timezone: string;
  /** The instant local midnight occurs, and the instant the next local midnight occurs. */
  readonly startUtc: string;
  readonly endUtc: string;
  /** 23, 24 or 25. Derived from the zone, never assumed. */
  readonly expectedIntervalCount: number;
  readonly dstTransition: DstTransition;
};

function parseDate(operatingDate: string): { year: number; month: number; day: number } {
  if (!DATE_PATTERN.test(operatingDate)) {
    throw new UepiDomainError(`'${operatingDate}' is not an operating date (YYYY-MM-DD)`);
  }
  const [year, month, day] = operatingDate.split("-").map(Number) as [number, number, number];
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (asUtc.getUTCFullYear() !== year || asUtc.getUTCMonth() + 1 !== month || asUtc.getUTCDate() !== day) {
    throw new UepiDomainError(`'${operatingDate}' is not a real calendar date`);
  }
  return { year, month, day };
}

/**
 * The operating day as a half-open interval of instants, with the hours it must contain.
 *
 * A market that does not observe daylight saving must produce 24; if its configured zone ever
 * yields anything else, that is a misconfiguration and it raises rather than quietly changing the
 * expected count of a market whose whole point is that its day never changes length.
 */
export function operatingDayWindow(
  benchmark: UepiBenchmark, operatingDate: string,
): OperatingDayWindow {
  const { year, month, day } = parseDate(operatingDate);
  const zone = benchmark.operatingTimezone;
  const startMs = zonedWallTimeToInstant(year, month, day, 0, zone);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const endMs = zonedWallTimeToInstant(
    nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), 0, zone);

  const hours = (endMs - startMs) / HOUR_MS;
  if (!Number.isInteger(hours) || hours < 23 || hours > 25) {
    throw new UepiDomainError(
      `${operatingDate} in ${zone} spans ${hours} hours, which is not an operating day`);
  }
  if (!benchmark.observesDst && hours !== 24) {
    throw new UepiDomainError(
      `${benchmark.seriesId} does not observe daylight saving, but ${zone} gives ${operatingDate} ${hours} hours`);
  }

  return {
    seriesId: benchmark.seriesId,
    operatingDate,
    timezone: zone,
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    expectedIntervalCount: hours,
    dstTransition: hours === 23 ? "spring_forward" : hours === 25 ? "fall_back" : "none",
  };
}

/** Every UTC hour the operating day contains, in order. The contiguity a released day asserts. */
export function expectedIntervalStarts(window: OperatingDayWindow): string[] {
  const starts: string[] = [];
  const endMs = Date.parse(window.endUtc);
  for (let ms = Date.parse(window.startUtc); ms < endMs; ms += HOUR_MS) {
    starts.push(new Date(ms).toISOString());
  }
  return starts;
}

/**
 * Whether a transition day may be released without an operator looking at it.
 *
 * Three markets have had a real transition file parsed; three have prevailing-time behaviour that
 * is expected but unverified; ISO-NE's convention is unknown altogether. On an ordinary day the
 * distinction does not arise. On a transition day it decides whether a 23- or 25-hour result is
 * evidence or an assumption, and specification §C.6 says an assumption must stop and be looked at.
 */
export function dstEvidenceSufficient(benchmark: UepiBenchmark, window: OperatingDayWindow): boolean {
  if (benchmark.dstEvidence === "unresolved") return false;
  if (window.dstTransition === "none") return true;
  return benchmark.dstEvidence === "verified";
}
