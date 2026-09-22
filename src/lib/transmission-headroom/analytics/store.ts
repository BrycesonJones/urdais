/**
 * Reading the canonical population and persisting the run.
 *
 * The input digest is the whole idempotence story: it hashes the canonical margins the run read,
 * so an unchanged evidence base under an unchanged methodology resolves to the run already
 * recorded rather than writing a second identical set of numbers.
 */

import { createHash } from "node:crypto";

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import type { LatestMargin, MarketInput, MetricResult } from "@/lib/transmission-headroom/analytics/calculate";
import {
  APPROVED_MARKETS, METHODOLOGY_SLUG, METHODOLOGY_VERSION, assertMethodologyApproved,
  assertMethodologyDocument, type ApprovedMarket,
} from "@/lib/transmission-headroom/analytics/methodology";

export type MetricDefinition = {
  code: string; marketSlug: string; unit: string; scope: "entity" | "market";
  minimumEntities: number | null; isLive: boolean; deferredReason: string | null;
};

export async function loadMetricDefinitions(
  sql: CapacitySqlExecutor,
): Promise<MetricDefinition[]> {
  const rows = await sql.query(
    `select code, market_slug, unit, scope, minimum_entities, is_live, deferred_reason
       from reference.transmission_metric_definitions order by market_slug, code`, []);
  return rows.rows.map((row) => ({
    code: String(row.code), marketSlug: String(row.market_slug), unit: String(row.unit),
    scope: String(row.scope) as "entity" | "market",
    minimumEntities: row.minimum_entities == null ? null : Number(row.minimum_entities),
    isLive: Boolean(row.is_live),
    deferredReason: row.deferred_reason == null ? null : String(row.deferred_reason),
  }));
}

/**
 * One latest eligible margin per canonical entity.
 *
 * `distinct on (entity)` is the point-in-time rule made concrete: without it an interface
 * publishing every five minutes would contribute hundreds of rows to a market median and an
 * hourly one would contribute a handful.
 */
export async function loadLatestMargins(
  sql: CapacitySqlExecutor, sourceSlug: string,
): Promise<LatestMargin[]> {
  const rows = await sql.query(
    `select distinct on (m.entity_id)
            m.entity_id,
            coalesce(i.native_name,
                     e.native_constraint_name || ' / ' || e.native_contingency_name) as label,
            reference.transmission_code('contingency_kind', m.contingency_kind) as contingency_kind,
            m.observed_at::text as observed_at,
            reference.transmission_code('margin_state', m.state) as state,
            m.headroom_mw::text as headroom_mw, f.flow_mw::text as flow_mw,
            l.limit_mw::text as limit_mw,
            reference.transmission_code('limit_state', l.limit_state) as limit_state,
            nullif(r.payload->>'ShadowPrice', '')::numeric as shadow_price
       from pipeline.transmission_margins m
       join reference.source_interfaces si on si.id = m.source_interface_id
       join pipeline.transmission_flow_observations f on f.id = m.flow_observation_id
       join pipeline.raw_transmission_records r on r.id = f.raw_record_id
       left join pipeline.transmission_limit_observations l on l.id = m.limit_observation_id
       left join pipeline.transmission_interfaces i on i.id = m.entity_id
       left join pipeline.transmission_elements e on e.id = m.entity_id
      where si.slug = $1
      order by m.entity_id, m.observed_at desc`,
    [sourceSlug],
  );
  return rows.rows.map((row) => ({
    entityId: String(row.entity_id), entityLabel: String(row.label),
    contingencyKind: String(row.contingency_kind), observedAt: String(row.observed_at),
    state: String(row.state),
    headroomMw: row.headroom_mw == null ? null : Number(row.headroom_mw),
    flowMw: Number(row.flow_mw),
    limitMw: row.limit_mw == null ? null : Number(row.limit_mw),
    limitState: row.limit_state == null ? null : String(row.limit_state),
    shadowPrice: row.shadow_price == null ? null : Number(row.shadow_price),
  }));
}

export async function loadHistoryCounts(
  sql: CapacitySqlExecutor, sourceSlug: string,
): Promise<{ negativeMarginObservations: number; totalObservations: number }> {
  const rows = await sql.query(
    `select count(*) filter (where m.headroom_mw < 0)::int as negative,
            count(*)::int as total
       from pipeline.transmission_margins m
       join reference.source_interfaces si on si.id = m.source_interface_id
      where si.slug = $1`,
    [sourceSlug],
  );
  const row = rows.rows[0];
  return {
    negativeMarginObservations: Number(row?.negative ?? 0),
    totalObservations: Number(row?.total ?? 0),
  };
}

export async function loadSourceStatus(
  sql: CapacitySqlExecutor, sourceSlug: string,
): Promise<"current" | "stale" | "unavailable"> {
  const rows = await sql.query(
    `select m.stale_after_hours,
            extract(epoch from (now() - max(f.observed_at))) / 3600 as age_hours
       from reference.transmission_source_monitors m
       join reference.source_interfaces si on si.id = m.source_interface_id
       left join pipeline.transmission_interfaces ti on ti.source_interface_id = si.id
       left join pipeline.transmission_elements te on te.source_interface_id = si.id
       left join pipeline.transmission_flow_observations f
              on f.entity_id = coalesce(ti.id, te.id)
      where si.slug = $1
      group by m.stale_after_hours`,
    [sourceSlug],
  );
  const row = rows.rows[0];
  if (row === undefined || row.age_hours == null) return "unavailable";
  return Number(row.age_hours) > Number(row.stale_after_hours) ? "stale" : "current";
}

/**
 * The digest of everything the run read.
 *
 * Deliberately includes each entity's state and value, not just a row count: a corrected
 * observation that leaves the count unchanged must still produce a new run.
 */
export function inputDigest(
  methodologyVersion: string, inputs: readonly MarketInput[],
): string {
  const canonical = inputs
    .map((input) => [
      input.market, input.sourceStatus,
      input.history.negativeMarginObservations, input.history.totalObservations,
      [...input.latest]
        .sort((a, b) => a.entityId.localeCompare(b.entityId))
        .map((entry) => [
          entry.entityId, entry.observedAt, entry.state,
          entry.headroomMw, entry.flowMw, entry.limitMw, entry.limitState, entry.shadowPrice,
        ]),
    ]);
  return createHash("sha256")
    .update(JSON.stringify([methodologyVersion, canonical]))
    .digest("hex");
}

export async function buildMarketInputs(
  sql: CapacitySqlExecutor, definitions: readonly MetricDefinition[],
): Promise<MarketInput[]> {
  const inputs: MarketInput[] = [];
  for (const market of Object.keys(APPROVED_MARKETS) as ApprovedMarket[]) {
    const config = APPROVED_MARKETS[market];
    const floors: Record<string, number | null> = {};
    for (const definition of definitions) {
      if (definition.marketSlug === config.marketSlug) floors[definition.code] = definition.minimumEntities;
    }
    inputs.push({
      market,
      latest: await loadLatestMargins(sql, config.sourceInterfaceSlug),
      history: await loadHistoryCounts(sql, config.sourceInterfaceSlug),
      sourceStatus: await loadSourceStatus(sql, config.sourceInterfaceSlug),
      deferredMetrics: definitions
        .filter((d) => d.marketSlug === config.marketSlug && !d.isLive)
        .map((d) => ({ code: d.code, reason: d.deferredReason ?? "" })),
      floors,
    });
  }
  return inputs;
}

export type PersistOutcome = {
  runId: string;
  run: "created" | "existing";
  methodologyVersion: string;
  inputDigest: string;
  resultsInserted: number;
  byStatus: Record<string, number>;
  statements: number;
};

/**
 * Rights, read from the determination in force rather than from a copied flag.
 *
 * Both markets are currently permitted for public derived display — ERCOT by an affirmative grant,
 * NYISO under founder-accepted risk with its classification left visible — so nothing is blocked
 * today. The lookup exists so that a future change in the registry takes effect without an edit
 * here.
 */
async function rightsFor(
  sql: CapacitySqlExecutor, sourceSlug: string,
): Promise<{ publishable: boolean; reason: string | null }> {
  const rows = await sql.query(
    `select disposition, rights_classification, unresolved_issue
       from reference.source_use_permissions p
       join reference.source_interfaces si on si.id = p.source_interface_id
      where si.slug = $1
        and p.purpose_code = 'public_transmission_headroom_derived_metric_display'
      limit 1`,
    [sourceSlug],
  );
  const row = rows.rows[0];
  if (row === undefined) {
    return { publishable: false, reason: "no derived-display permission is recorded" };
  }
  if (String(row.disposition) !== "permitted") {
    return {
      publishable: false,
      reason: `derived display is ${String(row.disposition)} under ${String(row.rights_classification)}`,
    };
  }
  return { publishable: true, reason: null };
}

export async function persistRun(
  sql: CapacitySqlExecutor, inputs: readonly MarketInput[], results: readonly MetricResult[],
  digest: string, options: { calculationVersion?: string } = {},
): Promise<PersistOutcome> {
  await assertMethodologyApproved(sql);
  await assertMethodologyDocument();
  const calculationVersion = options.calculationVersion ?? "0.1.0";
  let statements = 0;
  const count = () => { statements += 1; };

  count();
  const meta = await sql.query(
    `select mv.id as methodology_version_id, cv.id as calculation_version_id
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
       cross join reference.transmission_calculation_versions cv
      where m.slug = $1 and mv.version = $2 and mv.status = 'approved' and cv.version = $3`,
    [METHODOLOGY_SLUG, METHODOLOGY_VERSION, calculationVersion],
  );
  const metaRow = meta.rows[0];
  if (metaRow === undefined) {
    throw new Error(`methodology ${METHODOLOGY_SLUG} ${METHODOLOGY_VERSION} is not approved`);
  }
  const methodologyVersionId = String(metaRow.methodology_version_id);

  count();
  const existing = await sql.query(
    `select id from pipeline.transmission_analytics_runs
      where methodology_version_id = $1 and input_digest = $2`,
    [methodologyVersionId, digest],
  );
  if (existing.rows[0] !== undefined) {
    return {
      runId: String(existing.rows[0]!.id), run: "existing",
      methodologyVersion: METHODOLOGY_VERSION, inputDigest: digest,
      resultsInserted: 0, byStatus: {}, statements,
    };
  }

  const marginCount = inputs.reduce((total, input) => total + input.history.totalObservations, 0);

  count();
  await sql.query("begin", []);
  try {
    count();
    const run = await sql.query(
      `insert into pipeline.transmission_analytics_runs
         (methodology_version_id, calculation_version_id, input_digest, calculated_at,
          run_status, margin_count, notes)
       values ($1,$2,$3,now(),'validated',$4,$5) returning id`,
      [methodologyVersionId, String(metaRow.calculation_version_id), digest, marginCount,
        `${results.length} results over ${inputs.length} markets, never combined.`],
    );
    const runId = String(run.rows[0]!.id);

    const rights = new Map<string, { publishable: boolean; reason: string | null }>();
    for (const market of Object.keys(APPROVED_MARKETS) as ApprovedMarket[]) {
      count();
      rights.set(APPROVED_MARKETS[market].marketSlug,
        await rightsFor(sql, APPROVED_MARKETS[market].sourceInterfaceSlug));
    }

    count();
    const interfaces = await sql.query(
      `select slug, id from reference.source_interfaces
        where slug in ('nyiso-external-limits-flows', 'ercot-sced-binding-constraints')`, []);
    const interfaceBySlug = new Map(
      interfaces.rows.map((row) => [String(row.slug), String(row.id)]));
    const sourceForMarket: Record<string, string> = {
      nyiso: interfaceBySlug.get("nyiso-external-limits-flows")!,
      ercot: interfaceBySlug.get("ercot-sced-binding-constraints")!,
    };

    const byStatus: Record<string, number> = {};
    const rows = results.map((result) => {
      const right = rights.get(result.marketSlug);
      const blocked = right !== undefined && !right.publishable;
      const status = blocked ? "rights_blocked" : result.status;
      const value = blocked ? null : result.value;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      return [
        runId, result.metricCode, result.marketSlug, sourceForMarket[result.marketSlug],
        result.entityId, result.entityLabel, result.contingencyKind, result.observedAt,
        status, value, result.unit, result.sampleSize, JSON.stringify(result.coverage),
        blocked ? "internal_only" : result.publicationState,
        blocked ? right!.reason : result.rightsReason,
      ];
    });

    const cols = 15;
    const perStatement = Math.floor(60_000 / cols);
    let inserted = 0;
    for (let i = 0; i < rows.length; i += perStatement) {
      const batch = rows.slice(i, i + perStatement);
      const placeholders = batch.map((_, r) =>
        `(${Array.from({ length: cols }, (_, c) =>
          c === 12 ? `$${r * cols + c + 1}::jsonb` : `$${r * cols + c + 1}`).join(",")})`).join(",");
      count();
      const written = await sql.query(
        `insert into pipeline.transmission_metric_results
           (run_id, metric_code, market_slug, source_interface_id, entity_id, entity_label,
            contingency_kind, observed_at, status, value, unit, sample_size, coverage,
            publication_state, rights_reason)
         values ${placeholders} returning id`,
        batch.flat(),
      );
      inserted += written.rows.length;
    }

    count();
    await sql.query("commit", []);
    return {
      runId, run: "created", methodologyVersion: METHODOLOGY_VERSION, inputDigest: digest,
      resultsInserted: inserted, byStatus, statements,
    };
  } catch (error) {
    count();
    await sql.query("rollback", []);
    throw error;
  }
}
