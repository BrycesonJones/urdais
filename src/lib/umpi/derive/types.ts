/**
 * The derivation layer's shapes.
 *
 * This layer turns current source observations into published monthly points. It computes
 * nothing the methodology does not define, and it reuses the Phase 3 primitives in
 * `src/lib/umpi/calculate.ts` rather than restating their arithmetic: `unitValueUsdPerKg`,
 * `computeIndexBase`, `rebaseToIndex` and `monthOverMonth` were written for exactly this.
 */

import type { MomWithheldReason, ReferenceMonth, UmpiSeriesCode } from "../types";

/**
 * The implementation that produced a value.
 *
 * Bumped when the arithmetic changes, never when the inputs do. A published row records it so a
 * later reader can tell "the source revised" from "we changed how we compute".
 */
export const UMPI_CALCULATION_VERSION = "1.0.0";

/** The calendar year whose aggregate unit value is the Series B base. Frozen by methodology. */
export const UMPI_BASE_YEAR = 2020;
export const UMPI_BASE_LABEL = "2020 calendar-year aggregate = 100";

/** One current observation, as the derivation reads it. */
export type CurrentObservation = {
  observationId: string;
  seriesId: string;
  sourceSeriesId: string;
  referenceMonth: ReferenceMonth;
  vintageOrdinal: number;
  methodologyVersionId: string;
  indexLevel: number | null;
  indexBaseLabel: string | null;
  exportValueUsd: number | null;
  exportWeightKg: number | null;
};

export type StoredBase = {
  indexBaseId: string;
  baseLabel: string;
  baseValueUsd: number;
  baseWeightKg: number;
  baseUnitValue: number;
  monthCount: number;
  inputsDigest: string;
};

/** Why a base could not be built. Each is a refusal to publish, never a fallback. */
export type BaseBlockedReason =
  | "no_observations"
  | "missing_months"
  | "duplicate_month"
  | "non_positive_weight"
  | "negative_value"
  | "mixed_source_series"
  | "mixed_methodology_version";

export type BaseResult =
  | { state: "built"; base: StoredBase; created: boolean }
  | { state: "blocked"; reason: BaseBlockedReason; detail: string };

/** One derived monthly point, before it is written. */
export type DerivedPoint = {
  seriesCode: UmpiSeriesCode;
  referenceMonth: ReferenceMonth;
  observationId: string;
  previousObservationId: string | null;
  publishedLevel: number;
  unitValueUsdPerKg: number | null;
  momChange: number | null;
  momWithheldReason: MomWithheldReason | null;
  baseLabel: string;
  indexBaseId: string | null;
  sourceVintageOrdinal: number;
  methodologyVersionId: string;
  inputsDigest: string;
};

export type DerivationOutcome =
  | {
      status: "derived";
      seriesCode: UmpiSeriesCode;
      points: number;
      written: number;
      unchanged: number;
      superseded: number;
      base: StoredBase | null;
    }
  | { status: "blocked"; seriesCode: UmpiSeriesCode; reason: string; detail: string }
  | { status: "failed"; seriesCode: UmpiSeriesCode; error: string };
