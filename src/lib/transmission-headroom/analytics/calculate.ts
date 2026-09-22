/**
 * The Transmission Headroom analytics engine.
 *
 * One orchestration layer, two market calculators that share nothing but their shape. That is
 * deliberate: NYISO measures a directional margin on a census of published interfaces, ERCOT
 * measures an oriented margin on whichever constraints dispatch was tracking. Forcing them through
 * a common formula abstraction would mean inventing a shared semantics neither source has.
 *
 * Every eligibility rule comes from `methodology.ts`. Nothing in this file decides what may be
 * published; it decides only how to compute what the methodology already approved.
 *
 * Two distributions exist here and they are not the same statistic. A point-in-time distribution
 * takes one latest observation per entity, so an entity that publishes every five minutes cannot
 * outvote one that publishes hourly. An observation-weighted count runs over retained history.
 * Mixing them would produce a "market median" dominated by whichever entity is noisiest.
 */

import {
  APPROVED_MARKETS, ERCOT_IMPLAUSIBLE_LIMIT_MW, NYISO_SENTINEL_MW,
  type ApprovedMarket,
} from "@/lib/transmission-headroom/analytics/methodology";

export type ResultStatus =
  | "live" | "not_available" | "insufficient_sample"
  | "source_stale" | "rights_blocked" | "methodology_deferred";

export type MetricResult = {
  metricCode: string;
  marketSlug: string;
  entityId: string | null;
  entityLabel: string | null;
  contingencyKind: string | null;
  observedAt: string | null;
  status: ResultStatus;
  value: number | null;
  unit: string;
  sampleSize: number;
  coverage: Record<string, unknown>;
  publicationState: "publishable" | "internal_only";
  rightsReason: string | null;
};

/** One entity's latest eligible margin, as the point-in-time population sees it. */
export type LatestMargin = {
  entityId: string;
  entityLabel: string;
  contingencyKind: string;
  observedAt: string;
  state: string;
  headroomMw: number | null;
  flowMw: number;
  limitMw: number | null;
  limitState: string | null;
  shadowPrice: number | null;
};

export type MarketInput = {
  market: ApprovedMarket;
  /** One row per canonical entity: its most recent margin. */
  latest: LatestMargin[];
  /** Counts over retained history, not a point in time. */
  history: { negativeMarginObservations: number; totalObservations: number };
  sourceStatus: "current" | "stale" | "unavailable";
  /** From the registry, so a deferral reason is never retyped here. */
  deferredMetrics: { code: string; reason: string }[];
  floors: Record<string, number | null>;
};

export type MetricDefinitionLite = {
  code: string; unit: string; scope: "entity" | "market"; minimumEntities: number | null;
  isLive: boolean; deferredReason: string | null;
};

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/**
 * Linear-interpolated percentile over a sorted population.
 *
 * Matches PostgreSQL's `percentile_cont`, so a spot check in SQL and the engine agree.
 */
export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) throw new Error("percentile of an empty population");
  if (sorted.length === 1) return sorted[0]!;
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

/** NYISO utilization: magnitudes, but only after the direction has already been chosen. */
export function nyisoUtilization(flowMw: number, selectedLimitMw: number): number | null {
  const denominator = Math.abs(selectedLimitMw);
  if (denominator === 0) return null;
  if (denominator === NYISO_SENTINEL_MW) return null;
  return round4((Math.abs(flowMw) / denominator) * 100);
}

/** ERCOT utilization: the flow is already oriented, so no magnitudes are taken. */
export function ercotUtilization(valueMw: number, limitMw: number): number | null {
  if (limitMw <= 0) return null;
  if (limitMw > ERCOT_IMPLAUSIBLE_LIMIT_MW) return null;
  return round4((valueMw / limitMw) * 100);
}

function baseResult(
  metricCode: string, marketSlug: string, unit: string,
): MetricResult {
  return {
    metricCode, marketSlug, entityId: null, entityLabel: null, contingencyKind: null,
    observedAt: null, status: "not_available", value: null, unit, sampleSize: 0,
    coverage: {}, publicationState: "publishable", rightsReason: null,
  };
}

/**
 * A market-scoped distribution, or the reason there isn't one.
 *
 * A stale source blocks a current value outright — an operating margin from two days ago is not
 * "current" in any sense a reader would accept — and a population under its floor yields
 * `insufficient_sample` with the count, never a number.
 */
function distribution(
  metricCode: string, marketSlug: string, unit: string, population: number[],
  fraction: number, floor: number | null, sourceStatus: MarketInput["sourceStatus"],
  coverage: Record<string, unknown>,
): MetricResult {
  const result = baseResult(metricCode, marketSlug, unit);
  result.sampleSize = population.length;
  result.coverage = { ...coverage, weighting: "entity_point_in_time" };

  if (sourceStatus !== "current") {
    result.status = "source_stale";
    result.coverage = { ...result.coverage, sourceStatus };
    return result;
  }
  if (population.length === 0) {
    result.status = "not_available";
    return result;
  }
  if (floor !== null && population.length < floor) {
    result.status = "insufficient_sample";
    result.coverage = { ...result.coverage, minimumEntities: floor };
    return result;
  }
  const sorted = [...population].sort((a, b) => a - b);
  result.status = "live";
  result.value = round4(percentile(sorted, fraction));
  return result;
}

function counted(
  metricCode: string, marketSlug: string, unit: string, count: number,
  sampleSize: number, coverage: Record<string, unknown>,
): MetricResult {
  const result = baseResult(metricCode, marketSlug, unit);
  result.status = "live";
  result.value = count;
  result.sampleSize = sampleSize;
  result.coverage = coverage;
  return result;
}

/**
 * NYISO: interface headroom.
 *
 * Entity values come straight from the canonical margin, which already applied the direction rule.
 * Everything with a status rather than a value is emitted as that status, so an unmonitored
 * direction appears as an unmonitored direction rather than vanishing from the response.
 */
export function calculateNyiso(input: MarketInput): MetricResult[] {
  const results: MetricResult[] = [];
  const market = APPROVED_MARKETS.nyiso.marketSlug;

  for (const entry of input.latest) {
    const headroom = baseResult("interface_headroom_mw", market, "MW");
    headroom.entityId = entry.entityId;
    headroom.entityLabel = entry.entityLabel;
    headroom.observedAt = entry.observedAt;
    headroom.sampleSize = 1;
    headroom.coverage = { marginState: entry.state, limitState: entry.limitState };

    const utilization = { ...headroom, metricCode: "interface_utilization_pct", unit: "percent" };

    if (input.sourceStatus !== "current") {
      headroom.status = "source_stale";
      utilization.status = "source_stale";
    } else if (entry.state === "ok" && entry.headroomMw !== null) {
      headroom.status = "live";
      headroom.value = round4(entry.headroomMw);
      const pct = entry.limitMw === null ? null : nyisoUtilization(entry.flowMw, entry.limitMw);
      if (pct === null) {
        utilization.status = "not_available";
        utilization.coverage = { ...utilization.coverage, reason: "no usable denominator" };
      } else {
        utilization.status = "live";
        utilization.value = pct;
      }
    } else {
      // The canonical state is the reason, carried through verbatim rather than flattened.
      headroom.status = "not_available";
      headroom.coverage = { ...headroom.coverage, reason: entry.state };
      utilization.status = "not_available";
      utilization.coverage = { ...utilization.coverage, reason: entry.state };
    }
    results.push(headroom, utilization);
  }

  const eligible = input.latest.filter((entry) => entry.state === "ok" && entry.headroomMw !== null);
  const headrooms = eligible.map((entry) => entry.headroomMw!);
  const utilizations = eligible
    .map((entry) => entry.limitMw === null ? null : nyisoUtilization(entry.flowMw, entry.limitMw))
    .filter((value): value is number => value !== null);

  const coverage = {
    entitiesObserved: input.latest.length,
    entitiesEligible: eligible.length,
    entitiesUnmonitored: input.latest.filter((e) => e.state === "unmonitored_direction").length,
    entitiesZeroFlow: input.latest.filter((e) => e.state === "zero_flow_direction_undetermined").length,
    note: "One latest observation per published interface. Population is a census of what NYISO "
      + "publishes in External Limits and Flows, not of every interface in New York.",
  };

  results.push(
    distribution("interface_headroom_median_mw", market, "MW", headrooms, 0.5,
      input.floors.interface_headroom_median_mw ?? null, input.sourceStatus, coverage),
    distribution("interface_headroom_p10_mw", market, "MW", headrooms, 0.1,
      input.floors.interface_headroom_p10_mw ?? null, input.sourceStatus, coverage),
    distribution("interface_headroom_p25_mw", market, "MW", headrooms, 0.25,
      input.floors.interface_headroom_p25_mw ?? null, input.sourceStatus, coverage),
    distribution("interface_utilization_median_pct", market, "percent", utilizations, 0.5,
      input.floors.interface_utilization_median_pct ?? null, input.sourceStatus, coverage),
    distribution("interface_utilization_p90_pct", market, "percent", utilizations, 0.9,
      input.floors.interface_utilization_p90_pct ?? null, input.sourceStatus, coverage),
    counted("interface_negative_headroom_observations", market, "observations",
      input.history.negativeMarginObservations, input.history.totalObservations, {
        weighting: "observation_history",
        note: "Counted over retained history. Negative headroom means observed flow exceeded the "
          + "applicable published limit; it is not called an overload or a violation, because the "
          + "source does not.",
      }),
  );

  return results;
}

/**
 * ERCOT: constraint margin.
 *
 * Binding comes from the source shadow price and never from a margin of zero — the canonical data
 * holds 47 observations that are at their limit and not binding.
 */
export function calculateErcot(input: MarketInput): MetricResult[] {
  const results: MetricResult[] = [];
  const market = APPROVED_MARKETS.ercot.marketSlug;

  for (const entry of input.latest) {
    const margin = baseResult("constraint_margin_mw", market, "MW");
    margin.entityId = entry.entityId;
    margin.entityLabel = entry.entityLabel;
    margin.contingencyKind = entry.contingencyKind;
    margin.observedAt = entry.observedAt;
    margin.sampleSize = 1;
    margin.coverage = {
      marginState: entry.state, limitState: entry.limitState,
      // Recorded, and deliberately not used: CCTStatus is market-power metadata.
      bindingFromShadowPrice: entry.shadowPrice === null ? null : entry.shadowPrice > 0,
    };
    const utilization = { ...margin, metricCode: "constraint_utilization_pct", unit: "percent" };

    if (input.sourceStatus !== "current") {
      margin.status = "source_stale";
      utilization.status = "source_stale";
    } else if (entry.state === "ok" && entry.headroomMw !== null) {
      margin.status = "live";
      margin.value = round4(entry.headroomMw);
      const pct = entry.limitMw === null ? null : ercotUtilization(entry.flowMw, entry.limitMw);
      if (pct === null) {
        utilization.status = "not_available";
        utilization.coverage = { ...utilization.coverage, reason: "no usable denominator" };
      } else {
        utilization.status = "live";
        utilization.value = pct;
      }
    } else {
      margin.status = "not_available";
      margin.coverage = { ...margin.coverage, reason: entry.state };
      utilization.status = "not_available";
      utilization.coverage = { ...utilization.coverage, reason: entry.state };
    }
    results.push(margin, utilization);
  }

  const eligible = input.latest.filter((entry) => entry.state === "ok" && entry.headroomMw !== null);
  const margins = eligible.map((entry) => entry.headroomMw!);
  const utilizations = eligible
    .map((entry) => entry.limitMw === null ? null : ercotUtilization(entry.flowMw, entry.limitMw))
    .filter((value): value is number => value !== null);

  // The split is disclosed on every distribution, because an undisclosed figure spanning both
  // contingency states would be dominated by post-contingency conditions.
  const coverage = {
    entitiesObserved: input.latest.length,
    entitiesEligible: eligible.length,
    baseCaseEntities: eligible.filter((e) => e.contingencyKind === "base_case").length,
    postContingencyEntities: eligible.filter((e) => e.contingencyKind === "post_contingency").length,
    entitiesImplausibleLimit: input.latest.filter((e) => e.state === "implausible_limit").length,
    spansContingencyKinds: true,
    note: "Tracked constraints only: ERCOT publishes a constraint while dispatch is managing it, "
      + "so this is never a view of the ERCOT network. Spans base-case and post-contingency "
      + "constraints, whose counts are given separately.",
  };

  results.push(
    distribution("constraint_margin_median_mw", market, "MW", margins, 0.5,
      input.floors.constraint_margin_median_mw ?? null, input.sourceStatus, coverage),
    distribution("constraint_margin_p10_mw", market, "MW", margins, 0.1,
      input.floors.constraint_margin_p10_mw ?? null, input.sourceStatus, coverage),
    distribution("constraint_margin_p25_mw", market, "MW", margins, 0.25,
      input.floors.constraint_margin_p25_mw ?? null, input.sourceStatus, coverage),
    distribution("constraint_utilization_median_pct", market, "percent", utilizations, 0.5,
      input.floors.constraint_utilization_median_pct ?? null, input.sourceStatus, coverage),
    distribution("constraint_utilization_p90_pct", market, "percent", utilizations, 0.9,
      input.floors.constraint_utilization_p90_pct ?? null, input.sourceStatus, coverage),
    counted("constraint_negative_margin_observations", market, "observations",
      input.history.negativeMarginObservations, input.history.totalObservations,
      { weighting: "observation_history" }),
  );

  // Binding: from ShadowPrice, never from margin === 0.
  const binding = baseResult("binding_tracked_constraints", market, "entities");
  binding.sampleSize = input.latest.length;
  if (input.sourceStatus !== "current") {
    binding.status = "source_stale";
  } else {
    binding.status = "live";
    binding.value = input.latest.filter((e) => e.shadowPrice !== null && e.shadowPrice > 0).length;
    binding.coverage = {
      source: "ShadowPrice > 0",
      note: "Never derived from a margin of zero: the canonical data holds observations at exactly "
        + "their limit with a zero shadow price, which are not binding.",
      zeroMarginNonBinding: input.latest.filter(
        (e) => e.headroomMw === 0 && e.shadowPrice === 0).length,
    };
  }
  results.push(binding);

  return results;
}

/** Metrics the methodology names but does not approve. Named, never silently absent. */
export function deferredResults(
  deferred: { code: string; reason: string; marketSlug: string; unit: string }[],
): MetricResult[] {
  return deferred.map((entry) => {
    const result = baseResult(entry.code, entry.marketSlug, entry.unit);
    result.status = "methodology_deferred";
    result.coverage = { reason: entry.reason };
    return result;
  });
}

/**
 * The whole calculation, per market.
 *
 * There is no cross-market step and no place to add one: the function returns each market's
 * results and never sees both populations at once in a way that could be totalled.
 */
export function calculateAll(inputs: MarketInput[]): MetricResult[] {
  const results: MetricResult[] = [];
  for (const input of inputs) {
    results.push(...(input.market === "nyiso" ? calculateNyiso(input) : calculateErcot(input)));
  }
  return results;
}
