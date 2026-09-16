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
 */

import type { ComparisonRow, VolumeRow } from "@/lib/open-weight/derive";
import { blendedPrice } from "@/lib/frontier/price";
import { FRONTIER_BENCHMARKS } from "@/lib/frontier/types";
import type { SqlExecutor } from "@/lib/utvi/store";

const SLUGS = FRONTIER_BENCHMARKS.map((benchmark) => benchmark.slug);
const LABELS = new Map<string, string>(FRONTIER_BENCHMARKS.map((benchmark) => [benchmark.slug, benchmark.label]));

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
 * Capability observations that carry a canonical model, a live class, and a selected price.
 *
 * Inner-joined on the class here, unlike the volume query, and for a different reason: the
 * capability and price panels compare two named classes against each other. A model with no
 * classification has nothing to contribute to "the best open-weight model" or to either
 * median, and counting it as a third slice of a comparison would be meaningless. The
 * production check reports how many observations this drops, so the exclusion is visible
 * rather than silent.
 */
export async function loadComparisonRows(sql: SqlExecutor): Promise<ComparisonRow[]> {
  const { rows } = await sql.query(
    `select o.benchmark_slug,
            o.score::float8            as score,
            l.source_configuration     as configuration,
            o.capability_as_of::text   as capability_as_of,
            m.provider_model_id        as provider_model_id,
            m.display_name             as display_name,
            a.access_class             as access_class,
            pin.canonical_price_usd_per_1m::float8  as input_price,
            pout.canonical_price_usd_per_1m::float8 as output_price,
            greatest(pin.retrieved_at, pout.retrieved_at)::date::text as price_as_of
       from pipeline.capability_observations o
       join reference.capability_model_links l
              on l.source_model_identifier = o.source_model_identifier
             and l.source_interface_id = o.source_interface_id
             and l.link_state = 'evidenced'
       join reference.models m on m.id = l.model_id
       join reference.model_access_classes a
              on a.model_id = m.id and a.superseded_by_id is null
       left join reference.model_price_selections s on s.model_id = m.id
       left join pipeline.token_price_observations pin
              on pin.model_id = m.id
             and pin.pricing_dimension = 'input'
             and pin.service_tier is not distinct from s.service_tier
             and pin.context_tier  is not distinct from s.context_tier
             and pin.region        is not distinct from s.region
       left join pipeline.token_price_observations pout
              on pout.model_id = m.id
             and pout.pricing_dimension = 'output'
             and pout.service_tier is not distinct from s.service_tier
             and pout.context_tier  is not distinct from s.context_tier
             and pout.region        is not distinct from s.region
      where o.superseded_by_id is null
        and o.benchmark_slug = any($1)
        -- A model classified unknown or not_applicable is classified: Urdais established that
        -- it could not establish the answer. It belongs in the volume panel's Unclassified
        -- slice and nowhere in a two-class comparison, so it is excluded here rather than
        -- folded into a third side that would mean nothing.
        and a.access_class not in ('unknown', 'not_applicable')
      order by o.benchmark_slug, m.provider_model_id`,
    [SLUGS],
  );

  return rows.map((row) => {
    const input = row.input_price === null ? null : Number(row.input_price);
    const output = row.output_price === null ? null : Number(row.output_price);
    return {
      benchmarkSlug: String(row.benchmark_slug),
      benchmarkLabel: LABELS.get(String(row.benchmark_slug)) ?? String(row.benchmark_slug),
      score: Number(row.score),
      configuration: row.configuration === null ? null : String(row.configuration),
      capabilityAsOf: String(row.capability_as_of),
      providerModelId: String(row.provider_model_id),
      displayName: String(row.display_name),
      accessClass: String(row.access_class),
      // Model Frontier's own blend function, imported rather than restated: two sections
      // quoting different prices for the same model would be a defect no test would catch if
      // each owned its own arithmetic.
      blendedUsdPer1m: input === null || output === null ? null : blendedPrice(input, output),
      priceAsOf: row.price_as_of === null ? null : String(row.price_as_of),
    };
  });
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
