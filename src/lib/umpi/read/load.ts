/**
 * Loading publishable UMPI rows.
 *
 * The gate is in the query, not in the caller. A row reaches the public model only when it is
 * the current publication for its month, in `published` state, under a methodology version that
 * is approved and in force today. Any one of those failing makes the row invisible, which is the
 * fail-closed behaviour the methodology requires: an unapproved or superseded calculation is not
 * a value that may be shown.
 */

import { loadUmpiFreshness } from "@/lib/umpi/ops/read";
import type { UmpiSqlExecutor } from "../ingest/store";
import type { UmpiSeriesCode } from "../types";
import { buildUmpiReadModel, type PublicationRow, type UmpiReadModel } from "./read-model";

const PUBLISHABLE = `
  select s.series_code,
         to_char(p.reference_month, 'YYYY-MM') as reference_month,
         p.published_level,
         p.mom_change,
         p.mom_withheld_reason,
         p.unit_value_usd_per_kg,
         p.vintage_published_at,
         p.base_label,
         p.attribution_text,
         mv.version as methodology_version,
         to_char(mv.effective_from, 'YYYY-MM-DD') as methodology_effective_from
    from pipeline.umpi_publications p
    join reference.umpi_series s on s.id = p.series_id
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
   where p.superseded_by_id is null
     and p.publication_state = 'published'
     and mv.status = 'approved'
     and mv.effective_from is not null
     and mv.effective_from <= current_date
     and (mv.effective_to is null or mv.effective_to > current_date)
`;

function toRow(row: Record<string, unknown>): PublicationRow {
  const numeric = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
  return {
    seriesCode: String(row.series_code) as UmpiSeriesCode,
    referenceMonth: String(row.reference_month),
    level: Number(row.published_level),
    change: numeric(row.mom_change),
    changeWithheldReason: row.mom_withheld_reason === null ? null : String(row.mom_withheld_reason),
    tradeUnitValueUsdPerKg: numeric(row.unit_value_usd_per_kg),
    publishedAt: new Date(String(row.vintage_published_at)).toISOString(),
    methodologyVersion: String(row.methodology_version),
    methodologyEffectiveFrom: String(row.methodology_effective_from),
    base: String(row.base_label),
    attributionNotice: String(row.attribution_text),
  };
}

export async function loadUmpiPublications(sql: UmpiSqlExecutor): Promise<PublicationRow[]> {
  const { rows } = await sql.query(`${PUBLISHABLE} order by s.series_code, p.reference_month`, []);
  return rows.map(toRow);
}

/**
 * The public model, with freshness attached from the operational record.
 *
 * Freshness is evaluated against the months this model actually carries, rather than re-queried,
 * so the verdict a surface renders always describes the points beside it. Re-reading the
 * published month separately would let the two disagree across a concurrent publication, which
 * is exactly the window in which a wrong freshness claim does the most damage.
 */
export async function loadUmpiReadModel(sql: UmpiSqlExecutor, asOf: Date = new Date()): Promise<UmpiReadModel> {
  const model = buildUmpiReadModel(await loadUmpiPublications(sql));
  const publishedMonths = Object.fromEntries(
    model.series.map((series) => [series.seriesCode, series.latest?.referenceMonth ?? null]),
  );
  const freshness = await loadUmpiFreshness(sql, publishedMonths, asOf);
  return {
    ...model,
    freshness: freshness.family,
    series: model.series.map((series) => ({
      ...series,
      freshness: freshness.series[series.seriesCode] ?? null,
    })),
  };
}

/**
 * One series, for the per-series route.
 *
 * An unknown code is not an empty series: the caller gets null and answers 404, because
 * "you asked for something that does not exist" and "this exists and has no data" are different
 * answers and a client should be able to tell them apart.
 */
export async function loadUmpiSeries(sql: UmpiSqlExecutor, seriesCode: string) {
  const model = await loadUmpiReadModel(sql);
  return model.series.find((series) => series.seriesCode === seriesCode) ?? null;
}

/**
 * The invariant a public read depends on: at most one current publication per series and month.
 *
 * Enforced by a partial unique index, and checked here as well, because a duplicate would make
 * the read silently ambiguous rather than loudly wrong.
 */
export async function currentPublicationConflicts(sql: UmpiSqlExecutor): Promise<string[]> {
  const { rows } = await sql.query(
    `select s.series_code, to_char(p.reference_month, 'YYYY-MM') as reference_month, count(*) as n
       from pipeline.umpi_publications p
       join reference.umpi_series s on s.id = p.series_id
      where p.superseded_by_id is null
      group by 1, 2 having count(*) > 1`,
    [],
  );
  return rows.map((row) => `${String(row.series_code)} ${String(row.reference_month)} has ${String(row.n)} current publications`);
}
