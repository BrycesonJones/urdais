/**
 * The FC-3 gap-sensitivity study.
 *
 * The question it exists to answer:
 *
 *   Outside the already-protected peak day, how long may a contiguous run of missing hours be
 *   before the scenario result stops being trustworthy?
 *
 * Why naturally occurring gaps cannot answer it. Measured EIA-930 history is almost complete --
 * the worst market-year in FC-2 was missing two hours -- so waiting for a bad year to appear would
 * mean never resolving the parameter. The evidence has to be manufactured: take a year that is
 * complete, delete a block of known length at a known place, and measure what the model does.
 *
 * Where the distortion comes from, which is what makes the search tractable. With the peak day
 * complete and the deletion outside it, `Peak_ref` is invariant -- the maximum survives, so every
 * `d_t` is unchanged. The whole effect is on the feasibility equation
 *
 *     sum_t max(0, D - d_t)  <=  alpha * D * T
 *
 * Deleting an hour removes its term `c_t = max(0, D - d_t)` from the left and one unit of T from
 * the right. So:
 *
 *   - deleting a **low-load** hour removes nothing from the left (its `c_t` is zero) but shrinks
 *     the budget, and D* **falls**. Understating headroom is the safe direction.
 *   - deleting a **high-load** hour removes a large `c_t` and only `alpha * D` of budget, and D*
 *     **rises**. Overstating headroom is the dangerous direction, and it is the one the threshold
 *     has to bound.
 *
 * That also identifies the worst case analytically rather than by brute force: the most damaging
 * window of length L is the one maximising the sum of `c_t` over L consecutive hours, which a
 * single sliding pass finds. The argument is first order, so the study recomputes the top of that
 * ranking rather than its single best entry; `exhaustiveWorstCase` re-derives the answer by
 * testing every admissible placement and confirms on a small fixture that the neighbourhood is
 * wide enough.
 *
 * One measured result is worth stating here because it shapes how a threshold must be read.
 * **Worst-case distortion is not monotone in gap length.** A long window cannot be aimed: a
 * 24-hour gap necessarily swallows a nightly trough, whose hours carry no curtailment and only
 * cost budget, while a 12-hour gap can sit entirely on the afternoon hours that do carry it. The
 * worst case therefore peaks at a length comparable to the daily curtailment window. A threshold
 * of N accordingly promises that no gap of *any* length up to N distorts the answer by more than
 * the stated bound -- a running maximum, never a single measurement at N.
 */

import { localDateOf } from "@/lib/flexible-capacity/period";
import { curtailmentEvents, curtailmentProfileMw, headroomGapsMw, peakReference, solveHeadroomMw }
  from "@/lib/flexible-capacity/scenario";
import { PEAK_REFERENCE_RULE } from "@/lib/flexible-capacity/methodology";
import type { HourlyLoadPoint, ModeledPeriod } from "@/lib/flexible-capacity/types";

/** Where a deleted window sits in the load distribution. */
export type GapPlacement =
  | "worst_case_contribution"
  | "highest_load"
  | "peak_day_adjacent"
  | "median_load"
  | "lowest_load";

export type ScenarioSummary = {
  readonly headroomMw: number;
  readonly peakReferenceMw: number;
  readonly observationCount: number;
  readonly curtailmentClockHours: number;
  readonly curtailmentEventCount: number;
  readonly maxCurtailmentEventHours: number;
};

export type GapExperiment = {
  readonly market: string;
  readonly localYear: number;
  readonly alpha: number;
  readonly gapHours: number;
  readonly placement: GapPlacement;
  readonly gapStartUtc: string;
  readonly baseline: ScenarioSummary;
  readonly perturbed: ScenarioSummary;
  readonly absoluteChangeMw: number;
  /** Signed: positive means the gap made the model report more headroom than the truth. */
  readonly relativeChange: number;
  readonly peakReferenceChanged: boolean;
};

/** Summarise a series at one alpha. */
export function summarise(series: readonly HourlyLoadPoint[], alpha: number): ScenarioSummary {
  const peak = peakReference(series, PEAK_REFERENCE_RULE);
  const gaps = headroomGapsMw(series, peak.mw);
  const headroomMw = solveHeadroomMw(gaps, alpha);
  const events = curtailmentEvents(series, curtailmentProfileMw(gaps, headroomMw));
  return {
    headroomMw,
    peakReferenceMw: peak.mw,
    observationCount: series.length,
    curtailmentClockHours: events.reduce((sum, event) => sum + event.hours, 0),
    curtailmentEventCount: events.length,
    maxCurtailmentEventHours: events.reduce((longest, event) => Math.max(longest, event.hours), 0),
  };
}

/** Indices whose local date equals the peak day; deleting any of them is already fatal. */
function peakDayIndices(
  series: readonly HourlyLoadPoint[], period: ModeledPeriod, peakAtUtc: string,
): Set<number> {
  const peakDate = localDateOf(peakAtUtc, period.timezone);
  const indices = new Set<number>();
  for (const [index, point] of series.entries()) {
    if (localDateOf(point.periodStartUtc, period.timezone) === peakDate) indices.add(index);
  }
  return indices;
}

/** Whether a window of `length` starting at `start` avoids the protected peak day entirely. */
function admissible(start: number, length: number, protectedIndices: Set<number>, total: number): boolean {
  if (start < 0 || start + length > total) return false;
  for (let index = start; index < start + length; index += 1) {
    if (protectedIndices.has(index)) return false;
  }
  return true;
}

function windowSums(values: readonly number[], length: number): number[] {
  const sums: number[] = [];
  let running = 0;
  for (const [index, value] of values.entries()) {
    running += value;
    if (index >= length) running -= values[index - length]!;
    if (index >= length - 1) sums.push(running);
  }
  return sums;
}

function pickWindow(
  sums: readonly number[], length: number, protectedIndices: Set<number>, total: number,
  prefer: "max" | "min",
): number | null {
  let best: number | null = null;
  let bestValue = prefer === "max" ? -Infinity : Infinity;
  for (const [start, value] of sums.entries()) {
    if (!admissible(start, length, protectedIndices, total)) continue;
    if (prefer === "max" ? value > bestValue : value < bestValue) { bestValue = value; best = start; }
  }
  return best;
}

/**
 * How many of the highest-contribution windows are recomputed rather than just the single best.
 *
 * The sliding-window argument is first order: it maximises the contribution removed at the
 * *baseline* answer, and the true maximiser of the change in D* can differ slightly because
 * deleting hours also shifts which hours lie inside the curtailment set at the new answer. An
 * exhaustive scan would settle it but costs one solve per placement, which a year of hourly data
 * makes impossible. Recomputing the top of the ranking instead captures the second-order effect at
 * a bounded cost, and `exhaustiveWorstCase` confirms on a small fixture that the neighbourhood is
 * wide enough to contain the true worst case.
 */
export const CONTRIBUTION_NEIGHBOURHOOD = 40;

function topWindows(
  sums: readonly number[], length: number, protectedIndices: Set<number>, total: number, take: number,
): number[] {
  return [...sums.entries()]
    .filter(([start]) => admissible(start, length, protectedIndices, total))
    .sort((left, right) => right[1] - left[1])
    .slice(0, take)
    .map(([start]) => start);
}

export function deleteWindow(
  series: readonly HourlyLoadPoint[], start: number, length: number,
): HourlyLoadPoint[] {
  return [...series.slice(0, start), ...series.slice(start + length)];
}

/** The candidate placements tested for one gap length. */
export function candidatePlacements(
  series: readonly HourlyLoadPoint[], period: ModeledPeriod, alpha: number, gapHours: number,
): { placement: GapPlacement; start: number }[] {
  const peak = peakReference(series, PEAK_REFERENCE_RULE);
  const gaps = headroomGapsMw(series, peak.mw);
  const baselineHeadroom = solveHeadroomMw(gaps, alpha);
  const protectedIndices = peakDayIndices(series, period, peak.atUtc);
  const total = series.length;

  // c_t: how much each hour contributes to the curtailment requirement at the baseline answer.
  const contribution = curtailmentProfileMw(gaps, baselineHeadroom);
  const loads = series.map((point) => point.valueMw);

  const contributionSums = windowSums(contribution, gapHours);
  const loadSums = windowSums(loads, gapHours);

  const chosen: { placement: GapPlacement; start: number }[] = [];
  const push = (placement: GapPlacement, start: number | null): void => {
    if (start !== null) chosen.push({ placement, start });
  };

  for (const start of topWindows(contributionSums, gapHours, protectedIndices, total, CONTRIBUTION_NEIGHBOURHOOD)) {
    push("worst_case_contribution", start);
  }
  push("highest_load", pickWindow(loadSums, gapHours, protectedIndices, total, "max"));
  push("lowest_load", pickWindow(loadSums, gapHours, protectedIndices, total, "min"));

  // The block ending immediately before the peak day begins: the nearest a gap may legally sit to
  // the peak, and the placement an operator would intuitively worry about most.
  const firstPeakIndex = Math.min(...protectedIndices);
  push("peak_day_adjacent", admissible(firstPeakIndex - gapHours, gapHours, protectedIndices, total)
    ? firstPeakIndex - gapHours : null);

  // A median-load window, as the benign reference case.
  const ordered = [...loadSums.entries()]
    .filter(([start]) => admissible(start, gapHours, protectedIndices, total))
    .sort((left, right) => left[1] - right[1]);
  push("median_load", ordered.length === 0 ? null : ordered[Math.floor(ordered.length / 2)]![0]);

  // De-duplicate identical starts, keeping the first (most meaningful) label.
  const seen = new Set<number>();
  return chosen.filter(({ start }) => (seen.has(start) ? false : (seen.add(start), true)));
}

/** Run every candidate placement for one market-year, alpha and gap length. */
export function runGapExperiments(
  series: readonly HourlyLoadPoint[], period: ModeledPeriod, market: string,
  alpha: number, gapHours: number,
): GapExperiment[] {
  const baseline = summarise(series, alpha);
  return candidatePlacements(series, period, alpha, gapHours).map(({ placement, start }) => {
    const perturbedSeries = deleteWindow(series, start, gapHours);
    const perturbed = summarise(perturbedSeries, alpha);
    const absoluteChangeMw = perturbed.headroomMw - baseline.headroomMw;
    return {
      market, localYear: period.localYear, alpha, gapHours, placement,
      gapStartUtc: series[start]!.periodStartUtc,
      baseline, perturbed,
      absoluteChangeMw,
      relativeChange: baseline.headroomMw === 0 ? 0 : absoluteChangeMw / baseline.headroomMw,
      peakReferenceChanged: perturbed.peakReferenceMw !== baseline.peakReferenceMw,
    };
  });
}

/**
 * Test every admissible placement, not just the analytic candidates.
 *
 * Slow on purpose, and run only on a representative market-year: its job is to confirm that the
 * sliding-window argument really does find the worst case, so the rest of the study may rely on it.
 */
export function exhaustiveWorstCase(
  series: readonly HourlyLoadPoint[], period: ModeledPeriod, alpha: number, gapHours: number,
): { start: number; relativeChange: number; startUtc: string } {
  const baseline = summarise(series, alpha);
  const peak = peakReference(series, PEAK_REFERENCE_RULE);
  const protectedIndices = peakDayIndices(series, period, peak.atUtc);
  let best = { start: -1, relativeChange: -Infinity, startUtc: "" };
  for (let start = 0; start + gapHours <= series.length; start += 1) {
    if (!admissible(start, gapHours, protectedIndices, series.length)) continue;
    const perturbed = summarise(deleteWindow(series, start, gapHours), alpha);
    const relativeChange = baseline.headroomMw === 0
      ? 0 : (perturbed.headroomMw - baseline.headroomMw) / baseline.headroomMw;
    if (relativeChange > best.relativeChange) {
      best = { start, relativeChange, startUtc: series[start]!.periodStartUtc };
    }
  }
  return best;
}

/** Default lengths swept by the study. */
export const GAP_LENGTHS_HOURS = [1, 2, 3, 6, 12, 18, 24, 36, 48, 72, 96] as const;
