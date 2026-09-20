/**
 * Server-side reads for planning demand.
 *
 * Two families, and the distinction is the point of the module:
 *
 *   `publishable*`  public reads. Every one of them resolves the vintage through
 *                   `mayPublishPlanningForecast` and returns nothing for a source the policy
 *                   blocks. A new public read that forgets to do this is caught by the test
 *                   that walks this module's exports.
 *
 *   `*Internal`     server-only reads that return blocked and internal-only material, for the
 *                   operator surfaces and the ingestion code that must see everything Urdais
 *                   holds. They are never called from a client component or a public route.
 *
 * Planning forecasts are market-specific. There is no aggregation here -- no seven-market
 * total, no sum of official peaks, no coincidence model -- because the markets' peaks fall in
 * different hours and seasons on different weather bases, and adding them produces a number
 * that describes nothing. This module deliberately does not import the operational aggregator.
 */

import {
  mayPublishPlanningForecast,
  type PlanningPublicationDecision,
} from "@/lib/power-delivery/planning/rights";
import type {
  PlanningForecastPoint,
  PlanningForecastScenario,
  PlanningForecastVintage,
  PlanningRightsState,
  PlanningUsePurpose,
  PublicPlanningUsePurpose,
} from "@/lib/power-delivery/planning/types";

export interface PlanningSqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const DEFAULT_PUBLIC_PURPOSE: PublicPlanningUsePurpose = "public_raw_planning_value_display";

const text = (value: unknown): string | null => (value == null ? null : String(value));
const iso = (value: unknown): string => new Date(String(value)).toISOString();

/**
 * The determination in force now, resolved per source and purpose. A source with no row for the
 * purpose yields null, which the policy reads as "no permission", not as "no objection".
 */
const RIGHTS_JOIN = `left join lateral (
    select sup.rights_classification, sup.disposition, sup.attribution_required, sup.attribution_text,
           sup.conditions, sup.unresolved_issue, sup.terms_document_url, sup.reviewed_by, sup.reviewed_on
      from reference.source_use_permissions sup
     where sup.source_interface_id = v.source_interface_id
       and sup.purpose_code = $1
       and sup.effective_from <= now()
       and (sup.effective_to is null or sup.effective_to > now())
     order by sup.effective_from desc
     limit 1
  ) r on true`;

const VINTAGE_SELECT = `select v.id, v.native_vintage_key, v.native_report_id, v.report_title,
    v.published_at, v.published_at_precision, v.retrieved_at,
    v.source_methodology_name, v.source_methodology_version, v.rights_classification,
    v.publication_state, v.quality_status, v.superseded_by_id, v.superseded_at,
    v.supersession_reason, v.supersession_kind,
    a.id as grid_area_id, a.slug as market_slug, a.display_name as market_name, a.eia_ba_code,
    s.slug as source_slug, s.name as source_name,
    r.rights_classification as rights_in_force, r.disposition, r.attribution_required,
    r.attribution_text, r.conditions, r.unresolved_issue, r.terms_document_url,
    r.reviewed_by, r.reviewed_on
  from pipeline.planning_forecast_vintages v
  join reference.grid_areas a on a.id = v.grid_area_id
  join reference.source_interfaces s on s.id = v.source_interface_id
  ${RIGHTS_JOIN}`;

function rightsState(row: Record<string, unknown>, purpose: PlanningUsePurpose): PlanningRightsState | null {
  if (row.rights_in_force == null) return null;
  return {
    sourceInterfaceSlug: String(row.source_slug),
    sourceName: String(row.source_name),
    purpose,
    rightsClassification: String(row.rights_in_force) as PlanningRightsState["rightsClassification"],
    disposition: String(row.disposition) as PlanningRightsState["disposition"],
    attributionRequired: row.attribution_required === true,
    attributionText: text(row.attribution_text),
    conditions: text(row.conditions),
    unresolvedIssue: text(row.unresolved_issue),
    termsDocumentUrl: text(row.terms_document_url),
    reviewedBy: text(row.reviewed_by),
    reviewedOn: row.reviewed_on == null ? null : String(row.reviewed_on).slice(0, 10),
  };
}

function vintage(row: Record<string, unknown>, purpose: PlanningUsePurpose): PlanningForecastVintage {
  return {
    id: String(row.id),
    marketSlug: String(row.market_slug),
    marketName: String(row.market_name),
    eiaBaCode: String(row.eia_ba_code),
    gridAreaId: String(row.grid_area_id),
    sourceInterfaceSlug: String(row.source_slug),
    sourceName: String(row.source_name),
    nativeVintageKey: String(row.native_vintage_key),
    nativeReportId: text(row.native_report_id),
    reportTitle: String(row.report_title),
    publishedAt: iso(row.published_at),
    publishedAtPrecision: String(row.published_at_precision) as PlanningForecastVintage["publishedAtPrecision"],
    retrievedAt: iso(row.retrieved_at),
    sourceMethodologyName: text(row.source_methodology_name),
    sourceMethodologyVersion: text(row.source_methodology_version),
    rightsClassification: String(row.rights_classification) as PlanningForecastVintage["rightsClassification"],
    publicationState: String(row.publication_state) as PlanningForecastVintage["publicationState"],
    qualityStatus: String(row.quality_status) as PlanningForecastVintage["qualityStatus"],
    supersededById: text(row.superseded_by_id),
    supersededAt: row.superseded_at == null ? null : iso(row.superseded_at),
    supersessionReason: text(row.supersession_reason),
    supersessionKind: text(row.supersession_kind) as PlanningForecastVintage["supersessionKind"],
    rights: rightsState(row, purpose),
  };
}

function scenario(row: Record<string, unknown>): PlanningForecastScenario {
  return {
    id: String(row.id),
    vintageId: String(row.vintage_id),
    nativeScenarioKey: String(row.native_scenario_key),
    nativeScenarioLabel: String(row.native_scenario_label),
    canonicalClass: text(row.canonical_class) as PlanningForecastScenario["canonicalClass"],
    isReference: row.is_reference === true,
    weatherBasis: String(row.weather_basis) as PlanningForecastScenario["weatherBasis"],
    loadBasis: String(row.load_basis) as PlanningForecastScenario["loadBasis"],
    largeLoadPolicy: String(row.large_load_policy) as PlanningForecastScenario["largeLoadPolicy"],
    assumptions: (row.assumptions ?? {}) as Record<string, unknown>,
    assumptionsText: text(row.assumptions_text),
  };
}

function point(row: Record<string, unknown>): PlanningForecastPoint {
  return {
    id: String(row.id),
    vintageId: String(row.vintage_id),
    scenarioId: String(row.scenario_id),
    gridAreaId: String(row.grid_area_id),
    rawRecordId: String(row.raw_record_id),
    geographicGrain: String(row.geographic_grain) as PlanningForecastPoint["geographicGrain"],
    nativeGeographyLabel: text(row.native_geography_label),
    targetPeriodKind: String(row.target_period_kind) as PlanningForecastPoint["targetPeriodKind"],
    targetYear: Number(row.target_year),
    targetSeason: text(row.target_season) as PlanningForecastPoint["targetSeason"],
    targetTimestamp: row.target_timestamp == null ? null : iso(row.target_timestamp),
    value: Number(row.value),
    unit: String(row.unit) as PlanningForecastPoint["unit"],
    peakType: String(row.peak_type) as PlanningForecastPoint["peakType"],
    weatherBasis: String(row.weather_basis) as PlanningForecastPoint["weatherBasis"],
    loadBasis: String(row.load_basis) as PlanningForecastPoint["loadBasis"],
    largeLoadPolicy: String(row.large_load_policy) as PlanningForecastPoint["largeLoadPolicy"],
    sourceMethodologyName: text(row.source_methodology_name),
    sourceMethodologyVersion: text(row.source_methodology_version),
    qualityStatus: String(row.quality_status) as PlanningForecastPoint["qualityStatus"],
    supersededById: text(row.superseded_by_id),
  };
}

const SCENARIO_SELECT = `select id, vintage_id, native_scenario_key, native_scenario_label,
    canonical_class, is_reference, weather_basis, load_basis, large_load_policy,
    assumptions, assumptions_text
  from pipeline.planning_forecast_scenarios`;

const POINT_SELECT = `select id, vintage_id, scenario_id, grid_area_id, raw_record_id,
    geographic_grain, native_geography_label, target_period_kind, target_year, target_season,
    target_timestamp, value::float8 as value, unit, peak_type, weather_basis, load_basis,
    large_load_policy, source_methodology_name, source_methodology_version, quality_status,
    superseded_by_id
  from pipeline.planning_forecast_points`;

// ------------------------------------------------------------------------------ internal reads

/** The most recent live vintage for each market, including material no public surface may show. */
export async function latestVintageByMarketInternal(
  sql: PlanningSqlExecutor,
  purpose: PlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PlanningForecastVintage[]> {
  const { rows } = await sql.query(
    `${VINTAGE_SELECT}
      where v.superseded_by_id is null
        and v.published_at = (
          select max(v2.published_at) from pipeline.planning_forecast_vintages v2
           where v2.grid_area_id = v.grid_area_id and v2.superseded_by_id is null)
      order by a.display_name`,
    [purpose],
  );
  return rows.map((row) => vintage(row, purpose));
}

export async function vintageByIdInternal(
  sql: PlanningSqlExecutor,
  vintageId: string,
  purpose: PlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PlanningForecastVintage | null> {
  const { rows } = await sql.query(`${VINTAGE_SELECT} where v.id = $2`, [purpose, vintageId]);
  return rows[0] ? vintage(rows[0], purpose) : null;
}

export async function vintageByKeyInternal(
  sql: PlanningSqlExecutor,
  marketSlug: string,
  nativeVintageKey: string,
  purpose: PlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PlanningForecastVintage | null> {
  const { rows } = await sql.query(
    `${VINTAGE_SELECT} where a.slug = $2 and v.native_vintage_key = $3 and v.superseded_by_id is null`,
    [purpose, marketSlug, nativeVintageKey],
  );
  return rows[0] ? vintage(rows[0], purpose) : null;
}

/**
 * Every live vintage that says something about one target year, newest publication first. This
 * is the read that makes forecast drift visible: the 2025 and 2026 releases both speak about
 * 2031 and neither is a correction of the other.
 */
export async function vintagesForTargetYearInternal(
  sql: PlanningSqlExecutor,
  marketSlug: string,
  targetYear: number,
  purpose: PlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PlanningForecastVintage[]> {
  const { rows } = await sql.query(
    `${VINTAGE_SELECT}
      where a.slug = $2 and v.superseded_by_id is null
        and exists (select 1 from pipeline.planning_forecast_points p
                     where p.vintage_id = v.id and p.target_year = $3 and p.superseded_by_id is null)
      order by v.published_at desc`,
    [purpose, marketSlug, targetYear],
  );
  return rows.map((row) => vintage(row, purpose));
}

export async function scenariosForVintageInternal(
  sql: PlanningSqlExecutor,
  vintageId: string,
): Promise<PlanningForecastScenario[]> {
  const { rows } = await sql.query(
    `${SCENARIO_SELECT} where vintage_id = $1 order by is_reference desc, native_scenario_key`,
    [vintageId],
  );
  return rows.map(scenario);
}

export async function pointsForScenarioInternal(
  sql: PlanningSqlExecutor,
  vintageId: string,
  scenarioId: string,
): Promise<PlanningForecastPoint[]> {
  const { rows } = await sql.query(
    `${POINT_SELECT}
      where vintage_id = $1 and scenario_id = $2 and superseded_by_id is null
      order by target_year, target_period_kind, target_season nulls first, target_timestamp nulls first`,
    [vintageId, scenarioId],
  );
  return rows.map(point);
}

/** The rights and provenance record behind a vintage, for an operator or a disclosure page. */
export async function planningRightsMetadataInternal(
  sql: PlanningSqlExecutor,
  sourceInterfaceSlug: string,
): Promise<PlanningRightsState[]> {
  const { rows } = await sql.query(
    `select s.slug as source_slug, s.name as source_name, sup.purpose_code,
            sup.rights_classification as rights_in_force, sup.disposition, sup.attribution_required,
            sup.attribution_text, sup.conditions, sup.unresolved_issue, sup.terms_document_url,
            sup.reviewed_by, sup.reviewed_on
       from reference.source_use_permissions sup
       join reference.source_interfaces s on s.id = sup.source_interface_id
      where s.slug = $1 and sup.effective_from <= now()
        and (sup.effective_to is null or sup.effective_to > now())
      order by sup.purpose_code`,
    [sourceInterfaceSlug],
  );
  return rows
    .map((row) => rightsState(row, String(row.purpose_code) as PlanningUsePurpose))
    .filter((state): state is PlanningRightsState => state !== null);
}

// -------------------------------------------------------------------------------- public reads

export type PublishablePlanningVintage = {
  vintage: PlanningForecastVintage;
  /** Why this vintage may be shown, and what must be shown alongside it. */
  publication: PlanningPublicationDecision;
};

/** The single gate. Nothing in the public family reaches a caller without passing through it. */
function gate(
  candidate: PlanningForecastVintage,
  purpose: PublicPlanningUsePurpose,
): PublishablePlanningVintage | null {
  const publication = mayPublishPlanningForecast({
    rights: candidate.rights,
    publicationState: candidate.publicationState,
    purpose,
  });
  return publication.allowed ? { vintage: candidate, publication } : null;
}

function gateAll(
  candidates: readonly PlanningForecastVintage[],
  purpose: PublicPlanningUsePurpose,
): PublishablePlanningVintage[] {
  return candidates
    .map((candidate) => gate(candidate, purpose))
    .filter((entry): entry is PublishablePlanningVintage => entry !== null);
}

export async function publishableLatestVintageByMarket(
  sql: PlanningSqlExecutor,
  purpose: PublicPlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PublishablePlanningVintage[]> {
  return gateAll(await latestVintageByMarketInternal(sql, purpose), purpose);
}

export async function publishableVintageById(
  sql: PlanningSqlExecutor,
  vintageId: string,
  purpose: PublicPlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PublishablePlanningVintage | null> {
  const candidate = await vintageByIdInternal(sql, vintageId, purpose);
  return candidate === null ? null : gate(candidate, purpose);
}

export async function publishableVintageByKey(
  sql: PlanningSqlExecutor,
  marketSlug: string,
  nativeVintageKey: string,
  purpose: PublicPlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PublishablePlanningVintage | null> {
  const candidate = await vintageByKeyInternal(sql, marketSlug, nativeVintageKey, purpose);
  return candidate === null ? null : gate(candidate, purpose);
}

export async function publishableVintagesForTargetYear(
  sql: PlanningSqlExecutor,
  marketSlug: string,
  targetYear: number,
  purpose: PublicPlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PublishablePlanningVintage[]> {
  return gateAll(await vintagesForTargetYearInternal(sql, marketSlug, targetYear, purpose), purpose);
}

export async function publishableScenariosForVintage(
  sql: PlanningSqlExecutor,
  vintageId: string,
  purpose: PublicPlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PlanningForecastScenario[]> {
  const allowed = await publishableVintageById(sql, vintageId, purpose);
  return allowed === null ? [] : scenariosForVintageInternal(sql, vintageId);
}

export async function publishablePointsForScenario(
  sql: PlanningSqlExecutor,
  vintageId: string,
  scenarioId: string,
  purpose: PublicPlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PlanningForecastPoint[]> {
  const allowed = await publishableVintageById(sql, vintageId, purpose);
  return allowed === null ? [] : pointsForScenarioInternal(sql, vintageId, scenarioId);
}

/** Rights and provenance for a vintage a public surface is already permitted to show. */
export async function publishablePlanningRights(
  sql: PlanningSqlExecutor,
  vintageId: string,
  purpose: PublicPlanningUsePurpose = DEFAULT_PUBLIC_PURPOSE,
): Promise<PlanningRightsState[]> {
  const allowed = await publishableVintageById(sql, vintageId, purpose);
  return allowed === null ? [] : planningRightsMetadataInternal(sql, allowed.vintage.sourceInterfaceSlug);
}
