/**
 * Synthetic fixtures for UMPI tests.
 *
 * Every number here is invented and is chosen to make arithmetic checkable by hand. None of it
 * is a Bank of Korea or Korea Customs observation, none of it may be seeded into any database,
 * and the shapes are deliberately round so that a reader can verify a test by mental arithmetic
 * rather than by trusting the code under test.
 *
 * Real official values exist in the Phase 2C verification record as *evidence that an identifier
 * resolves*. They are not copied here, because a fixture that looks like a real observation is
 * one refactor away from being treated as one.
 */

import type { BaseWindowMonth } from "./calculate";
import type { ReferenceMonth } from "./types";

export const FIXTURE_MARKER = "synthetic-fixture" as const;

/**
 * A twelve-month base window whose aggregate unit value is exactly 100 USD/kg:
 * 12 months × 1,000,000 USD over 12 months × 10,000 kg = 12,000,000 / 120,000 = 100.
 */
export const SYNTHETIC_BASE_WINDOW_2020: readonly BaseWindowMonth[] = Array.from({ length: 12 }, (_, i) => ({
  referenceMonth: `2020-${String(i + 1).padStart(2, "0")}` as ReferenceMonth,
  exportValueUsd: 1_000_000,
  exportWeightKg: 10_000,
}));

/**
 * A deliberately uneven window over the same twelve months, to prove the base sums value and
 * weight before dividing rather than averaging twelve monthly ratios.
 *
 * January exports 1,000,000 USD against 100,000 kg (a ratio of 10); each other month exports
 * 1,000,000 USD against 10,000 kg (a ratio of 100). The aggregate unit value is
 * 12,000,000 / 210,000, while the mean of the twelve monthly ratios is 92.5. Every input is an
 * exact integer, so the two answers differ for a real reason and not through rounding.
 */
export const SYNTHETIC_UNEVEN_BASE_WINDOW_2020: readonly BaseWindowMonth[] = Array.from({ length: 12 }, (_, i) => ({
  referenceMonth: `2020-${String(i + 1).padStart(2, "0")}` as ReferenceMonth,
  exportValueUsd: 1_000_000,
  exportWeightKg: i === 0 ? 100_000 : 10_000,
}));

/** What the uneven window must produce, and what it must not. */
export const UNEVEN_WINDOW_AGGREGATE_UNIT_VALUE = 12_000_000 / 210_000;
export const UNEVEN_WINDOW_MEAN_OF_RATIOS = 92.5;

/** Two BOK months with a clean 10% step, for the MoM primitive. */
export const SYNTHETIC_BOK_LEVELS: readonly { referenceMonth: ReferenceMonth; indexLevel: number }[] = [
  { referenceMonth: "2026-06", indexLevel: 100 },
  { referenceMonth: "2026-07", indexLevel: 110 },
];
