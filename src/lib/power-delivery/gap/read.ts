/**
 * The public Power Delivery Gap surface.
 *
 * One market. Ten points. Six markets that produce nothing and say why.
 *
 * The read model carries its own lifecycle rather than letting a caller infer one from whether
 * the series is empty, because empty means four different things here — nothing calculated yet,
 * rights withheld, inputs superseded, no database configured — and a surface that renders them
 * identically is a surface that looks broken when it is working correctly.
 *
 * Nothing is computed here. The gap was subtracted by PostgreSQL when it was calculated and
 * frozen against the two rows it came from; this reads the answer and the provenance around it.
 */

import { currentEligiblePairs } from "@/lib/power-delivery/gap/calculate";
import {
  APPROVED_VERSION, DELIVERY_GAP_METHODOLOGY, EXCLUDED_GAP_MARKETS, GAP_PAIRINGS,
} from "@/lib/power-delivery/gap/eligibility";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

/** The market the approved methodology covers. There is exactly one in version 1.0.0. */
export const GAP_MARKET = "ercot";

/**
 * Where the product stands. Never inferred from the presence of data.
 *
 * `stale` is specific: a gap exists and may be shown, but the rows it froze are no longer the
 * rows the approved pairing would use, which happens the moment a new source release is ingested
 * and the calculation has not been rerun. The values stay, and stop being called current.
 */
export type DeliveryGapLifecycle = "not_initialized" | "blocked" | "stale" | "live";

export type DeliveryGapPoint = {
  targetYear: number;
  season: string;
  demandMw: number;
  capacityMw: number;
  /** Positive means forecast demand exceeds approved planning capacity. Never clipped. */
  gapMw: number;
  unit: string;
  capacityBasis: string;
  demandScenarioLabel: string;
  capacityScenarioLabel: string;
  calculatedAt: string;
  publicationState: string;
};

export type DeliveryGapSource = {
  sourceInterfaceSlug: string;
  sourceName: string;
  vintageKey: string | null;
  publishedAt: string | null;
  attribution: string | null;
};

export type DeliveryGapOtherMarket = {
  marketSlug: string;
  status: string;
  blocker: string;
};

export type DeliveryGapReadModel = {
  marketSlug: string;
  marketName: string;
  lifecycle: DeliveryGapLifecycle;
  /** Why the lifecycle is what it is, in one sentence, always present. */
  reason: string;
  methodology: { slug: string; version: string; documentPath: string };
  /** The most recent calculation behind the series shown. Never a deploy time. */
  calculatedAt: string | null;
  demandSource: DeliveryGapSource | null;
  capacitySource: DeliveryGapSource | null;
  /** The mandatory statement that this is not ERCOT's published reserve margin. */
  disclosure: string;
  attributionNote: string;
  series: DeliveryGapPoint[];
  otherMarkets: DeliveryGapOtherMarket[];
};

export const GAP_DISCLOSURE =
  "This is not ERCOT's published reserve margin. Urdais measures against the full ERCOT Adjusted "
  + "planning forecast peak; ERCOT's reserve margin is calculated against firm peak load, which "
  + "excludes load ERCOT may curtail.";

const ATTRIBUTION_NOTE = "Gap calculated by Urdais.";

const OTHER_MARKETS: DeliveryGapOtherMarket[] = EXCLUDED_GAP_MARKETS.map((market) => ({
  marketSlug: market.marketSlug,
  status: market.status,
  blocker: market.publicBlocker,
}));

function base(lifecycle: DeliveryGapLifecycle, reason: string): DeliveryGapReadModel {
  return {
    marketSlug: GAP_MARKET,
    marketName: "ERCOT",
    lifecycle,
    reason,
    methodology: {
      slug: DELIVERY_GAP_METHODOLOGY,
      version: APPROVED_VERSION,
      documentPath: "docs/methodology/power-delivery-gap.md",
    },
    calculatedAt: null,
    demandSource: null,
    capacitySource: null,
    disclosure: GAP_DISCLOSURE,
    attributionNote: ATTRIBUTION_NOTE,
    series: [],
    otherMarkets: OTHER_MARKETS,
  };
}

/** What the surface serves when no database is configured. Not an outage, and not zero. */
export function unconfiguredDeliveryGapReadModel(): DeliveryGapReadModel {
  return base("not_initialized", "No database is configured for this environment, so no gap has been calculated.");
}

async function sourceOf(
  sql: CapacitySqlExecutor,
  slug: string,
  vintage: { key: string | null; publishedAt: string | null },
  purpose: string,
): Promise<DeliveryGapSource | null> {
  const { rows } = await sql.query(
    `select s.slug, s.name,
            (select sup.attribution_text from reference.source_use_permissions sup
              where sup.source_interface_id = s.id and sup.purpose_code = $2
                and sup.effective_from <= now()
                and (sup.effective_to is null or sup.effective_to > now())
              order by sup.effective_from desc limit 1) as attribution
       from reference.source_interfaces s
      where s.slug = $1`,
    [slug, purpose],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    sourceInterfaceSlug: String(row.slug),
    sourceName: String(row.name),
    vintageKey: vintage.key,
    publishedAt: vintage.publishedAt,
    attribution: row.attribution == null ? null : String(row.attribution),
  };
}

export async function loadDeliveryGapReadModel(sql: CapacitySqlExecutor): Promise<DeliveryGapReadModel> {
  const pairing = GAP_PAIRINGS.find((entry) => entry.marketSlug === GAP_MARKET);
  if (pairing === undefined) {
    return base("blocked", "No pairing is approved for this market under the current methodology version.");
  }

  const { rows } = await sql.query(
    `select g.target_year, g.target_season, g.demand_value::float8 as demand_value,
            g.capacity_value::float8 as capacity_value, g.gap_value::float8 as gap_value,
            g.unit, g.capacity_basis, g.publication_state, g.created_at,
            ds.native_scenario_label as demand_scenario, cs.native_scenario_label as capacity_scenario,
            dv.native_vintage_key as demand_vintage, dv.published_at as demand_published,
            cv.native_vintage_key as capacity_vintage, cv.published_at as capacity_published,
            a.display_name as market_name,
            (select count(*) from pipeline.delivery_gap_result_inputs i
              where i.result_id = g.id
                and (i.planning_point_id is not null or i.capacity_result_id is not null)) as input_count,
            (select i.planning_point_id from pipeline.delivery_gap_result_inputs i
              where i.result_id = g.id and i.input_kind = 'planning_point' limit 1) as planning_point_id,
            (select i.capacity_result_id from pipeline.delivery_gap_result_inputs i
              where i.result_id = g.id and i.input_kind = 'capacity_result' limit 1) as capacity_result_id
       from pipeline.delivery_gap_results g
       join reference.grid_areas a on a.id = g.grid_area_id
       join reference.methodology_versions mv on mv.id = g.methodology_version_id
       join reference.methodologies m on m.id = mv.methodology_id
       join pipeline.planning_forecast_scenarios ds on ds.id = g.demand_scenario_id
       join pipeline.planning_forecast_vintages dv on dv.id = ds.vintage_id
       join pipeline.grid_capacity_scenarios cs on cs.id = g.capacity_scenario_id
       join pipeline.grid_capacity_vintages cv on cv.id = cs.vintage_id
      where a.slug = $1 and g.superseded_by_id is null
        and m.slug = $2 and mv.version = $3 and mv.status = 'approved'
      -- Deterministic: year, then summer before winter, as a reader reads a forecast.
      order by g.target_year, case g.target_season when 'summer' then 0 else 1 end`,
    [GAP_MARKET, DELIVERY_GAP_METHODOLOGY, APPROVED_VERSION],
  );

  if (rows.length === 0) {
    return base("not_initialized", "No delivery gap has been calculated yet for this market.");
  }

  const marketName = String(rows[0]!.market_name);
  const publishable = rows.filter((row) => String(row.publication_state) === "publication_candidate"
    || String(row.publication_state) === "published");

  const demand = await sourceOf(sql, pairing.demandSourceInterfaceSlug, {
    key: rows[0]!.demand_vintage == null ? null : String(rows[0]!.demand_vintage),
    publishedAt: rows[0]!.demand_published == null ? null : new Date(String(rows[0]!.demand_published)).toISOString(),
  }, "public_derived_delivery_gap_display");
  const capacity = await sourceOf(sql, pairing.capacitySourceInterfaceSlug, {
    key: rows[0]!.capacity_vintage == null ? null : String(rows[0]!.capacity_vintage),
    publishedAt: rows[0]!.capacity_published == null ? null : new Date(String(rows[0]!.capacity_published)).toISOString(),
  }, "public_derived_delivery_gap_display");

  const calculatedAt = rows
    .map((row) => new Date(String(row.created_at)).toISOString())
    .sort()
    .at(-1) ?? null;

  const model: DeliveryGapReadModel = {
    ...base("live", ""),
    marketName,
    calculatedAt,
    demandSource: demand,
    capacitySource: capacity,
    series: publishable.map((row) => ({
      targetYear: Number(row.target_year),
      season: String(row.target_season),
      demandMw: Number(row.demand_value),
      capacityMw: Number(row.capacity_value),
      gapMw: Number(row.gap_value),
      unit: String(row.unit),
      capacityBasis: String(row.capacity_basis),
      demandScenarioLabel: String(row.demand_scenario),
      capacityScenarioLabel: String(row.capacity_scenario),
      calculatedAt: new Date(String(row.created_at)).toISOString(),
      publicationState: String(row.publication_state),
    })),
  };

  if (publishable.length === 0) {
    return {
      ...model,
      lifecycle: "blocked",
      reason: "A gap has been calculated, and the rights determination on one of its sources withholds public display.",
      series: [],
    };
  }

  // The currentness gate: are the rows these gaps froze still the rows the pairing would use?
  const current = await currentEligiblePairs(sql, GAP_MARKET);
  const currentKeys = new Set(current.map((pair) => `${pair.planningPointId}|${pair.capacityResultId}`));
  const frozenKeys = new Set(rows.map((row) => `${String(row.planning_point_id)}|${String(row.capacity_result_id)}`));
  const stale = current.length !== frozenKeys.size
    || [...frozenKeys].some((key) => !currentKeys.has(key));

  if (stale) {
    return {
      ...model,
      lifecycle: "stale",
      reason:
        "A newer source release has been ingested since this gap was calculated, so these values are "
        + "retained history rather than the current gap. Rerunning the calculation refreshes them.",
    };
  }

  return {
    ...model,
    reason: `Calculated from the current ERCOT forecast and capacity report under methodology ${APPROVED_VERSION}.`,
  };
}

/**
 * Whether a response may be served, checked against the shape a reader depends on rather than
 * against a schema nobody reads. A surface that quietly serves a number with no provenance is
 * worse than one that returns an error.
 */
export function validatePublicDeliveryGap(value: unknown): string[] {
  const reasons: string[] = [];
  const model = value as Partial<DeliveryGapReadModel> | null;
  if (model === null || typeof model !== "object") return ["response is not an object"];

  if (model.marketSlug !== GAP_MARKET) reasons.push(`market is ${String(model.marketSlug)}, not ${GAP_MARKET}`);
  if (model.methodology?.version !== APPROVED_VERSION) reasons.push("methodology version is missing or not the approved one");
  if (typeof model.disclosure !== "string" || model.disclosure.length < 40) reasons.push("the ERCOT disclosure is missing");
  if (typeof model.attributionNote !== "string" || model.attributionNote.length === 0) reasons.push("the attribution note is missing");
  if (typeof model.reason !== "string" || model.reason.length === 0) reasons.push("the lifecycle has no reason");
  if (!Array.isArray(model.otherMarkets) || model.otherMarkets.length !== EXCLUDED_GAP_MARKETS.length) {
    reasons.push("the ineligible markets are not all accounted for");
  }
  if (!Array.isArray(model.series)) return [...reasons, "series is not an array"];

  const lifecycle = model.lifecycle;
  if (lifecycle === "live" || lifecycle === "stale") {
    if (model.series.length === 0) reasons.push(`lifecycle is ${lifecycle} with an empty series`);
    if (model.demandSource === null || model.capacitySource === null) {
      reasons.push("a served series must name both of its sources");
    }
    if (model.calculatedAt === null) reasons.push("a served series must say when it was calculated");
  } else if (model.series.length > 0) {
    reasons.push(`lifecycle is ${String(lifecycle)} with a non-empty series`);
  }

  for (const point of model.series) {
    if (!Number.isFinite(point.gapMw)) reasons.push(`a point for ${point.targetYear} has no finite gap`);
    // The subtraction must still hold in what is served: a surface that rounds one side and not
    // the other would quietly publish a gap that is not the difference of its own numbers.
    if (Math.abs(point.demandMw - point.capacityMw - point.gapMw) > 1e-6) {
      reasons.push(`the gap for ${point.season} ${point.targetYear} is not its own demand minus capacity`);
    }
    if (point.unit !== "MW" && point.unit !== "GW") reasons.push(`a point for ${point.targetYear} is not in MW or GW`);
  }
  return reasons;
}
