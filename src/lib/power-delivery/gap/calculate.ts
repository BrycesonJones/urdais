/**
 * Producing delivery gaps, for the pairings the methodology approves and no others.
 *
 * The subtraction is trivial. Everything hard is in deciding that two numbers may be subtracted at
 * all, and that decision is made twice over: `eligibility.ts` names the pairing, and the query
 * below pins both sides to the release in force and to the exact season, peak definition and load
 * basis the pairing was approved for. A row that does not match on every one of those is not a
 * near miss; it is a different question and produces nothing.
 *
 * Rights are the strict part. A gap is derived from two sources, so **the most restrictive input
 * wins** — the demand source, the capacity source and the delivery-gap display purpose must all
 * permit it, and the first refusal decides.
 */

import { randomUUID } from "node:crypto";

import {
  APPROVED_VERSION, DELIVERY_GAP_METHODOLOGY, EXCLUDED_GAP_MARKETS, GAP_PAIRINGS,
  isComparableLoadBasis, type GapPairing,
} from "@/lib/power-delivery/gap/eligibility";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { mayPublishSourceValue, type SourceRightsState } from "@/lib/rights/publication";

const GAP_DISPLAY_PURPOSE = "public_derived_delivery_gap_display";

export type GapOutcome = {
  marketSlug: string;
  status: string;
  demandVintage: string | null;
  capacityVintage: string | null;
  paired: number;
  inserted: number;
  unchanged: number;
  revised: number;
  /** Demand rows with no capacity partner, and capacity rows with no demand partner. */
  demandWithoutCapacity: number;
  capacityWithoutDemand: number;
  publicationState: "internal_only" | "publication_candidate" | null;
  rightsReason: string | null;
  note: string;
};

export type GapReport = {
  methodologyVersion: string;
  ranAt: string;
  outcomes: GapOutcome[];
};

type Pair = {
  planningPointId: string;
  capacityResultId: string;
  demandScenarioId: string;
  capacityScenarioId: string;
  targetYear: number;
  targetSeason: string | null;
  peakType: string;
  demandValue: string;
  capacityValue: string;
  capacityBasis: string;
  unit: string;
};

async function approvedVersion(sql: CapacitySqlExecutor): Promise<{ id: string; version: string }> {
  const { rows } = await sql.query(
    `select mv.id, mv.version, mv.status
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1 and mv.version = $2`,
    [DELIVERY_GAP_METHODOLOGY, APPROVED_VERSION],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`methodology ${DELIVERY_GAP_METHODOLOGY} has no version ${APPROVED_VERSION}`);
  if (String(row.status) !== "approved") {
    throw new Error(`methodology version ${APPROVED_VERSION} is ${String(row.status)}, not approved; no gap may be calculated under it`);
  }
  return { id: String(row.id), version: String(row.version) };
}

async function rightsFor(sql: CapacitySqlExecutor, slug: string): Promise<SourceRightsState | null> {
  const { rows } = await sql.query(
    `select s.slug, s.name, sup.purpose_code, sup.rights_classification, sup.disposition,
            sup.attribution_required, sup.attribution_text, sup.conditions, sup.unresolved_issue,
            sup.terms_document_url, sup.reviewed_by, sup.reviewed_on
       from reference.source_use_permissions sup
       join reference.source_interfaces s on s.id = sup.source_interface_id
      where s.slug = $1 and sup.purpose_code = $2
        and sup.effective_from <= now() and (sup.effective_to is null or sup.effective_to > now())
      order by sup.effective_from desc limit 1`,
    [slug, GAP_DISPLAY_PURPOSE],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    sourceInterfaceSlug: String(row.slug), sourceName: String(row.name), purpose: String(row.purpose_code),
    rightsClassification: String(row.rights_classification) as SourceRightsState["rightsClassification"],
    disposition: String(row.disposition) as SourceRightsState["disposition"],
    attributionRequired: row.attribution_required === true,
    attributionText: row.attribution_text == null ? null : String(row.attribution_text),
    conditions: row.conditions == null ? null : String(row.conditions),
    unresolvedIssue: row.unresolved_issue == null ? null : String(row.unresolved_issue),
    termsDocumentUrl: row.terms_document_url == null ? null : String(row.terms_document_url),
    reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
    reviewedOn: row.reviewed_on == null ? null : String(row.reviewed_on),
  };
}

/**
 * The eligible pairs, and a count of each side that found no partner.
 *
 * Both sides are restricted to the release in force: a demand vintage that has been superseded and
 * a capacity result that has been superseded both fall out, which is the currentness gate. The join
 * itself carries the compatibility rules — same year, same season — while the where clause carries
 * the ones about meaning.
 */
async function eligiblePairs(
  sql: CapacitySqlExecutor,
  pairing: GapPairing,
): Promise<{ demandVintage: string | null; capacityVintage: string | null; pairs: Pair[]; demandOnly: number; capacityOnly: number }> {
  if (!isComparableLoadBasis(pairing.demandLoadBasis)) {
    throw new Error(`${pairing.marketSlug}: a pairing cannot be approved against an unspecified load basis`);
  }

  const { rows: vintages } = await sql.query(
    `select v.id, v.native_vintage_key
       from pipeline.planning_forecast_vintages v
       join reference.grid_areas a on a.id = v.grid_area_id
       join reference.source_interfaces s on s.id = v.source_interface_id
      where a.slug = $1 and s.slug = $2 and v.superseded_by_id is null
      order by v.published_at desc, v.created_at desc limit 1`,
    [pairing.marketSlug, pairing.demandSourceInterfaceSlug],
  );
  const demandVintage = vintages[0];
  if (demandVintage === undefined) {
    return { demandVintage: null, capacityVintage: null, pairs: [], demandOnly: 0, capacityOnly: 0 };
  }

  const demandSql =
    `select p.id, p.scenario_id, p.target_year, p.target_season, p.peak_type,
            p.value::text as value, p.unit
       from pipeline.planning_forecast_points p
       join pipeline.planning_forecast_scenarios sc on sc.id = p.scenario_id
      where p.vintage_id = $1 and p.superseded_by_id is null
        and sc.native_scenario_key = $2
        and p.geographic_grain = $3 and p.native_geography_label is null
        and p.target_period_kind = $4 and p.peak_type = $5 and p.load_basis = $6`;
  const { rows: demandRows } = await sql.query(demandSql, [
    String(demandVintage.id), pairing.demandScenarioKey, pairing.demandGrain,
    pairing.demandPeriodKind, pairing.demandPeakType, pairing.demandLoadBasis,
  ]);

  const { rows: capacityRows } = await sql.query(
    `select r.id, r.scenario_id, r.target_year, r.target_season, r.value::text as value,
            r.unit, r.capacity_basis, v.native_vintage_key
       from pipeline.deliverable_capacity_results r
       join reference.grid_areas a on a.id = r.grid_area_id
       join pipeline.grid_capacity_scenarios sc on sc.id = r.scenario_id
       join pipeline.grid_capacity_vintages v on v.id = sc.vintage_id
       join reference.source_interfaces s on s.id = v.source_interface_id
      where a.slug = $1 and s.slug = $2 and r.superseded_by_id is null
        and sc.native_scenario_key = $3 and r.capacity_basis = $4
        and r.grid_subarea_id is null
        and v.superseded_by_id is null`,
    [pairing.marketSlug, pairing.capacitySourceInterfaceSlug, pairing.capacityScenarioKey, pairing.capacityBasis],
  );

  const key = (year: unknown, season: unknown) => `${String(year)}|${season == null ? "" : String(season)}`;
  const capacityByPeriod = new Map(capacityRows.map((row) => [key(row.target_year, row.target_season), row]));
  const pairs: Pair[] = [];
  let demandOnly = 0;
  const matchedCapacity = new Set<string>();

  for (const demand of demandRows) {
    const capacity = capacityByPeriod.get(key(demand.target_year, demand.target_season));
    if (capacity === undefined) { demandOnly += 1; continue; }
    if (String(capacity.unit) !== String(demand.unit)) { demandOnly += 1; continue; }
    matchedCapacity.add(String(capacity.id));
    pairs.push({
      planningPointId: String(demand.id),
      capacityResultId: String(capacity.id),
      demandScenarioId: String(demand.scenario_id),
      capacityScenarioId: String(capacity.scenario_id),
      targetYear: Number(demand.target_year),
      targetSeason: demand.target_season == null ? null : String(demand.target_season),
      peakType: String(demand.peak_type),
      demandValue: String(demand.value),
      capacityValue: String(capacity.value),
      capacityBasis: String(capacity.capacity_basis),
      unit: String(demand.unit),
    });
  }

  return {
    demandVintage: String(demandVintage.native_vintage_key),
    capacityVintage: capacityRows[0] === undefined ? null : String(capacityRows[0].native_vintage_key),
    pairs,
    demandOnly,
    capacityOnly: capacityRows.length - matchedCapacity.size,
  };
}

const identity = (versionId: string, pair: Pair): string => JSON.stringify([
  versionId, pair.demandScenarioId, pair.capacityScenarioId,
  pair.targetYear, pair.targetSeason, pair.peakType, pair.unit,
]);

/**
 * What the approved pairings say should currently be paired, without writing anything.
 *
 * The read model uses this to tell a live result from a stale one: a gap is stale when the rows
 * it froze are no longer the rows this returns, which happens as soon as a new source release is
 * ingested and the calculation has not been rerun. Sharing the function rather than restating the
 * rules is the point — two implementations of "what pairs" would eventually disagree.
 */
export async function currentEligiblePairs(
  sql: CapacitySqlExecutor,
  marketSlug: string,
): Promise<{ planningPointId: string; capacityResultId: string; targetYear: number; targetSeason: string | null }[]> {
  const pairing = GAP_PAIRINGS.find((entry) => entry.marketSlug === marketSlug);
  if (pairing === undefined) return [];
  const found = await eligiblePairs(sql, pairing);
  return found.pairs.map((pair) => ({
    planningPointId: pair.planningPointId,
    capacityResultId: pair.capacityResultId,
    targetYear: pair.targetYear,
    targetSeason: pair.targetSeason,
  }));
}

export async function calculateDeliveryGaps(
  sql: CapacitySqlExecutor,
  options: { markets?: readonly string[] } = {},
): Promise<GapReport> {
  const version = await approvedVersion(sql);
  const ranAt = new Date().toISOString();
  const wanted = options.markets;
  const outcomes: GapOutcome[] = [];

  await sql.query("begin", []);
  try {
    for (const pairing of GAP_PAIRINGS) {
      if (wanted !== undefined && !wanted.includes(pairing.marketSlug)) continue;
      outcomes.push(await calculateMarket(sql, version.id, pairing));
    }
    for (const excluded of EXCLUDED_GAP_MARKETS) {
      if (wanted !== undefined && !wanted.includes(excluded.marketSlug)) continue;
      outcomes.push({
        marketSlug: excluded.marketSlug, status: excluded.status,
        demandVintage: null, capacityVintage: null,
        paired: 0, inserted: 0, unchanged: 0, revised: 0,
        demandWithoutCapacity: 0, capacityWithoutDemand: 0,
        publicationState: null, rightsReason: null, note: excluded.blocker,
      });
    }
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }

  return { methodologyVersion: version.version, ranAt, outcomes };
}

async function calculateMarket(
  sql: CapacitySqlExecutor,
  methodologyVersionId: string,
  pairing: GapPairing,
): Promise<GapOutcome> {
  const { rows: areas } = await sql.query(`select id from reference.grid_areas where slug = $1`, [pairing.marketSlug]);
  if (areas[0] === undefined) throw new Error(`no grid area ${pairing.marketSlug}`);
  const gridAreaId = String(areas[0].id);

  const found = await eligiblePairs(sql, pairing);

  // ------------------------------------------------------ the rights gate, strictest input wins
  const decisions = await Promise.all(
    [pairing.demandSourceInterfaceSlug, pairing.capacitySourceInterfaceSlug].map(async (slug) => {
      const rights = await rightsFor(sql, slug);
      return {
        slug,
        decision: mayPublishSourceValue({
          rights, publicationState: "publication_candidate",
          purpose: GAP_DISPLAY_PURPOSE, isPublicPurpose: true,
        }),
      };
    }),
  );
  const refused = decisions.find((entry) => !entry.decision.allowed);
  const allowed = refused === undefined && pairing.status === "public_gap_eligible";
  const publicationState = allowed ? "publication_candidate" as const : "internal_only" as const;
  const rightsReason = refused === undefined
    ? decisions[0]?.decision.reasonCode ?? null
    : `${refused.decision.reasonCode} (${refused.slug})`;

  const { rows: live } = await sql.query(
    `select g.id, g.gap_value::text as gap_value, g.demand_scenario_id, g.capacity_scenario_id,
            g.demand_value::text as demand_value, g.capacity_value::text as capacity_value,
            g.target_year, g.target_season, g.peak_type, g.unit, g.publication_state
       from pipeline.delivery_gap_results g
      where g.methodology_version_id = $1 and g.grid_area_id = $2 and g.superseded_by_id is null`,
    [methodologyVersionId, gridAreaId],
  );
  const existing = new Map<string, { id: string; demand: string; capacity: string; publicationState: string }>();
  for (const row of live) {
    existing.set(JSON.stringify([
      methodologyVersionId, String(row.demand_scenario_id), String(row.capacity_scenario_id),
      Number(row.target_year), row.target_season == null ? null : String(row.target_season),
      String(row.peak_type), String(row.unit),
    ]), {
      id: String(row.id), demand: String(row.demand_value), capacity: String(row.capacity_value),
      publicationState: String(row.publication_state),
    });
  }

  let inserted = 0;
  let unchanged = 0;
  let revised = 0;

  for (const pair of found.pairs) {
    const key = identity(methodologyVersionId, pair);
    const current = existing.get(key);
    // Compared on the two inputs rather than on the difference: if neither side moved, the gap
    // did not either, and comparing stored text avoids ever rounding a sixteen-digit value.
    if (current !== undefined && current.demand === pair.demandValue
        && current.capacity === pair.capacityValue
        && current.publicationState === publicationState) {
      unchanged += 1;
      continue;
    }
    const nextId = randomUUID();
    if (current !== undefined) {
      await sql.query(
        `update pipeline.delivery_gap_results
            set superseded_by_id = $2, superseded_at = now(),
                supersession_reason = 'an input was restated, or the pairing''s publication eligibility changed'
          where id = $1`,
        [current.id, nextId],
      );
      revised += 1;
    } else {
      inserted += 1;
    }

    await sql.query(
      `insert into pipeline.delivery_gap_results
         (id, methodology_version_id, grid_area_id, grid_subarea_id, demand_scenario_id,
          capacity_scenario_id, period_basis, target_year, target_season, peak_type,
          demand_value, capacity_value, gap_value, unit, capacity_basis,
          calculation_status, publication_state, calculation_notes)
       -- The subtraction is done by PostgreSQL in exact decimal. Computing it in JavaScript and
       -- sending the answer would round a sixteen-digit value and the table's own check would
       -- catch the disagreement, which is a poor way to find out.
       values ($1,$2,$3,null,$4,$5,$6,$7,$8,$9,$10::numeric,$11::numeric,
               $10::numeric - $11::numeric,$12,$13,'validated',$14,$15)`,
      [nextId, methodologyVersionId, gridAreaId, pair.demandScenarioId, pair.capacityScenarioId,
        pairing.periodBasis, pair.targetYear, pair.targetSeason, pair.peakType,
        pair.demandValue, pair.capacityValue, pair.unit, pair.capacityBasis,
        publicationState, pairing.notes],
    );

    for (const input of [
      { kind: "planning_point", id: pair.planningPointId, role: `demand: ${pairing.demandScenarioKey}, ${pairing.demandPeakType}, ${pairing.demandLoadBasis} load` },
      { kind: "capacity_result", id: pair.capacityResultId, role: `capacity: ${pairing.capacityScenarioKey}, ${pairing.capacityBasis} basis` },
    ]) {
      await sql.query(
        `insert into pipeline.delivery_gap_result_inputs
           (result_id, input_kind, planning_point_id, capacity_result_id, input_role)
         values ($1, $2, $3, $4, $5)`,
        [nextId, input.kind,
          input.kind === "planning_point" ? input.id : null,
          input.kind === "capacity_result" ? input.id : null,
          input.role],
      );
    }
    existing.set(key, { id: nextId, demand: pair.demandValue, capacity: pair.capacityValue, publicationState });
  }

  return {
    marketSlug: pairing.marketSlug,
    status: pairing.status,
    demandVintage: found.demandVintage,
    capacityVintage: found.capacityVintage,
    paired: found.pairs.length,
    inserted, unchanged, revised,
    demandWithoutCapacity: found.demandOnly,
    capacityWithoutDemand: found.capacityOnly,
    publicationState,
    rightsReason,
    note: allowed
      ? `Offered for publication; the strictest input allowed it under ${rightsReason}.`
      : `Retained internally: ${rightsReason}.`,
  };
}
