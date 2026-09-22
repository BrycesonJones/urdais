/**
 * The deterministic derivations UMPI publishes, and nothing else.
 *
 * Every function here is pure and total: it either returns a value or refuses, and it never
 * returns a filler. `null` and an explicit withholding reason are how a refusal is expressed,
 * following the convention `src/lib/utvi/calculate.ts` set — a zero is a claim that nothing
 * changed, and a missing comparison is not that claim.
 */

import { isConsecutive } from "./reference-month";
import type { LineagedLevel, MomResult, ReferenceMonth, SeriesLineage } from "./types";

export class UmpiCalculationError extends Error {}

/**
 * The Series B native quantity: declared export value over declared export weight.
 *
 * Export side only. Korean import values are reported CIF while exports are FOB declared, so a
 * ratio mixing them would measure freight and insurance as well as price.
 */
export function unitValueUsdPerKg(input: { exportValueUsd: number; exportWeightKg: number }): number {
  const { exportValueUsd, exportWeightKg } = input;
  if (!Number.isFinite(exportValueUsd) || !Number.isFinite(exportWeightKg)) {
    throw new UmpiCalculationError("export value and weight must both be finite numbers");
  }
  if (exportValueUsd < 0) throw new UmpiCalculationError("export value is negative");
  if (exportWeightKg < 0) throw new UmpiCalculationError("export weight is negative");
  // A month with no exported weight has no unit value. Dividing anyway would publish an
  // Infinity, and treating it as zero would publish a price collapse that did not happen.
  if (exportWeightKg === 0) throw new UmpiCalculationError("export weight is zero: the month has no unit value");
  return exportValueUsd / exportWeightKg;
}

export type BaseWindowMonth = { referenceMonth: ReferenceMonth; exportValueUsd: number; exportWeightKg: number };

export type IndexBase = {
  baseLabel: string;
  baseValueUsd: number;
  baseWeightKg: number;
  baseUnitValue: number;
  monthCount: number;
};

/**
 * The frozen Series B base: the calendar-year aggregate unit value.
 *
 *   base_uv = Σ expDlr over the window / Σ expWgt over the window
 *
 * Summing value and weight *before* dividing is the arithmetic that matches what a unit value
 * is. An average of twelve monthly ratios would weight a small month equally with a large one
 * and would not be the year's unit value.
 *
 * The window must be complete: a base computed from eleven months is a different base, and
 * every published value would inherit the difference invisibly.
 */
export function computeIndexBase(input: {
  baseLabel: string;
  months: readonly BaseWindowMonth[];
  expectedMonths: readonly ReferenceMonth[];
}): IndexBase {
  const { baseLabel, months, expectedMonths } = input;

  const present = new Set(months.map((m) => m.referenceMonth));
  const missing = expectedMonths.filter((m) => !present.has(m));
  if (missing.length > 0) {
    throw new UmpiCalculationError(`the base window is incomplete; missing ${missing.join(", ")}`);
  }
  if (months.length !== expectedMonths.length) {
    throw new UmpiCalculationError(
      `the base window has ${months.length} months for ${expectedMonths.length} expected; a duplicate month would be counted twice`,
    );
  }

  let baseValueUsd = 0;
  let baseWeightKg = 0;
  for (const month of months) {
    if (month.exportValueUsd < 0 || month.exportWeightKg < 0) {
      throw new UmpiCalculationError(`negative figures in base month ${month.referenceMonth}`);
    }
    baseValueUsd += month.exportValueUsd;
    baseWeightKg += month.exportWeightKg;
  }
  if (baseWeightKg <= 0) throw new UmpiCalculationError("the base window has no exported weight");

  return {
    baseLabel,
    baseValueUsd,
    baseWeightKg,
    baseUnitValue: baseValueUsd / baseWeightKg,
    monthCount: months.length,
  };
}

/** `index_t = 100 × uv_t / base_uv`. The published Series B level. */
export function rebaseToIndex(unitValue: number, base: Pick<IndexBase, "baseUnitValue">): number {
  if (!Number.isFinite(unitValue) || unitValue <= 0) {
    throw new UmpiCalculationError("a unit value must be a positive finite number to be rebased");
  }
  if (!Number.isFinite(base.baseUnitValue) || base.baseUnitValue <= 0) {
    throw new UmpiCalculationError("the base unit value must be positive");
  }
  return (100 * unitValue) / base.baseUnitValue;
}

function sameLineage(a: SeriesLineage, b: SeriesLineage): boolean {
  return (
    a.seriesCode === b.seriesCode &&
    a.methodologyVersion === b.methodologyVersion &&
    a.sourceSeriesId === b.sourceSeriesId &&
    a.baseLabel === b.baseLabel
  );
}

/**
 * The month-over-month change.
 *
 *   MoM_t = (value_t − value_{t−1}) / value_{t−1}
 *
 * Withheld rather than computed whenever the comparison would not be like-for-like: no prior
 * month at all, a gap where the previous month should be, or a boundary in methodology version,
 * source identity or base regime. Across a boundary the two levels are not the same measurement
 * expressed the same way, and a percentage between them would be a number about nothing.
 */
export function monthOverMonth(current: LineagedLevel, previous: LineagedLevel | null | undefined): MomResult {
  if (previous === null || previous === undefined) {
    return { state: "withheld", reason: "no_prior_month" };
  }
  if (!isConsecutive(previous.referenceMonth, current.referenceMonth)) {
    // A gap is a gap. The change is not computed across it and no point is invented inside it.
    return { state: "withheld", reason: "prior_month_missing" };
  }
  if (current.lineage.methodologyVersion !== previous.lineage.methodologyVersion) {
    return { state: "withheld", reason: "methodology_boundary" };
  }
  if (
    current.lineage.seriesCode !== previous.lineage.seriesCode ||
    current.lineage.sourceSeriesId !== previous.lineage.sourceSeriesId
  ) {
    return { state: "withheld", reason: "source_boundary" };
  }
  if (current.lineage.baseLabel !== previous.lineage.baseLabel) {
    return { state: "withheld", reason: "base_boundary" };
  }
  if (!sameLineage(current.lineage, previous.lineage)) {
    return { state: "withheld", reason: "source_boundary" };
  }
  if (previous.level === 0) {
    // An index level of zero is not a measurement this product can produce, and a division that
    // could return Infinity is not one a calculation layer should contain.
    return { state: "withheld", reason: "prior_month_missing" };
  }
  return { state: "computed", change: (current.level - previous.level) / previous.level };
}
