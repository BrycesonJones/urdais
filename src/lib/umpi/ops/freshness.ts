/**
 * Whether a UMPI series is currently current.
 *
 * The question this answers is deliberately narrow and deliberately hard to fake: **is the
 * reference month a reader sees the one the source should have produced by now?** Not "did the
 * scheduler run", not "did the source return 200", not "was something retrieved recently". An
 * August figure is not current in late October because a check succeeded this morning, and a
 * system that answers with the check's timestamp will report perfect health while the product
 * quietly falls two months behind.
 *
 * So freshness is computed from five separate facts, and every one of them can withhold it:
 *
 *   - which month the source says it has;
 *   - which month Urdais has ingested as a canonical observation;
 *   - which month has a current public publication;
 *   - whether the most recent operational check actually reached the source;
 *   - when that check ran, relative to the cadence it is supposed to run at.
 *
 * It fails closed. Every path that cannot establish currentness returns something other than
 * `fresh`, and the absence of evidence is `unknown` rather than an optimistic default.
 *
 * The clock is always injected. Nothing here calls `Date.now()`, because a state machine whose
 * transitions depend on an ambient clock can only be tested by waiting.
 */

import {
  expectedReferenceMonth,
  overdueAt,
  type UmpiReleasePolicy,
} from "@/lib/umpi/ops/policy";

/**
 * `fresh`              the public month satisfies the expected-release rule.
 * `awaiting_release`   the next month is not reasonably due from the source yet.
 * `stale`              it is due, the grace window has passed, and Urdais still lacks it.
 * `source_unavailable` the scheduled check could not reach or parse the official source.
 * `derivation_failed`  the source has a month Urdais ingested or could ingest, and no current
 *                      publication was produced for it.
 * `unknown`            required operational evidence is missing; currentness cannot be claimed.
 */
export type UmpiFreshnessState =
  | "fresh"
  | "awaiting_release"
  | "stale"
  | "source_unavailable"
  | "derivation_failed"
  | "unknown";

/** A series is operationally healthy while it is current, or legitimately waiting to be. */
export const HEALTHY_FRESHNESS: readonly UmpiFreshnessState[] = ["fresh", "awaiting_release"];

export function isHealthy(state: UmpiFreshnessState): boolean {
  return HEALTHY_FRESHNESS.includes(state);
}

export type UmpiFreshnessEvidence = {
  /** Injected, never ambient. */
  asOf: Date;
  policy: UmpiReleasePolicy;
  /** Newest reference month with a current, public publication. */
  publishedMonth: string | null;
  /** Newest reference month the source reported holding at the last successful check. */
  sourceMonth: string | null;
  /** Newest reference month stored as a current canonical observation. */
  observedMonth: string | null;
  /** When the most recent operational check ran, whatever its outcome. */
  lastCheckAt: Date | null;
  /** Whether that check reached and parsed the source. */
  lastCheckReachable: boolean;
};

export type UmpiFreshness = {
  state: UmpiFreshnessState;
  /** The month that should be public by now, under this series' release policy. */
  expectedReferenceMonth: string;
  /** The month that is public. */
  latestReferenceMonth: string | null;
  /** When the expected month stops being a wait and becomes a fault. */
  dueAt: string;
  /** Set only while `stale`: when this series first became overdue. */
  staleSince: string | null;
  /** Why, in one line a person can act on. */
  reason: string;
};

/** `YYYY-MM` strings compare correctly as strings; this only makes the intent explicit. */
function isAtLeast(month: string | null, target: string): boolean {
  return month !== null && month >= target;
}

export function evaluateFreshness(evidence: UmpiFreshnessEvidence): UmpiFreshness {
  const { asOf, policy, publishedMonth, sourceMonth, observedMonth, lastCheckAt, lastCheckReachable } = evidence;
  const expected = expectedReferenceMonth(asOf, policy);
  const overdue = overdueAt(expected, policy);
  const base = {
    expectedReferenceMonth: expected,
    latestReferenceMonth: publishedMonth,
    dueAt: overdue.toISOString(),
    staleSince: null as string | null,
  };

  // No check has ever run, or the schedule has stopped. Both mean the same thing: Urdais cannot
  // currently vouch for what the source holds, so it must not claim the public month is current
  // however recent that month happens to look.
  if (lastCheckAt === null) {
    return { ...base, state: "unknown", reason: "no operational check has run for this series" };
  }
  const ageHours = (asOf.getTime() - lastCheckAt.getTime()) / 3_600_000;
  if (ageHours > policy.maxCheckAgeHours) {
    return {
      ...base,
      state: "unknown",
      reason: `the last operational check ran ${Math.floor(ageHours)}h ago, beyond the ${policy.maxCheckAgeHours}h this series is checked at`,
    };
  }

  if (!lastCheckReachable) {
    return { ...base, state: "source_unavailable", reason: "the last operational check could not reach or parse the source" };
  }

  // The source has a month Urdais has not published. Whether it was never ingested or ingested
  // and never derived, the public answer is the same: a figure exists upstream and Urdais is not
  // serving it, which is a fault in Urdais rather than a wait on the agency.
  if (sourceMonth !== null && (publishedMonth === null || sourceMonth > publishedMonth)) {
    const stage = observedMonth !== null && observedMonth >= sourceMonth ? "derivation" : "ingestion";
    return {
      ...base,
      state: "derivation_failed",
      reason: `the source holds ${sourceMonth} and no current publication exists for it (${stage} did not complete)`,
    };
  }

  if (isAtLeast(publishedMonth, expected)) {
    return { ...base, state: "fresh", reason: `the published month ${publishedMonth} satisfies the expected month ${expected}` };
  }

  // The expected month is missing. Whether that is a fault depends only on the calendar: an
  // agency that has not published yet is not Urdais being stale.
  if (asOf <= overdue) {
    return {
      ...base,
      state: "awaiting_release",
      reason: `${expected} is not overdue until ${overdue.toISOString().slice(0, 10)}`,
    };
  }

  return {
    ...base,
    state: "stale",
    staleSince: overdue.toISOString(),
    reason: `${expected} was due by ${overdue.toISOString().slice(0, 10)} and no current publication exists for it`,
  };
}

/**
 * The family's state, which summarises the two series without replacing either.
 *
 * Series A and Series B are independent: the Bank of Korea missing a release says nothing about
 * Korea Customs. A summary that let one series' fault mask the other's health would be worse than
 * no summary, so the rule is the pessimistic one and the per-series states stay visible.
 */
export function summariseFreshness(states: readonly UmpiFreshnessState[]): UmpiFreshnessState {
  if (states.length === 0) return "unknown";
  if (states.every((state) => state === "fresh")) return "fresh";
  if (states.every(isHealthy)) return "awaiting_release";
  // Worst wins, in order of how much it should worry an operator.
  for (const state of ["stale", "derivation_failed", "source_unavailable", "unknown"] as const) {
    if (states.includes(state)) return state;
  }
  return "unknown";
}
