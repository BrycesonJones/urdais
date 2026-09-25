/**
 * Range windows and period returns for the market detail chart.
 *
 * A range is a trailing window that ends at the instrument's latest
 * observation: one day, seven calendar days, or one, three, six, or twelve
 * calendar months. Its base is the last observation at or before the window
 * start, so the return is measured from the close that precedes the window.
 * Pure functions of the series and the as-of time, so the same history
 * always yields the same numbers.
 *
 * Every window ends at the caller's `asOf`, which every surface takes from the instrument's
 * own latest observation rather than from the clock. A daily series published after midnight
 * therefore draws the same chart all day, and a browser in any timezone draws the same one.
 */

import { changeBetween, changeUnavailable, type MarketChange } from "@/lib/market-change";
import { DETAIL_RANGES } from "@/types/market";
import type { DetailRange, DetailedSeries, PeriodPerformance, TimeSeriesPoint } from "@/types/market";

const DAY = 86_400;

export const RANGE_LABELS: Record<DetailRange, string> = {
  "1D": "1 day",
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  "1Y": "1 year",
};

/** Ranges drawn from the 15-minute series rather than daily closes, where one exists. */
const INTRADAY_RANGES: ReadonlySet<DetailRange> = new Set(["1D", "1W"]);

export function isIntradayRange(range: DetailRange): boolean {
  return INTRADAY_RANGES.has(range);
}

/**
 * Whether a range should be drawn from the fine series *for this series*.
 *
 * `1D` and `1W` are intraday ranges for an instrument that has a 15-minute tail. Some
 * instruments have none and never will: UTVI publishes one figure per completed UTC day and
 * its source refuses to serve a partial day at all, so synthesising a tail would be a
 * fabrication rather than a missing feature.
 *
 * Without this distinction a daily-only series drew its short ranges from an empty array and
 * fell back to the single daily point at the window's base — one point, which is not a line.
 * A daily-only series therefore draws every range from its daily closes, where `1D` is the
 * latest point and the one before it, and `1W` is the inclusive seven-calendar-day span.
 */
export function usesIntradaySeries(series: DetailedSeries, range: DetailRange): boolean {
  return isIntradayRange(range) && series.intraday.length > 0;
}

/** Shift a UTC timestamp by calendar months/years, keeping day and time of day. */
function shiftUtc(unixSeconds: number, { months = 0, years = 0 }: { months?: number; years?: number }): number {
  const date = new Date(unixSeconds * 1000);
  return (
    Date.UTC(
      date.getUTCFullYear() + years,
      date.getUTCMonth() + months,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    ) / 1000
  );
}

/** Start of the trailing window for a range. */
export function rangeStart(range: DetailRange, asOf: number): number {
  switch (range) {
    case "1D":
      return asOf - DAY;
    case "1W":
      // Seven calendar days: Urdais markets are quoted continuously, so a
      // five-observation trading week would be the wrong model.
      return asOf - 7 * DAY;
    case "1M":
      return shiftUtc(asOf, { months: -1 });
    case "3M":
      return shiftUtc(asOf, { months: -3 });
    case "6M":
      return shiftUtc(asOf, { months: -6 });
    case "1Y":
      return shiftUtc(asOf, { years: -1 });
  }
}

/** Index of the last point at or before `time`, or -1 when every point is later. */
function baseIndex(points: TimeSeriesPoint[], time: number): number {
  let low = 0;
  let high = points.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (points[mid]!.time <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

/**
 * The earliest instant a window's base may sit at: one further window back.
 *
 * The base is the last observation at or before the window start, which is right for a
 * regularly sampled series -- a daily close a few seconds either side of the boundary is
 * plainly the observation the window means. It is wrong without a bound. Two observations
 * four hundred days apart used to make every range "available", each reporting the same
 * figure, so a "1 day" return was measured across four hundred days; that is the oldest
 * available point being used merely because it exists.
 *
 * Bounding the base by one further window is calendar-aware and introduces no constant of
 * its own: a `1D` base must fall within the preceding day, a `1M` base within the preceding
 * calendar month. A series with a genuine gap therefore loses the short horizons it cannot
 * honestly measure and keeps the long ones it can.
 */
function earliestAcceptableBase(range: DetailRange, asOf: number): number {
  return rangeStart(range, rangeStart(range, asOf));
}

/**
 * Index of the window's base observation, or -1 where there is none within reach.
 *
 * This is the one place availability is decided, so the chart window, the range buttons and
 * the period returns cannot disagree about whether a horizon is real.
 */
function windowBaseIndex(points: TimeSeriesPoint[], range: DetailRange, asOf: number): number {
  const index = baseIndex(points, rangeStart(range, asOf));
  if (index < 0) return -1;
  return points[index]!.time >= earliestAcceptableBase(range, asOf) ? index : -1;
}

/**
 * Points inside the window, starting at the base observation. Intraday
 * windows draw the 15-minute series; when that series begins after the
 * window opens, the daily close at the window start stands in as the base,
 * since the fine series is pinned to those closes. When the history starts
 * after the window does, the whole history is returned so a shorter
 * comparison series can still be drawn over a longer primary window.
 */
export function windowPoints(series: DetailedSeries, range: DetailRange, asOf: number): TimeSeriesPoint[] {
  const start = rangeStart(range, asOf);
  if (usesIntradaySeries(series, range)) {
    const base = baseIndex(series.intraday, start);
    if (base >= 0) return series.intraday.slice(base);
    const dailyBase = baseIndex(series.daily, start);
    const tail = series.intraday.filter((point) => point.time > start);
    return dailyBase >= 0 ? [series.daily[dailyBase]!, ...tail] : tail;
  }
  const base = baseIndex(series.daily, start);
  return base < 0 ? series.daily : series.daily.slice(base);
}

/**
 * A range is supported when the history reaches back to the window's base and that base is
 * within reach of the window start. Never when the only candidate is an observation so much
 * older than the window that the return would measure a different period than its label.
 */
export function isRangeAvailable(series: DetailedSeries, range: DetailRange, asOf: number): boolean {
  if (usesIntradaySeries(series, range)) {
    return (
      series.intraday.length >= 2 &&
      (windowBaseIndex(series.intraday, range, asOf) >= 0 || windowBaseIndex(series.daily, range, asOf) >= 0)
    );
  }
  return series.daily.length >= 2 && windowBaseIndex(series.daily, range, asOf) >= 0;
}

export function availableRanges(series: DetailedSeries, asOf: number): DetailRange[] {
  return DETAIL_RANGES.filter((range) => isRangeAvailable(series, range, asOf));
}

/**
 * Whether a window's two endpoints measure the same thing.
 *
 * A percentage change is a statement about one economic object moving. Where a
 * product can redesignate what it measures -- Urdais Token Price redesignates a
 * provider's benchmark model -- the points either side of that boundary are
 * computed from different objects, and the difference between them is not a
 * change in anything. docs/methodology/token-price.md is explicit: percentage
 * change is withheld across a constituent boundary, and "is never shown as zero
 * to fill the space".
 *
 * Zero is exactly what the naive subtraction produced on 22 September 2026,
 * when xAI moved from Grok 4.6 to Grok 4.7 and both models happened to be
 * published at the same price. The value was right and the label was a claim
 * nobody had checked.
 *
 * Points that carry no lineage are comparable, because every series that has
 * only ever measured one thing leaves the field unset. Only a genuine,
 * stated disagreement withholds.
 */
function sameLineage(first: TimeSeriesPoint, last: TimeSeriesPoint): boolean {
  if (first.lineage === undefined || last.lineage === undefined) return true;
  return first.lineage === last.lineage;
}

/**
 * Percentage change from the window's base observation to the latest one.
 *
 * Null wherever a percentage would not be economically meaningful, which is wider than "the base
 * is zero": a negative base inverts the sign, so a series rising from -10 to -5 used to report
 * -50% while it rose. The rule lives in one place, `changeBetween`, and it is the same rule for
 * every series. Strictly positive series -- which is every Urdais series other than wholesale
 * power -- are unaffected: their percentages are exactly what they were.
 */
export function periodReturn(series: DetailedSeries, range: DetailRange, asOf: number): number | null {
  const change = periodChange(series, range, asOf);
  return change.kind === "percentage" ? change.percentage : null;
}

/**
 * The full change over the window: a percentage where one is publishable, the absolute change and
 * the reason the percentage was withheld where it is not, and an explicit `unavailable` -- which
 * is a different statement again -- where the horizon has no base observation in reach.
 */
export function periodChange(series: DetailedSeries, range: DetailRange, asOf: number): MarketChange {
  if (!isRangeAvailable(series, range, asOf)) return changeUnavailable("insufficient_history");
  const points = windowPoints(series, range, asOf);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return changeUnavailable("no_base_observation");
  if (!sameLineage(first, last)) return changeUnavailable("methodology_version_break");
  return changeBetween(first.value, last.value, { baseTime: first.time, latestTime: last.time });
}

export function periodPerformance(series: DetailedSeries, asOf: number): PeriodPerformance[] {
  return DETAIL_RANGES.map((range) => ({ range, returnPercent: periodReturn(series, range, asOf) }));
}

/* ------------------------------------------------------------------ low-frequency series
 *
 * The functions above assume a continuously quoted instrument: a daily close series with
 * a fine intraday tail, where `1D` and `1W` are windows on the intraday points. A
 * low-frequency index -- one published once per day, or less often -- has no intraday
 * series at all, and the generic rule would therefore disable `1D` and `1W` forever.
 *
 * The wrong fix is to copy daily points into the intraday array. That would invent
 * observations, and for an index like UBWI, whose whole claim is that it publishes only
 * what it actually measured, inventing observations to unlock a button is the failure
 * mode, not the workaround.
 *
 * The right fix is small: read every range off the published points themselves, and keep
 * the existing availability rule otherwise -- a range is supported when the history
 * reaches back to the window's base and the window holds at least two real points. Ranges
 * then become available organically as history accumulates: two consecutive daily points
 * support `1D`, a week of them supports `1W`, and so on, with no range ever implying data
 * that does not exist.
 */

/**
 * Points inside the window for a low-frequency series, starting at the base observation.
 *
 * The whole history is returned when it begins after the window opens, matching
 * `windowPoints`, so a caller drawing a longer window over a short history still gets
 * every real point rather than none.
 */
export function lowFrequencyWindowPoints(
  points: readonly TimeSeriesPoint[],
  range: DetailRange,
  asOf: number,
): TimeSeriesPoint[] {
  const base = baseIndex(points as TimeSeriesPoint[], rangeStart(range, asOf));
  return base < 0 ? [...points] : points.slice(base);
}

/**
 * A range is supported when the history reaches back to the window's base and the window
 * contains at least two real observations. Two points are the minimum that can be drawn
 * as a line or measured as a return; one is a dot and no movement.
 */
export function isLowFrequencyRangeAvailable(
  points: readonly TimeSeriesPoint[],
  range: DetailRange,
  asOf: number,
): boolean {
  if (points.length < 2) return false;
  // Same base-within-reach rule as the continuously quoted path, so the two conventions
  // cannot drift into disagreeing about what counts as a real horizon.
  if (windowBaseIndex(points as TimeSeriesPoint[], range, asOf) < 0) return false;
  return lowFrequencyWindowPoints(points, range, asOf).length >= 2;
}

export function lowFrequencyAvailableRanges(
  points: readonly TimeSeriesPoint[],
  asOf: number,
): DetailRange[] {
  return DETAIL_RANGES.filter((range) => isLowFrequencyRangeAvailable(points, range, asOf));
}

/**
 * Relative percentage return over the window, on the same convention as `periodReturn`:
 * `(last - first) / first * 100`. Null where the range is unavailable, where the endpoints measure
 * different things, or where a percentage between these two values would not be meaningful --
 * never a fabricated 0 %.
 *
 * The base-zero guard this function used to carry was too narrow. It protected against an
 * undefined denominator and let a *negative* base through, which returns a sign-inverted
 * percentage: the series rises and the figure reads negative. No series published before UEPI can
 * go non-positive, so closing it changes no published number; it closes the hole before the first
 * series that can walks through it.
 */
export function lowFrequencyPeriodReturn(
  points: readonly TimeSeriesPoint[],
  range: DetailRange,
  asOf: number,
): number | null {
  const change = lowFrequencyPeriodChange(points, range, asOf);
  return change.kind === "percentage" ? change.percentage : null;
}

/**
 * The full change over the window for a low-frequency series.
 *
 * This is the shape a signed series needs, and the one a wholesale-power surface reads: a
 * percentage where both endpoints are strictly positive, otherwise the change in the series' own
 * unit together with the reason the percentage was withheld, and `unavailable` where no comparison
 * exists at all. The endpoint timestamps travel with it, so a surface can state the date a
 * "1 month" comparison actually measured from rather than leaving the label to imply it.
 */
export function lowFrequencyPeriodChange(
  points: readonly TimeSeriesPoint[],
  range: DetailRange,
  asOf: number,
): MarketChange {
  if (!isLowFrequencyRangeAvailable(points, range, asOf)) return changeUnavailable("insufficient_history");
  const window = lowFrequencyWindowPoints(points, range, asOf);
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return changeUnavailable("no_base_observation");
  if (!sameLineage(first, last)) return changeUnavailable("methodology_version_break");
  return changeBetween(first.value, last.value, { baseTime: first.time, latestTime: last.time });
}

/** Every horizon's full change, in display order. The signed-series counterpart of the returns list. */
export function lowFrequencyPeriodChanges(
  points: readonly TimeSeriesPoint[],
  asOf: number,
): { range: DetailRange; change: MarketChange }[] {
  return DETAIL_RANGES.map((range) => ({ range, change: lowFrequencyPeriodChange(points, range, asOf) }));
}

export function lowFrequencyPeriodPerformance(
  points: readonly TimeSeriesPoint[],
  asOf: number,
): PeriodPerformance[] {
  return DETAIL_RANGES.map((range) => ({
    range,
    returnPercent: lowFrequencyPeriodReturn(points, range, asOf),
  }));
}
