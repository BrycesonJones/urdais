import { describe, expect, it } from "vitest";

import { MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION, PEAK_REFERENCE_RULE } from "@/lib/flexible-capacity/methodology";
import { localYearWindow } from "@/lib/flexible-capacity/period";
import {
  curtailedEnergyMwh, curtailmentEvents, curtailmentProfileMw, headroomGapsMw,
  headroomUpperBoundMw, peakReference, runFlexibleCapacityScenario, solveHeadroomMw,
} from "@/lib/flexible-capacity/scenario";
import {
  FlexibleCapacityDomainError, type HourlyLoadPoint, type ModeledPeriod,
} from "@/lib/flexible-capacity/types";

const HOUR_MS = 3_600_000;
const EPOCH = Date.parse("2025-01-01T06:00:00.000Z"); // ERCOT local new year

/** A synthetic hourly series starting at the ERCOT local year boundary. */
function seriesOf(values: readonly number[]): HourlyLoadPoint[] {
  return values.map((valueMw, index) => ({
    periodStartUtc: new Date(EPOCH + index * HOUR_MS).toISOString(),
    valueMw,
  }));
}

/** A period whose expected length equals the fixture, so coverage is exactly 1. */
function fixturePeriod(hours: number): ModeledPeriod {
  return {
    market: "ercot", localYear: 2025, timezone: "America/Chicago",
    startUtc: new Date(EPOCH).toISOString(),
    endUtc: new Date(EPOCH + hours * HOUR_MS).toISOString(),
    expectedObservationCount: hours,
  };
}

/**
 * An independent closed-form solution, used only by these tests.
 *
 * Because sum_t max(0, D - d_t) is piecewise linear with breakpoints at the gaps, the largest root
 * of the feasibility equation lies on some segment where exactly k gaps are below D, and there
 * satisfies k*D - S_k = alpha*T*D, i.e. D = S_k / (k - alpha*T). Scanning k and keeping only
 * self-consistent candidates finds it exactly, with no iteration. If bisection and this agree, the
 * solver is not merely reproducing its own arithmetic.
 */
function oracleHeadroomMw(gaps: readonly number[], alpha: number): number {
  const total = gaps.length;
  const sorted = [...gaps].map((gap) => Math.max(gap, 0)).sort((a, b) => a - b);
  let best = 0;
  let prefix = 0;
  for (let k = 1; k <= total; k += 1) {
    prefix += sorted[k - 1]!;
    const denominator = k - alpha * total;
    if (denominator <= 0) continue;
    const candidate = prefix / denominator;
    if (sorted.filter((gap) => gap < candidate).length === k) best = Math.max(best, candidate);
  }
  return best;
}

describe("1. the peak reference", () => {
  it("is the modelled period's own observed maximum", () => {
    const series = seriesOf([90, 100, 95]);
    expect(peakReference(series, PEAK_REFERENCE_RULE)).toEqual({
      mw: 100, atUtc: series[1]!.periodStartUtc,
    });
  });

  it("resolves a tie to the earliest hour, so the answer never depends on ordering", () => {
    const series = seriesOf([100, 90, 100]);
    expect(peakReference(series, PEAK_REFERENCE_RULE).atUtc).toBe(series[0]!.periodStartUtc);
  });

  it("refuses a rule the methodology names but does not adopt", () => {
    expect(() => peakReference(seriesOf([1]), "prior_period_observed_peak"))
      .toThrow(/named but not adopted/);
  });

  it("leaves every gap non-negative, so the new load never curtails more than itself", () => {
    const series = seriesOf([90, 100, 95]);
    const gaps = headroomGapsMw(series, peakReference(series, PEAK_REFERENCE_RULE).mw);
    expect(gaps).toEqual([10, 0, 5]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0);
  });
});

describe("2. fixture: a perfectly flat system load", () => {
  // Every hour is the peak, so d_t = 0 and R_t = Delta-L in all T hours. The curtailment
  // requirement is T*Delta-L against a budget of alpha*T*Delta-L, which for any alpha < 1 can
  // only balance at zero. No flat load can be added to a flat system without curtailing always.
  const gaps = Array.from({ length: 100 }, () => 0);

  it("admits no additional load at any permitted alpha", () => {
    for (const alpha of [0, 0.0025, 0.005, 0.01, MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION]) {
      expect(solveHeadroomMw(gaps, alpha)).toBe(0);
    }
  });

  it("would require curtailment in every hour for any positive load", () => {
    expect(curtailmentProfileMw(gaps, 5)).toEqual(Array.from({ length: 100 }, () => 5));
    expect(curtailedEnergyMwh(gaps, 5)).toBe(500);
  });
});

describe("3. fixture: one hour at the peak, ninety-nine below it", () => {
  // 99 hours at 90 and one at 100 give gaps of 10 and a single 0.
  //   sum R = Delta-L + 99*max(0, Delta-L - 10),  budget = 100*alpha*Delta-L.
  // Below Delta-L = 10 the requirement is exactly Delta-L, so feasibility is 1 <= 100*alpha.
  // At alpha = 0.01 that holds with equality and the binding constraint moves to the upper
  // segment, where 100*Delta-L - 990 <= Delta-L gives Delta-L <= 10 exactly.
  const values = [100, ...Array.from({ length: 99 }, () => 90)];
  const series = seriesOf(values);
  const gaps = headroomGapsMw(series, 100);

  it("admits exactly 10 MW at alpha = 0.01, which is an exact arithmetic result", () => {
    expect(solveHeadroomMw(gaps, 0.01)).toBe(10);
  });

  it("admits nothing at alpha = 0.005, because one full-load hour costs more than the budget", () => {
    expect(solveHeadroomMw(gaps, 0.005)).toBe(0);
  });

  it("spends the budget exactly at the solution, and not a megawatt-hour more", () => {
    const delta = solveHeadroomMw(gaps, 0.01);
    expect(curtailedEnergyMwh(gaps, delta)).toBeCloseTo(0.01 * delta * gaps.length, 9);
  });

  it("curtails in exactly one clock hour, the peak hour itself", () => {
    const profile = curtailmentProfileMw(gaps, solveHeadroomMw(gaps, 0.01));
    expect(profile.filter((mw) => mw > 0)).toHaveLength(1);
    expect(profile[0]).toBe(10);
  });
});

describe("4. fixture: two hours at the peak", () => {
  // Two peak hours cost twice the budget of one, so the alpha that admits 10 MW doubles.
  const gaps = headroomGapsMw(seriesOf([100, 100, ...Array.from({ length: 98 }, () => 90)]), 100);

  it("needs alpha = 0.02 to admit the 10 MW that one peak hour admitted at 0.01", () => {
    expect(solveHeadroomMw(gaps, 0.02)).toBe(10);
    expect(solveHeadroomMw(gaps, 0.01)).toBe(0);
  });

  it("curtails in exactly two clock hours at the solution", () => {
    const profile = curtailmentProfileMw(gaps, solveHeadroomMw(gaps, 0.02));
    expect(profile.filter((mw) => mw > 0)).toHaveLength(2);
  });
});

describe("5. fixture: a three-level load, where the answer falls between breakpoints", () => {
  // One hour at 100, 49 at 98, 50 at 90. For 2 < Delta-L <= 10 the requirement is
  // Delta-L + 49*(Delta-L - 2) = 50*Delta-L - 98, so 50*Delta-L - 98 = 100*alpha*Delta-L gives
  // Delta-L = 98 / (50 - 100*alpha). At alpha = 0.04 that is 98/46, which is not a breakpoint and
  // cannot be reached by rounding anything.
  const gaps = headroomGapsMw(
    seriesOf([100, ...Array.from({ length: 49 }, () => 98), ...Array.from({ length: 50 }, () => 90)]), 100);

  it("lands on 98/46 MW at alpha = 0.04", () => {
    expect(solveHeadroomMw(gaps, 0.04)).toBeCloseTo(98 / 46, 6);
  });

  it("curtails in the 50 hours whose headroom is below the solution, not the other 50", () => {
    const profile = curtailmentProfileMw(gaps, solveHeadroomMw(gaps, 0.04));
    expect(profile.filter((mw) => mw > 0)).toHaveLength(50);
  });
});

describe("6. the properties the methodology asserts", () => {
  const gaps = headroomGapsMw(
    seriesOf(Array.from({ length: 500 }, (_, index) => 100 - (index % 37) * 1.5)), 100);

  it("admits nothing when no curtailment is allowed", () => {
    expect(solveHeadroomMw(gaps, 0)).toBe(0);
  });

  it("never decreases as alpha increases", () => {
    let previous = -1;
    for (const alpha of [0, 0.001, 0.0025, 0.005, 0.0075, 0.01, 0.02, 0.03, 0.04, 0.05]) {
      const solved = solveHeadroomMw(gaps, alpha);
      expect(solved).toBeGreaterThanOrEqual(previous);
      previous = solved;
    }
  });

  it("keeps feasibility monotone: everything below the solution is also feasible", () => {
    const alpha = 0.01;
    const solved = solveHeadroomMw(gaps, alpha);
    for (const fraction of [0, 0.1, 0.5, 0.9, 0.999]) {
      const delta = solved * fraction;
      expect(curtailedEnergyMwh(gaps, delta)).toBeLessThanOrEqual(alpha * delta * gaps.length + 1e-9);
    }
  });

  it("stays inside the analytic upper bound", () => {
    for (const alpha of [0.0025, 0.005, 0.01, 0.05]) {
      expect(solveHeadroomMw(gaps, alpha)).toBeLessThanOrEqual(headroomUpperBoundMw(gaps, alpha) + 1e-9);
    }
  });

  it("never sheds more than the new load in any hour", () => {
    const alpha = 0.03;
    const solved = solveHeadroomMw(gaps, alpha);
    for (const shed of curtailmentProfileMw(gaps, solved)) {
      expect(shed).toBeLessThanOrEqual(solved + 1e-12);
      expect(shed).toBeGreaterThanOrEqual(0);
    }
  });

  it("agrees with an independent closed-form solution", () => {
    for (const alpha of [0, 0.0025, 0.005, 0.01, 0.02, 0.05]) {
      expect(solveHeadroomMw(gaps, alpha)).toBeCloseTo(oracleHeadroomMw(gaps, alpha), 5);
    }
  });

  it("agrees with the oracle on pseudo-random shapes too", () => {
    let seed = 20260923;
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    for (let trial = 0; trial < 12; trial += 1) {
      const values = Array.from({ length: 300 }, () => 60 + random() * 40);
      const trialGaps = headroomGapsMw(seriesOf(values), Math.max(...values));
      for (const alpha of [0.005, 0.02, 0.05]) {
        expect(solveHeadroomMw(trialGaps, alpha)).toBeCloseTo(oracleHeadroomMw(trialGaps, alpha), 5);
      }
    }
  });

  it("refuses an alpha above the methodology maximum rather than extrapolating", () => {
    expect(() => solveHeadroomMw(gaps, 0.2)).toThrow(/exceeds the methodology maximum/);
    expect(() => solveHeadroomMw(gaps, -0.1)).toThrow(/negative or not finite/);
  });
});

describe("7. curtailment events", () => {
  it("groups consecutive curtailed hours into one event", () => {
    const series = seriesOf([100, 100, 90, 100, 90, 90]);
    const profile = curtailmentProfileMw(headroomGapsMw(series, 100), 5);
    const events = curtailmentEvents(series, profile);
    expect(events.map((event) => event.hours)).toEqual([2, 1]);
    expect(events[0]!.startUtc).toBe(series[0]!.periodStartUtc);
    expect(events[0]!.endUtc).toBe(series[2]!.periodStartUtc);
  });

  it("does not bridge an event across a missing hour", () => {
    // Two curtailed hours that are adjacent in the array but two hours apart in time.
    const series: HourlyLoadPoint[] = [
      { periodStartUtc: new Date(EPOCH).toISOString(), valueMw: 100 },
      { periodStartUtc: new Date(EPOCH + 2 * HOUR_MS).toISOString(), valueMw: 100 },
    ];
    const profile = curtailmentProfileMw(headroomGapsMw(series, 100), 5);
    expect(curtailmentEvents(series, profile).map((event) => event.hours)).toEqual([1, 1]);
  });
});

describe("8. the full scenario result", () => {
  const values = [100, ...Array.from({ length: 99 }, () => 90)];
  const period = fixturePeriod(100);
  const input = {
    market: "ercot" as const, modeledPeriod: period, hourlyLoadSeries: seriesOf(values),
    annualCurtailmentEnergyFraction: 0.01, peakReferenceRule: PEAK_REFERENCE_RULE,
  };

  it("separates what was observed from what was assumed", () => {
    const run = runFlexibleCapacityScenario(input, { minimumCoverage: 0.99 });
    expect(run.observed).toEqual({
      peakReferenceMw: 100,
      peakReferenceAtUtc: new Date(EPOCH).toISOString(),
      meanLoadMw: (100 + 99 * 90) / 100,
      observationCount: 100,
      expectedObservationCount: 100,
      missingObservationCount: 0,
      coverageRatio: 1,
      peakRegion: {
        localDate: "2025-01-01", expectedHours: 24, presentHours: 24, complete: true,
      },
    });
    expect(run.assumptions.annualCurtailmentEnergyFraction).toBe(0.01);
    expect(run.assumptions.batteryEnabled).toBe(false);
    expect(run.assumptions.reboundModel).toBe("no_rebound");
    expect(run.assumptions.modeledLoadShape).toBe("flat");
  });

  it("reports the headroom in both MW and GW, from the same number", () => {
    const run = runFlexibleCapacityScenario(input, { minimumCoverage: 0.99 });
    expect(run.result.curtailmentEnabledHeadroomMw).toBe(10);
    expect(run.result.curtailmentEnabledHeadroomGw).toBe(0.01);
  });

  it("never reports curtailed energy above the budget it reports", () => {
    const run = runFlexibleCapacityScenario(input, { minimumCoverage: 0.99 });
    expect(run.result.curtailedEnergyMwh).toBeLessThanOrEqual(run.result.curtailmentBudgetMwh + 1e-9);
  });

  it("distinguishes equivalent full-load hours from clock hours with curtailment", () => {
    const run = runFlexibleCapacityScenario(input, { minimumCoverage: 0.99 });
    // alpha * T = 1 equivalent full-load hour, spent in exactly 1 clock hour here -- but the two
    // are different quantities and the contract keeps them apart.
    expect(run.assumptions.equivalentFullLoadHours).toBe(1);
    expect(run.result.curtailmentClockHours).toBe(1);
    expect(run.result.curtailmentEventCount).toBe(1);
    expect(run.result.maxCurtailmentEventHours).toBe(1);
  });

  it("states its limitations on the result, not only in the documentation", () => {
    const run = runFlexibleCapacityScenario(input, { minimumCoverage: 0.99 });
    expect(run.limitations.join(" ")).toMatch(/not compute capacity/i);
    expect(run.limitations.join(" ")).toMatch(/double count/i);
  });

  it("refuses a market-year below the coverage floor rather than modelling it", () => {
    const short = { ...input, hourlyLoadSeries: seriesOf(values).slice(0, 90) };
    expect(() => runFlexibleCapacityScenario(short, { minimumCoverage: 0.995 }))
      .toThrow(/below the .* floor/);
  });

  it("refuses a series whose market disagrees with its period", () => {
    expect(() => runFlexibleCapacityScenario({ ...input, market: "pjm" }, { minimumCoverage: 0.99 }))
      .toThrow(FlexibleCapacityDomainError);
  });

  it("produces no headroom at all when no curtailment is allowed", () => {
    const run = runFlexibleCapacityScenario(
      { ...input, annualCurtailmentEnergyFraction: 0 }, { minimumCoverage: 0.99 });
    expect(run.result.curtailmentEnabledHeadroomMw).toBe(0);
    expect(run.result.curtailedEnergyMwh).toBe(0);
    expect(run.result.curtailmentClockHours).toBe(0);
  });

  it("is deterministic: the same input yields an identical result", () => {
    const first = runFlexibleCapacityScenario(input, { minimumCoverage: 0.99 });
    const second = runFlexibleCapacityScenario(input, { minimumCoverage: 0.99 });
    expect(first).toEqual(second);
  });

  it("produces no NaN or Infinity anywhere in the result", () => {
    const run = runFlexibleCapacityScenario(input, { minimumCoverage: 0.99 });
    for (const value of Object.values(run.result)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("9. a real market-year window", () => {
  it("accepts a full ERCOT 2025 of synthetic hours and reports 8,760 observations", () => {
    const period = localYearWindow("ercot", 2025);
    const hours: HourlyLoadPoint[] = [];
    for (let ms = Date.parse(period.startUtc); ms < Date.parse(period.endUtc); ms += HOUR_MS) {
      const hourOfYear = (ms - Date.parse(period.startUtc)) / HOUR_MS;
      hours.push({ periodStartUtc: new Date(ms).toISOString(), valueMw: 50_000 + (hourOfYear % 1000) * 20 });
    }
    const run = runFlexibleCapacityScenario({
      market: "ercot", modeledPeriod: period, hourlyLoadSeries: hours,
      annualCurtailmentEnergyFraction: 0.005, peakReferenceRule: PEAK_REFERENCE_RULE,
    });
    expect(run.observed.observationCount).toBe(8760);
    expect(run.observed.coverageRatio).toBe(1);
    expect(run.assumptions.equivalentFullLoadHours).toBeCloseTo(43.8, 10);
    expect(run.result.curtailmentEnabledHeadroomMw).toBeGreaterThan(0);
    expect(run.result.curtailedEnergyMwh).toBeLessThanOrEqual(run.result.curtailmentBudgetMwh + 1e-6);
  });
});

describe("10. the peak reference may not be set from an incomplete peak day", () => {
  // The coverage floor bounds how many hours are absent; this bounds where. A year that lost the
  // afternoon of its hottest day could keep a shoulder hour, set Peak_ref from it, and report more
  // headroom than the evidence supports while its coverage ratio still looked healthy.
  const period = localYearWindow("ercot", 2025);
  const startMs = Date.parse(period.startUtc);

  /** A year whose single maximum sits in the middle of a named local day. */
  function yearWithPeakOn(peakHourOfYear: number): HourlyLoadPoint[] {
    const hours: HourlyLoadPoint[] = [];
    for (let index = 0; index < period.expectedObservationCount; index += 1) {
      hours.push({
        periodStartUtc: new Date(startMs + index * HOUR_MS).toISOString(),
        valueMw: index === peakHourOfYear ? 90_000 : 50_000 + (index % 500) * 10,
      });
    }
    return hours;
  }

  const AUGUST_AFTERNOON = 5_500; // some hour deep in the local summer

  it("accepts a year whose peak day is complete", () => {
    const run = runFlexibleCapacityScenario({
      market: "ercot", modeledPeriod: period, hourlyLoadSeries: yearWithPeakOn(AUGUST_AFTERNOON),
      annualCurtailmentEnergyFraction: 0.005, peakReferenceRule: PEAK_REFERENCE_RULE,
    });
    expect(run.observed.peakReferenceMw).toBe(90_000);
    expect(run.observed.peakRegion.complete).toBe(true);
    expect(run.observed.peakRegion.presentHours).toBe(run.observed.peakRegion.expectedHours);
  });

  it("refuses a year missing hours from the local day that holds the peak", () => {
    const hours = yearWithPeakOn(AUGUST_AFTERNOON);
    // Remove three hours from the same local day as the peak, leaving the peak hour itself.
    const withHole = hours.filter((_, index) =>
      !(index >= AUGUST_AFTERNOON + 1 && index <= AUGUST_AFTERNOON + 3));
    expect(() => runFlexibleCapacityScenario({
      market: "ercot", modeledPeriod: period, hourlyLoadSeries: withHole,
      annualCurtailmentEnergyFraction: 0.005, peakReferenceRule: PEAK_REFERENCE_RULE,
    })).toThrow(/the local day holding the peak reference/);
  });

  it("still refuses even though annual coverage comfortably passes the floor", () => {
    const hours = yearWithPeakOn(AUGUST_AFTERNOON);
    const withHole = hours.filter((_, index) => index !== AUGUST_AFTERNOON + 1);
    // One absent hour in 8,760 is 99.99% coverage: the quantity rule would wave this through.
    const coverage = (period.expectedObservationCount - 1) / period.expectedObservationCount;
    expect(coverage).toBeGreaterThan(0.995);
    expect(() => runFlexibleCapacityScenario({
      market: "ercot", modeledPeriod: period, hourlyLoadSeries: withHole,
      annualCurtailmentEnergyFraction: 0.005, peakReferenceRule: PEAK_REFERENCE_RULE,
    })).toThrow(/the local day holding the peak reference/);
  });

  it("counts a spring-forward peak day as 23 hours and a fall-back day as 25", () => {
    const springPeak = Math.round((Date.parse("2025-03-09T18:00:00.000Z") - startMs) / HOUR_MS);
    const spring = runFlexibleCapacityScenario({
      market: "ercot", modeledPeriod: period, hourlyLoadSeries: yearWithPeakOn(springPeak),
      annualCurtailmentEnergyFraction: 0.005, peakReferenceRule: PEAK_REFERENCE_RULE,
    });
    expect(spring.observed.peakRegion.localDate).toBe("2025-03-09");
    expect(spring.observed.peakRegion.expectedHours).toBe(23);

    const autumnPeak = Math.round((Date.parse("2025-11-02T18:00:00.000Z") - startMs) / HOUR_MS);
    const autumn = runFlexibleCapacityScenario({
      market: "ercot", modeledPeriod: period, hourlyLoadSeries: yearWithPeakOn(autumnPeak),
      annualCurtailmentEnergyFraction: 0.005, peakReferenceRule: PEAK_REFERENCE_RULE,
    });
    expect(autumn.observed.peakRegion.localDate).toBe("2025-11-02");
    expect(autumn.observed.peakRegion.expectedHours).toBe(25);
  });
});
