/**
 * Range windows over a UEPI series, under specification 1.0.0 §E.
 *
 * §E.2 is explicit that UEPI reuses the existing Urdais range contract rather than inventing
 * one, and specifically its low-frequency path: UEPI publishes once per operating day and has
 * no intraday tail, and copying daily points into an intraday array to light up the 1D and 1W
 * buttons would invent observations. So the availability rule, the base rule and the one-further-
 * window bound all come from `market-ranges.ts` unchanged.
 *
 * What this module adds is the two things the shared path cannot know about:
 *
 *   the point clock (§E.1) -- every released day is stamped at its operating date at 00:00:00
 *   UTC, so four timezones line up on one axis and calendar-month arithmetic is exact; and
 *
 *   exact dollar changes (§D) -- the shared path computes its absolute change in `number`,
 *   which is right for its callers and not good enough for a six-decimal price, so the amount
 *   is recomputed from the stored decimal strings once the endpoints are known.
 */

import {
  lowFrequencyAvailableRanges,
  lowFrequencyPeriodChanges,
  lowFrequencyWindowPoints,
} from "@/lib/market-ranges";
import { changeBetweenDays, unavailableChange, type UepiChange } from "@/lib/uepi/read/read-model";
import type { ReleasedDayRow } from "@/lib/uepi/read/load";
import { DETAIL_RANGES, type DetailRange, type TimeSeriesPoint } from "@/types/market";

/** §E.1: the operating date at 00:00:00 UTC. A date key, not a claim about when the hours ran. */
export function operatingDateInstant(operatingDate: string): number {
  return Math.floor(new Date(`${operatingDate}T00:00:00Z`).getTime() / 1000);
}

/** The released days as plottable points, in operating-date order. */
export function toTimeSeries(days: readonly ReleasedDayRow[]): TimeSeriesPoint[] {
  return days.map((day) => ({
    time: operatingDateInstant(day.operatingDate),
    value: Number(day.valueUsdPerMwh),
  }));
}

/**
 * `asOf` for a UEPI series is its own latest released observation, never the clock (§E.1).
 *
 * A day published at 05:00 UTC therefore draws the same chart all day, in every browser
 * timezone. Reading the clock instead would make the available ranges depend on when a reader
 * happened to load the page.
 */
export function seriesAsOf(days: readonly ReleasedDayRow[]): number {
  const latest = days[days.length - 1];
  return latest === undefined ? 0 : operatingDateInstant(latest.operatingDate);
}

export function availableRangesFor(days: readonly ReleasedDayRow[]): DetailRange[] {
  if (days.length < 2) return [];
  return lowFrequencyAvailableRanges(toTimeSeries(days), seriesAsOf(days));
}

/** The released days inside one window, from its base observation to the latest. */
export function windowDays(days: readonly ReleasedDayRow[], range: DetailRange): ReleasedDayRow[] {
  if (days.length === 0) return [];
  const window = lowFrequencyWindowPoints(toTimeSeries(days), range, seriesAsOf(days));
  const first = window[0];
  if (first === undefined) return [];
  return days.filter((day) => operatingDateInstant(day.operatingDate) >= first.time);
}

/**
 * Every horizon's change, in display order.
 *
 * The shared path decides availability and picks the endpoints; §D then decides what may be
 * said about them. A range that is available but whose endpoints are not both strictly
 * positive is *not* unavailable -- it carries a dollar change and no percentage, and the
 * surface must keep offering it. Conflating the two is how a negative-price day would disable
 * a button over data that exists.
 */
export function rangeChanges(days: readonly ReleasedDayRow[]): { range: DetailRange; change: UepiChange }[] {
  if (days.length === 0) {
    return DETAIL_RANGES.map((range) => ({ range, change: unavailableChange("no_released_value") }));
  }
  const byInstant = new Map(days.map((day) => [operatingDateInstant(day.operatingDate), day]));
  return lowFrequencyPeriodChanges(toTimeSeries(days), seriesAsOf(days)).map(({ range, change }) => {
    if (change.kind === "unavailable") return { range, change: unavailableChange(change.reason) };
    const base = change.baseTime === null ? undefined : byInstant.get(change.baseTime);
    const latest = change.latestTime === null ? undefined : byInstant.get(change.latestTime);
    if (base === undefined || latest === undefined) {
      return { range, change: unavailableChange("no_base_observation") };
    }
    // Recomputed exactly from the stored decimals. The shared path's own figures agree to
    // display precision; they are not the ones published.
    return { range, change: changeBetweenDays(base, latest) };
  });
}
