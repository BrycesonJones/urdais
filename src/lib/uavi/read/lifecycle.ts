/**
 * What the public UAVI surface is allowed to say about the index's state.
 *
 * The rule this module exists to enforce:
 *
 *   A nonexistent index value must never be replaced by a mock value, synthetic history,
 *   placeholder series, or stale demo chart.
 *
 * UAVI arrives with that rule already broken once: it carried a generated market at 27.84 points
 * with a year of seeded history, in the same type and the same colours as a published index. The
 * walk is gone, and there is no code path in this file that produces a number from an absence —
 * a lifecycle state carries a level only when it is `live` or `delayed`.
 *
 * **Five states, and the fifth is the one that matters most here.** UGAI has four, because UGAI
 * has never reached the point where its own arithmetic could run and be refused. UAVI separates:
 *
 *   `blocked`      an upstream dependency stopped the calculation before it began — no production
 *                  parent snapshot, no valid parent weight vector, no admitted option source.
 *   `unavailable`  the calculation ran. Constituent volatilities exist, coverage was measured, and
 *                  a publication gate refused the headline.
 *
 * Collapsing those two would be the specific dishonesty this file is against: `unavailable` is the
 * state in which UAVI is working correctly and declining to publish, and `blocked` is the state in
 * which it has not started. A reader told only "no value" cannot tell a functioning index
 * exercising a gate from one that was never wired up.
 *
 * The evaluation consumes the publication checks recorded against the most recent calculation and
 * the calculation's own structured reason, and nothing else. There is exactly one implementation
 * of "may UAVI publish", it lives in the database, and this reads its answer.
 */

import type { UnavailableReason } from "@/lib/uavi/parameters";

/** The index's position in its own lifecycle. Never inferred from the presence of data. */
export type UaviLifecycle =
  /** No legitimate observation has ever been published. The current state. */
  | "not_initialized"
  /** An upstream dependency prevents the calculation from running at all. */
  | "blocked"
  /** The calculation ran and a publication gate withheld the headline. */
  | "unavailable"
  /** A published series exists and the latest observation is publishable. */
  | "live"
  /**
   * Live, but the latest published observation is older than the approved freshness threshold.
   * Reachable only once `publication_deadline` is an approved parameter: without it there is no
   * rule that makes an observation late, and asserting one here would invent timing policy.
   */
  | "delayed";

/** One publication check, as the database records it. */
export type PublicationCheck = {
  checkName: string;
  result: "passed" | "failed" | "unavailable" | "parameter_unresolved";
  parameterKey: string | null;
  basis: string;
};

export type LifecycleInput = {
  /** Has any observation ever been published? */
  hasPublishedObservation: boolean;
  latestPublishedAt: string | null;
  /** The checks recorded against the most recent calculation attempt. */
  checks: readonly PublicationCheck[];
  /**
   * The structured reason the most recent calculation withheld a headline, if it recorded one.
   * A gate reason means the arithmetic ran; a parent reason means it did not.
   */
  latestUnavailableReason: UnavailableReason | null;
  /** True only when the methodology's publication deadline is approved and in force. */
  freshnessApproved: boolean;
  freshnessSeconds?: number;
  now?: string;
};

export type LifecycleEvaluation = {
  lifecycle: UaviLifecycle;
  /** Durable public wording. Never an internal identifier or a column name. */
  publicReason: string;
  /** Which checks are not passing, by name only. Detail stays internal. */
  unmetChecks: readonly string[];
};

/**
 * Public wording.
 *
 * Deliberately durable and deliberately vague about mechanism. A reader needs to know whether the
 * index is live, held back by something upstream, or declining to publish on its own coverage
 * rules; they do not need — and Urdais should not publish — which vendor agreement is unsigned.
 * The detailed blockers stay in the operator diagnostics.
 */
const NOT_INITIALIZED_REASON =
  "UAVI has not begun live publication. The AI Equity Universe it measures does not yet have a production weight set, and the licensed options data the calculation requires is not yet in place. No volatility level is published until both are.";
const BLOCKED_REASON =
  "UAVI is not calculating for this date. A required upstream input — the parent universe's canonical weights, or admitted options data — is not available.";
const UNAVAILABLE_REASON =
  "UAVI calculated for this date and is not publishing a level. The covered share of the parent universe did not meet the methodology's publication thresholds, and a level computed from the remainder would not represent the universe it names.";
const DELAYED_REASON =
  "UAVI's most recent published level is older than the methodology's publication deadline.";

/**
 * The gate reasons — the ones that mean the calculation ran and its result was refused.
 *
 * Anything else means the calculation never got that far. The distinction is what separates
 * `unavailable` from `blocked`, so it is a named set rather than a condition inline.
 */
const GATE_REASONS: ReadonlySet<UnavailableReason> = new Set([
  "coverage_below_threshold",
  "issuer_count_below_threshold",
  "no_covered_constituents",
]);

/**
 * Evaluate the lifecycle.
 *
 * Note what this cannot do. There is no branch returning `live` without a published observation,
 * no branch returning `delayed` without an approved deadline, and no argument that lets a caller
 * assert a state — the inputs are facts about the database and the state is derived from them.
 */
export function evaluateLifecycle(input: LifecycleInput): LifecycleEvaluation {
  const unmet = input.checks.filter((c) => c.result !== "passed").map((c) => c.checkName);

  if (!input.hasPublishedObservation || input.latestPublishedAt === null) {
    return {
      lifecycle: "not_initialized",
      publicReason: NOT_INITIALIZED_REASON,
      unmetChecks: unmet,
    };
  }

  if (input.latestUnavailableReason !== null && GATE_REASONS.has(input.latestUnavailableReason)) {
    return { lifecycle: "unavailable", publicReason: UNAVAILABLE_REASON, unmetChecks: unmet };
  }

  if (unmet.length > 0 || input.latestUnavailableReason !== null) {
    return { lifecycle: "blocked", publicReason: BLOCKED_REASON, unmetChecks: unmet };
  }

  // Lateness is a methodology question. Without an approved deadline there is no threshold to be
  // past, so a live index stays live rather than being called late against a number this code
  // invented.
  if (input.freshnessApproved && input.freshnessSeconds !== undefined) {
    const now = Date.parse(input.now ?? new Date().toISOString());
    const published = Date.parse(input.latestPublishedAt);
    if (Number.isFinite(now) && Number.isFinite(published)) {
      if ((now - published) / 1000 > input.freshnessSeconds) {
        return { lifecycle: "delayed", publicReason: DELAYED_REASON, unmetChecks: unmet };
      }
    }
  }

  return { lifecycle: "live", publicReason: "", unmetChecks: [] };
}

/** Whether a lifecycle state may carry a numeric level. The only place that decision is made. */
export function lifecycleCarriesLevel(lifecycle: UaviLifecycle): boolean {
  return lifecycle === "live" || lifecycle === "delayed";
}
