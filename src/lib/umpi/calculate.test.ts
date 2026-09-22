import { describe, expect, it } from "vitest";

import {
  UmpiCalculationError,
  computeIndexBase,
  monthOverMonth,
  rebaseToIndex,
  unitValueUsdPerKg,
} from "./calculate";
import {
  SYNTHETIC_BASE_WINDOW_2020,
  SYNTHETIC_UNEVEN_BASE_WINDOW_2020,
  UNEVEN_WINDOW_AGGREGATE_UNIT_VALUE,
  UNEVEN_WINDOW_MEAN_OF_RATIOS,
} from "./fixtures";
import { calendarYearMonths } from "./reference-month";
import type { LineagedLevel, SeriesLineage } from "./types";

const lineage: SeriesLineage = {
  seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
  methodologyVersion: "0.1.0-draft",
  sourceSeriesId: "kcs:8542321010/15100475",
  baseLabel: "2020 calendar-year aggregate = 100",
};
const level = (referenceMonth: string, value: number, over: Partial<SeriesLineage> = {}): LineagedLevel => ({
  referenceMonth,
  level: value,
  lineage: { ...lineage, ...over },
});

describe("unit value", () => {
  it("is declared export USD over declared export kg", () => {
    expect(unitValueUsdPerKg({ exportValueUsd: 1_000_000, exportWeightKg: 10_000 })).toBe(100);
  });

  it("refuses a month with no exported weight rather than publishing an infinity or a zero", () => {
    expect(() => unitValueUsdPerKg({ exportValueUsd: 1_000, exportWeightKg: 0 })).toThrow(UmpiCalculationError);
  });

  it("refuses negative official figures instead of coercing them", () => {
    expect(() => unitValueUsdPerKg({ exportValueUsd: -1, exportWeightKg: 10 })).toThrow(UmpiCalculationError);
    expect(() => unitValueUsdPerKg({ exportValueUsd: 1, exportWeightKg: -10 })).toThrow(UmpiCalculationError);
  });
});

describe("the 2020 calendar-year base", () => {
  const expected = calendarYearMonths(2020);

  it("is the aggregate unit value: sum the value and the weight, then divide", () => {
    const base = computeIndexBase({
      baseLabel: "2020 calendar-year aggregate = 100",
      months: SYNTHETIC_BASE_WINDOW_2020,
      expectedMonths: expected,
    });
    expect(base.baseValueUsd).toBe(12_000_000);
    expect(base.baseWeightKg).toBe(120_000);
    expect(base.baseUnitValue).toBe(100);
    expect(base.monthCount).toBe(12);
  });

  it("is not the mean of the monthly ratios, and an uneven window proves it", () => {
    const base = computeIndexBase({
      baseLabel: "2020 calendar-year aggregate = 100",
      months: SYNTHETIC_UNEVEN_BASE_WINDOW_2020,
      expectedMonths: expected,
    });
    expect(base.baseUnitValue).toBeCloseTo(UNEVEN_WINDOW_AGGREGATE_UNIT_VALUE, 10);
    // A weight-blind average would report 92.5 and would be wrong by more than a third.
    expect(base.baseUnitValue).not.toBeCloseTo(UNEVEN_WINDOW_MEAN_OF_RATIOS, 6);
  });

  it("refuses an incomplete window, because eleven months is a different base", () => {
    expect(() =>
      computeIndexBase({
        baseLabel: "2020 calendar-year aggregate = 100",
        months: SYNTHETIC_BASE_WINDOW_2020.slice(0, 11),
        expectedMonths: expected,
      }),
    ).toThrow(/incomplete/);
  });

  it("refuses a duplicated month, which would be counted twice", () => {
    const duplicated = [...SYNTHETIC_BASE_WINDOW_2020, { ...SYNTHETIC_BASE_WINDOW_2020[0]! }];
    expect(() =>
      computeIndexBase({ baseLabel: "b", months: duplicated, expectedMonths: expected }),
    ).toThrow(/counted twice/);
  });
});

describe("rebasing", () => {
  const base = { baseUnitValue: 100 };

  it("puts the base month at exactly 100", () => {
    expect(rebaseToIndex(100, base)).toBe(100);
  });

  it("scales linearly with the unit value", () => {
    expect(rebaseToIndex(150, base)).toBe(150);
    expect(rebaseToIndex(50, base)).toBe(50);
  });

  it("refuses a non-positive base or value", () => {
    expect(() => rebaseToIndex(0, base)).toThrow(UmpiCalculationError);
    expect(() => rebaseToIndex(100, { baseUnitValue: 0 })).toThrow(UmpiCalculationError);
  });
});

describe("month-over-month", () => {
  it("compares consecutive reference months", () => {
    const result = monthOverMonth(level("2026-07", 110), level("2026-06", 100));
    expect(result).toEqual({ state: "computed", change: 0.1 });
  });

  it("is withheld with no prior month, and is never a zero", () => {
    expect(monthOverMonth(level("2026-06", 100), null)).toEqual({
      state: "withheld",
      reason: "no_prior_month",
    });
  });

  it("is withheld across a gap rather than computed over it", () => {
    // May and July are not consecutive. Nothing is interpolated into June.
    expect(monthOverMonth(level("2026-07", 110), level("2026-05", 100))).toEqual({
      state: "withheld",
      reason: "prior_month_missing",
    });
  });

  it("is withheld across a methodology-version boundary", () => {
    const result = monthOverMonth(level("2026-07", 110), level("2026-06", 100, { methodologyVersion: "0.0.9-draft" }));
    expect(result).toEqual({ state: "withheld", reason: "methodology_boundary" });
  });

  it("is withheld across a source boundary", () => {
    const result = monthOverMonth(level("2026-07", 110), level("2026-06", 100, { sourceSeriesId: "kcs:8542321010/15101609" }));
    expect(result).toEqual({ state: "withheld", reason: "source_boundary" });
  });

  it("is withheld across a base change, because the two levels are not the same measurement", () => {
    const result = monthOverMonth(level("2026-07", 110), level("2026-06", 100, { baseLabel: "2025 calendar-year aggregate = 100" }));
    expect(result).toEqual({ state: "withheld", reason: "base_boundary" });
  });

  it("crosses a year boundary correctly", () => {
    expect(monthOverMonth(level("2027-01", 110), level("2026-12", 100))).toEqual({
      state: "computed",
      change: 0.1,
    });
  });

  it("never divides by a zero prior level", () => {
    expect(monthOverMonth(level("2026-07", 110), level("2026-06", 0)).state).toBe("withheld");
  });

  it("reports a fall as a negative fraction", () => {
    expect(monthOverMonth(level("2026-07", 90), level("2026-06", 100))).toEqual({
      state: "computed",
      change: -0.1,
    });
  });
});
