/**
 * Server-only loading of Open-weight vs Proprietary from production.
 *
 * There is no open-weight table. Like Market Share, every number is an aggregation of rows the
 * platform already holds -- UTVI's observations, Epoch's capability scores, Token Price's
 * selections -- and the only thing this phase persists is the *classification*, which is a
 * researched fact about a model rather than a derived statistic. A persisted share would be a
 * derived row that can outlive the observation it came from; a persisted classification is
 * evidence, and is superseded rather than recomputed.
 *
 * Three joins in these queries carry the methodology, and each would be a silent defect if it
 * went the other way:
 *
 * `p.superseded_by_id is null and s.superseded_by_id is null` -- a revised UTVI date changes
 * the window on the next read. The publication is the claim and the snapshot is the evidence;
 * a claim whose evidence was withdrawn cannot back a share.
 *
 * `a.superseded_by_id is null` on the classification -- a model whose weights were published
 * after release has two classification rows, and only the live one may be counted. The earlier
 * one was not wrong, which is why it is still there.
 *
 * `left join` on the link and on the class, never inner. An inner join would make unlinked and
 * unclassified volume vanish from the denominator instead of appearing as the Unclassified
 * slice, which is precisely the failure that turns ignorance into a confident number.
 *
 * Capability and price are not loaded here at all. They come from Model Frontier's own loader,
 * so the Pareto set this section reports is the one the chart draws rather than a second
 * frontier computed over a classified subset.
 */

import { accessKey, type VolumeRow } from "@/lib/open-weight/derive";
import type { SqlExecutor } from "@/lib/utvi/store";

/** Whether the Open-weight methodology version is approved. Nothing publishes under a draft. */
export async function methodologyApproved(
  sql: SqlExecutor,
): Promise<{ version: string; approved: boolean } | null> {
  const { rows } = await sql.query(
    `select v.version, v.status = 'approved' as approved
       from reference.methodology_versions v
       join reference.methodologies m on m.id = v.methodology_id
      where m.slug = 'open-weight-proprietary'
      order by v.created_at desc
      limit 1`,
    [],
  );
  const row = rows[0];
  return row === undefined ? null : { version: String(row.version), approved: Boolean(row.approved) };
}

/**
 * Observations for the trailing window ending at the newest live publication.
 *
 * The window is anchored to the newest *published* date rather than to today, so a day when
 * collection has not yet run shortens nothing and shifts nothing: the window is the last N
 * dates the platform actually published, and the view reports its own first and last date.
 */
export async function loadVolumeRows(sql: SqlExecutor, windowDays: number): Promise<VolumeRow[]> {
  const { rows } = await sql.query(
    `with live as (
       select p.calculation_date as date, s.id as snapshot_id
         from pipeline.utvi_publications p
         join pipeline.utvi_calculations c on c.id = p.calculation_id
         join pipeline.utvi_daily_snapshots s on s.id = c.daily_snapshot_id
        where p.superseded_by_id is null
          and s.superseded_by_id is null
     ),
     window_dates as (
       select date, snapshot_id from live order by date desc limit $1
     )
     select w.date::text                  as date,
            o.source_model_permaslug      as permaslug,
            o.is_residual                 as is_residual,
            o.source_total_tokens::text   as tokens,
            coalesce(l.link_state, 'unmapped') as link_state,
            a.access_class                as access_class,
            m.provider_model_id           as provider_model_id
       from window_dates w
       join pipeline.utvi_model_observations o on o.daily_snapshot_id = w.snapshot_id
       left join reference.utvi_model_links l
              on l.source_model_permaslug = o.source_model_permaslug
       left join reference.models m
              on m.id = l.model_id and l.link_state = 'evidenced'
       left join reference.model_access_classes a
              on a.model_id = m.id and a.superseded_by_id is null
      order by w.date, o.source_model_permaslug`,
    [windowDays],
  );

  return rows.map((row) => ({
    date: String(row.date),
    permaslug: String(row.permaslug),
    isResidual: Boolean(row.is_residual),
    tokens: BigInt(String(row.tokens)),
    linkState: String(row.link_state),
    accessClass: row.access_class === null ? null : String(row.access_class),
    providerModelId: row.provider_model_id === null ? null : String(row.provider_model_id),
  }));
}

/**
 * The live access class of every classified model, keyed by provider and model id.
 *
 * This replaces what used to be a second capability query. Capability and price now come from
 * Model Frontier's own loader and derivation, so the only thing this module still needs from
 * the database is the classification to hang on each point -- which also guarantees the two
 * sections cannot disagree about which configurations are Pareto-efficient, because they are
 * literally the same objects.
 *
 * Unclassified models are absent from the map rather than present with a null, and the
 * derivation treats a miss as Unclassified. That keeps "no row" and "a row saying unknown"
 * folding to the same public bucket without either one needing a special case here.
 */
export async function loadAccessClasses(sql: SqlExecutor): Promise<Map<string, string>> {
  const { rows } = await sql.query(
    `select p.slug as provider_slug, m.provider_model_id, a.access_class
       from reference.model_access_classes a
       join reference.models m on m.id = a.model_id
       join reference.providers p on p.id = m.provider_id
      where a.superseded_by_id is null`,
    [],
  );
  return new Map(
    rows.map((row) => [accessKey(String(row.provider_slug), String(row.provider_model_id)), String(row.access_class)]),
  );
}

/** How many classifications are live, by class. For the production check, not the page. */
export async function loadClassificationCensus(sql: SqlExecutor): Promise<{ accessClass: string; count: number }[]> {
  const { rows } = await sql.query(
    `select access_class, count(*)::int as count
       from reference.model_access_classes
      where superseded_by_id is null
      group by access_class
      order by access_class`,
    [],
  );
  return rows.map((row) => ({ accessClass: String(row.access_class), count: Number(row.count) }));
}
