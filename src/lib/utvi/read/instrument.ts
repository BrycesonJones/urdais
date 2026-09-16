/**
 * The published UTVI series, in the shape the Model Economics chart consumes.
 *
 * A translation layer and nothing more: it invents no point, fills no gap and derives no
 * value. Three properties of the real series make that worth saying explicitly.
 *
 * **Gaps stay gaps.** Two dates in the source's history return no rows — 2025-06-15 and
 * 2025-07-15 — and they are simply absent from the array. Nothing here inserts a zero or
 * interpolates a neighbour. If the chart library draws a straight line across the missing day,
 * that is a drawing decision about two real points either side of it; there is no third point
 * in the data, so no tooltip can report one and no calculation can read one.
 *
 * **There is no intraday tail.** The source publishes one figure per completed UTC day and
 * cannot serve a partial day at all, so `intraday` is empty. The mock had a synthesised
 * intraday bridge; a real one would be a fabrication.
 *
 * **Percentage change comes from the read model, not from the chart.** The chart's own
 * `periodReturn` walks whatever points fall inside a window, which would silently compare
 * against the nearest available date when the anchor is missing. UTVI's changes are
 * calendar-anchored and `null` when the anchor has no published value, so the API's numbers
 * are the ones that reach the page.
 */

import { DETAIL_RANGES, type DetailRange, type MarketInstrumentDetail, type TimeSeriesPoint } from "@/types/market";
import { UTVI_DISPLAY_NAME, UTVI_SYMBOL, UTVI_UNIT } from "@/lib/utvi/types";
import type { UtviChangePeriod } from "@/lib/utvi/calculate";
import type { UtviReadModel } from "@/lib/utvi/read/read-model";

/** The published surface for one UTVI instrument, plus what the chart cannot carry. */
export type UtviInstrumentView = {
  instrument: MarketInstrumentDetail;
  /** Calendar-anchored changes from the read model. `null` means no comparable point. */
  changePercent: Record<UtviChangePeriod, number | null>;
  settlementState: "provisional" | "final";
  methodologyVersion: string;
  universe: string;
  attribution: UtviReadModel extends { snapshot: infer S }
    ? S extends { attribution: infer A }
      ? A
      : never
    : never;
  /** Dates inside the series span for which the source published nothing. */
  coverageGaps: string[];
};

/** UTC midnight of a date, in seconds, which is the axis the chart uses. */
function secondsAtUtcMidnight(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

/**
 * Every date inside the series span that carries no point.
 *
 * Computed from the series rather than hardcoded, so a future gap is reported without a code
 * change and the two known ones need no special case.
 */
export function coverageGapsIn(dates: readonly string[]): string[] {
  if (dates.length < 2) return [];
  const present = new Set(dates);
  const first = Date.parse(`${dates[0]!}T00:00:00Z`);
  const last = Date.parse(`${dates[dates.length - 1]!}T00:00:00Z`);
  const gaps: string[] = [];
  for (let t = first; t <= last; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (!present.has(date)) gaps.push(date);
  }
  return gaps;
}

/**
 * Which ranges the published history is long enough to support.
 *
 * Decided by the span of real points, so a range is offered only when there is a point at or
 * before its start. The alternative — offering every range and letting the chart show a
 * truncated window as though it were a year — would misdescribe the data.
 */
export function availableUtviRanges(dates: readonly string[]): DetailRange[] {
  if (dates.length === 0) return [];
  const latest = Date.parse(`${dates[dates.length - 1]!}T00:00:00Z`);
  const earliest = Date.parse(`${dates[0]!}T00:00:00Z`);
  const spanDays = Math.round((latest - earliest) / 86_400_000);
  const needed: Record<DetailRange, number> = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 182, "1Y": 365 };
  return DETAIL_RANGES.filter((range) => spanDays >= needed[range]);
}

/**
 * Build the instrument, or return null when nothing is published.
 *
 * Null rather than an empty instrument: a chart with no points is a different thing from a
 * product that has not published, and the section says which.
 */
export function utviInstrumentFrom(model: UtviReadModel): UtviInstrumentView | null {
  const snapshot = model.snapshot;
  if (snapshot === null || model.series.length === 0) return null;

  const daily: TimeSeriesPoint[] = model.series.map((point) => ({
    time: secondsAtUtcMidnight(point.date),
    // A token count exceeds what a double holds exactly; the chart's axis is a double, so this
    // is the one place the value is narrowed, and it is narrowed for drawing only. The exact
    // decimal string is what the headline renders.
    value: Number(point.tokensPerDay),
  }));

  const dates = model.series.map((point) => point.date);
  const asOf = secondsAtUtcMidnight(snapshot.asOfDate);

  const instrument: MarketInstrumentDetail = {
    id: "utvi",
    shortLabel: UTVI_SYMBOL,
    symbol: UTVI_SYMBOL,
    name: UTVI_DISPLAY_NAME,
    unit: UTVI_UNIT,
    snapshot: {
      value: Number(snapshot.tokensPerDay),
      // The 1-day change, calendar-anchored by the read model. Null where the previous
      // calendar day has no published point, which is how a gap presents.
      changePercent: snapshot.changePercent["1D"],
      asOf,
    },
    // No intraday tail exists and none is synthesised: the source serves completed days only.
    series: { daily, intraday: [] },
    availableRanges: availableUtviRanges(dates),
    comparisons: [],
  };

  return {
    instrument,
    changePercent: snapshot.changePercent,
    settlementState: snapshot.settlementState,
    methodologyVersion: snapshot.methodologyVersion,
    universe: snapshot.universe,
    attribution: snapshot.attribution as UtviInstrumentView["attribution"],
    coverageGaps: coverageGapsIn(dates),
  };
}
