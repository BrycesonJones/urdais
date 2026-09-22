/**
 * Shared vocabulary for Grid Buildout Velocity ingestion.
 *
 * The codes here mirror the reference tables the migration seeds. They are typed rather than
 * stringly so an adapter cannot invent a lifecycle class or a milestone kind the schema will
 * reject only at insert time.
 */

export type LifecycleState =
  | "proposed" | "planned" | "approved" | "in_development"
  | "under_construction" | "in_service" | "cancelled" | "suspended" | "unknown";

/**
 * How a lifecycle class was decided.
 *
 * `source_list_membership` outranks `native_status_text` and that ordering is the whole point:
 * ERCOT's Transmission Status column is Optional in its own field dictionary and disagrees with
 * sheet membership on 44.7% of completed rows.
 */
export type LifecycleBasis = "source_list_membership" | "native_status_text" | "unmapped";

export type MilestoneKind =
  | "approved"
  | "target_in_service_at_approval"
  | "target_in_service_prior_vintage"
  | "target_in_service_current"
  | "permit_filing_expected"
  | "construction_start_expected"
  | "actual_in_service";

/** Whether a milestone's date may be used in arithmetic. Never conflated with lifecycle. */
export type DateQuality = "reported" | "sentinel_unknown" | "unparseable" | "not_reported";

export type DatePrecision = "day" | "month" | "year" | "none";

export type QuantityKind =
  | "service_level_kv"
  | "circuit_miles_new"
  | "circuit_miles_rebuilt"
  | "autotransformer_capacity_mva"
  | "reactive_capability_mvar";

export type DriverClass =
  | "regional_reliability" | "economic" | "public_policy" | "local_other"
  | "generator_interconnection" | "load_interconnection" | "asset_condition" | "unknown";

/** Only `publisher_field` and `publisher_identifier` may produce a class other than `unknown`. */
export type DriverBasis = "publisher_field" | "publisher_identifier" | "text_signal_only" | "none";

export type RelationshipKind = "associated_with" | "phase_of" | "references_plan_item";

export type DeferralReason =
  | "missing_native_id" | "duplicate_native_id" | "unmapped_lifecycle"
  | "status_contradicts_list" | "unparseable_date" | "sentinel_date"
  | "unparseable_quantity" | "unknown_vintage_column" | "driver_signal_only"
  | "unresolved_relationship";

export const GBV_SOURCE_KEYS = ["ercot", "caiso"] as const;
export type GbvSourceKey = (typeof GBV_SOURCE_KEYS)[number];

/**
 * ERCOT writes year 9999 into the actual in-service column for a project it lists as complete but
 * has not dated. GBV-1 settled what that means: the date is unknown, the lifecycle is not.
 */
export const SENTINEL_YEAR = 9999;

/** Thrown when a source no longer looks the way the adapter was written against. */
export class BuildoutSourceShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildoutSourceShapeError";
  }
}
