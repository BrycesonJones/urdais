/**
 * The Flexible Capacity scenario calculation.
 *
 * One question, stated exactly once:
 *
 *   How much additional flat load Delta-L could this balancing authority have carried through the
 *   modelled period without demand exceeding the peak reference, if that new load accepted an
 *   annual curtailment energy allowance of alpha times its own annual energy?
 *
 * For each hour t, with `d_t = Peak_ref - Load_t` the headroom below the reference:
 *
 *   R_t(Delta-L) = min(Delta-L, max(0, Delta-L - d_t))
 *
 * R_t is what the new load must shed in hour t. The outer `min` is the physics: new load can
 * curtail itself and nothing else, so it can never shed more than its own size, and an hour whose
 * demand already exceeded the reference before the new load arrived is not something the new load
 * can fix. Under the rule 1.0.0 adopts the reference is the period's own maximum, so every d_t is
 * non-negative and the clamp never binds; it is written anyway because it is the definition, and
 * because a later version adopting a different reference would need it.
 *
 * Delta-L* is then the largest Delta-L >= 0 satisfying
 *
 *   sum_t R_t(Delta-L)  <=  alpha * Delta-L * T
 *
 * where T is the count of valid hourly observations actually used -- not 8,760, and not the
 * nominal length of the year.
 *
 * Why the feasible set is an interval, which is what makes bisection valid. Each R_t is
 * non-decreasing, convex and piecewise linear in Delta-L, so their sum is too; the budget is
 * linear. Their difference g(Delta-L) is therefore convex with g(0) = 0, so {g <= 0} is an
 * interval anchored at zero and feasibility is monotone: if Delta-L is feasible, everything below
 * it is. `scenario.test.ts` tests that property directly rather than assuming it.
 *
 * The search is bounded analytically rather than by a guessed ceiling. Since
 * R_t >= Delta-L - max(d_t, 0),
 *
 *   sum_t R_t >= T*Delta-L - sum_t max(d_t, 0)
 *
 * so any Delta-L above `sum_t max(d_t, 0) / ((1 - alpha) * T)` is infeasible. That bound is
 * exactly (Peak_ref - mean Load) / (1 - alpha) when no hour exceeds the reference, which is also
 * the honest intuition for the whole product: headroom cannot exceed the average unused headroom,
 * inflated by whatever curtailment is permitted.
 */

import {
  BATTERY_ENABLED, DEFAULT_ALPHA_SCENARIOS, MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION,
  METHODOLOGY_SLUG, METHODOLOGY_VERSION, MINIMUM_ANNUAL_COVERAGE, MODELED_LOAD_SHAPE,
  PEAK_REFERENCE_RULE, REBOUND_MODEL, STANDING_LIMITATIONS,
} from "@/lib/flexible-capacity/methodology";
import { assessCoverage, assessPeakRegion } from "@/lib/flexible-capacity/period";
import {
  FlexibleCapacityDomainError,
  type CurtailmentEvent, type FlexibleCapacityScenarioInput, type FlexibleCapacityScenarioResult,
  type HourlyLoadPoint, type PeakReferenceRule, type ScenarioResult,
} from "@/lib/flexible-capacity/types";

const HOUR_MS = 3_600_000;

/** Bisection stops when the bracket is this narrow, in MW. One microwatt. */
export const SOLVER_TOLERANCE_MW = 0.000001;

/** A ceiling on iterations. The analytic bound needs ~35 halvings to reach the tolerance. */
export const SOLVER_MAX_ITERATIONS = 100;

/** Reported megawatts are floored to this many decimals, so the answer stays feasible. */
export const REPORTED_MW_DECIMALS = 6;

const floorTo = (value: number, decimals: number): number => {
  const scale = 10 ** decimals;
  return Math.floor(value * scale) / scale;
};

export type PeakReference = { readonly mw: number; readonly atUtc: string };

/**
 * The peak reference for a series.
 *
 * Ties resolve to the earliest hour so that the answer does not depend on iteration order. Only
 * the rule 1.0.0 adopts is implemented; the others are named in the type so the alternatives are
 * on the record, and reaching one here is a registration error rather than a silent fallback.
 */
export function peakReference(
  series: readonly HourlyLoadPoint[], rule: PeakReferenceRule,
): PeakReference {
  if (rule !== PEAK_REFERENCE_RULE) {
    throw new FlexibleCapacityDomainError(
      `peak reference rule '${rule}' is named but not adopted by methodology ${METHODOLOGY_VERSION}`);
  }
  if (series.length === 0) throw new FlexibleCapacityDomainError("the series is empty");
  let best = series[0]!;
  for (const point of series) {
    if (point.valueMw > best.valueMw) best = point;
  }
  return { mw: best.valueMw, atUtc: best.periodStartUtc };
}

/** d_t: headroom below the reference in each hour, in series order. */
export function headroomGapsMw(series: readonly HourlyLoadPoint[], peakReferenceMw: number): number[] {
  return series.map((point) => peakReferenceMw - point.valueMw);
}

/** R_t at a given Delta-L, in series order. */
export function curtailmentProfileMw(gapsMw: readonly number[], deltaMw: number): number[] {
  return gapsMw.map((gap) => Math.min(deltaMw, Math.max(0, deltaMw - gap)));
}

/** sum_t R_t, in MWh: each hour's shed megawatts persist for exactly one hour. */
export function curtailedEnergyMwh(gapsMw: readonly number[], deltaMw: number): number {
  let total = 0;
  for (const gap of gapsMw) total += Math.min(deltaMw, Math.max(0, deltaMw - gap));
  return total;
}

/** The analytic ceiling above which no Delta-L can satisfy the budget. */
export function headroomUpperBoundMw(gapsMw: readonly number[], alpha: number): number {
  let positiveGapSum = 0;
  for (const gap of gapsMw) positiveGapSum += Math.max(gap, 0);
  return positiveGapSum / ((1 - alpha) * gapsMw.length);
}

/**
 * How closely a curtailed-energy figure must sit inside its budget.
 *
 * Relative, not absolute, and exported so that the solver, the stored-result validator and the
 * database constraint all apply the same rule. Summing thousands of megawatt-hour terms leaves
 * float residue proportional to the total -- for a market spending 1.6 million MWh that is a
 * fraction of a megawatt-hour -- and an absolute tolerance tight enough for a small fixture would
 * reject an arithmetically correct answer for a large market.
 */
export function energyToleranceMwh(budgetMwh: number): number {
  return 1e-9 * (Math.abs(budgetMwh) + 1);
}

function feasible(gapsMw: readonly number[], alpha: number, deltaMw: number): boolean {
  const budget = alpha * deltaMw * gapsMw.length;
  return curtailedEnergyMwh(gapsMw, deltaMw) <= budget + energyToleranceMwh(budget);
}

/**
 * Solve for Delta-L*, in MW, by bisection on the feasible interval.
 *
 * Returns the feasible side of the bracket, never the infeasible one, so the answer always
 * satisfies the curtailment budget rather than merely approximating it. With alpha = 0 this is
 * exactly zero: no positive flat load can be added without exceeding a reference that the period's
 * own peak hour already touches.
 */
export function solveHeadroomMw(gapsMw: readonly number[], alpha: number): number {
  if (gapsMw.length === 0) throw new FlexibleCapacityDomainError("the series is empty");
  if (!Number.isFinite(alpha) || alpha < 0) {
    throw new FlexibleCapacityDomainError(`alpha ${alpha} is negative or not finite`);
  }
  if (alpha > MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION) {
    throw new FlexibleCapacityDomainError(
      `alpha ${alpha} exceeds the methodology maximum ${MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION}`);
  }
  const upper = headroomUpperBoundMw(gapsMw, alpha);
  if (!(upper > 0)) return 0;
  if (feasible(gapsMw, alpha, upper)) return upper;

  let low = 0;
  let high = upper;
  for (let iteration = 0; iteration < SOLVER_MAX_ITERATIONS && high - low > SOLVER_TOLERANCE_MW; iteration += 1) {
    const mid = (low + high) / 2;
    if (feasible(gapsMw, alpha, mid)) low = mid; else high = mid;
  }
  return low;
}

/** Maximal runs of consecutive curtailed hours. A missing hour ends a run; it never bridges one. */
export function curtailmentEvents(
  series: readonly HourlyLoadPoint[], profileMw: readonly number[],
): CurtailmentEvent[] {
  const events: CurtailmentEvent[] = [];
  let open: { startMs: number; lastMs: number; hours: number } | null = null;
  const close = (): void => {
    if (open === null) return;
    events.push({
      startUtc: new Date(open.startMs).toISOString(),
      endUtc: new Date(open.lastMs + HOUR_MS).toISOString(),
      hours: open.hours,
    });
    open = null;
  };
  for (const [index, point] of series.entries()) {
    const ms = Date.parse(point.periodStartUtc);
    if ((profileMw[index] ?? 0) <= 0) { close(); continue; }
    if (open !== null && ms === open.lastMs + HOUR_MS) {
      open.lastMs = ms;
      open.hours += 1;
      continue;
    }
    close();
    open = { startMs: ms, lastMs: ms, hours: 1 };
  }
  close();
  return events;
}

export type ScenarioOptions = {
  /** Overrides the methodology coverage floor. Tests use it; production must not. */
  readonly minimumCoverage?: number;
};

/**
 * Run one scenario.
 *
 * Refuses rather than degrades. A market-year below the coverage floor produces no figure at all:
 * the alternative is a headroom number computed from a year that is missing part of its own peak
 * season, which would look exactly like a good one.
 */
export function runFlexibleCapacityScenario(
  input: FlexibleCapacityScenarioInput, options: ScenarioOptions = {},
): FlexibleCapacityScenarioResult {
  const { market, modeledPeriod, hourlyLoadSeries, annualCurtailmentEnergyFraction: alpha } = input;
  if (market !== modeledPeriod.market) {
    throw new FlexibleCapacityDomainError(`series market ${market} does not match period market ${modeledPeriod.market}`);
  }
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION) {
    throw new FlexibleCapacityDomainError(
      `alpha must lie in [0, ${MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION}]; received ${alpha}`);
  }

  const threshold = options.minimumCoverage ?? MINIMUM_ANNUAL_COVERAGE;
  const coverage = assessCoverage(hourlyLoadSeries, modeledPeriod, threshold);
  if (!coverage.meetsThreshold) {
    throw new FlexibleCapacityDomainError(
      `${market} ${modeledPeriod.localYear} has ${(coverage.coverageRatio * 100).toFixed(3)}% hourly coverage, `
      + `below the ${(threshold * 100).toFixed(3)}% floor; ${coverage.missingObservationCount} hours are absent `
      + "and methodology 1.0.0 does not interpolate them");
  }

  // Chronological order is a precondition for event detection, and cheap to guarantee here.
  const series = [...hourlyLoadSeries].sort(
    (left, right) => Date.parse(left.periodStartUtc) - Date.parse(right.periodStartUtc));

  const peak = peakReference(series, input.peakReferenceRule);

  // The coverage floor bounds how many hours are absent; this bounds where. A year that lost the
  // afternoon of its hottest day could keep a shoulder hour, set the reference from it, and report
  // more headroom than the evidence supports while its coverage ratio still looked healthy.
  const peakRegion = assessPeakRegion(series, modeledPeriod, peak.atUtc);
  if (!peakRegion.complete) {
    throw new FlexibleCapacityDomainError(
      `${market} ${modeledPeriod.localYear} is missing ${peakRegion.missingHours} of the `
      + `${peakRegion.expectedHours} hours on ${peakRegion.localDate}, the local day holding the `
      + "peak reference; methodology 1.0.0 will not set a peak reference from an incomplete peak day");
  }

  const gaps = headroomGapsMw(series, peak.mw);
  const observationCount = series.length;

  const solved = solveHeadroomMw(gaps, alpha);
  // Report the floored value and describe *that*, so the stated energy belongs to the stated
  // headroom rather than to a slightly different number held only inside the solver.
  const headroomMw = floorTo(solved, REPORTED_MW_DECIMALS);
  const profile = curtailmentProfileMw(gaps, headroomMw);
  const events = curtailmentEvents(series, profile);
  const curtailed = profile.reduce((sum, value) => sum + value, 0);

  let loadSum = 0;
  for (const point of series) loadSum += point.valueMw;

  const result: ScenarioResult = {
    curtailmentEnabledHeadroomMw: headroomMw,
    curtailmentEnabledHeadroomGw: headroomMw / 1000,
    curtailedEnergyMwh: curtailed,
    curtailmentBudgetMwh: alpha * headroomMw * observationCount,
    curtailmentClockHours: events.reduce((sum, event) => sum + event.hours, 0),
    curtailmentEventCount: events.length,
    meanCurtailmentEventHours: events.length === 0
      ? 0 : events.reduce((sum, event) => sum + event.hours, 0) / events.length,
    maxCurtailmentEventHours: events.reduce((longest, event) => Math.max(longest, event.hours), 0),
  };

  return {
    market,
    methodology: { slug: METHODOLOGY_SLUG, version: METHODOLOGY_VERSION },
    modeledPeriod,
    observed: {
      peakReferenceMw: peak.mw,
      peakReferenceAtUtc: peak.atUtc,
      meanLoadMw: loadSum / observationCount,
      observationCount,
      expectedObservationCount: coverage.expectedObservationCount,
      missingObservationCount: coverage.missingObservationCount,
      coverageRatio: coverage.coverageRatio,
      peakRegion: {
        localDate: peakRegion.localDate,
        expectedHours: peakRegion.expectedHours,
        presentHours: peakRegion.presentHours,
        complete: peakRegion.complete,
      },
    },
    assumptions: {
      annualCurtailmentEnergyFraction: alpha,
      equivalentFullLoadHours: alpha * observationCount,
      nominalEquivalentFullLoadHours: alpha * coverage.expectedObservationCount,
      peakReferenceRule: input.peakReferenceRule,
      reboundModel: REBOUND_MODEL,
      modeledLoadShape: MODELED_LOAD_SHAPE,
      batteryEnabled: BATTERY_ENABLED,
    },
    result,
    limitations: STANDING_LIMITATIONS,
  };
}

/** The default scenario set, for a single market-year. */
export function runDefaultScenarios(
  input: Omit<FlexibleCapacityScenarioInput, "annualCurtailmentEnergyFraction">,
  options: ScenarioOptions = {},
): FlexibleCapacityScenarioResult[] {
  return DEFAULT_ALPHA_SCENARIOS.map((alpha) =>
    runFlexibleCapacityScenario({ ...input, annualCurtailmentEnergyFraction: alpha }, options));
}
