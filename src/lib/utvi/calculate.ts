/**
 * UTVI, from one daily snapshot.
 *
 *   UTVI(t) = the sum of every eligible observed row for date t, the aggregate tail included
 *
 * The tail belongs in the sum. Truncation at the top fifty cuts *attribution*, not volume:
 * the tail row is defined as everything outside the named rows, so named rows plus tail is
 * the platform's whole public traffic for the day. Leaving it out would understate the level
 * by the six per cent or so that it runs at.
 *
 * Two residuals come out, and keeping them apart is the point of the function. The model
 * residual is volume with no model at all. The lab residual is volume with a perfectly good
 * model whose author Urdais will not guess — measured at roughly three per cent, most of it
 * one anonymous pre-release model. A share table that summed to a hundred per cent while
 * that volume sat inside a named lab would be wrong, so both numbers are computed here and
 * published rather than reconciled away.
 *
 * There is no coverage branch that yields zero. A snapshot without coverage cannot produce a
 * calculation at all, because `sum of nothing = 0` is a plausible-looking published claim
 * that the world consumed no tokens that day.
 */

import type { CoverageState, DailySnapshot, UtviCalculation } from "@/lib/utvi/types";

export class UtviCoverageError extends Error {
  readonly coverageState: CoverageState;
  constructor(observationDate: string, coverageState: CoverageState) {
    super(
      `utvi: ${observationDate} has coverage state '${coverageState}'; no value is calculated for a date without observed rows`,
    );
    this.name = "UtviCoverageError";
    this.coverageState = coverageState;
  }
}

/**
 * Whether a snapshot can produce a value.
 *
 * The coverage precondition, and the reason it is a separate exported predicate rather than
 * a branch inside the calculation: a caller asks first and declines to calculate, so the
 * absence of a point is a decision with a name rather than an exception in a log.
 */
export function canCalculate(snapshot: DailySnapshot): boolean {
  return snapshot.coverageState === "covered_observed" && snapshot.namedRowCount > 0;
}

/** Compute UTVI for one date. Throws rather than inventing a value for an uncovered date. */
export function calculateUtvi(snapshot: DailySnapshot): UtviCalculation {
  if (!canCalculate(snapshot)) {
    throw new UtviCoverageError(snapshot.observationDate, snapshot.coverageState);
  }

  const named = snapshot.observations.filter((o) => !o.isResidual);
  const residuals = snapshot.observations.filter((o) => o.isResidual);

  const attributedTokens = named.reduce((sum, o) => sum + o.tokens, 0n);
  const modelResidualTokens = residuals.reduce((sum, o) => sum + o.tokens, 0n);
  const totalObservedTokens = attributedTokens + modelResidualTokens;

  // Volume on a named model whose lab is not evidenced. A subset of the attributed volume,
  // never an addition to it.
  const labResidualTokens = named
    .filter((o) => o.labAttributionState !== "evidenced")
    .reduce((sum, o) => sum + o.tokens, 0n);

  // Nothing is excluded under 0.1.1-draft: every row the source returns for an observed date
  // is eligible, including embedding models, which Phase 1A measured inside the top fifty.
  // The field exists because a later methodology version could exclude a category, and an
  // exclusion must then be counted and named rather than silently dropped.
  const exclusions: UtviCalculation["exclusions"] = [];

  return {
    calculationDate: snapshot.observationDate,
    totalObservedTokens,
    modelResidualTokens,
    labResidualTokens,
    attributedTokens,
    eligibleRowCount: snapshot.observations.length,
    excludedRowCount: exclusions.length,
    exclusions,
    coverageState: snapshot.coverageState,
    settlementState: snapshot.settlementState,
    sourceContentHash: snapshot.dateContentHash ?? "",
  };
}

/**
 * Percentage change between two values.
 *
 * Null rather than zero whenever it cannot be computed, because zero is a claim that nothing
 * changed and a missing comparison is not that claim. A zero base returns null rather than
 * an infinity: the source has never returned a zero daily total, but a division that could
 * produce `Infinity` is one a read layer should not contain.
 */
export function percentageChange(current: bigint, previous: bigint | null | undefined): number | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0n) return null;
  // Scaled integer arithmetic first, so a ratio of two multi-trillion values does not lose
  // its low digits before it becomes a percentage.
  const scaled = ((current - previous) * 1_000_000_000n) / previous;
  return Number(scaled) / 10_000_000;
}

/** The periods the product publishes. Percentage only; never an absolute token difference. */
export const UTVI_CHANGE_PERIODS = ["1D", "1W", "1M", "3M", "6M", "1Y"] as const;
export type UtviChangePeriod = (typeof UTVI_CHANGE_PERIODS)[number];

/** Calendar-anchored offsets, so a period means a period and not a count of available points. */
export function periodStartDate(anchor: string, period: UtviChangePeriod): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  switch (period) {
    case "1D":
      date.setUTCDate(date.getUTCDate() - 1);
      break;
    case "1W":
      date.setUTCDate(date.getUTCDate() - 7);
      break;
    case "1M":
      date.setUTCMonth(date.getUTCMonth() - 1);
      break;
    case "3M":
      date.setUTCMonth(date.getUTCMonth() - 3);
      break;
    case "6M":
      date.setUTCMonth(date.getUTCMonth() - 6);
      break;
    case "1Y":
      date.setUTCFullYear(date.getUTCFullYear() - 1);
      break;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Percentage changes over every published period.
 *
 * `history` maps a UTC date to that date's published value. A period whose anchor date has
 * no published value yields null — the comparison is against an actual observed point or it
 * is not made at all, never against an interpolated or carried-forward one.
 */
export function changesForPeriods(
  anchorDate: string,
  currentValue: bigint,
  history: ReadonlyMap<string, bigint>,
): Record<UtviChangePeriod, number | null> {
  const out = {} as Record<UtviChangePeriod, number | null>;
  for (const period of UTVI_CHANGE_PERIODS) {
    out[period] = percentageChange(currentValue, history.get(periodStartDate(anchorDate, period)));
  }
  return out;
}
