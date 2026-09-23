/**
 * Monthly series mechanics for the UMPI surface.
 *
 * A UMPI point is identified by a reference month (`YYYY-MM`), not by an instant. Everything
 * here exists to keep that distinction intact on the way to a chart: the month is the identity,
 * a timestamp is only a position on an axis, and no function in this file ever produces a point
 * that was not published.
 *
 * Two rules matter more than the rest.
 *
 * **Gaps are real.** UMPI's export unit-value series publishes its 2020 base year and then
 * resumes years later, because those are the months Urdais has collected — not because anything
 * happened in between. Positioning points by their place in an array would draw that hole as a
 * single smooth segment, which is a picture of five years of movement that was never observed.
 * `umpiSegments` positions by elapsed months and breaks the line wherever consecutive points are
 * not consecutive months, so a gap reads as a gap.
 *
 * **Ranges are read off the published points.** The shared low-frequency helpers already do this
 * for once-per-day indices; monthly is the same problem one step further out. `1D` and `1W` are
 * refused outright rather than left to fail the availability test, because a monthly index should
 * not offer a daily horizon even if some future backfill accidentally satisfied one.
 */

import { isLowFrequencyRangeAvailable } from "@/lib/market-ranges";
import type { DetailRange, TimeSeriesPoint } from "@/types/market";
import type { UmpiPoint } from "@/lib/umpi/read/read-model";

/** Horizons a monthly index may offer. `1D` and `1W` are absent by construction, not by filter. */
export const UMPI_RANGES = ["3M", "6M", "1Y"] as const satisfies readonly DetailRange[];

/** How far back each window reaches, in months. A monthly index measures its axis in months. */
const RANGE_MONTHS: Record<(typeof UMPI_RANGES)[number], number> = { "3M": 3, "6M": 6, "1Y": 12 };

/** The whole published history, offered alongside the fixed windows for a sparse series. */
export const UMPI_ALL_RANGE = "ALL" as const;

export type UmpiRange = (typeof UMPI_RANGES)[number] | typeof UMPI_ALL_RANGE;

/** Months since 1970-01, the unit the axis is spaced in. */
export function monthOrdinal(referenceMonth: string): number {
  const [year, month] = referenceMonth.split("-").map(Number);
  return (year ?? 0) * 12 + ((month ?? 1) - 1);
}

/** Midnight UTC on the first of the month, for the shared range helpers only. */
export function monthStartUtc(referenceMonth: string): number {
  const [year, month] = referenceMonth.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, 1) / 1000;
}

/** `2026-08` renders as `Aug 2026`. Never a day: a month is not the first of the month. */
export function formatReferenceMonth(referenceMonth: string): string {
  const [year, month] = referenceMonth.split("-").map(Number);
  if (!year || !month) return referenceMonth;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  )} ${year}`;
}

/** Published points as an axis series. The value is the published level and nothing is added. */
export function umpiTimeSeries(points: readonly UmpiPoint[]): TimeSeriesPoint[] {
  return points.map((point) => ({ time: monthStartUtc(point.referenceMonth), value: point.level }));
}

/**
 * The series' own `asOf`: the latest published month, never the clock.
 *
 * A monthly index published through August is not stale in October, and measuring its horizons
 * against today's date would make every window shrink as the month wore on.
 */
export function umpiAsOf(points: readonly UmpiPoint[]): number {
  const last = points[points.length - 1];
  return last ? monthStartUtc(last.referenceMonth) : 0;
}

/**
 * Which horizons this history actually supports, `ALL` last.
 *
 * `ALL` appears as soon as there are two points to draw a line between. A fixed window appears
 * only when the published months reach back far enough to fill it, so a control never opens a
 * window that is empty or that measures across a hole.
 */
export function umpiAvailableRanges(points: readonly UmpiPoint[]): UmpiRange[] {
  if (points.length < 2) return [];
  const series = umpiTimeSeries(points);
  const asOf = umpiAsOf(points);
  const windows = UMPI_RANGES.filter((range) => isLowFrequencyRangeAvailable(series, range, asOf));
  return [...windows, UMPI_ALL_RANGE];
}

/**
 * The points inside a window. `ALL` is the published history, unfiltered.
 *
 * Counted in months rather than sliced from the nearest earlier observation. The shared slice
 * starts at the last point at or before the window opens, which is right for a continuously
 * quoted series and wrong here: the export unit-value series' nearest earlier point can be five
 * years stale, and including it would stretch a three-month window across the whole hole.
 */
export function umpiWindowPoints(points: readonly UmpiPoint[], range: UmpiRange): UmpiPoint[] {
  if (range === UMPI_ALL_RANGE) return [...points];
  const last = points[points.length - 1];
  if (!last) return [];
  const cutoff = monthOrdinal(last.referenceMonth) - RANGE_MONTHS[range];
  return points.filter((point) => monthOrdinal(point.referenceMonth) >= cutoff);
}

/**
 * The change across a window, as a percentage.
 *
 * Offered beside the chart and never in place of the headline. The headline change is MoM by
 * definition, and a range control must not be able to redefine what the index's change means.
 */
export function umpiRangeReturnPercent(
  points: readonly UmpiPoint[],
  range: UmpiRange,
): number | null {
  // A window Urdais will not offer is a window it will not measure either.
  if (!umpiAvailableRanges(points).includes(range)) return null;
  const window = umpiWindowPoints(points, range);
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last || first.level === 0) return null;
  return ((last.level - first.level) / first.level) * 100;
}

/**
 * Contiguous runs of consecutive months.
 *
 * Each run is drawn as its own line. Two runs separated by unpublished months are never joined,
 * because the join would be the only part of the picture that was not measured.
 */
export function umpiSegments(points: readonly UmpiPoint[]): UmpiPoint[][] {
  const segments: UmpiPoint[][] = [];
  let current: UmpiPoint[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous && monthOrdinal(point.referenceMonth) !== monthOrdinal(previous.referenceMonth) + 1) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/** True when the window omits months between its first and last published point. */
export function umpiHasGaps(points: readonly UmpiPoint[]): boolean {
  return umpiSegments(points).length > 1;
}
