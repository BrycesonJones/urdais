/**
 * Producing deliverable capacity results, for the markets the methodology approves and no others.
 *
 * Three gates, checked separately because they answer different questions. The **methodology**
 * gate asks whether this market is approved under an approved version. The **rights** gate asks
 * whether the source's determinations permit showing a derived value. The **currentness** gate
 * asks whether the inputs come from the vintage in force rather than from one that happens to
 * still be readable. A number reaches a public surface only if all three open, and a number that
 * fails one is retained unpublished rather than left absent or approximated.
 *
 * Every result freezes the exact component rows it came from. Version 1.0.0 approves no
 * arithmetic, so that is one row per result — which is not a weakness of the freezing but the
 * reason it is cheap to insist on: a value nobody can reconstruct is a value nobody can audit,
 * and the discipline has to hold before the formulas get interesting.
 */

import { randomUUID } from "node:crypto";

import {
  APPROVED_VERSION, DELIVERABLE_CAPACITY_METHODOLOGY, EXCLUDED_MARKETS, RESULT_RULES,
  type ResultRule,
} from "@/lib/power-delivery/capacity/deliverable/methodology";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { mayPublishSourceValue, type SourceRightsState } from "@/lib/rights/publication";

const DERIVED_DISPLAY_PURPOSE = "public_derived_deliverable_capacity_display";

export type MarketOutcome = {
  marketSlug: string;
  status: string;
  /** Null when the market produces no result at all. */
  vintageKey: string | null;
  computed: number;
  inserted: number;
  unchanged: number;
  revised: number;
  publicationState: "internal_only" | "publication_candidate" | null;
  /** Why publication is or is not offered, in the rights policy's own words. */
  rightsReason: string | null;
  note: string;
};

export type CalculationReport = {
  methodologyVersion: string;
  ranAt: string;
  outcomes: MarketOutcome[];
};

type Candidate = {
  componentId: string;
  scenarioId: string;
  periodBasis: string;
  targetYear: number;
  targetSeason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  value: string;
  unit: string;
  capacityBasis: string;
  sourceTerm: string;
};

/**
 * The approved methodology version, or a refusal.
 *
 * A draft cannot produce a published number, and the database says so independently. Looking the
 * status up here as well means the failure is a clear message rather than a constraint violation
 * three statements later.
 */
async function approvedVersion(sql: CapacitySqlExecutor): Promise<{ id: string; version: string }> {
  const { rows } = await sql.query(
    `select mv.id, mv.version, mv.status
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1 and mv.version = $2`,
    [DELIVERABLE_CAPACITY_METHODOLOGY, APPROVED_VERSION],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`methodology ${DELIVERABLE_CAPACITY_METHODOLOGY} has no version ${APPROVED_VERSION}`);
  }
  if (String(row.status) !== "approved") {
    throw new Error(
      `methodology version ${APPROVED_VERSION} is ${String(row.status)}, not approved; nothing may be calculated under it`,
    );
  }
  return { id: String(row.id), version: String(row.version) };
}

/**
 * The determination in force for showing a derived value from this market's source.
 *
 * Read from the registry rather than from anything in this module: approving a methodology does
 * not grant a right, and the two must be able to disagree.
 */
async function derivedDisplayRights(
  sql: CapacitySqlExecutor,
  sourceInterfaceSlug: string,
): Promise<SourceRightsState | null> {
  const { rows } = await sql.query(
    `select s.slug, s.name, sup.purpose_code, sup.rights_classification, sup.disposition,
            sup.attribution_required, sup.attribution_text, sup.conditions, sup.unresolved_issue,
            sup.terms_document_url, sup.reviewed_by, sup.reviewed_on
       from reference.source_use_permissions sup
       join reference.source_interfaces s on s.id = sup.source_interface_id
      where s.slug = $1 and sup.purpose_code = $2
        and sup.effective_from <= now() and (sup.effective_to is null or sup.effective_to > now())
      order by sup.effective_from desc limit 1`,
    [sourceInterfaceSlug, DERIVED_DISPLAY_PURPOSE],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    sourceInterfaceSlug: String(row.slug),
    sourceName: String(row.name),
    purpose: String(row.purpose_code),
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
 * The components a rule admits, taken only from the vintage currently in force.
 *
 * The currentness gate lives in this query. An earlier vintage's components are still live rows
 * and would happily calculate; restricting to the newest live vintage of the rule's own source is
 * what stops a stale release producing a confident number.
 */
async function currentComponents(
  sql: CapacitySqlExecutor,
  rule: ResultRule,
): Promise<{ vintageKey: string | null; candidates: Candidate[] }> {
  const { rows: vintages } = await sql.query(
    `select v.id, v.native_vintage_key
       from pipeline.grid_capacity_vintages v
       join reference.grid_areas a on a.id = v.grid_area_id
       join reference.source_interfaces s on s.id = v.source_interface_id
      where a.slug = $1 and s.slug = $2 and v.superseded_by_id is null
      order by v.published_at desc, v.created_at desc
      limit 1`,
    [rule.marketSlug, rule.sourceInterfaceSlug],
  );
  const vintage = vintages[0];
  if (vintage === undefined) return { vintageKey: null, candidates: [] };

  const { rows } = await sql.query(
    `select c.id, c.scenario_id, c.period_basis, c.target_year, c.target_season,
            c.period_start::text as period_start, c.period_end::text as period_end,
            c.value::text as value, c.unit, c.capacity_basis, c.source_term
       from pipeline.grid_capacity_components c
      where c.vintage_id = $1
        and c.superseded_by_id is null
        and c.quantity_kind = 'capability'
        and c.component_kind = $2
        and c.capacity_basis = $3
        and c.source_term = $4
        -- Whole-market only. Version 1.0.0 approves no locational result in any market.
        and c.grid_subarea_id is null
        and c.grid_interface_id is null
      order by c.target_year, c.target_season nulls first`,
    [String(vintage.id), rule.componentKind, rule.capacityBasis, rule.sourceTerm],
  );

  return {
    vintageKey: String(vintage.native_vintage_key),
    candidates: rows.map((row) => ({
      componentId: String(row.id),
      scenarioId: String(row.scenario_id),
      periodBasis: String(row.period_basis),
      targetYear: Number(row.target_year),
      targetSeason: row.target_season == null ? null : String(row.target_season),
      // Cast to text in SQL: a date returned as a JS Date stringifies to "Mon Jun 01 2026 …",
      // whose first ten characters are not a date at all.
      periodStart: row.period_start == null ? null : String(row.period_start),
      periodEnd: row.period_end == null ? null : String(row.period_end),
      value: String(row.value),
      unit: String(row.unit),
      capacityBasis: String(row.capacity_basis),
      sourceTerm: String(row.source_term),
    })),
  };
}

const identity = (methodologyVersionId: string, candidate: Candidate): string => JSON.stringify([
  methodologyVersionId, candidate.scenarioId, candidate.periodBasis,
  candidate.targetYear, candidate.targetSeason, candidate.unit, candidate.capacityBasis,
]);

/**
 * Calculate every approved market's results.
 *
 * One transaction for the whole run: the result set is a statement about the methodology version
 * as a whole, and half of it would be a worse outcome than none of it.
 */
export async function calculateDeliverableCapacity(
  sql: CapacitySqlExecutor,
  options: { markets?: readonly string[] } = {},
): Promise<CalculationReport> {
  const version = await approvedVersion(sql);
  const ranAt = new Date().toISOString();
  const wanted = options.markets;
  const outcomes: MarketOutcome[] = [];

  await sql.query("begin", []);
  try {
    for (const rule of RESULT_RULES) {
      if (wanted !== undefined && !wanted.includes(rule.marketSlug)) continue;
      outcomes.push(await calculateMarket(sql, version.id, rule));
    }

    // Markets that produce nothing are reported, so an absence is visible as a decision.
    for (const excluded of EXCLUDED_MARKETS) {
      if (wanted !== undefined && !wanted.includes(excluded.marketSlug)) continue;
      outcomes.push({
        marketSlug: excluded.marketSlug, status: excluded.status, vintageKey: null,
        computed: 0, inserted: 0, unchanged: 0, revised: 0,
        publicationState: null, rightsReason: null, note: excluded.reason,
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
  rule: ResultRule,
): Promise<MarketOutcome> {
  const { rows: areas } = await sql.query(
    `select id from reference.grid_areas where slug = $1`, [rule.marketSlug],
  );
  const gridAreaId = areas[0] === undefined ? null : String(areas[0].id);
  if (gridAreaId === null) throw new Error(`no grid area ${rule.marketSlug}`);

  const { vintageKey, candidates } = await currentComponents(sql, rule);

  // ------------------------------------------------------------------------- the rights gate
  const rights = await derivedDisplayRights(sql, rule.sourceInterfaceSlug);
  const decision = mayPublishSourceValue({
    rights, publicationState: "publication_candidate",
    purpose: DERIVED_DISPLAY_PURPOSE, isPublicPurpose: true,
  });
  // A market the methodology itself keeps internal is never offered for publication, whatever
  // the rights say; and a market the rights refuse is never offered, whatever the methodology says.
  const publishable = decision.allowed && rule.status === "approved_result";
  const publicationState = publishable ? "publication_candidate" as const : "internal_only" as const;

  const { rows: live } = await sql.query(
    `select r.id, r.value::text as value, r.scenario_id, r.period_basis, r.target_year,
            r.target_season, r.unit, r.capacity_basis, r.publication_state
       from pipeline.deliverable_capacity_results r
      where r.methodology_version_id = $1 and r.grid_area_id = $2 and r.superseded_by_id is null`,
    [methodologyVersionId, gridAreaId],
  );
  const existing = new Map<string, { id: string; value: string; publicationState: string }>();
  for (const row of live) {
    existing.set(identity(methodologyVersionId, {
      componentId: "", scenarioId: String(row.scenario_id), periodBasis: String(row.period_basis),
      targetYear: Number(row.target_year), targetSeason: row.target_season == null ? null : String(row.target_season),
      periodStart: null, periodEnd: null, value: String(row.value), unit: String(row.unit),
      capacityBasis: String(row.capacity_basis), sourceTerm: "",
    }), { id: String(row.id), value: String(row.value), publicationState: String(row.publication_state) });
  }

  let inserted = 0;
  let unchanged = 0;
  let revised = 0;

  for (const candidate of candidates) {
    const key = identity(methodologyVersionId, candidate);
    const current = existing.get(key);
    // Compared as stored text, never as float8: production renders float8 to fifteen significant
    // digits and ERCOT's capacity figures need sixteen.
    if (current !== undefined && current.value === candidate.value
        && current.publicationState === publicationState) {
      unchanged += 1;
      continue;
    }
    const nextId = randomUUID();
    if (current !== undefined) {
      await sql.query(
        `update pipeline.deliverable_capacity_results
            set superseded_by_id = $2, superseded_at = now(),
                supersession_reason = 'the source restated this capability, or its publication eligibility changed'
          where id = $1`,
        [current.id, nextId],
      );
      revised += 1;
    } else {
      inserted += 1;
    }

    await sql.query(
      `insert into pipeline.deliverable_capacity_results
         (id, methodology_version_id, grid_area_id, grid_subarea_id, scenario_id, period_basis,
          target_year, target_season, period_start, period_end, value, unit, capacity_basis,
          calculation_status, publication_state, calculation_notes)
       values ($1,$2,$3,null,$4,$5,$6,$7,$8::date,$9::date,$10::numeric,$11,$12,'validated',$13,$14)`,
      [nextId, methodologyVersionId, gridAreaId, candidate.scenarioId, candidate.periodBasis,
        candidate.targetYear, candidate.targetSeason, candidate.periodStart, candidate.periodEnd,
        candidate.value, candidate.unit, candidate.capacityBasis, publicationState,
        `${rule.sourceTerm}, carried through unchanged under ${APPROVED_VERSION}. ${rule.scope}`
        + (rule.questionAEligible ? "" : " Not eligible for a planning capacity margin against forecast peak demand."),
      ],
    );

    await sql.query(
      `insert into pipeline.deliverable_capacity_result_inputs
         (result_id, input_kind, component_id, input_role)
       values ($1, 'component', $2, $3)`,
      [nextId, candidate.componentId,
        `the whole of the result: ${rule.sourceTerm} carried through unchanged`],
    );
    existing.set(key, { id: nextId, value: candidate.value, publicationState });
  }

  return {
    marketSlug: rule.marketSlug,
    status: rule.status,
    vintageKey,
    computed: candidates.length,
    inserted, unchanged, revised,
    publicationState,
    rightsReason: decision.reasonCode,
    note: publishable
      ? `Offered for publication under ${decision.reasonCode}.`
      : rule.status === "internal_result_only"
        ? `Retained internally: the methodology keeps this market internal, and the rights determination says ${decision.reasonCode}.`
        : `Retained internally: ${decision.reasonCode}.`,
  };
}
