/**
 * The IQ-5 analytics methodology, as rules rather than prose.
 *
 * This module computes nothing. It encodes the decisions the methodology document makes, so that
 * IQ-6 implements them instead of re-deciding them, and so the invariants that protect the
 * product's honesty are enforced by tests rather than by memory.
 *
 * The specification is docs/methodology/interconnection-queue-analytics.md, version 0.1.0-draft.
 * Where the two disagree the document is authoritative and this file is a bug.
 */

import type { LifecycleStage, QuantityKind, RequestClass } from "@/lib/interconnection-queue/types";

export const METHODOLOGY_SLUG = "interconnection-queue-analytics";
export const METHODOLOGY_VERSION = "0.1.0-draft";

// ------------------------------------------------------------------ lifecycle

/**
 * Active means the request has not left the queue.
 *
 * `suspended` is active: PJM publishes 140 suspended requests and suspension is routinely lifted.
 * `agreement_executed` and `under_construction` are active too — an executed agreement is not
 * operation, and neither is building.
 */
export const ACTIVE_STAGES: readonly LifecycleStage[] = [
  "requested", "study", "agreement_pending", "agreement_executed", "under_construction", "suspended",
];

export const TERMINAL_STAGES_FOR_ANALYTICS: readonly LifecycleStage[] = ["operational", "withdrawn"];

/**
 * `unknown` is in no published metric at all.
 *
 * IQ-2 made it non-terminal so a vocabulary gap could not silently shrink a stored queue. For
 * publication the opposite risk applies: counting a request whose state nobody knows would
 * silently inflate one. It is reported as a coverage figure beside a metric, never inside it.
 */
export const EXCLUDED_STAGES: readonly LifecycleStage[] = ["unknown"];

export function isActiveForAnalytics(stage: LifecycleStage): boolean {
  return ACTIVE_STAGES.includes(stage);
}

export function isPublishableStage(stage: LifecycleStage): boolean {
  return !EXCLUDED_STAGES.includes(stage);
}

// ------------------------------------------------------------------ eligibility

/** Subtypes whose requests may enter a new-generation queue metric. */
export const ELIGIBLE_SUBTYPES: readonly string[] = ["new_generation", "not_distinguished"];

/**
 * Capacity-rights activity is never new-generation queue capacity.
 *
 * ISO-NE's 662 capacity-rights requests carry 171,358 MW of summer capability against 50,260 MW
 * on requests that actually propose new plant. Including them overstates New England by 4.4x.
 */
export const EXCLUDED_SUBTYPES: readonly string[] = [
  "capacity_rights", "elective_transmission_upgrade", "transmission_service", "unknown",
];

export function isEligibleSubtype(subtype: string): boolean {
  return ELIGIBLE_SUBTYPES.includes(subtype);
}

/** Generation-family request classes. Load is a different metric family entirely. */
export const GENERATION_CLASSES: readonly RequestClass[] = ["generation", "storage", "mixed"];
export const LOAD_CLASSES: readonly RequestClass[] = ["load"];

export function isGenerationClass(requestClass: RequestClass): boolean {
  return GENERATION_CLASSES.includes(requestClass);
}

/** A load MW is a withdrawal from the grid and may never enter a generation total. */
export function mayEnterGenerationMetric(input: {
  stage: LifecycleStage; subtype: string; requestClass: RequestClass;
}): boolean {
  return isPublishableStage(input.stage)
    && isEligibleSubtype(input.subtype)
    && isGenerationClass(input.requestClass);
}

// ------------------------------------------------------------------ quantities

/** Quantity kinds that describe new capability, and so could enter a generation MW total. */
export const NEW_CAPABILITY_QUANTITY_KINDS: readonly QuantityKind[] = [
  "maximum_facility_output", "net_mw_to_grid", "summer_mw", "winter_mw", "in_service_mw",
];

/**
 * CAISO's component MW is descriptive composition and is never additive.
 *
 * 937 CAISO observations have components summing above the published project figure; one is
 * Solar plus Battery at 4,132.6 MW against a net to grid of 2,000 MW.
 */
export const NON_ADDITIVE_QUANTITY_KINDS: readonly QuantityKind[] = ["component_mw"];

export function mayBeSummedIntoProjectMw(kind: QuantityKind): boolean {
  return !NON_ADDITIVE_QUANTITY_KINDS.includes(kind);
}

/**
 * The MW field each market's own active-MW metric reads, or null where the decision is deferred.
 *
 * PJM is deferred because `MWEnergy` and `MWCapacity` are two different service rights and
 * `MaximumFacilityOutput` is neither; nothing in the source says which a reader means. ERCOT is
 * deferred because its column is a net change for repowering, not a level, and goes negative.
 */
export const MARKET_MW_FIELD: Readonly<Record<string, { field: string; kind: QuantityKind } | null>> = {
  pjm: null,
  ercot: null,
  miso: { field: "summerNetMW", kind: "summer_mw" },
  caiso: { field: "Net MWs to Grid", kind: "net_mw_to_grid" },
  nyiso: { field: "SP (MW)", kind: "summer_mw" },
  "iso-ne": { field: "Summer MW", kind: "summer_mw" },
  spp: { field: "MAX Summer MW", kind: "summer_mw" },
};

/** There is no quantity kind published by all seven markets, so there is no cross-market total. */
export const CROSS_MARKET_MW_TOTAL_DEFENSIBLE = false;

// ------------------------------------------------------------------ operational evidence

/**
 * The only route to counting a request as operated.
 *
 * Every rejected alternative below is a real field that looks like evidence and is not:
 * a projected COD says a project is late; MISO's doneDate dates the end of the interconnection
 * *request process* and 201 of 269 rows carrying one are not in service; NYISO's "In Service for
 * Test" is a plant on test.
 */
export function countsAsOperated(input: {
  stage: LifecycleStage;
  actualInServiceOn: string | null;
  proposedInServiceOn?: string | null;
  misoDoneDate?: string | null;
  nativeStatusDescription?: string | null;
}): boolean {
  if (input.stage !== "operational") return false;
  if (input.nativeStatusDescription !== undefined && input.nativeStatusDescription !== null
      && /in[- ]service for test|partial(?:ly)?[- ]in[- ]service/i.test(input.nativeStatusDescription)) {
    return false;
  }
  return true;
}

/** Time to operation needs both explicit dates. No substitution is permitted. */
export function timeToOperationDays(input: {
  requestedOn: string | null; actualInServiceOn: string | null;
}): number | null {
  if (input.requestedOn === null || input.actualInServiceOn === null) return null;
  const start = Date.parse(`${input.requestedOn}T00:00:00Z`);
  const end = Date.parse(`${input.actualInServiceOn}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000);
}

// ------------------------------------------------------------------ exits

/**
 * Absence from a later snapshot is only absence.
 *
 * ERCOT is the one market where disappearance is observable, and it publishes neither
 * withdrawals nor operations. A request that stops appearing has stopped appearing.
 */
export function disappearanceCountsAsExit(): false {
  return false;
}

// ------------------------------------------------------------------ cohorts

export const MATURITY_UNRESOLVED_SHARE_MAX = 0.15;

/**
 * A cohort is publishable only when both conditions hold.
 *
 * Each binds in a different place: PJM's 2017 cohort is cut by unresolved share at 15.2%, and
 * CAISO's 2016 cohort by an observation window of 10.2 years against a p90 of 10.43. Either
 * alone would admit a cohort the other correctly rejects — PJM's 2021 cohort is 0% operational
 * with 1,328 entrants, and CAISO's 2022 cohort is fully resolved on a sample of four.
 */
export function isCohortMature(input: {
  observationWindowYears: number;
  marketP90TimeToOperationYears: number | null;
  unresolvedShare: number;
}): boolean {
  if (input.marketP90TimeToOperationYears === null) return false;
  return input.observationWindowYears >= input.marketP90TimeToOperationYears
    && input.unresolvedShare <= MATURITY_UNRESOLVED_SHARE_MAX;
}

export type CompletionRate = {
  cohortEntrants: number;
  operated: number;
  /** Null when the cohort is immature or below the sample floor: never a number in those cases. */
  rate: number | null;
  status: "published" | "immature" | "insufficient_sample";
  unresolvedShare: number;
};

/**
 * Project completion rate, cohort-based and never `operational / currently active`.
 *
 * That ratio moves when withdrawals clear the denominator and says nothing about outcomes.
 */
export function projectCompletionRate(input: {
  cohortEntrants: number; operated: number; unresolved: number;
  observationWindowYears: number; marketP90TimeToOperationYears: number | null;
}): CompletionRate {
  const unresolvedShare = input.cohortEntrants === 0 ? 1 : input.unresolved / input.cohortEntrants;
  const base = { cohortEntrants: input.cohortEntrants, operated: input.operated, unresolvedShare };
  if (input.cohortEntrants < MINIMUM_SAMPLES.completionRate) {
    return { ...base, rate: null, status: "insufficient_sample" };
  }
  if (!isCohortMature({
    observationWindowYears: input.observationWindowYears,
    marketP90TimeToOperationYears: input.marketP90TimeToOperationYears,
    unresolvedShare,
  })) {
    return { ...base, rate: null, status: "immature" };
  }
  return { ...base, rate: input.operated / input.cohortEntrants, status: "published" };
}

/**
 * MW completion is a different metric from project completion and is deferred for every market.
 *
 * It additionally needs a defensible cohort quantity field, and no market has both a mature
 * cohort and an unambiguous MW field.
 */
export const MW_COMPLETION_RATE_DEFERRED = true;

// ------------------------------------------------------------------ samples

export const MINIMUM_SAMPLES = {
  median: 30, p75: 50, p90: 100, completionRate: 100, technologyShare: 30,
} as const;

export type SampleGate = { publishable: boolean; n: number; floor: number };

export function meetsSampleFloor(n: number, statistic: keyof typeof MINIMUM_SAMPLES): SampleGate {
  const floor = MINIMUM_SAMPLES[statistic];
  return { publishable: n >= floor, n, floor };
}

// ------------------------------------------------------------------ entries

export type EntryBasis = "source_reported_application_date" | "snapshot_first_seen";

/**
 * Which entry basis a market uses. These measure different things and are never mixed on one
 * series without a label: ERCOT publishes no request date at all, so its entries are the first
 * vintage in which Urdais observed the request, valid from 2019-01 with 366 requests already
 * present in the opening report excluded as left-censored.
 */
export const MARKET_ENTRY_BASIS: Readonly<Record<string, EntryBasis>> = {
  pjm: "source_reported_application_date",
  miso: "source_reported_application_date",
  caiso: "source_reported_application_date",
  nyiso: "source_reported_application_date",
  "iso-ne": "source_reported_application_date",
  spp: "source_reported_application_date",
  ercot: "snapshot_first_seen",
};

export const ERCOT_FIRST_SEEN_SERIES_BEGINS = "2019-01-01";

// ------------------------------------------------------------------ comparability

export type ComparabilityTier = "A" | "B" | "C";

/** Markets whose queue values may be displayed publicly at all. */
export const PUBLISHABLE_MARKETS: readonly string[] =
  ["pjm", "miso", "caiso", "ercot", "nyiso", "iso-ne"];

/** SPP is computed internally and published nowhere, raw or derived. */
export const PUBLICATION_BLOCKED_MARKETS: readonly string[] = ["spp"];

export function mayPublishMarketMetric(marketSlug: string): boolean {
  return !PUBLICATION_BLOCKED_MARKETS.includes(marketSlug);
}

// ------------------------------------------------------------------ load and AI

/**
 * An AI data-centre classification comes only from the publisher's own end-use code.
 *
 * No inference from project names, company names, location or size. A market that publishes no
 * end-use classification has an *unknown* AI load, not a zero one.
 */
export const AI_LOAD_END_USE = "data_center_ai";
export const MARKETS_PUBLISHING_LOAD_END_USE: readonly string[] = ["nyiso"];

export function aiLoadIsKnown(marketSlug: string): boolean {
  return MARKETS_PUBLISHING_LOAD_END_USE.includes(marketSlug);
}

// ------------------------------------------------------------------ technology mix

/**
 * Technology mix is count-based and multi-label: a project is counted once and tagged with every
 * technology its resources name, so shares sum above 100% and say so. A hybrid is never two
 * projects. MW-based mix is deferred — it needs component attribution that only CAISO publishes
 * and that CAISO's own figures prove non-additive.
 */
export const TECHNOLOGY_MIX_BASIS = "project_count_multi_label" as const;
export const TECHNOLOGY_MIX_BY_MW_DEFERRED = true;
