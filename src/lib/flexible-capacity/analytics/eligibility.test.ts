import { describe, expect, it } from "vitest";

import { assessMarketYearEligibility, maxContiguousGapHours }
  from "@/lib/flexible-capacity/analytics/eligibility";
import { assessCoverage, localDateOf, localYearWindow } from "@/lib/flexible-capacity/period";
import type { HourlyLoadPoint } from "@/lib/flexible-capacity/types";

const HOUR_MS = 3_600_000;
const PERIOD = localYearWindow("ercot", 2025);
const START = Date.parse(PERIOD.startUtc);

/**
 * A peak the plausibility rule accepts. The shoulder of this fixture tops out at 54,990 MW, so a
 * maximum of 56,000 sits at 1.02x the 99.9th percentile -- the ratio a real annual peak has. An
 * earlier draft used 90,000, which is 1.64x and is correctly refused as not a peak at all.
 */
const PEAK_MW = 56_000;

/** A complete ERCOT 2025 whose single maximum sits on a known summer afternoon. */
function completeYear(peakHourOfYear = 5_500): HourlyLoadPoint[] {
  const hours: HourlyLoadPoint[] = [];
  for (let index = 0; index < PERIOD.expectedObservationCount; index += 1) {
    hours.push({
      periodStartUtc: new Date(START + index * HOUR_MS).toISOString(),
      valueMw: index === peakHourOfYear ? PEAK_MW : 50_000 + (index % 500) * 10,
    });
  }
  return hours;
}

const withoutIndices = (series: readonly HourlyLoadPoint[], from: number, count: number): HourlyLoadPoint[] =>
  [...series.slice(0, from), ...series.slice(from + count)];

/** An index far from the peak day, in a low-load stretch. */
const AWAY_FROM_PEAK = 1_000;

describe("1. a complete year is eligible", () => {
  it("passes all three conditions", () => {
    const eligibility = assessMarketYearEligibility(completeYear(), PERIOD, { maximumContiguousGapHours: 6 });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.failures).toEqual([]);
    expect(eligibility.coverage.coverageRatio).toBe(1);
    expect(eligibility.peakRegion?.complete).toBe(true);
    expect(eligibility.maxContiguousGapHours).toBe(0);
  });
});

describe("2. annual coverage", () => {
  it("rejects a year below the floor", () => {
    const short = completeYear().slice(0, 8_000);
    const eligibility = assessMarketYearEligibility(short, PERIOD, { maximumContiguousGapHours: 10_000 });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.failures.map((failure) => failure.code)).toContain("annual_coverage_below_floor");
  });

  it("accepts a year just above the floor", () => {
    // 99.5% of 8,760 is 8,716.2, so 8,717 present hours clears it.
    const trimmed = completeYear().filter((_, index) => index < 8_717);
    const eligibility = assessMarketYearEligibility(trimmed, PERIOD, { maximumContiguousGapHours: 10_000 });
    expect(eligibility.coverage.meetsThreshold).toBe(true);
    expect(eligibility.failures.map((failure) => failure.code))
      .not.toContain("annual_coverage_below_floor");
  });
});

describe("3. the peak day, which the gap rule never softens", () => {
  it("rejects a year missing one hour of the peak day, however small the gap", () => {
    const series = completeYear();
    const eligibility = assessMarketYearEligibility(
      withoutIndices(series, 5_501, 1), PERIOD, { maximumContiguousGapHours: 48 });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.failures.map((failure) => failure.code)).toContain("peak_day_incomplete");
    // One hour is inside any threshold; the rejection comes from where it is, not how long it is.
    expect(eligibility.maxContiguousGapHours).toBe(1);
    expect(eligibility.maxContiguousGapHours).toBeLessThanOrEqual(48);
  });

  it("names the local date it rejected, not a UTC one", () => {
    const series = completeYear();
    const eligibility = assessMarketYearEligibility(
      withoutIndices(series, 5_501, 1), PERIOD, { maximumContiguousGapHours: 48 });
    expect(eligibility.peakRegion?.localDate)
      .toBe(localDateOf(series[5_500]!.periodStartUtc, PERIOD.timezone));
  });
});

describe("4. the contiguous-gap rule", () => {
  it("accepts a gap at the threshold", () => {
    const eligibility = assessMarketYearEligibility(
      withoutIndices(completeYear(), AWAY_FROM_PEAK, 6), PERIOD, { maximumContiguousGapHours: 6 });
    expect(eligibility.maxContiguousGapHours).toBe(6);
    expect(eligibility.eligible).toBe(true);
  });

  it("rejects a gap one hour above the threshold", () => {
    const eligibility = assessMarketYearEligibility(
      withoutIndices(completeYear(), AWAY_FROM_PEAK, 7), PERIOD, { maximumContiguousGapHours: 6 });
    expect(eligibility.maxContiguousGapHours).toBe(7);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.failures.map((failure) => failure.code)).toContain("contiguous_gap_too_long");
  });

  it("measures the longest run, not the total absence", () => {
    // Three separate three-hour gaps: nine hours absent, longest run three.
    let series = completeYear();
    series = withoutIndices(series, 3_000, 3);
    series = withoutIndices(series, 2_000, 3);
    series = withoutIndices(series, 1_000, 3);
    const eligibility = assessMarketYearEligibility(series, PERIOD, { maximumContiguousGapHours: 6 });
    expect(eligibility.coverage.missingObservationCount).toBe(9);
    expect(eligibility.maxContiguousGapHours).toBe(3);
    expect(eligibility.eligible).toBe(true);
  });

  it("is not satisfied by a low coverage ratio alone", () => {
    // A single long gap that still leaves 99.6% coverage: quantity passes, shape does not.
    const series = withoutIndices(completeYear(), AWAY_FROM_PEAK, 30);
    const coverage = assessCoverage(series, PERIOD, 0.995);
    expect(coverage.meetsThreshold).toBe(true);
    const eligibility = assessMarketYearEligibility(series, PERIOD, { maximumContiguousGapHours: 6 });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.failures.map((failure) => failure.code)).toEqual(["contiguous_gap_too_long"]);
  });
});

describe("5. an unresolved threshold", () => {
  it("makes every market-year ineligible outside research mode", () => {
    const eligibility = assessMarketYearEligibility(
      completeYear(), PERIOD, { maximumContiguousGapHours: null });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.failures.map((failure) => failure.code)).toContain("gap_threshold_unresolved");
  });

  it("is permitted in research mode, which is how the study that resolves it runs", () => {
    const eligibility = assessMarketYearEligibility(completeYear(), PERIOD, {
      maximumContiguousGapHours: null, allowUnresolvedGapThreshold: true,
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.maxContiguousGapThreshold).toBeNull();
  });
});

describe("6. failures accumulate rather than short-circuit", () => {
  it("reports every condition a year fails", () => {
    // Short overall, missing hours from the peak day, and a long block elsewhere. The deletions
    // run high-index-first so earlier indices stay meaningful, and they leave the peak hour
    // itself in place -- removing it would simply move the peak to a complete day.
    let series = completeYear().slice(0, 8_600);
    series = withoutIndices(series, 5_501, 4);
    series = withoutIndices(series, AWAY_FROM_PEAK, 40);
    const eligibility = assessMarketYearEligibility(series, PERIOD, { maximumContiguousGapHours: 6 });
    const codes = eligibility.failures.map((failure) => failure.code).sort();
    expect(codes).toContain("peak_day_incomplete");
    expect(codes).toContain("contiguous_gap_too_long");
    expect(eligibility.failures.length).toBeGreaterThanOrEqual(2);
  });
});

describe("7. the gap helper", () => {
  it("returns zero for a complete year", () => {
    expect(maxContiguousGapHours(assessCoverage(completeYear(), PERIOD, 0.5))).toBe(0);
  });
});
