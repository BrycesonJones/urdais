import { describe, expect, it } from "vitest";

import { canRebase, resolvePlot } from "@/components/charts/plot-basis";
import type { TimeSeriesPoint } from "@/types/market";

const DAY = 86_400;

function series(values: readonly number[]): TimeSeriesPoint[] {
  return values.map((value, index) => ({ time: 1_700_000_000 + index * DAY, value }));
}

const USD_PER_MWH = "$/MWh";

describe("1. a percent axis is only ever drawn over percentages", () => {
  it("rebases when every series starts strictly positive", () => {
    const plot = resolvePlot({
      requested: "relative",
      primaryUnit: USD_PER_MWH,
      primary: series([40, 44]),
      comparisons: [series([20, 19])],
    });
    expect(plot.mode).toBe("relative");
    expect(plot.axisUnit).toBe("%");
    // Float arithmetic, and deliberately so: this is a pixel position, not a published value.
    expect(plot.primary.map((point) => point.plotted)[0]).toBe(0);
    expect(plot.primary.map((point) => point.plotted)[1]).toBeCloseTo(10, 9);
    expect(plot.comparisons[0]!.map((point) => point.plotted)[1]).toBeCloseTo(-5, 9);
    expect(plot.comparisonsVisible).toBe(true);
    expect(plot.suppression).toBe("none");
  });

  it("refuses to rebase on a zero base, and does not label raw values as percentages", () => {
    // The defect: the old helper fell through to raw values while the axis still read "%".
    const plot = resolvePlot({
      requested: "relative",
      primaryUnit: USD_PER_MWH,
      primary: series([0, 12]),
      comparisons: [series([20, 19])],
    });
    expect(plot.mode).toBe("absolute");
    expect(plot.axisUnit).toBe(USD_PER_MWH);
    expect(plot.primary.map((point) => point.plotted)).toEqual([0, 12]);
    expect(plot.suppression).toBe("nonpositive_base");
  });

  it("refuses to rebase on a negative base, which would draw a rising series falling", () => {
    const plot = resolvePlot({
      requested: "relative",
      primaryUnit: USD_PER_MWH,
      primary: series([-10, -5]),
      comparisons: [series([20, 21])],
    });
    expect(plot.mode).toBe("absolute");
    expect(plot.axisUnit).toBe(USD_PER_MWH);
    expect(plot.suppression).toBe("nonpositive_base");
  });

  it("refuses when the base of a comparison, not the primary, is non-positive", () => {
    const plot = resolvePlot({
      requested: "relative",
      primaryUnit: USD_PER_MWH,
      primary: series([40, 44]),
      comparisons: [series([30, 31]), series([-2, 6])],
    });
    expect(plot.mode).toBe("absolute");
    expect(plot.suppression).toBe("nonpositive_base");
  });

  it("rebases a series that crosses zero, as long as it starts positive", () => {
    // A sign crossing inside the window is fine: the denominator is the base, and it is positive.
    const plot = resolvePlot({
      requested: "relative",
      primaryUnit: USD_PER_MWH,
      primary: series([20, -10]),
      comparisons: [series([40, 44])],
    });
    expect(plot.mode).toBe("relative");
    expect(plot.primary.map((point) => point.plotted)).toEqual([0, -150]);
  });
});

describe("2. a refused rebase drops the comparison rather than mixing units", () => {
  it("returns no plotted comparisons when the rebase is refused", () => {
    const plot = resolvePlot({
      requested: "relative",
      primaryUnit: USD_PER_MWH,
      primary: series([0, 12]),
      comparisons: [series([20, 19])],
    });
    expect(plot.comparisonsVisible).toBe(false);
    expect(plot.comparisons).toEqual([]);
  });

  it("keeps an absolute comparison, which shares one unit and needs no rebase", () => {
    const plot = resolvePlot({
      requested: "absolute",
      primaryUnit: USD_PER_MWH,
      primary: series([-10, -5]),
      comparisons: [series([0, 4])],
    });
    expect(plot.mode).toBe("absolute");
    expect(plot.comparisonsVisible).toBe(true);
    expect(plot.axisUnit).toBe(USD_PER_MWH);
    // Signed values pass through untouched: a negative $/MWh is a real price, not a defect.
    expect(plot.primary.map((point) => point.plotted)).toEqual([-10, -5]);
    expect(plot.comparisons[0]!.map((point) => point.plotted)).toEqual([0, 4]);
  });

  it("says the basis question did not arise when there is nothing to compare with", () => {
    const plot = resolvePlot({
      requested: "relative", primaryUnit: USD_PER_MWH, primary: series([40, 44]), comparisons: [],
    });
    expect(plot.mode).toBe("absolute");
    expect(plot.axisUnit).toBe(USD_PER_MWH);
    expect(plot.suppression).toBe("no_comparisons");
  });
});

describe("3. the invariant, stated once", () => {
  const cases: readonly { name: string; primary: number[]; comparison: number[] }[] = [
    { name: "positive bases", primary: [40, 44], comparison: [20, 21] },
    { name: "zero primary base", primary: [0, 44], comparison: [20, 21] },
    { name: "negative primary base", primary: [-4, 44], comparison: [20, 21] },
    { name: "zero comparison base", primary: [40, 44], comparison: [0, 21] },
    { name: "negative comparison base", primary: [40, 44], comparison: [-1, 21] },
    { name: "sign-crossing primary", primary: [40, -44], comparison: [20, 21] },
  ];

  it("labels the axis '%' if and only if every plotted value is a percentage", () => {
    for (const testCase of cases) {
      const plot = resolvePlot({
        requested: "relative",
        primaryUnit: USD_PER_MWH,
        primary: series(testCase.primary),
        comparisons: [series(testCase.comparison)],
      });
      const everyBasePositive = canRebase(series(testCase.primary)) && canRebase(series(testCase.comparison));
      expect(plot.axisUnit === "%", testCase.name).toBe(everyBasePositive);
      expect(plot.mode === "relative", testCase.name).toBe(everyBasePositive);
      // And the plotted numbers agree with the label, never the other way round.
      const plottedFirst = plot.primary[0]!.plotted;
      expect(plottedFirst === 0 && plot.mode === "relative", testCase.name).toBe(everyBasePositive);
    }
  });
});
