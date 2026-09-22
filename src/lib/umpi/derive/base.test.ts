import { describe, expect, it } from "vitest";

import { calendarYearMonths } from "../reference-month";
import { baseEligibility, buildBase, computeBaseFrom } from "./base";
import type { CurrentObservation } from "./types";

/** A 2020 month with the shape the derivation reads. */
const month = (m: string, usd: number, kg: number, over: Partial<CurrentObservation> = {}): CurrentObservation => ({
  observationId: `obs-${m}`,
  seriesId: "s-b",
  sourceSeriesId: "ss-b",
  referenceMonth: m,
  vintageOrdinal: 1,
  methodologyVersionId: "mv-1",
  indexLevel: null,
  indexBaseLabel: null,
  exportValueUsd: usd,
  exportWeightKg: kg,
  ...over,
});

/** Twelve months of 2020, each 1,000,000 USD against 10,000 kg: aggregate 100 USD/kg. */
const evenYear = () => calendarYearMonths(2020).map((m) => month(m, 1_000_000, 10_000));

/**
 * The same twelve months, one of which carries ten times the weight at the same value.
 * Aggregate is 12,000,000 / 210,000; the mean of the twelve monthly ratios is 92.5.
 */
const unevenYear = () =>
  calendarYearMonths(2020).map((m, i) => month(m, 1_000_000, i === 0 ? 100_000 : 10_000));

describe("base eligibility", () => {
  it("accepts exactly the twelve months of the base year", () => {
    const result = baseEligibility(evenYear());
    expect(result.state).toBe("eligible");
    if (result.state !== "eligible") return;
    expect(result.months).toHaveLength(12);
    expect(result.months[0]!.referenceMonth).toBe("2020-01");
    expect(result.months[11]!.referenceMonth).toBe("2020-12");
  });

  it("blocks on a missing month rather than building an eleven-month base", () => {
    // Eleven months is a different base, and every value derived from it would inherit the
    // difference invisibly.
    const result = baseEligibility(evenYear().filter((m) => m.referenceMonth !== "2020-07"));
    expect(result).toMatchObject({ state: "blocked", reason: "missing_months" });
    if (result.state === "blocked") expect(result.detail).toContain("2020-07");
  });

  it("blocks on a duplicate month", () => {
    const doubled = [...evenYear(), month("2020-03", 5, 5)];
    expect(baseEligibility(doubled)).toMatchObject({ state: "blocked", reason: "duplicate_month" });
  });

  it("blocks on a non-positive weight, which has no unit value", () => {
    const withZero = evenYear().map((m) => (m.referenceMonth === "2020-05" ? month(m.referenceMonth, 1, 0) : m));
    expect(baseEligibility(withZero)).toMatchObject({ state: "blocked", reason: "non_positive_weight" });
  });

  it("blocks when the window spans two source identities or two methodology versions", () => {
    const mixedSource = evenYear().map((m) =>
      m.referenceMonth === "2020-02" ? month(m.referenceMonth, 1_000_000, 10_000, { sourceSeriesId: "other" }) : m,
    );
    expect(baseEligibility(mixedSource)).toMatchObject({ state: "blocked", reason: "mixed_source_series" });

    const mixedMethodology = evenYear().map((m) =>
      m.referenceMonth === "2020-02" ? month(m.referenceMonth, 1_000_000, 10_000, { methodologyVersionId: "mv-2" }) : m,
    );
    expect(baseEligibility(mixedMethodology)).toMatchObject({ state: "blocked", reason: "mixed_methodology_version" });
  });

  it("ignores months outside the base year entirely", () => {
    const withNoise = [...evenYear(), month("2019-12", 9, 9), month("2021-01", 9, 9)];
    const result = baseEligibility(withNoise);
    expect(result.state).toBe("eligible");
    if (result.state === "eligible") expect(result.months).toHaveLength(12);
  });

  it("blocks when the base year has not been ingested at all", () => {
    expect(baseEligibility([month("2026-06", 1, 1)])).toMatchObject({ state: "blocked", reason: "no_observations" });
  });
});

describe("the base formula", () => {
  it("is the aggregate unit value: sum the value and the weight, then divide", () => {
    const base = computeBaseFrom(evenYear());
    expect(base.baseValueUsd).toBe(12_000_000);
    expect(base.baseWeightKg).toBe(120_000);
    expect(base.baseUnitValue).toBe(100);
    expect(base.monthCount).toBe(12);
  });

  it("is not the arithmetic mean of the monthly unit values", () => {
    // The distinguishing case: one heavy month. An implementation that averaged the twelve
    // monthly ratios would report 92.5 here and pass every other test in this file.
    const base = computeBaseFrom(unevenYear());
    expect(base.baseUnitValue).toBeCloseTo(12_000_000 / 210_000, 10);
    expect(base.baseUnitValue).not.toBeCloseTo(92.5, 6);

    const meanOfRatios = unevenYear().reduce((sum, m) => sum + m.exportValueUsd! / m.exportWeightKg!, 0) / 12;
    expect(meanOfRatios).toBeCloseTo(92.5, 10);
    expect(base.baseUnitValue).not.toBeCloseTo(meanOfRatios, 6);
  });

  it("weights the base by physical exports, so a heavy cheap month pulls it down", () => {
    expect(computeBaseFrom(unevenYear()).baseUnitValue).toBeLessThan(computeBaseFrom(evenYear()).baseUnitValue);
  });
});

describe("buildBase", () => {
  it("returns the computed base when the window is whole", () => {
    const result = buildBase(evenYear());
    expect(result.state).toBe("computed");
    if (result.state === "computed") expect(result.base.baseUnitValue).toBe(100);
  });

  it("returns the block rather than throwing when it is not", () => {
    expect(buildBase([]).state).toBe("blocked");
  });
});
