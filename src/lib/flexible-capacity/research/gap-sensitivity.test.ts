import { describe, expect, it } from "vitest";

import { localDateOf, localYearWindow } from "@/lib/flexible-capacity/period";
import {
  candidatePlacements, deleteWindow, exhaustiveWorstCase, runGapExperiments, summarise,
} from "@/lib/flexible-capacity/research/gap-sensitivity";
import type { HourlyLoadPoint } from "@/lib/flexible-capacity/types";

const HOUR_MS = 3_600_000;
const YEAR = localYearWindow("ercot", 2025);
const START = Date.parse(YEAR.startUtc);

/**
 * A compact period with a realistic shape: a broad daily cycle, one sharp annual peak, and a long
 * low-load stretch. Small enough to search exhaustively, structured enough that the placements the
 * study distinguishes are genuinely different.
 */
const HOURS = 960;
const PERIOD = {
  ...YEAR,
  endUtc: new Date(START + HOURS * HOUR_MS).toISOString(),
  expectedObservationCount: HOURS,
};
const PEAK_INDEX = 500;

function shapedSeries(): HourlyLoadPoint[] {
  return Array.from({ length: HOURS }, (_, index) => {
    const daily = Math.sin((index % 24) / 24 * Math.PI * 2) * 6_000;
    const seasonal = index > 400 && index < 600 ? 8_000 : 0;
    const base = 50_000 + daily + seasonal;
    return {
      periodStartUtc: new Date(START + index * HOUR_MS).toISOString(),
      valueMw: index === PEAK_INDEX ? 80_000 : base,
    };
  });
}

const ALPHA = 0.005;

describe("1. deleting a window", () => {
  it("removes exactly the hours asked for and leaves the rest in order", () => {
    const series = shapedSeries();
    const shortened = deleteWindow(series, 100, 6);
    expect(shortened).toHaveLength(series.length - 6);
    expect(shortened[99]).toEqual(series[99]);
    expect(shortened[100]).toEqual(series[106]);
  });
});

describe("2. the peak survives every admissible deletion", () => {
  it("never places a window on the local day holding the peak", () => {
    const series = shapedSeries();
    const peakDate = localDateOf(series[PEAK_INDEX]!.periodStartUtc, PERIOD.timezone);
    for (const gapHours of [1, 6, 24, 48]) {
      for (const { start } of candidatePlacements(series, PERIOD, ALPHA, gapHours)) {
        for (let index = start; index < start + gapHours; index += 1) {
          expect(localDateOf(series[index]!.periodStartUtc, PERIOD.timezone)).not.toBe(peakDate);
        }
      }
    }
  });

  it("leaves the peak reference unchanged, which is what makes the study about D* alone", () => {
    const series = shapedSeries();
    for (const gapHours of [1, 6, 24, 48]) {
      for (const experiment of runGapExperiments(series, PERIOD, "ercot", ALPHA, gapHours)) {
        expect(experiment.peakReferenceChanged).toBe(false);
        expect(experiment.perturbed.peakReferenceMw).toBe(80_000);
      }
    }
  });
});

describe("3. the direction of distortion", () => {
  const series = shapedSeries();

  it("deleting the lowest-load hours reduces headroom, the safe direction", () => {
    const experiments = runGapExperiments(series, PERIOD, "ercot", ALPHA, 12);
    const lowest = experiments.find((entry) => entry.placement === "lowest_load");
    expect(lowest).toBeDefined();
    expect(lowest!.absoluteChangeMw).toBeLessThanOrEqual(0);
  });

  it("deleting the hours that carry the curtailment raises it, the dangerous direction", () => {
    const experiments = runGapExperiments(series, PERIOD, "ercot", ALPHA, 12);
    const worst = experiments.find((entry) => entry.placement === "worst_case_contribution");
    expect(worst).toBeDefined();
    expect(worst!.absoluteChangeMw).toBeGreaterThan(0);
  });

  it("finds its worst case among the high-contribution windows, not the benign strata", () => {
    // Which *label* wins is not the property that matters and is not stable: the window adjacent
    // to the peak day is often itself a high-contribution window. What matters is that the worst
    // case never comes from the low-load or median strata, which are the benign references.
    for (const gapHours of [6, 12, 24]) {
      const experiments = runGapExperiments(series, PERIOD, "ercot", ALPHA, gapHours);
      const worst = experiments.reduce((a, b) => (a.relativeChange > b.relativeChange ? a : b));
      expect(["worst_case_contribution", "peak_day_adjacent", "highest_load"]).toContain(worst.placement);
    }
  });
});

describe("4. the analytic search finds the true worst case", () => {
  const series = shapedSeries();

  /**
   * Seven exhaustive sweeps of a year-long series, which is real work rather than a slow test: the
   * whole point is to check the analytic search against brute force. It runs in a few seconds on a
   * developer machine and has twice crossed vitest's five-second default on a loaded CI runner --
   * once on `main` -- so it states the time it needs instead of failing as if the assertion had.
   * Nothing about the assertion changes.
   */
  it("agrees with an exhaustive scan over every admissible placement", () => {
    for (const gapHours of [1, 2, 3, 6, 12, 24, 48]) {
      const exhaustive = exhaustiveWorstCase(series, PERIOD, ALPHA, gapHours);
      const analytic = runGapExperiments(series, PERIOD, "ercot", ALPHA, gapHours)
        .reduce((a, b) => (a.relativeChange > b.relativeChange ? a : b));
      // The sliding-window argument is a first-order one, so the guarantee asserted is that it
      // finds a placement as bad as the true worst to within a hair, not that the index matches.
      expect(analytic.relativeChange).toBeCloseTo(exhaustive.relativeChange, 9);
    }
  }, 60_000);
});

describe("5. how distortion varies with gap length", () => {
  const series = shapedSeries();
  const LENGTHS = [1, 2, 3, 6, 12, 24, 48];
  // One exhaustive scan per length, shared: each is a full sweep of every admissible placement.
  const byLength = LENGTHS.map((gapHours) =>
    exhaustiveWorstCase(series, PERIOD, ALPHA, gapHours).relativeChange);

  it("is NOT monotone in the length of the deleted block", () => {
    // The finding that shapes the rule. A long window cannot be aimed: a 24-hour gap necessarily
    // swallows a nightly trough, whose hours carry no curtailment and only cost budget, while a
    // 12-hour gap can sit entirely on the hours that do carry it. So the worst case peaks at a
    // length comparable to the daily curtailment window rather than rising with every hour, and a
    // threshold cannot be justified by "shorter is always safer".
    const isAscending = byLength.every((value, index) => index === 0 || value >= byLength[index - 1]!);
    expect(isAscending).toBe(false);
    // Concretely on this fixture: six hours aimed at one afternoon distort more than twelve or
    // twenty-four, which are forced to include the night either side.
    const [, , , six, twelve, twentyFour] = byLength;
    expect(six!).toBeGreaterThan(twelve!);
    expect(six!).toBeGreaterThan(twentyFour!);
  });

  it("must therefore be bounded by a running maximum, not by a measurement at N", () => {
    // Which is what a threshold of N actually promises: not that a gap of exactly N is tolerable,
    // but that no gap of any length up to N distorts the answer more than the stated bound.
    const running = byLength.map((_, index) => Math.max(...byLength.slice(0, index + 1)));
    expect(running.every((value, index) => index === 0 || value >= running[index - 1]!)).toBe(true);
    // And on this fixture the running maximum is strictly above the per-length value somewhere,
    // which is exactly why reading the curve at a single length would understate the risk.
    expect(running.some((value, index) => value > byLength[index]!)).toBe(true);
  });

  it("is negligible for a single hour", () => {
    expect(Math.abs(byLength[0]!)).toBeLessThan(0.05);
  });
});

describe("6. the summary", () => {
  it("reports the same headroom the scenario contract would", () => {
    const series = shapedSeries();
    const summary = summarise(series, ALPHA);
    expect(summary.observationCount).toBe(HOURS);
    expect(summary.peakReferenceMw).toBe(80_000);
    expect(summary.headroomMw).toBeGreaterThan(0);
    expect(summary.curtailmentEventCount).toBeGreaterThan(0);
    expect(summary.maxCurtailmentEventHours).toBeGreaterThan(0);
  });
});
