/**
 * How a comparison chart decides what it is plotting, and what its axis is therefore called.
 *
 * The defect this module exists to close: rebasing to percentage change divides by the window's
 * first value, and the chart used to fall back to plotting *raw values* whenever that base was
 * zero -- while leaving the axis labelled `%`. Dollars per megawatt-hour drawn against a percent
 * axis is not a rendering quirk; it is a chart that states something untrue, and a negative base
 * is worse still, because the rebased series then falls as the price rises.
 *
 * The fix is structural rather than a guard bolted on at the division. One call returns the mode,
 * the plotted points, whether comparisons may be drawn at all, and the axis unit, so the label and
 * the numbers under it cannot come from different decisions. A percent axis is possible only when
 * every plotted series has a strictly positive base -- the same rule §D applies to a published
 * percentage change, for the same reason.
 *
 * When rebasing is refused, the comparison is dropped rather than silently redrawn in some other
 * unit: two series in different units on one absolute axis would be a second way of saying
 * something untrue. The caller states why, and the reader can pick a different range -- a longer
 * or shorter window frequently has a positive base.
 */

import type { ComparisonBasis, TimeSeriesPoint } from "@/types/market";

/** A point with the value it is plotted at, which differs from `value` on a relative basis. */
export type PlotPoint = TimeSeriesPoint & { plotted: number };

export type PlotSuppression =
  /** Nothing was suppressed: either an absolute chart, or a rebase that was valid. */
  | "none"
  /** There is nothing to compare against, so the basis question does not arise. */
  | "no_comparisons"
  /** A rebase was asked for and at least one series' window base is zero or negative. */
  | "nonpositive_base";

export type PlotResolution = {
  readonly mode: "absolute" | "relative";
  /** False when a requested rebase was refused: the primary is drawn alone. */
  readonly comparisonsVisible: boolean;
  readonly suppression: PlotSuppression;
  /** What the axis is labelled. `%` only when `mode` is relative. */
  readonly axisUnit: string;
  readonly primary: readonly PlotPoint[];
  /** Plotted comparison series, positionally matching the input. Empty when they are not drawn. */
  readonly comparisons: readonly (readonly PlotPoint[])[];
};

/** Whether a series can be expressed as percentage change from its own window base. */
export function canRebase(points: readonly TimeSeriesPoint[]): boolean {
  const base = points[0]?.value;
  return base !== undefined && Number.isFinite(base) && base > 0;
}

function plotAbsolute(points: readonly TimeSeriesPoint[]): PlotPoint[] {
  return points.map((point) => ({ ...point, plotted: point.value }));
}

function plotRelative(points: readonly TimeSeriesPoint[]): PlotPoint[] {
  const base = points[0]!.value;
  return points.map((point) => ({ ...point, plotted: (point.value / base - 1) * 100 }));
}

export type PlotRequest = {
  readonly requested: ComparisonBasis;
  readonly primaryUnit: string;
  readonly primary: readonly TimeSeriesPoint[];
  /** Comparison series already filtered to those long enough to draw. */
  readonly comparisons: readonly (readonly TimeSeriesPoint[])[];
};

/**
 * Resolve one chart's basis, its plotted points and its axis unit together.
 *
 * Deliberately the only way to produce plotted points: taking the mode from here and the values
 * from somewhere else is how the two came to disagree in the first place.
 */
export function resolvePlot(request: PlotRequest): PlotResolution {
  const absolute = (suppression: PlotSuppression, comparisonsVisible: boolean): PlotResolution => ({
    mode: "absolute",
    comparisonsVisible,
    suppression,
    axisUnit: request.primaryUnit,
    primary: plotAbsolute(request.primary),
    comparisons: comparisonsVisible ? request.comparisons.map(plotAbsolute) : [],
  });

  if (request.comparisons.length === 0) {
    return absolute(request.requested === "relative" ? "no_comparisons" : "none", false);
  }
  if (request.requested !== "relative") return absolute("none", true);

  const everyBasePositive = canRebase(request.primary) && request.comparisons.every(canRebase);
  if (!everyBasePositive) return absolute("nonpositive_base", false);

  return {
    mode: "relative",
    comparisonsVisible: true,
    suppression: "none",
    axisUnit: "%",
    primary: plotRelative(request.primary),
    comparisons: request.comparisons.map(plotRelative),
  };
}
