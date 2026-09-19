/**
 * Domain types for Available Compute Capacity: observed market supply.
 *
 * This is a dataset, not an index, and it is a sibling of the UCPI price
 * pipeline rather than a layer on top of it:
 *
 *   source_retrievals -> raw_offers -+-> normalized_observations  (what it costs)
 *                                    \-> capacity_observations    (what is there)
 *
 * The separation is the point. A price and an availability are different
 * statements about different things, and the one failure this module exists to
 * make impossible is a price feed quietly becoming a supply figure. They are
 * different types here, different tables in the schema, and there is no
 * function anywhere that turns one into the other.
 *
 * Nothing here touches a database or a network.
 */

/**
 * The measurement hierarchy. A source that states a number and a source that
 * states "available" have not told us the same thing, and this union keeps
 * them from being stored as though they had.
 */
export type CapacityMeasurementType =
  /** Tier 1: the source stated a count. */
  | "exact_quantity"
  /** Tier 2: the source stated bounds. */
  | "quantity_range"
  /** Tier 3: the source stated availability with no count. Never a number. */
  | "availability_state"
  /** Tier 4: no usable capacity signal. Never a zero. */
  | "unknown";

/** What a quantity counts. Accelerators, nodes and instances are not addable to one another. */
export type CapacityQuantityUnit = "accelerator" | "node" | "instance";

/** The family availability vocabulary, shared with UCPI. */
export type CapacityAvailabilityState =
  | "available"
  | "limited"
  | "waitlisted"
  | "sold_out"
  | "quote_required"
  | "unknown";

/** Tier number, for presentation and for capability comparison. */
export type CapacityTier = 1 | 2 | 3 | 4;

export const TIER_BY_MEASUREMENT: Record<CapacityMeasurementType, CapacityTier> = {
  exact_quantity: 1,
  quantity_range: 2,
  availability_state: 3,
  unknown: 4,
};

/**
 * One observation of available supply.
 *
 * The union is discriminated on `measurement` so that a Tier 3 observation has
 * no quantity field to read — not a null one, none — and code that wants a
 * number has to narrow first. A null would be forgettable; an absent property
 * is a type error.
 */
export type CapacityMeasurement =
  | {
      kind: "exact_quantity";
      /** Zero is a real observation: the source was asked and said none. */
      quantity: number;
      unit: CapacityQuantityUnit;
      /** The categorical reading, where the source also gave one. */
      state: CapacityAvailabilityState | null;
    }
  | {
      kind: "quantity_range";
      min: number;
      max: number;
      unit: CapacityQuantityUnit;
      state: CapacityAvailabilityState | null;
    }
  | {
      kind: "availability_state";
      /** Never "unknown": that is Tier 4, a different thing. */
      state: Exclude<CapacityAvailabilityState, "unknown">;
    }
  | {
      kind: "unknown";
    };

/** Hardware identity, at the grade the evidence supports. */
export type CapacityHardware = {
  /** The canonical bucket, e.g. "H100-SXM". Null where identity is unresolved. */
  normalizedGpuType: string | null;
  gpuVendor: string | null;
  gpuModel: string | null;
  formFactor: string | null;
  gpuMemoryGb: number | null;
  identityGrade: "A" | "B" | "C" | "insufficient" | null;
  /** Accelerators per counted unit, where evidenced. The only route from nodes to accelerators. */
  gpusPerUnit: number | null;
};

/** Lineage: where the observation came from and under what rules it was read. */
export type CapacityProvenance = {
  rawOfferId: string;
  retrievalId: string;
  sourceInterfaceSlug: string;
  methodologyVersion: string;
  /** Parser/collector version, so a normalization change is attributable. */
  collectorIdentity: string;
  /** The source's own words, preserved so the normalization can be rechecked. */
  sourceNativeValue: string | null;
  /** Which field they came from. */
  sourceNativeField: string | null;
  sourceUrl: string | null;
};

/** One row of the dataset. */
export type CapacityObservation = {
  id: string;
  provenance: CapacityProvenance;

  /** Canonical identity, reused from the market-entity registry. No second identity system. */
  sellerEntityId: string;
  operatorEntityId: string | null;
  marketplaceEntityId: string | null;
  /** Operator where determinable, seller otherwise. The deduplication key. */
  capacitySourceEntityId: string;

  canonicalRegionCode: string | null;
  sourceNativeRegion: string | null;

  hardware: CapacityHardware;
  serviceTier: Record<string, unknown> | null;

  measurement: CapacityMeasurement;
  /** 1 (strongest) to 6. Required for any quantity: a number needs evidence behind it. */
  availabilityEvidenceGrade: 1 | 2 | 3 | 4 | 5 | 6 | null;

  /** When the source was read. */
  observedAt: string;
  sourceEffectiveAt: string | null;
  /** When the availability itself was true, where the source says. No source found says. */
  availabilityObservedAt: string | null;
  /** When the retrieval completed. The basis of the freshness policy, since sources give no timestamp. */
  retrievedAt: string;

  supersededById: string | null;
};

/** What a source interface can actually tell us, separate from whether we may ask. */
export type CapacitySignalCapability = {
  sourceInterfaceSlug: string;
  maxTier: CapacityTier;
  supportsExactQuantity: boolean;
  supportsQuantityRange: boolean;
  supportsAvailabilityState: boolean;
  supportsRegion: boolean;
  supportsConfiguration: boolean;
  quantityUnit: CapacityQuantityUnit | null;
  freshnessHorizonSeconds: number | null;
  assessment: string;
  /** Permission is a separate axis and both are required. */
  termsPermitted: boolean;
  productionApproved: boolean;
  /**
   * The registry's own words, kept because "refused in writing" and "under
   * review" are not the same barrier and must not be reported as one.
   */
  termsReviewState: string;
  productionAccessState: string;
};

/**
 * A capable source is not an eligible one. The compute market's best
 * availability interface is one Urdais has been refused in writing, and
 * capability does not cure a refusal.
 */
export function isEligibleSource(capability: CapacitySignalCapability): boolean {
  return capability.termsPermitted && capability.productionApproved && capability.maxTier <= 3;
}

export const CAPACITY_METHODOLOGY = {
  slug: "available-compute-capacity",
  name: "Urdais Available Compute Capacity",
  version: "0.1.0-draft",
  status: "draft",
  documentPath: "/docs/methodology/available-compute-capacity",
} as const;

/** Mandatory in any presentation of this dataset. Both sentences, not one. */
export const CAPACITY_DISCLAIMERS = [
  "Published or advertised compute pricing does not itself constitute evidence of available compute capacity.",
  "Available Compute Capacity measures observable market supply, not total installed fleet capacity and not provider utilization.",
] as const;
