/**
 * Freshness for capacity observations.
 *
 * Capacity is the most time-sensitive thing Urdais measures. A price from
 * yesterday is a true fact about yesterday and is useful; an availability from
 * yesterday is not evidence about today, and presenting it as current supply
 * is the most likely way this dataset would come to state something false
 * without anyone editing a number.
 *
 * No provider examined in the Phase 1 study exposes an availability-change or
 * availability-effective timestamp, so the policy rests on collection time,
 * which Urdais controls and records exactly. Each interface carries its own
 * horizon, because a daily catalog mirror and a live inventory API do not go
 * stale at the same rate.
 */

import type { CapacityObservation } from "@/lib/capacity/domain";

/** The horizon for an interface collected once a day. */
export const DEFAULT_FRESHNESS_HORIZON_SECONDS = 86_400;

export type FreshnessState =
  /** Within its horizon. Counts toward current capacity. */
  | "fresh"
  /** Past its horizon. Excluded from current totals, retained in history. */
  | "stale"
  /** A newer observation exists for the same key. Never current. */
  | "superseded";

export type FreshnessVerdict = {
  state: FreshnessState;
  ageSeconds: number;
  horizonSeconds: number;
};

/**
 * Classify one observation against a reference time.
 *
 * Supersession is checked first: a superseded row is not current no matter how
 * recently it was collected.
 */
export function classifyFreshness(
  observation: CapacityObservation,
  now: Date,
  horizonSeconds: number = DEFAULT_FRESHNESS_HORIZON_SECONDS,
): FreshnessVerdict {
  const retrieved = Date.parse(observation.retrievedAt);
  const ageSeconds = Number.isNaN(retrieved) ? Number.POSITIVE_INFINITY : (now.getTime() - retrieved) / 1000;

  if (observation.supersededById !== null) {
    return { state: "superseded", ageSeconds, horizonSeconds };
  }
  // An unparseable or future timestamp is not treated as fresh. A clock that
  // disagrees is a reason to exclude an observation, not to trust it more.
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > horizonSeconds) {
    return { state: "stale", ageSeconds, horizonSeconds };
  }
  return { state: "fresh", ageSeconds, horizonSeconds };
}

/**
 * The observations admissible to a current-capacity total.
 *
 * A stale source leaves the total rather than retaining its last good figure.
 * Carrying it forward would make a dead feed indistinguishable from a live one,
 * and the coverage statement is where its absence is meant to show up.
 */
export function currentObservations(
  observations: readonly CapacityObservation[],
  now: Date,
  horizonBySource: ReadonlyMap<string, number> = new Map(),
): readonly CapacityObservation[] {
  return observations.filter((observation) => {
    const horizon =
      horizonBySource.get(observation.provenance.sourceInterfaceSlug) ?? DEFAULT_FRESHNESS_HORIZON_SECONDS;
    return classifyFreshness(observation, now, horizon).state === "fresh";
  });
}
