/**
 * The headline: renormalization, the arithmetic mean, the diagnostics, and the two gates.
 *
 *   v_i,t   = w_i,t / Σ_{j∈C_t} w_j,t
 *   UAVI_t  = 100 × Σ_{i∈C_t} v_i,t × σ_i,30,t
 *
 * **The square root is already taken.** Each `σ_i,30` arrived from `interpolate30Day` as the root
 * of that constituent's own 30-day variance, and this module averages those volatilities. It does
 * not square them, does not sum variances, and takes no square root of its own. Version
 * 0.1.0-draft specified `100 × sqrt(Σ v_i σ²_i)`, the weighted root mean square, which is also
 * what the sole institutional analogue publishes — so a regression here is a plausible mistake
 * with a plausible pedigree, producing a number that is strictly larger whenever constituent
 * volatilities differ and that nothing about the output would flag. `aggregate.test.ts` pins a
 * fixture on which the two forms differ by four volatility points, and a database trigger
 * re-derives the level from the constituent rows at commit.
 *
 * **Parent weights are inherited, never repaired.** If the supplied vector is absent, or does not
 * sum to one, or carries a negative entry, this refuses rather than normalizing it into shape.
 * Renormalizing a broken parent vector would produce a UAVI whose weights came from Urdais's
 * arithmetic rather than the parent's methodology, and the failure would be invisible.
 *
 * **Concentration is measured, not gated.** `max(v_i)` and `N_eff` are computed and returned in
 * every outcome that got far enough to compute them, and neither can withhold a headline. V1 has
 * exactly two gates.
 */

import {
  COVERED_WEIGHT_GATE_TOLERANCE,
  MIN_COVERED_ISSUER_COUNT,
  MIN_COVERED_PARENT_WEIGHT,
  type UnavailableReason,
} from "@/lib/uavi/parameters";

/** One parent member as it enters aggregation. */
export type AggregationConstituent = {
  issuerId: string;
  /** w_i, the canonical parent base weight for the date. Never recomputed here. */
  parentWeight: number;
  /** Decimal 30-day volatility, or null where the issuer is uncovered. */
  sigma30: number | null;
};

export type CoveredContribution = {
  issuerId: string;
  parentWeight: number;
  renormalizedWeight: number;
  sigma30: number;
  /** v_i × σ_i. These sum to `indexLevel / 100` exactly. */
  weightContribution: number;
};

export type AggregationDiagnostics = {
  coveredParentWeight: number;
  coveredIssuerCount: number;
  uncoveredIssuerCount: number;
  maxRenormalizedWeight: number | null;
  effectiveIssuerCount: number | null;
};

export type AggregationResult =
  | ({
      publishable: true;
      indexLevel: number;
      contributions: readonly CoveredContribution[];
      unavailableReason: null;
    } & AggregationDiagnostics)
  | ({
      publishable: false;
      indexLevel: null;
      contributions: readonly CoveredContribution[];
      unavailableReason: UnavailableReason;
    } & AggregationDiagnostics);

/** How a parent weight vector can be unusable, distinguished because the responses differ. */
export type ParentWeightProblem =
  | "parent_weights_missing"
  | "parent_weights_invalid";

const EMPTY_DIAGNOSTICS: AggregationDiagnostics = {
  coveredParentWeight: 0,
  coveredIssuerCount: 0,
  uncoveredIssuerCount: 0,
  maxRenormalizedWeight: null,
  effectiveIssuerCount: null,
};

/**
 * Validate the inherited parent weight vector before anything is computed from it.
 *
 * Separate from aggregation so that "the parent produced nothing" and "the parent produced
 * something that does not add up" stay distinguishable: the first is the parent not being ready,
 * which is the current state and not a fault, and the second is a fault that must be investigated
 * rather than absorbed.
 */
export function validateParentWeights(
  constituents: readonly AggregationConstituent[],
  tolerance = 1e-9,
): ParentWeightProblem | null {
  if (constituents.length === 0) return "parent_weights_missing";
  let total = 0;
  const seen = new Set<string>();
  for (const c of constituents) {
    // A repeated issuer would be counted twice in the denominator and once in the numerator, so
    // it is a fault rather than something to de-duplicate silently.
    if (seen.has(c.issuerId)) return "parent_weights_invalid";
    seen.add(c.issuerId);
    if (!Number.isFinite(c.parentWeight)) return "parent_weights_invalid";
    if (c.parentWeight < 0) return "parent_weights_invalid";
    total += c.parentWeight;
  }
  if (!Number.isFinite(total)) return "parent_weights_invalid";
  if (Math.abs(total - 1) > tolerance) return "parent_weights_invalid";
  return null;
}

/**
 * Aggregate one session.
 *
 * Returns diagnostics in every outcome that reached them, including the outcomes where the gates
 * refuse a headline: a reader of an unavailable UAVI is owed the coverage figures that explain it,
 * and withholding those alongside the level would make the refusal unexplainable.
 */
export function aggregate(constituents: readonly AggregationConstituent[]): AggregationResult {
  const weightProblem = validateParentWeights(constituents);
  if (weightProblem !== null) {
    return {
      publishable: false,
      indexLevel: null,
      contributions: [],
      unavailableReason: weightProblem,
      ...EMPTY_DIAGNOSTICS,
    };
  }

  const covered = constituents.filter(
    (c): c is AggregationConstituent & { sigma30: number } =>
      c.sigma30 !== null && Number.isFinite(c.sigma30) && c.sigma30 >= 0,
  );
  const uncoveredIssuerCount = constituents.length - covered.length;

  const coveredParentWeight = covered.reduce((sum, c) => sum + c.parentWeight, 0);

  // W_t = 0 means the denominator does not exist. Dividing anyway yields Infinity or NaN weights
  // that would propagate into a published number, so the quotient is never attempted.
  if (covered.length === 0 || !(coveredParentWeight > 0)) {
    return {
      publishable: false,
      indexLevel: null,
      contributions: [],
      unavailableReason: "no_covered_constituents",
      coveredParentWeight: Number.isFinite(coveredParentWeight) ? coveredParentWeight : 0,
      coveredIssuerCount: covered.length,
      uncoveredIssuerCount,
      maxRenormalizedWeight: null,
      effectiveIssuerCount: null,
    };
  }

  const contributions: CoveredContribution[] = covered.map((c) => {
    const renormalizedWeight = c.parentWeight / coveredParentWeight;
    return {
      issuerId: c.issuerId,
      parentWeight: c.parentWeight,
      renormalizedWeight,
      sigma30: c.sigma30,
      // v_i × σ_i. Volatility, first power. Not σ², and nothing here is ever square-rooted.
      weightContribution: renormalizedWeight * c.sigma30,
    };
  });

  const maxRenormalizedWeight = contributions.reduce(
    (max, c) => Math.max(max, c.renormalizedWeight),
    0,
  );
  const sumSquaredWeights = contributions.reduce(
    (sum, c) => sum + c.renormalizedWeight * c.renormalizedWeight,
    0,
  );
  const effectiveIssuerCount = sumSquaredWeights > 0 ? 1 / sumSquaredWeights : null;

  const diagnostics: AggregationDiagnostics = {
    coveredParentWeight,
    coveredIssuerCount: contributions.length,
    uncoveredIssuerCount,
    maxRenormalizedWeight,
    effectiveIssuerCount,
  };

  // THE aggregation. A weighted arithmetic mean of volatilities, scaled once by 100.
  const indexLevel = 100 * contributions.reduce((sum, c) => sum + c.weightContribution, 0);
  if (!Number.isFinite(indexLevel) || indexLevel < 0) {
    return {
      publishable: false,
      indexLevel: null,
      contributions,
      unavailableReason: "no_covered_constituents",
      ...diagnostics,
    };
  }

  // The two frozen gates, in a fixed order so that the reported reason is deterministic when both
  // fail. Neither is lowered for a thin universe; that is what "frozen" means.
  // Compared with a tolerance, because the gate is a threshold on a real number and the left
  // side is a floating-point sum of it. See COVERED_WEIGHT_GATE_TOLERANCE: without this, eight
  // issuers at a genuine 0.1 each sum to 0.7999999999999999 and a universe covering exactly 80%
  // is refused by binary representation rather than by its coverage.
  if (coveredParentWeight < MIN_COVERED_PARENT_WEIGHT - COVERED_WEIGHT_GATE_TOLERANCE) {
    return {
      publishable: false,
      indexLevel: null,
      contributions,
      unavailableReason: "coverage_below_threshold",
      ...diagnostics,
    };
  }
  if (contributions.length < MIN_COVERED_ISSUER_COUNT) {
    return {
      publishable: false,
      indexLevel: null,
      contributions,
      unavailableReason: "issuer_count_below_threshold",
      ...diagnostics,
    };
  }

  return {
    publishable: true,
    indexLevel,
    contributions,
    unavailableReason: null,
    ...diagnostics,
  };
}
