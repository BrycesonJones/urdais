/**
 * Aggregating capacity observations.
 *
 * Two rules govern everything here.
 *
 * Only quantities are summed. Tier 3 observations are counted and reported
 * beside the total, never inside it. Three providers reporting "available"
 * are three providers, not three GPUs, and the moment they become three GPUs
 * the dataset is measuring its own coverage and calling it supply.
 *
 * Ranges stay ranges. A Tier 2 observation of 50-100 contributes [50, 100],
 * not 75. A midpoint is a number nobody reported, and once one enters a total
 * there is no way to tell from the total that it is there.
 */

import type {
  CapacityObservation,
  CapacityQuantityUnit,
  CapacityAvailabilityState,
} from "@/lib/capacity/domain";

/**
 * A total, as an interval.
 *
 * Where every contributing observation is Tier 1 the bounds are equal and the
 * interval is a point; `exact` records which case this is so a caller need not
 * infer it from the bounds.
 */
export type CapacityTotal = {
  lower: number;
  upper: number;
  exact: boolean;
  unit: CapacityQuantityUnit;
  /** Observations that contributed a number. */
  quantitativeObservations: number;
  /** Distinct capacity sources behind them. */
  quantitativeSources: number;
};

/** What the categorical side of the population says. Reported beside a total, never merged into it. */
export type CategoricalCoverage = {
  /** Observations with a state and no number. */
  observations: number;
  /** Distinct capacity sources behind them. */
  sources: number;
  byState: Readonly<Record<CapacityAvailabilityState, number>>;
};

export type CapacityAggregate = {
  /** Null where no observation carried a quantity. Never zero as a stand-in for that. */
  total: CapacityTotal | null;
  categorical: CategoricalCoverage;
  /** Observations with no usable signal. Neither summed nor counted as availability. */
  unknownObservations: number;
};

/**
 * The deduplication key: one capacity source, one configuration, one region,
 * is one supply.
 *
 * Two interfaces reporting the same operator's H100s in the same region have
 * observed one thing twice. Summing them would double-count, and the failure
 * grows with coverage — the better Urdais's source coverage becomes, the more
 * it would overstate.
 */
export function dedupeKey(observation: CapacityObservation): string {
  return [
    observation.capacitySourceEntityId,
    observation.hardware.normalizedGpuType ?? "unresolved-gpu",
    observation.canonicalRegionCode ?? "unresolved-region",
  ].join("|");
}

/**
 * Source quality ordering for deduplication. Lower grade is better, matching
 * the UCPI scale, and a missing grade loses to any stated one.
 */
function qualityRank(observation: CapacityObservation): number {
  return observation.availabilityEvidenceGrade ?? Number.POSITIVE_INFINITY;
}

const TIER_RANK: Record<CapacityObservation["measurement"]["kind"], number> = {
  exact_quantity: 0,
  quantity_range: 1,
  availability_state: 2,
  unknown: 3,
};

/**
 * Collapse duplicates to one observation per key.
 *
 * Best evidence grade wins; a tie goes to the more recent observation; a
 * remaining tie goes to the more precise tier. Deterministic throughout, so
 * the same population always reduces to the same set.
 */
export function deduplicate(
  observations: readonly CapacityObservation[],
): readonly CapacityObservation[] {
  const best = new Map<string, CapacityObservation>();
  for (const observation of observations) {
    const key = dedupeKey(observation);
    const incumbent = best.get(key);
    if (incumbent === undefined) {
      best.set(key, observation);
      continue;
    }
    if (preferred(observation, incumbent)) best.set(key, observation);
  }
  return [...best.values()];
}

function preferred(candidate: CapacityObservation, incumbent: CapacityObservation): boolean {
  const quality = qualityRank(candidate) - qualityRank(incumbent);
  if (quality !== 0) return quality < 0;

  const candidateAt = Date.parse(candidate.observedAt);
  const incumbentAt = Date.parse(incumbent.observedAt);
  if (candidateAt !== incumbentAt) return candidateAt > incumbentAt;

  return TIER_RANK[candidate.measurement.kind] < TIER_RANK[incumbent.measurement.kind];
}

const EMPTY_STATE_COUNTS: Record<CapacityAvailabilityState, number> = {
  available: 0,
  limited: 0,
  waitlisted: 0,
  sold_out: 0,
  quote_required: 0,
  unknown: 0,
};

/**
 * Aggregate a population that has already been filtered for eligibility and
 * freshness and deduplicated.
 *
 * `unit` selects which quantities are addable. Observations in another unit
 * are not converted here — conversion needs evidenced accelerators-per-unit
 * and belongs in normalization — so they fall out of the total rather than
 * being coerced into it.
 */
export function aggregate(
  observations: readonly CapacityObservation[],
  unit: CapacityQuantityUnit = "accelerator",
): CapacityAggregate {
  let lower = 0;
  let upper = 0;
  let exact = true;
  let quantitative = 0;
  const quantitativeSources = new Set<string>();

  let categoricalObservations = 0;
  const categoricalSources = new Set<string>();
  const byState: Record<CapacityAvailabilityState, number> = { ...EMPTY_STATE_COUNTS };

  let unknownObservations = 0;

  for (const observation of observations) {
    const measurement = observation.measurement;
    switch (measurement.kind) {
      case "exact_quantity": {
        if (measurement.unit !== unit) continue;
        lower += measurement.quantity;
        upper += measurement.quantity;
        quantitative += 1;
        quantitativeSources.add(observation.capacitySourceEntityId);
        break;
      }
      case "quantity_range": {
        if (measurement.unit !== unit) continue;
        lower += measurement.min;
        upper += measurement.max;
        exact = false;
        quantitative += 1;
        quantitativeSources.add(observation.capacitySourceEntityId);
        break;
      }
      case "availability_state": {
        // Counted. Never summed. This branch has no access to a number and
        // that is deliberate.
        categoricalObservations += 1;
        categoricalSources.add(observation.capacitySourceEntityId);
        byState[measurement.state] += 1;
        break;
      }
      case "unknown": {
        unknownObservations += 1;
        break;
      }
    }
  }

  return {
    // No quantity anywhere means there is no total, which is different from a
    // total of zero. A zero here would read as "the market has none".
    total:
      quantitative === 0
        ? null
        : {
            lower,
            upper,
            exact,
            unit,
            quantitativeObservations: quantitative,
            quantitativeSources: quantitativeSources.size,
          },
    categorical: {
      observations: categoricalObservations,
      sources: categoricalSources.size,
      byState,
    },
    unknownObservations,
  };
}

export type CapacityBreakdown = {
  key: string;
  label: string;
  aggregate: CapacityAggregate;
};

/**
 * Break a population down by one dimension.
 *
 * Each group is aggregated independently and carries its own coverage, because
 * a breakdown is a different sample from the total: the observations that
 * resolve a region are not the ones that resolve a GPU type.
 */
export function breakdownBy(
  observations: readonly CapacityObservation[],
  dimension: (observation: CapacityObservation) => { key: string; label: string } | null,
  unit: CapacityQuantityUnit = "accelerator",
): readonly CapacityBreakdown[] {
  const groups = new Map<string, { label: string; rows: CapacityObservation[] }>();
  for (const observation of observations) {
    const slot = dimension(observation);
    // An observation that cannot be placed on this axis is left out of the
    // breakdown rather than bucketed into an "other" that would read as a
    // measured category.
    if (slot === null) continue;
    const group = groups.get(slot.key);
    if (group === undefined) groups.set(slot.key, { label: slot.label, rows: [observation] });
    else group.rows.push(observation);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, aggregate: aggregate(group.rows, unit) }))
    .sort((a, b) => (b.aggregate.total?.lower ?? 0) - (a.aggregate.total?.lower ?? 0) || a.key.localeCompare(b.key));
}

export const byGpuType = (observation: CapacityObservation) =>
  observation.hardware.normalizedGpuType === null
    ? null
    : { key: observation.hardware.normalizedGpuType, label: observation.hardware.normalizedGpuType };

export const byRegion = (observation: CapacityObservation) =>
  observation.canonicalRegionCode === null
    ? null
    : { key: observation.canonicalRegionCode, label: observation.canonicalRegionCode };

export const byCapacitySource = (observation: CapacityObservation) => ({
  key: observation.capacitySourceEntityId,
  label: observation.capacitySourceEntityId,
});
