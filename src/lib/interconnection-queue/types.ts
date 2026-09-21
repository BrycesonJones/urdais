/** The canonical interconnection queue vocabulary, mirrored from the reference tables. */

export const LIFECYCLE_STAGES = [
  "requested", "study", "agreement_pending", "agreement_executed",
  "under_construction", "suspended", "operational", "withdrawn", "unknown",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/**
 * A request in a terminal stage has left the queue. Everything else, including `unknown`, counts
 * toward the active stock — an unmapped status must never silently remove a request from it.
 */
export const TERMINAL_STAGES: readonly LifecycleStage[] = ["operational", "withdrawn"];

export function isTerminal(stage: LifecycleStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

export const REQUEST_CLASSES = [
  "generation", "storage", "mixed", "load", "transmission", "unknown",
] as const;
export type RequestClass = (typeof REQUEST_CLASSES)[number];

export const QUANTITY_KINDS = [
  "maximum_facility_output", "energy_service_mw", "capacity_service_mw", "in_service_mw",
  "net_mw_to_grid", "summer_mw", "winter_mw", "component_mw", "other_mw",
] as const;
export type QuantityKind = (typeof QUANTITY_KINDS)[number];

/** Component quantities describe one part of a request and are never summed into a project total. */
export const COMPONENT_QUANTITY_KIND: QuantityKind = "component_mw";

export const TECHNOLOGIES = [
  "solar", "wind", "battery_storage", "natural_gas", "nuclear", "hydro", "geothermal",
  "biomass", "coal", "other_generation", "hybrid", "transmission", "load", "unknown",
] as const;
export type Technology = (typeof TECHNOLOGIES)[number];

export const QUANTITY_UNITS = ["MW", "MVA", "MWh"] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const DEFERRAL_KINDS = [
  "unmapped_status", "unmapped_technology", "unmapped_quantity",
  "unknown_unit", "unparseable_value", "unsupported_row",
] as const;
export type DeferralKind = (typeof DEFERRAL_KINDS)[number];

export type CurrentnessStatus = "current" | "stale" | "unavailable";
