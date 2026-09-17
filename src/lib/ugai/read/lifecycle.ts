/**
 * What the public UGAI surface is allowed to say about the index's state.
 *
 * The rule this module exists to enforce:
 *
 *   A nonexistent index value must never be replaced by a mock value, synthetic history,
 *   placeholder series, or stale demo chart.
 *
 * "Not initialized yet" is a legitimate product state and UGAI must be able to say it. The way
 * that is guaranteed here is structural: a lifecycle state carries a level only when it is
 * `live`, and there is no code path in this file that produces a number from an absence.
 *
 * Four states, and they are deliberately not one field. "Never launched", "launched but today's
 * calculation is blocked" and "live but stale" are different facts about the product, and
 * collapsing them into a single status is how a page ends up saying nothing useful in the state
 * it is actually in.
 *
 * The evaluation consumes the Phase 5.7 publication checks and nothing else. There is exactly one
 * implementation of "may UGAI publish", it lives in the database, and this reads its answer —
 * the API and the frontend must never re-derive it, because two implementations of a publication
 * gate is one more than can be kept in agreement.
 */

/** The index's position in its own lifecycle. Never inferred from the presence of data. */
export type UgaiLifecycle =
  /** No legitimate base observation has ever been published. The current state. */
  | "not_initialized"
  /** A series exists, or would, but publication gates prevent today's observation. */
  | "blocked"
  /** A published series exists and the latest observation is publishable. */
  | "live"
  /**
   * Live, but the latest valid observation is older than the approved freshness threshold.
   * Only reachable once `stale_input_tolerance` is an approved parameter: without it there is no
   * rule that makes an observation late, and asserting one in frontend code would be inventing
   * timing policy the methodology has not decided.
   */
  | "delayed";

/** One Phase 5.7 publication check, as the database records it. */
export type PublicationCheck = {
  checkName: string;
  result: "passed" | "failed" | "unavailable" | "parameter_unresolved";
  parameterKey: string | null;
  basis: string;
};

export type LifecycleInput = {
  /** Has any observation ever been published as the base? */
  hasBaseObservation: boolean;
  /** The latest publication-eligible observation, if any. */
  latestPublishedAt: string | null;
  /** The checks recorded against the most recent calculation attempt. */
  checks: readonly PublicationCheck[];
  /** True only when the methodology's stale-input tolerance is approved and in force. */
  staleToleranceApproved: boolean;
  /** Seconds after which a live observation is stale. Meaningless unless the above is true. */
  staleToleranceSeconds?: number;
  now?: string;
};

export type LifecycleEvaluation = {
  lifecycle: UgaiLifecycle;
  /** Durable public wording. Never an internal identifier or a column name. */
  publicReason: string;
  /** Which checks are not passing, by name only. Detail stays internal. */
  unmetChecks: readonly string[];
};

/**
 * Public wording for the state.
 *
 * Deliberately durable and deliberately vague about mechanism. A reader needs to know the index
 * is not yet live and that the work outstanding is methodology and data validation; they do not
 * need — and Urdais should not publish — which permission grant is missing or which licence is
 * unsigned. The detailed blockers stay in the operator diagnostics.
 */
const NOT_INITIALIZED_REASON =
  "UGAI has not yet begun live publication. Methodology parameters and data-source validation are still being completed, and no index level is published until they are.";
const BLOCKED_REASON =
  "UGAI is not publishing a level for this date. One or more required inputs or methodology parameters are outstanding.";
const DELAYED_REASON =
  "UGAI's most recent published level is older than the methodology's freshness threshold.";

/**
 * Evaluate the lifecycle.
 *
 * Note what this cannot do. There is no branch that returns `live` without a published
 * observation, no branch that returns `delayed` without an approved tolerance, and no argument
 * that lets a caller assert a state — the inputs are facts about the database, and the state is
 * derived from them.
 */
export function evaluateLifecycle(input: LifecycleInput): LifecycleEvaluation {
  const unmet = input.checks
    .filter((c) => c.result !== "passed")
    .map((c) => c.checkName);

  if (!input.hasBaseObservation || input.latestPublishedAt === null) {
    return {
      lifecycle: "not_initialized",
      publicReason: NOT_INITIALIZED_REASON,
      unmetChecks: unmet,
    };
  }

  if (unmet.length > 0) {
    return { lifecycle: "blocked", publicReason: BLOCKED_REASON, unmetChecks: unmet };
  }

  // Staleness is a methodology question. Without an approved tolerance there is no threshold to
  // be past, so a live index stays live rather than being called late on a number this code
  // invented.
  if (input.staleToleranceApproved && input.staleToleranceSeconds !== undefined) {
    const now = Date.parse(input.now ?? new Date().toISOString());
    const published = Date.parse(input.latestPublishedAt);
    if (Number.isFinite(now) && Number.isFinite(published)) {
      if ((now - published) / 1000 > input.staleToleranceSeconds) {
        return { lifecycle: "delayed", publicReason: DELAYED_REASON, unmetChecks: unmet };
      }
    }
  }

  return { lifecycle: "live", publicReason: "", unmetChecks: [] };
}

/** Whether a lifecycle state may carry a numeric level. The only place that decision is made. */
export function lifecycleCarriesLevel(lifecycle: UgaiLifecycle): boolean {
  return lifecycle === "live" || lifecycle === "delayed";
}
