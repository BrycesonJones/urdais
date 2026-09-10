/**
 * Range windows and period returns for the market detail chart.
 *
 * A range is a window that ends at the instrument's latest observation. Its
 * base is the last observation at or before the window start, so the return
 * is measured from the close that precedes the window, the way "year to
 * date" is measured from the previous year's final close. Pure functions of
 * the series and the as-of time, so the same history always yields the same
 * numbers.
 */

import { DETAIL_RANGES } from "@/types/market";
import type { DetailRange, DetailedSeries, PeriodPerformance, TimeSeriesPoint } from "@/types/market";

const DAY = 86_400;

export const RANGE_LABELS: Record<DetailRange, string> = {
  "1D": "1 day",
  "5D": "5 days",
  "1M": "1 month",
  "6M": "6 months",
  YTD: "YTD",
  "1Y": "1 year",
  "5Y": "5 years",
  "10Y": "10 years",
  ALL: "All time",
};

/** Ranges drawn from the 15-minute series rather than daily closes. */
const INTRADAY_RANGES: ReadonlySet<DetailRange> = new Set(["1D", "5D"]);

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

/** Start of the window for a range, or null for the full history. */
export function rangeStart(range: DetailRange, asOf: number): number | null {
  switch (range) {
    case "1D":
      return asOf - DAY;
    case "5D":
      return asOf - 5 * DAY;
    case "1M":
      return shiftUtc(asOf, { months: -1 });
    case "6M":
      return shiftUtc(asOf, { months: -6 });
    case "YTD":
      return Date.UTC(new Date(asOf * 1000).getUTCFullYear(), 0, 1) / 1000;
    case "1Y":
      return shiftUtc(asOf, { years: -1 });
    case "5Y":
      return shiftUtc(asOf, { years: -5 });
    case "10Y":
      return shiftUtc(asOf, { years: -10 });
    case "ALL":
      return null;
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

function sourcePoints(series: DetailedSeries, range: DetailRange): TimeSeriesPoint[] {
  return isIntradayRange(range) ? series.intraday : series.daily;
}

/**
 * Points inside the window, starting at the base observation. When the
 * history starts after the window does, the whole history is returned so a
 * shorter comparison series can still be drawn over a longer primary window.
 */
export function windowPoints(series: DetailedSeries, range: DetailRange, asOf: number): TimeSeriesPoint[] {
  const points = sourcePoints(series, range);
  const start = rangeStart(range, asOf);
  if (start === null) return points;
  const base = baseIndex(points, start);
  return base < 0 ? points : points.slice(base);
}

/** A range is supported when the history reaches back to the window's base. */
export function isRangeAvailable(series: DetailedSeries, range: DetailRange, asOf: number): boolean {
  const points = sourcePoints(series, range);
  if (points.length < 2) return false;
  const start = rangeStart(range, asOf);
  return start === null || baseIndex(points, start) >= 0;
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
