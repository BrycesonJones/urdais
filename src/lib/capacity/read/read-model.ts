/**
 * The public Available Compute Capacity read model.
 *
 * The rule shaping every field: nullable means absent, not zero.
 *
 * When no source reports a quantity, `total` is null. It is not `{lower: 0,
 * upper: 0}`, because "0 GPUs available" is a strong and false claim about the
 * compute market, and it renders identically to a market that has genuinely
 * run out. The distinction between "we see none" and "we cannot see" is the
 * whole product, and a zero erases it.
 *
 * The coverage block is not decoration. Because the dataset is a convenience
 * sample of whichever interfaces both expose availability and permit Urdais to
 * use it, a total without its coverage is uninterpretable, so they are one
 * object and the validator refuses a response carrying a total without one.
 */

import { CAPACITY_DISCLAIMERS, CAPACITY_METHODOLOGY, type CapacityTier } from "@/lib/capacity/domain";
import type { CapacityAggregate, CapacityBreakdown } from "@/lib/capacity/aggregation";

/** Why the dataset is not publishing a value. Durable public wording. */
export type CapacityUnavailableReason =
  /** No source interface both exposes a capacity signal and permits its use. */
  | "no_eligible_source"
  /** Eligible sources exist but none has produced a fresh observation. */
  | "no_fresh_observations"
  /** Eligible sources report availability but none reports a quantity. */
  | "no_quantitative_coverage"
  /** The deployment has no database configured. */
  | "not_configured";

export type CapacitySourceCoverage = {
  sourceInterfaceSlug: string;
  providerName: string;
  /** The best tier this interface can support, whatever its permission state. */
  maxTier: CapacityTier;
  termsPermitted: boolean;
  productionApproved: boolean;
  /** Registry state, so the surface can distinguish a refusal from a pending review. */
  termsReviewState: string;
  eligible: boolean;
  /** Observations contributed to the current snapshot. Zero for an ineligible source. */
  freshObservations: number;
  /** Plain-language reason this source contributes nothing, or null when it does. */
  blockedReason: string | null;
};

export type CapacityCoverage = {
  /** Interfaces registered with an assessed capacity capability. */
  assessedSources: number;
  /** Of those, the ones both capable and permitted. */
  eligibleSources: number;
  /** Of those, the ones that produced a fresh observation. */
  contributingSources: number;
  /** Distinct capacity sources — operators or sellers — behind the snapshot. */
  capacitySources: number;
  regions: number;
  gpuTypes: number;
  sources: readonly CapacitySourceCoverage[];
};

export type CapacitySnapshot = {
  observedAt: string;
  aggregate: CapacityAggregate;
  byGpuType: readonly CapacityBreakdown[];
  byRegion: readonly CapacityBreakdown[];
  byProvider: readonly CapacityBreakdown[];
};

export type CapacityReadModel = {
  dataset: "available-compute-capacity";
  name: string;
  methodology: {
    version: string;
    status: string;
    documentPath: string;
    name: string;
  };
  disclaimers: readonly string[];

  /** Null whenever nothing eligible and fresh exists. Never a zeroed stand-in. */
  snapshot: CapacitySnapshot | null;
  /** Null exactly when snapshot is non-null and carries a quantitative total. */
  unavailableReason: CapacityUnavailableReason | null;
  /** Public wording for the reason. Empty only when a total is published. */
  publicReason: string;

  coverage: CapacityCoverage;
  /** The observed window. Empty until observations exist; never widened to fill a chart. */
  history: {
    points: readonly CapacityHistoryPoint[];
    /** Distinct observation days. The UI offers no range longer than this supports. */
    observedDays: number;
  };
};

export type CapacityHistoryPoint = {
  /** ISO date of the observation day. */
  date: string;
  /** Null where that day carried no quantitative observation. Never zero for that. */
  lower: number | null;
  upper: number | null;
  exact: boolean;
  /** Categorical observations that day, reported beside the number, never in it. */
  categoricalObservations: number;
  capacitySources: number;
};

export const CAPACITY_DATASET_NAME = "Available Compute Capacity" as const;

const REASON_TEXT: Record<CapacityUnavailableReason, string> = {
  no_eligible_source:
    "No source interface currently both exposes an availability signal and permits Urdais to use it. " +
    "Every compute interface Urdais has assessed that reports availability is either barred by its terms or " +
    "awaiting written confirmation, and every interface Urdais is permitted to use publishes prices only. " +
    "A published price is not evidence that compute can be had, so no capacity figure is shown.",
  no_fresh_observations:
    "Eligible sources are configured but none has produced an observation inside its freshness window. " +
    "Capacity is not carried forward, so no current figure is shown.",
  no_quantitative_coverage:
    "Sources currently report that compute is available without stating how much. Those observations are " +
    "counted below, but they are not quantities and are not added together into a GPU total.",
  not_configured: "No database is configured for this deployment.",
};

export function reasonText(reason: CapacityUnavailableReason): string {
  return REASON_TEXT[reason];
}

/** What the surface serves when nothing can be published. Not an error, and not a value. */
export function emptyCapacityReadModel(
  reason: CapacityUnavailableReason,
  coverage: CapacityCoverage,
): CapacityReadModel {
  return {
    dataset: "available-compute-capacity",
    name: CAPACITY_DATASET_NAME,
    methodology: {
      version: CAPACITY_METHODOLOGY.version,
      status: CAPACITY_METHODOLOGY.status,
      documentPath: CAPACITY_METHODOLOGY.documentPath,
      name: CAPACITY_METHODOLOGY.name,
    },
    disclaimers: CAPACITY_DISCLAIMERS,
    snapshot: null,
    unavailableReason: reason,
    publicReason: reasonText(reason),
    coverage,
    history: { points: [], observedDays: 0 },
  };
}

export function emptyCoverage(): CapacityCoverage {
  return {
    assessedSources: 0,
    eligibleSources: 0,
    contributingSources: 0,
    capacitySources: 0,
    regions: 0,
    gpuTypes: 0,
    sources: [],
  };
}

/**
 * Contract check on the way out.
 *
 * These are the mistakes that would be invisible in a rendered page: a zero
 * that should have been an absence, a total with no coverage to interpret it
 * by, or a publication under a draft methodology. A response failing any of
 * them is not served.
 */
export function validatePublicCapacity(model: unknown): readonly string[] {
  const reasons: string[] = [];
  if (typeof model !== "object" || model === null) return ["response is not an object"];
  const m = model as Partial<CapacityReadModel>;

  if (m.dataset !== "available-compute-capacity") reasons.push("dataset identifier is wrong or missing");
  if (!Array.isArray(m.disclaimers) || m.disclaimers.length !== CAPACITY_DISCLAIMERS.length) {
    reasons.push("the mandatory disclaimers are not present");
  }
  if (m.methodology === undefined) reasons.push("methodology reference is missing");

  const snapshot = m.snapshot ?? null;
  if (snapshot === null) {
    if (!m.unavailableReason) reasons.push("no snapshot and no reason given for its absence");
    if (!m.publicReason) reasons.push("no snapshot and no public wording for its absence");
    if (m.history && m.history.points.length > 0) {
      reasons.push("history is present without a snapshot");
    }
  } else {
    if (m.coverage === undefined) reasons.push("a snapshot was served with no coverage to interpret it by");
    const total = snapshot.aggregate?.total ?? null;
    if (total !== null) {
      if (total.quantitativeObservations <= 0) {
        reasons.push("a total was served that no quantitative observation contributed to");
      }
      if (total.upper < total.lower) reasons.push("total upper bound is below its lower bound");
      if (total.exact && total.lower !== total.upper) {
        reasons.push("a total marked exact carries unequal bounds");
      }
      // A draft methodology publishes nothing. The database enforces this for
      // index publications; this dataset has no publication table, so the
      // contract check is the enforcement point.
      if (m.methodology?.status === "draft") {
        reasons.push("a quantitative total was served under a draft methodology version");
      }
    }
  }

  // The specific zero this dataset must never serve.
  for (const point of m.history?.points ?? []) {
    if (point.lower === 0 && point.upper === 0 && point.capacitySources === 0) {
      reasons.push(`history point ${point.date} reports zero capacity from zero sources`);
    }
  }

  return reasons;
}
