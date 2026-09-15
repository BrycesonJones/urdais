/**
 * Range windows and period returns for the market detail chart.
 *
 * A range is a trailing window that ends at the instrument's latest
 * observation: one day, seven calendar days, or one, three, six, or twelve
 * calendar months. Its base is the last observation at or before the window
 * start, so the return is measured from the close that precedes the window.
 * Pure functions of the series and the as-of time, so the same history
 * always yields the same numbers.
 */

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

/** Ranges drawn from the 15-minute series rather than daily closes. */
const INTRADAY_RANGES: ReadonlySet<DetailRange> = new Set(["1D", "1W"]);

export function isIntradayRange(range: DetailRange): boolean {
  return INTRADAY_RANGES.has(range);
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
 * Points inside the window, starting at the base observation. Intraday
 * windows draw the 15-minute series; when that series begins after the
 * window opens, the daily close at the window start stands in as the base,
 * since the fine series is pinned to those closes. When the history starts
 * after the window does, the whole history is returned so a shorter
 * comparison series can still be drawn over a longer primary window.
 */
export function windowPoints(series: DetailedSeries, range: DetailRange, asOf: number): TimeSeriesPoint[] {
  const start = rangeStart(range, asOf);
  if (isIntradayRange(range)) {
    const base = baseIndex(series.intraday, start);
    if (base >= 0) return series.intraday.slice(base);
    const dailyBase = baseIndex(series.daily, start);
    const tail = series.intraday.filter((point) => point.time > start);
    return dailyBase >= 0 ? [series.daily[dailyBase]!, ...tail] : tail;
  }
  const base = baseIndex(series.daily, start);
  return base < 0 ? series.daily : series.daily.slice(base);
}

/** A range is supported when the history reaches back to the window's base. */
export function isRangeAvailable(series: DetailedSeries, range: DetailRange, asOf: number): boolean {
  const start = rangeStart(range, asOf);
  if (isIntradayRange(range)) {
    return series.intraday.length >= 2 && (baseIndex(series.intraday, start) >= 0 || baseIndex(series.daily, start) >= 0);
  }
  return series.daily.length >= 2 && baseIndex(series.daily, start) >= 0;
}

export function availableRanges(series: DetailedSeries, asOf: number): DetailRange[] {
  return DETAIL_RANGES.filter((range) => isRangeAvailable(series, range, asOf));
}

/** Percentage change from the window's base observation to the latest one. */
export function periodReturn(series: DetailedSeries, range: DetailRange, asOf: number): number | null {
  if (!isRangeAvailable(series, range, asOf)) return null;
  const points = windowPoints(series, range, asOf);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || first.value === 0) return null;
  return ((last.value - first.value) / first.value) * 100;
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
  if (baseIndex(points as TimeSeriesPoint[], rangeStart(range, asOf)) < 0) return false;
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
 * `(last - first) / first * 100`. Null where the range is unavailable or the base is zero,
 * never a fabricated 0 %.
 */
export function lowFrequencyPeriodReturn(
  points: readonly TimeSeriesPoint[],
  range: DetailRange,
  asOf: number,
): number | null {
  if (!isLowFrequencyRangeAvailable(points, range, asOf)) return null;
  const window = lowFrequencyWindowPoints(points, range, asOf);
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last || first.value === 0) return null;
  return ((last.value - first.value) / first.value) * 100;
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
