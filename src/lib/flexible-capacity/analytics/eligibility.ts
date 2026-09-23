/**
 * Whether a market-year may be modelled at all.
 *
 * Three conditions, and they exist because missing data is not one risk but three.
 *
 *   **Quantity.** Enough of the year must be present for T to mean something. That is
 *   `minimum_annual_coverage`, 99.5%, calibrated in FC-2 against measured history.
 *
 *   **The peak.** The local calendar day holding the observed maximum must be complete, or the
 *   reference could be a surviving shoulder hour of a day whose real peak is absent. FC-2 §7.
 *
 *   **Shape.** A coverage ratio cannot distinguish forty-four hours scattered through a mild
 *   spring from forty-four consecutive hours of an August afternoon, and those distort the answer
 *   very differently. That is `maximum_contiguous_gap_hours`, and FC-3 measured it rather than
 *   guessing: see `docs/research/flexible-capacity/fc3-gap-sensitivity.md`.
 *
 * The three are independent. Passing one says nothing about the others, and a market-year must
 * satisfy all of them. In particular the gap rule does not soften the peak-day rule: a gap of one
 * hour is within any threshold and is still fatal if it falls on the peak day.
 */

import {
  MAXIMUM_CONTIGUOUS_GAP_HOURS, MINIMUM_ANNUAL_COVERAGE, PEAK_PLAUSIBILITY_MAX_OVER_P999,
  PEAK_REFERENCE_RULE,
} from "@/lib/flexible-capacity/methodology";
import { assessCoverage, assessPeakRegion, type CoverageAssessment, type PeakRegionAssessment }
  from "@/lib/flexible-capacity/period";
import { peakReference } from "@/lib/flexible-capacity/scenario";
import type { HourlyLoadPoint, ModeledPeriod } from "@/lib/flexible-capacity/types";

export type EligibilityFailureCode =
  | "annual_coverage_below_floor"
  | "peak_day_incomplete"
  | "contiguous_gap_too_long"
  | "gap_threshold_unresolved"
  | "peak_implausible"
  | "series_empty";

export type EligibilityFailure = {
  readonly code: EligibilityFailureCode;
  readonly detail: string;
};

export type MarketYearEligibility = {
  readonly eligible: boolean;
  readonly failures: readonly EligibilityFailure[];
  readonly coverage: CoverageAssessment;
  readonly peakRegion: PeakRegionAssessment | null;
  /** Longest run of consecutive absent hours anywhere in the period. */
  readonly maxContiguousGapHours: number;
  /** The threshold applied, or null when the methodology has not resolved one. */
  readonly maxContiguousGapThreshold: number | null;
  /** The maximum divided by the 99.9th percentile of the same year. */
  readonly peakOverP999: number;
};

export type EligibilityOptions = {
  readonly minimumCoverage?: number;
  /**
   * Overrides the methodology threshold. The sensitivity study uses it to sweep candidate values;
   * production must not pass it, so that the applied rule is always the approved one.
   */
  readonly maximumContiguousGapHours?: number | null;
  /**
   * Research mode permits calculation while `maximum_contiguous_gap_hours` is unresolved, which is
   * how the study that resolves it is run at all. It never permits publication -- that is
   * `assertPublicationAuthorized`, a separate gate over the registry.
   */
  readonly allowUnresolvedGapThreshold?: boolean;
  /** Overrides the plausibility factor. The study uses it; production must not pass it. */
  readonly peakPlausibilityMaxOverP999?: number;
};

/**
 * A linearly interpolated percentile of the series' loads.
 *
 * Interpolated rather than nearest-rank so the reference does not jump as the observation count
 * changes by an hour; at the 99.9th percentile of a year that is the difference between the ninth
 * and tenth highest hour, and the rule should not depend on which of them a rounding rule picks.
 */
export function loadPercentile(series: readonly HourlyLoadPoint[], quantile: number): number {
  if (series.length === 0) return Number.NaN;
  const sorted = series.map((point) => point.valueMw).sort((left, right) => left - right);
  const position = quantile * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/** The longest run of absent hours, as `assessCoverage` already located them. */
export function maxContiguousGapHours(coverage: CoverageAssessment): number {
  return coverage.gaps.reduce((longest, gap) => Math.max(longest, gap.hours), 0);
}

/**
 * Assess a market-year against all three conditions.
 *
 * Reports every failure rather than the first. An operator looking at a rejected year wants to
 * know whether it is short by one hour on the peak day or missing a week in July, and stopping at
 * the first failure would hide the second.
 */
export function assessMarketYearEligibility(
  series: readonly HourlyLoadPoint[],
  period: ModeledPeriod,
  options: EligibilityOptions = {},
): MarketYearEligibility {
  const minimumCoverage = options.minimumCoverage ?? MINIMUM_ANNUAL_COVERAGE;
  const threshold = options.maximumContiguousGapHours === undefined
    ? MAXIMUM_CONTIGUOUS_GAP_HOURS : options.maximumContiguousGapHours;

  const coverage = assessCoverage(series, period, minimumCoverage);
  const longestGap = maxContiguousGapHours(coverage);
  const failures: EligibilityFailure[] = [];

  if (series.length === 0) {
    failures.push({ code: "series_empty", detail: "the market-year holds no observations" });
    return {
      eligible: false, failures, coverage, peakRegion: null,
      maxContiguousGapHours: longestGap, maxContiguousGapThreshold: threshold,
      peakOverP999: Number.NaN,
    };
  }

  if (!coverage.meetsThreshold) {
    failures.push({
      code: "annual_coverage_below_floor",
      detail: `${(coverage.coverageRatio * 100).toFixed(4)}% coverage is below the `
        + `${(minimumCoverage * 100).toFixed(3)}% floor; ${coverage.missingObservationCount} hours absent`,
    });
  }

  const peak = peakReference(series, PEAK_REFERENCE_RULE);

  // Is the maximum a peak at all, or a publisher error? A real annual peak sits near the top of
  // its own distribution; a corrupt value sits nowhere near it. Refusing the market-year is the
  // only honest response, because the canonical observation is evidence and is never repaired.
  const p999 = loadPercentile(series, 0.999);
  const plausibilityFactor = options.peakPlausibilityMaxOverP999 ?? PEAK_PLAUSIBILITY_MAX_OVER_P999;
  const peakOverP999 = p999 > 0 ? peak.mw / p999 : Number.POSITIVE_INFINITY;
  if (!(peakOverP999 <= plausibilityFactor)) {
    failures.push({
      code: "peak_implausible",
      detail: `the maximum ${peak.mw} MW at ${peak.atUtc} is ${peakOverP999.toFixed(2)}x the `
        + `99.9th percentile (${p999.toFixed(0)} MW), above the ${plausibilityFactor}x limit; `
        + "it is not a peak this publisher can have meant",
    });
  }

  const peakRegion = assessPeakRegion(series, period, peak.atUtc);
  if (!peakRegion.complete) {
    failures.push({
      code: "peak_day_incomplete",
      detail: `${peakRegion.missingHours} of the ${peakRegion.expectedHours} hours on `
        + `${peakRegion.localDate} are absent, and that is the local day holding the peak reference`,
    });
  }

  if (threshold === null) {
    if (options.allowUnresolvedGapThreshold !== true) {
      failures.push({
        code: "gap_threshold_unresolved",
        detail: "maximum_contiguous_gap_hours is unresolved, so no market-year may be judged "
          + "eligible outside research mode",
      });
    }
  } else if (longestGap > threshold) {
    failures.push({
      code: "contiguous_gap_too_long",
      detail: `the longest absent run is ${longestGap} hours, above the ${threshold}-hour threshold`,
    });
  }

  return {
    eligible: failures.length === 0,
    failures,
    coverage,
    peakRegion,
    maxContiguousGapHours: longestGap,
    maxContiguousGapThreshold: threshold,
    peakOverP999,
  };
}
