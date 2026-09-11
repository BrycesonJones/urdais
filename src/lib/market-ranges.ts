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
