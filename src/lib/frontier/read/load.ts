/**
 * Server-only loading of Model Frontier from production.
 *
 * One query does the whole join, and its shape is the methodology in SQL. Three things in it
 * are load bearing:
 *
 * `o.superseded_by_id is null` — a revised result cannot remain the basis of a point. Like
 * Market Share, the frontier is derived at read time from live rows, so a supersession
 * changes the chart on the next request with nothing to invalidate.
 *
 * `left join` on the link and on the price — not inner. An observation with no evidenced
 * identity, or a model with no comparable price, must still arrive so it can be *counted* as
 * an exclusion. An inner join would make the shortfall invisible, which is exactly the
 * failure the exclusion counts exist to prevent.
 *
 * `is not distinct from` on the price selection — because `null` is a real value for context
 * tier and region, meaning "the provider does not tier this", and `=` would silently drop
 * every untiered model.
 */

import type { SqlExecutor } from "@/lib/utvi/store";
import type { JoinableRow } from "@/lib/frontier/read/derive";
import { FRONTIER_BENCHMARKS, type FrontierBenchmarkSlug } from "@/lib/frontier/types";

const SLUGS = FRONTIER_BENCHMARKS.map((benchmark) => benchmark.slug);

export async function loadJoinableRows(sql: SqlExecutor): Promise<JoinableRow[]> {
  const { rows } = await sql.query(
    `select o.benchmark_slug,
            o.source_model_identifier,
            l.source_configuration,
            o.score::float8            as score,
            o.score_min::float8        as score_min,
            o.score_max::float8        as score_max,
            o.capability_as_of::text   as capability_as_of,
            coalesce(l.link_state, 'unmapped') as link_state,
            m.provider_model_id,
            p.slug                     as provider_slug,
            p.name                     as provider_name,
            m.display_name,
            pin.canonical_price_usd_per_1m::float8  as input_price,
            pout.canonical_price_usd_per_1m::float8 as output_price,
            greatest(pin.retrieved_at, pout.retrieved_at)::date::text as price_as_of
       from pipeline.capability_observations o
       left join reference.capability_model_links l
              on l.source_model_identifier = o.source_model_identifier
             and l.source_interface_id = o.source_interface_id
       left join reference.models m
              on m.id = l.model_id and l.link_state = 'evidenced'
       left join reference.providers p on p.id = m.provider_id
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
      order by o.benchmark_slug, o.source_model_identifier`,
    [SLUGS],
  );

  return rows.map((row) => ({
    benchmarkSlug: String(row.benchmark_slug) as FrontierBenchmarkSlug,
    sourceModelIdentifier: String(row.source_model_identifier),
    sourceConfiguration: row.source_configuration === null ? null : String(row.source_configuration),
    score: Number(row.score),
    scoreMin: Number(row.score_min),
    scoreMax: Number(row.score_max),
    capabilityAsOf: String(row.capability_as_of),
    linkState: String(row.link_state),
    providerModelId: row.provider_model_id === null ? null : String(row.provider_model_id),
    providerSlug: row.provider_slug === null ? null : String(row.provider_slug),
    providerName: row.provider_name === null ? null : String(row.provider_name),
    displayName: row.display_name === null ? null : String(row.display_name),
    inputPrice: row.input_price === null ? null : Number(row.input_price),
    outputPrice: row.output_price === null ? null : Number(row.output_price),
    priceAsOf: row.price_as_of === null ? null : String(row.price_as_of),
  }));
}

/** The source citation and licence to render, frozen on the retrieval the rows came from. */
export type FrontierAttribution = { citation: string; license: string; retrievedAt: string };

export async function loadAttribution(sql: SqlExecutor): Promise<FrontierAttribution | null> {
  const { rows } = await sql.query(
    `select r.source_citation, r.source_license, r.retrieved_at
       from pipeline.capability_retrievals r
      where r.outcome = 'succeeded'
      order by r.retrieved_at desc
      limit 1`,
    [],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    citation: String(row.source_citation),
    license: String(row.source_license),
    retrievedAt: new Date(String(row.retrieved_at)).toISOString(),
  };
}

/** Whether the methodology governing Model Frontier is approved. A draft publishes nothing. */
export async function methodologyApproved(sql: SqlExecutor): Promise<{ version: string; approved: boolean } | null> {
  const { rows } = await sql.query(
    `select v.version, v.status
       from reference.methodology_versions v
       join reference.methodologies m on m.id = v.methodology_id
      where m.slug = 'model-frontier'
      order by v.created_at desc
      limit 1`,
    [],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return { version: String(row.version), approved: String(row.status) === "approved" };
}
