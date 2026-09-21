/**
 * PD-4 grid capacity.
 *
 * A separate domain from PD-2 operational load and PD-3 planning demand, and — despite the
 * name — from `pipeline.capacity_observations`, which is rentable GPU supply. Nothing in this
 * module is assignable to anything in those three.
 *
 * The distinction the types exist to keep is between four quantities markets publish side by
 * side: what a system can supply, what it is obliged to hold, what the network permits, and what
 * Urdais concluded. `quantityKind` is mandatory everywhere for that reason.
 */

export const CAPACITY_QUANTITY_KINDS = [
  "capability", "requirement", "constraint", "resource_quantity", "derived_quantity", "diagnostic_only",
] as const;
export type CapacityQuantityKind = (typeof CAPACITY_QUANTITY_KINDS)[number];

/** Quantities a publisher stated. The rest is an Urdais conclusion. */
export const SOURCE_PUBLISHED_QUANTITY_KINDS = [
  "capability", "requirement", "constraint", "resource_quantity", "diagnostic_only",
] as const;

export const CAPACITY_COMPONENT_KINDS = [
  "accredited_resource_capacity", "procured_capacity", "installed_capacity",
  "import_capability", "export_capability", "transfer_capability",
  "reserve_requirement", "net_reserve_requirement", "local_reliability_requirement",
  "local_sourcing_requirement", "transmission_security_requirement", "tie_benefit",
  "capacity_transfer_requirement",
  "demand_response", "storage_capability", "firm_capacity", "other",
] as const;
export type CapacityComponentKind = (typeof CAPACITY_COMPONENT_KINDS)[number];

/** The denomination a capacity figure is in. Two bases are not comparable. */
export const CAPACITY_BASES = ["ucap", "icap", "nqc", "accredited", "nameplate", "unspecified"] as const;
export type CapacityBasis = (typeof CAPACITY_BASES)[number];

/**
 * The period a value is about. Markets transact in delivery and capability years that are not
 * calendar years and do not align with each other, so the basis travels with every value.
 */
export const CAPACITY_PERIOD_BASES = [
  "calendar", "delivery_year", "capability_year", "capacity_commitment_period", "planning_year", "seasonal",
] as const;
export type CapacityPeriodBasis = (typeof CAPACITY_PERIOD_BASES)[number];

export type CapacitySeason = "winter" | "spring" | "summer" | "fall";
/**
 * MW and GW are amounts of power. `percent` is for a requirement its publisher states as a
 * proportion of forecast peak — a reserve margin, a locational capacity requirement — which is
 * kept as the rate rather than multiplied by a peak Urdais chose.
 */
export type CapacityUnit = "MW" | "GW" | "percent";
export type CapacityQualityStatus = "accepted" | "provisional" | "suspect";

export const GRID_SUBAREA_KINDS = [
  "lda", "lrz", "locality", "local_capacity_area", "capacity_zone", "load_zone", "other",
] as const;
export type GridSubareaKind = (typeof GRID_SUBAREA_KINDS)[number];

export const GRID_INTERFACE_KINDS = ["import", "export", "internal_transfer", "external_tie", "other"] as const;
export type GridInterfaceKind = (typeof GRID_INTERFACE_KINDS)[number];

export const GRID_CONSTRAINT_KINDS = [
  "cetl", "cil", "cel", "mic", "mcl", "tsl", "import_limit", "export_limit", "other",
] as const;
export type GridConstraintKind = (typeof GRID_CONSTRAINT_KINDS)[number];

/** The period identity two values must share before they may be combined at all. */
export type CapacityPeriod = {
  periodBasis: CapacityPeriodBasis;
  targetYear: number;
  targetSeason: CapacitySeason | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type GridCapacityVintage = {
  id: string;
  marketSlug: string;
  marketName: string;
  gridAreaId: string;
  sourceInterfaceSlug: string;
  nativeVintageKey: string;
  reportTitle: string;
  releaseKind: string;
  publishedAt: string;
  retrievedAt: string;
  sourceMethodologyName: string | null;
  sourceMethodologyVersion: string | null;
  rightsClassification: string;
  publicationState: "internal_only" | "publication_candidate" | "published" | "withdrawn";
  qualityStatus: CapacityQualityStatus;
  supersededById: string | null;
};

/** A quantity exactly as a publisher stated it. Never an Urdais conclusion. */
export type GridCapacityComponent = {
  id: string;
  vintageId: string;
  scenarioId: string;
  gridAreaId: string;
  /** Present when the value is about a locality rather than the whole balancing authority. */
  gridSubareaId: string | null;
  gridInterfaceId: string | null;
  rawRecordId: string;
  quantityKind: Exclude<CapacityQuantityKind, "derived_quantity" | "constraint">;
  componentKind: CapacityComponentKind;
  /** The publisher's own word for it, so the classification can always be audited. */
  sourceTerm: string;
  period: CapacityPeriod;
  value: number;
  unit: CapacityUnit;
  capacityBasis: CapacityBasis;
  qualityStatus: CapacityQualityStatus;
  supersededById: string | null;
};

/** A network limit. Shared with the future Transmission Headroom section. */
export type GridConstraintValue = {
  id: string;
  vintageId: string;
  scenarioId: string;
  gridAreaId: string;
  gridInterfaceId: string;
  gridSubareaId: string | null;
  rawRecordId: string;
  quantityKind: "constraint";
  constraintKind: GridConstraintKind;
  direction: "import" | "export" | "bidirectional";
  sourceTerm: string;
  period: CapacityPeriod;
  value: number;
  unit: CapacityUnit;
  qualityStatus: CapacityQualityStatus;
  supersededById: string | null;
};

/** What Urdais concluded, with the methodology that produced it. */
export type DeliverableCapacityResult = {
  id: string;
  methodologyVersionId: string;
  methodologyVersion: string;
  methodologyStatus: "draft" | "approved" | "superseded" | "retired";
  gridAreaId: string;
  gridSubareaId: string | null;
  scenarioId: string | null;
  quantityKind: "derived_quantity";
  period: CapacityPeriod;
  value: number;
  unit: CapacityUnit;
  capacityBasis: CapacityBasis;
  calculationStatus: "draft" | "validated" | "failed";
  publicationState: "internal_only" | "publication_candidate" | "published" | "withdrawn";
  supersededById: string | null;
};

export type DeliverableCapacityInput = {
  id: string;
  resultId: string;
  inputKind: "component" | "constraint";
  componentId: string | null;
  constraintId: string | null;
  inputRole: string;
};

/** A derived result together with the exact frozen rows it was computed from. */
export type DeliverableCapacityResultWithInputs = {
  result: DeliverableCapacityResult;
  inputs: DeliverableCapacityInput[];
};
