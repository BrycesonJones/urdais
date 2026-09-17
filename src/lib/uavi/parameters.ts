/**
 * The UAVI parameter set, in one place, versioned.
 *
 * Every number the calculation depends on lives here and nowhere else. The methodology is
 * explicit that an unresolved parameter must be a queryable fact rather than a constant nobody
 * can find, and the corollary is that a *resolved* parameter must have exactly one home. Each
 * value below is also a row in `reference.methodology_parameters` against UAVI 0.2.0-draft, and
 * `parameters.test.ts` asserts the two agree — a constant that drifts from its approved row is
 * the failure this arrangement exists to prevent.
 *
 * The split between approved and unresolved is the important part. The launch contract froze a
 * set of values; a second set genuinely is not decided, and pretending otherwise by picking a
 * plausible default would be the specific failure the methodology names — "a gate chosen so that
 * the index publishes is not a gate", and a curve chosen because it was easy to implement is not
 * a curve anyone validated.
 */

/** The methodology version every UAVI calculation is stamped with. */
export const UAVI_METHODOLOGY_VERSION = "0.2.0-draft" as const;
export const UAVI_METHODOLOGY_SLUG = "uavi" as const;
export const UAVI_METHODOLOGY_PATH = "/docs/methodology/uavi" as const;

/**
 * The aggregation form, named rather than implied.
 *
 * Version 0.1.0-draft specified `100 × sqrt(Σ v_i σ²_i)` — a weighted root mean square — and that
 * is also what the one institutional analogue publishes. 0.2.0-draft publishes the weighted
 * arithmetic mean of the constituents' volatilities instead. The two agree only where every
 * constituent volatility is equal, so a regression is a real error in the level and looks like
 * nothing at all. It is named here, asserted in `aggregate.test.ts` against a fixture on which the
 * two differ, and re-derived by a database trigger at commit.
 */
export const UAVI_AGGREGATION_FORM = "weighted_arithmetic_mean_of_constituent_volatility" as const;

/** Calendar minutes in the constant 30-day horizon. */
export const N30 = 43_200 as const;
/** Calendar minutes in a 365-day year. Annualization is calendar time, not trading time. */
export const N365 = 525_600 as const;

/** Near Term window, in days to expiration. Inclusive at both ends. */
export const NEAR_TERM_MIN_DTE = 10 as const;
export const NEAR_TERM_MAX_DTE = 30 as const;
/** Next Term window: strictly above the near-term maximum, up to and including this. */
export const NEXT_TERM_MAX_DTE = 120 as const;

/** Minimum valid out-of-the-money contracts per wing, per strip. */
export const MIN_OTM_CONTRACTS_PER_SIDE = 3 as const;
/** Consecutive zero-bid out-of-the-money contracts that terminate a wing. */
export const ZERO_BID_RUN_LENGTH = 2 as const;

/** The official snapshot instant, as a local time in a named zone. */
export const SNAPSHOT_TIME_LOCAL = "15:45:00.000" as const;
export const SNAPSHOT_TIMEZONE = "America/New_York" as const;

/** Publication gates. Exactly two, frozen. */
export const MIN_COVERED_PARENT_WEIGHT = 0.8 as const;
export const MIN_COVERED_ISSUER_COUNT = 8 as const;

/**
 * The tolerance the covered-weight gate is compared with.
 *
 * The gate is `W_t ≥ 0.80` on a real number; `W_t` is a floating-point sum of the covered
 * members' parent weights. Those are not the same object. Eight issuers at a genuine 0.1 each sum
 * to 0.7999999999999999 in IEEE arithmetic, and a bare `>=` would withhold a headline on a
 * universe that covers exactly 80% — a refusal caused by binary representation and by summation
 * order, not by coverage.
 *
 * 1e-12 is twelve orders of magnitude below any coverage difference that could matter: it is a
 * ten-billionth of a percentage point of parent weight. It admits representation error and
 * nothing else, and the same tolerance is applied by the database trigger so the two cannot
 * disagree about the same universe.
 */
export const COVERED_WEIGHT_GATE_TOLERANCE = 1e-12 as const;

/**
 * There is no concentration gate in V1, and the absence is a decision rather than an omission.
 * `max(v_i)` and the effective constituent count are computed and published; neither can withhold
 * a headline. Recorded as a value so that "is there a concentration gate?" is answerable without
 * reading prose and without inferring it from the absence of code.
 */
export const CONCENTRATION_PUBLICATION_GATE = "none" as const;

/** No same-day and no prior-date carry of a constituent variance, under any circumstance. */
export const CONSTITUENT_VARIANCE_CARRY = "prohibited" as const;

/** Contracts are eligible only from US options venues. */
export const OPTION_VENUE_SCOPE = "us_listed" as const;

/**
 * The parameters that are genuinely not decided.
 *
 * Exported so that a caller can state *which* dependency blocks it rather than reporting a
 * generic failure, and so that a test can assert none of them has quietly acquired a value.
 */
export const UNRESOLVED_PARAMETERS = [
  /** Which USD curve, interpolated how, observed when, on what compounding basis. */
  "usd_rate_curve_family",
  /** How old a last-NBBO-before-the-instant may be before its strip is unusable. */
  "quote_freshness_tolerance",
  /** The time by which an observation must be released before it is Delayed. */
  "publication_deadline",
  /** The window within which an error is corrected by restatement rather than prospectively. */
  "correction_window",
] as const;

export type UnresolvedParameter = (typeof UNRESOLVED_PARAMETERS)[number];

/** Approved numeric parameters, keyed as the database keys them. For the agreement test. */
export const APPROVED_NUMERIC_PARAMETERS: Readonly<Record<string, number>> = {
  horizon_minutes: N30,
  annualization_minutes: N365,
  near_term_min_dte: NEAR_TERM_MIN_DTE,
  near_term_max_dte: NEAR_TERM_MAX_DTE,
  next_term_max_dte: NEXT_TERM_MAX_DTE,
  min_otm_contracts_per_side: MIN_OTM_CONTRACTS_PER_SIDE,
  zero_bid_run_length: ZERO_BID_RUN_LENGTH,
  min_covered_parent_weight: MIN_COVERED_PARENT_WEIGHT,
  min_covered_issuer_count: MIN_COVERED_ISSUER_COUNT,
};

/** Approved textual parameters, likewise. */
export const APPROVED_TEXT_PARAMETERS: Readonly<Record<string, string>> = {
  aggregation_form: UAVI_AGGREGATION_FORM,
  snapshot_time_local: SNAPSHOT_TIME_LOCAL,
  snapshot_timezone: SNAPSHOT_TIMEZONE,
  concentration_publication_gate: CONCENTRATION_PUBLICATION_GATE,
  constituent_variance_carry: CONSTITUENT_VARIANCE_CARRY,
  option_venue_scope: OPTION_VENUE_SCOPE,
};

/**
 * The reasons an issuer can be uncovered for a session.
 *
 * A closed list, matching the database's own check constraint. Free text as a publication input
 * is not auditable: the uncovered parent weight is published *by reason*, and a distribution over
 * arbitrary strings is not a distribution.
 */
export const UNCOVERED_REASONS = [
  "no_volatility_instrument",
  "option_data_missing",
  "near_expiry_missing",
  "next_expiry_missing",
  "invalid_forward",
  "invalid_k0",
  "insufficient_puts",
  "insufficient_calls",
  "invalid_atm_quotes",
  "invalid_variance",
  "adjusted_contract_only",
  "rate_missing",
  "stale_quotes",
  "reference_data_conflict",
  "underlying_halted",
] as const;

export type UncoveredReason = (typeof UNCOVERED_REASONS)[number];

/** The reasons a headline is withheld. Parent conditions and gate failures, in one list. */
export const UNAVAILABLE_REASONS = [
  "parent_not_production",
  "parent_weights_missing",
  "parent_weights_invalid",
  "coverage_below_threshold",
  "issuer_count_below_threshold",
  "no_covered_constituents",
  "no_option_data_source",
] as const;

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];
