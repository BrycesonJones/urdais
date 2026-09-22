/**
 * The Series B rebasing base.
 *
 * > base_uv = Σ export_value_usd over the twelve months of 2020 / Σ export_weight_kg over the same
 *
 * The arithmetic itself is `computeIndexBase` from the Phase 3 primitive layer, which already
 * refuses an incomplete or duplicated window and sums value and weight **before** dividing. This
 * module is the part that decides which observations are eligible to be handed to it, and
 * refuses rather than improvising when they are not.
 *
 * **A base is never partially built.** Eleven months is a different base, and every value derived
 * from it would inherit the difference invisibly, so a missing month blocks the base and
 * therefore blocks the series. That is the intended failure: no Series B level exists until the
 * base does.
 */

import { computeIndexBase, UmpiCalculationError } from "../calculate";
import { calendarYearMonths } from "../reference-month";
import type { BaseBlockedReason, BaseResult, CurrentObservation } from "./types";
import { UMPI_BASE_LABEL, UMPI_BASE_YEAR } from "./types";

export type BaseEligibility =
  | { state: "eligible"; months: CurrentObservation[] }
  | { state: "blocked"; reason: BaseBlockedReason; detail: string };

/**
 * Which of the supplied observations may form the base, or why none may.
 *
 * Every rule here is a methodology rule, not a defensive nicety: the window is exactly the
 * twelve months of the base year, from one source series under one methodology version, each
 * month once, each with a positive weight.
 */
export function baseEligibility(observations: readonly CurrentObservation[]): BaseEligibility {
  const wanted = new Set(calendarYearMonths(UMPI_BASE_YEAR));
  const inWindow = observations.filter((o) => wanted.has(o.referenceMonth));

  if (inWindow.length === 0) {
    return { state: "blocked", reason: "no_observations", detail: `no ${UMPI_BASE_YEAR} observations are stored` };
  }

  const seen = new Map<string, CurrentObservation>();
  for (const observation of inWindow) {
    if (seen.has(observation.referenceMonth)) {
      return {
        state: "blocked",
        reason: "duplicate_month",
        detail: `${observation.referenceMonth} appears more than once among current observations`,
      };
    }
    seen.set(observation.referenceMonth, observation);
  }

  const missing = [...wanted].filter((month) => !seen.has(month)).sort();
  if (missing.length > 0) {
    return {
      state: "blocked",
      reason: "missing_months",
      detail: `the ${UMPI_BASE_YEAR} window is missing ${missing.join(", ")}`,
    };
  }

  // One source identity and one methodology version across the window. A base spanning a source
  // or methodology boundary would be an average of two different measurements.
  const sourceSeries = new Set(inWindow.map((o) => o.sourceSeriesId));
  if (sourceSeries.size > 1) {
    return { state: "blocked", reason: "mixed_source_series", detail: `the window spans ${sourceSeries.size} source identities` };
  }
  const methodologies = new Set(inWindow.map((o) => o.methodologyVersionId));
  if (methodologies.size > 1) {
    return { state: "blocked", reason: "mixed_methodology_version", detail: `the window spans ${methodologies.size} methodology versions` };
  }

  for (const observation of inWindow) {
    if (observation.exportWeightKg === null || observation.exportWeightKg <= 0) {
      return {
        state: "blocked",
        reason: "non_positive_weight",
        detail: `${observation.referenceMonth} has no positive export weight`,
      };
    }
    if (observation.exportValueUsd === null || observation.exportValueUsd < 0) {
      return {
        state: "blocked",
        reason: "negative_value",
        detail: `${observation.referenceMonth} has no usable export value`,
      };
    }
  }

  return {
    state: "eligible",
    months: [...seen.values()].sort((a, b) => (a.referenceMonth < b.referenceMonth ? -1 : 1)),
  };
}

/** The aggregate unit value of the window, via the Phase 3 primitive. */
export function computeBaseFrom(months: readonly CurrentObservation[]) {
  return computeIndexBase({
    baseLabel: UMPI_BASE_LABEL,
    months: months.map((m) => ({
      referenceMonth: m.referenceMonth,
      exportValueUsd: m.exportValueUsd as number,
      exportWeightKg: m.exportWeightKg as number,
    })),
    expectedMonths: calendarYearMonths(UMPI_BASE_YEAR),
  });
}

/** Eligibility, then arithmetic. A calculation error is reported as a block, never thrown past. */
export function buildBase(observations: readonly CurrentObservation[]):
  | { state: "computed"; months: CurrentObservation[]; base: ReturnType<typeof computeBaseFrom> }
  | Extract<BaseResult, { state: "blocked" }> {
  const eligibility = baseEligibility(observations);
  if (eligibility.state === "blocked") return eligibility;
  try {
    return { state: "computed", months: eligibility.months, base: computeBaseFrom(eligibility.months) };
  } catch (error) {
    if (error instanceof UmpiCalculationError) {
      return { state: "blocked", reason: "no_observations", detail: error.message };
    }
    throw error;
  }
}
