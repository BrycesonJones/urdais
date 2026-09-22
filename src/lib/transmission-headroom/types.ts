/**
 * Transmission Headroom vocabularies.
 *
 * These mirror the reference tables rather than duplicating their meaning. The database is the
 * authority on what a state means; this file exists so the TypeScript that builds a row cannot
 * invent a state the database would reject.
 */

export const TRANSMISSION_SOURCE_KEYS = ["nyiso", "ercot"] as const;
export type TransmissionSourceKey = (typeof TRANSMISSION_SOURCE_KEYS)[number];

export const ENTITY_KINDS = ["interface", "element"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const CONTINGENCY_KINDS = ["base_case", "post_contingency", "not_applicable"] as const;
export type ContingencyKind = (typeof CONTINGENCY_KINDS)[number];

/** Whether a published limit may produce a margin. Only `real` and `zero` may. */
export const LIMIT_STATES = ["real", "zero", "sentinel", "implausible"] as const;
export type LimitState = (typeof LIMIT_STATES)[number];

/** Exactly one of these carries a number. That is what keeps an absence from becoming a zero. */
export const MARGIN_STATES = [
  "ok", "unmonitored_direction", "zero_flow_direction_undetermined", "implausible_limit",
] as const;
export type MarginState = (typeof MARGIN_STATES)[number];

export const LIMIT_DIRECTIONS = ["positive", "negative", "undirected"] as const;
export type LimitDirection = (typeof LIMIT_DIRECTIONS)[number];

export const FLOW_DIRECTIONS = ["positive", "negative", "zero", "unspecified"] as const;
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

export const SELECTED_DIRECTIONS = ["positive", "negative", "undirected", "undetermined"] as const;
export type SelectedDirection = (typeof SELECTED_DIRECTIONS)[number];

export const DEFERRAL_REASONS = [
  "sentinel_limit", "zero_flow_direction_undetermined", "unmonitored_direction",
  "implausible_limit", "malformed_numeric", "missing_required_field", "identity_collision",
] as const;
export type DeferralReason = (typeof DEFERRAL_REASONS)[number];

/**
 * How much a parsed timestamp can be trusted.
 *
 * NYISO prints `MM/DD/YYYY HH:MM` with no zone and no offset. Calling that UTC would be a silent
 * lie, so the parse records what it assumed instead of pretending the question did not arise.
 */
export const TIMESTAMP_ZONE_STATUSES = ["source_stated", "assumed_market_local", "ambiguous"] as const;
export type TimestampZoneStatus = (typeof TIMESTAMP_ZONE_STATUSES)[number];

/**
 * NYISO's code for "this direction is not monitored".
 *
 * Exact magnitude, never a threshold. The largest genuine limit anywhere in the NYISO archive is
 * 9899 MW — on `SCH - HQ_IMPORT_EXPORT`, 4,074 times — so a rule of `abs(limit) >= 9000` would
 * erase real observations. The database enforces the same equality.
 */
export const NYISO_SENTINEL_MW = 9999;

/**
 * The largest MW a limit may plausibly be before it is treated as a disabled monitor.
 *
 * ERCOT has no documented sentinel. It leaves a constraint monitored with its limit set absurdly
 * high — 85,999.1 and 84,999.1 were both observed on `EASTEX` with a zero shadow price — and taking
 * those at face value yields 83,449 MW of "headroom". There is no magic value to match, so this is
 * a bound rather than an equality, and it is deliberately far above any real ERCOT limit observed
 * (the largest was 3,263 MW) so that tightening it later is a methodology decision rather than a
 * silent reclassification of real data.
 */
export const IMPLAUSIBLE_LIMIT_MW = 50_000;

export const EXTRACTION_VERSION = "urdais-transmission-headroom-v1" as const;
