/**
 * Loading the public UGAI state from canonical tables.
 *
 * Reads only what Phase 5.7 froze: publication-eligible calculations and the publication checks
 * recorded against the most recent attempt. It does not evaluate publication rules — the database
 * already did, and a second implementation of a publication gate is one more than can be kept in
 * agreement with the first.
 *
 * Nothing here has a fallback. If the query returns no published observation, the loader reports
 * no published observation; there is no mock path, no demo path, and no "last known" cache to
 * serve instead.
 */

import {
  evaluateLifecycle,
  lifecycleCarriesLevel,
  type PublicationCheck,
} from "@/lib/ugai/read/lifecycle";
import {
  UGAI_BASE_LEVEL,
  UGAI_NAME,
  UGAI_SOURCE_CATEGORIES,
  UGAI_SYMBOL,
  UGAI_UNIT,
  type UgaiReadModel,
  type UgaiSeriesModel,
  type UgaiSeriesPoint,
} from "@/lib/ugai/read/read-model";

export interface SqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

async function methodologyRef(
  sql: SqlExecutor,
  slug: string,
  fallbackVersion: string,
  name: string,
  documentPath: string,
) {
  const { rows } = await sql.query(
    `select mv.version, mv.status
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1
      order by mv.created_at desc
      limit 1`,
    [slug],
  );
  const row = rows[0];
  return {
    version: row ? String(row.version) : fallbackVersion,
    // Anything that is not approved is presented as a draft. A methodology that has been
    // superseded or retired is certainly not something to show a reader as final.
    status: (row && row.status === "approved" ? "approved" : "draft") as "draft" | "approved",
    documentPath,
    name,
  };
}

/** The two most recent published observations, newest first. Empty where none exist. */
async function publishedObservations(sql: SqlExecutor, limit: number) {
  const { rows } = await sql.query(
    `select calculation_date::text as calculation_date,
            index_level::text as index_level,
            created_at
       from pipeline.ugai_calculations
      where state = 'publication_eligible'
        and superseded_by_id is null
        and index_level is not null
      order by calculation_date desc
      limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    date: String(r.calculation_date),
    level: Number(r.index_level),
    publishedAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

async function latestChecks(sql: SqlExecutor): Promise<PublicationCheck[]> {
  const { rows } = await sql.query(
    `select c.check_name, c.result, c.parameter_key, c.basis
       from pipeline.ugai_publication_checks c
       join pipeline.ugai_calculations k on k.id = c.calculation_id
      where k.superseded_by_id is null
      order by k.calculation_date desc, c.check_name`,
    [],
  );
  return rows.map((r) => ({
    checkName: String(r.check_name),
    result: String(r.result) as PublicationCheck["result"],
    parameterKey: r.parameter_key === null ? null : String(r.parameter_key),
    basis: String(r.basis),
  }));
}

/** Whether the methodology's stale-input tolerance is an approved parameter in force. */
async function staleToleranceApproved(sql: SqlExecutor): Promise<boolean> {
  const { rows } = await sql.query(
    `select 1 from reference.methodology_parameters
      where parameter_key = 'stale_input_tolerance'
        and status = 'approved'
        and effective_from is not null
        and effective_from <= current_date
      limit 1`,
    [],
  );
  return rows.length > 0;
}

export async function loadUgaiReadModel(sql: SqlExecutor, now?: string): Promise<UgaiReadModel> {
  // Sequential, deliberately. These share one pooled client, and issuing a second query while
  // the first is in flight is deprecated in pg and unreliable in practice -- the same trap the
  // UBWI page documents, where concurrent loaders tore the pool out from under each other and
  // rendered as a healthy database behind an empty surface.
  const observations = await publishedObservations(sql, 2);
  const checks = await latestChecks(sql);
  const toleranceApproved = await staleToleranceApproved(sql);
  const methodology = await methodologyRef(
    sql, "ugai", "0.2.0-draft", "Urdais Global AI Index", "/docs/methodology/ugai",
  );
  const parent = await methodologyRef(
    sql, "ai-equity-universe", "0.4.0-draft", "Urdais AI Equity Universe",
    "/docs/methodology/ai-equity-universe",
  );

  const latest = observations[0];
  const previous = observations[1];

  const evaluation = evaluateLifecycle({
    hasBaseObservation: observations.length > 0,
    latestPublishedAt: latest?.publishedAt ?? null,
    checks,
    staleToleranceApproved: toleranceApproved,
    ...(now === undefined ? {} : { now }),
  });

  const carries = lifecycleCarriesLevel(evaluation.lifecycle) && latest !== undefined;

  // A change needs two observations. With one, there is no previous level and therefore no
  // change -- not a change of zero, which would render as a flat day the index never had.
  const change = carries && previous ? latest.level - previous.level : null;
  const changePercent =
    carries && previous && previous.level !== 0 ? (change! / previous.level) * 100 : null;

  return {
    symbol: UGAI_SYMBOL,
    name: UGAI_NAME,
    unit: UGAI_UNIT,
    baseLevel: UGAI_BASE_LEVEL,
    lifecycle: evaluation.lifecycle,
    publicReason: evaluation.publicReason,
    level: carries ? latest.level : null,
    previousLevel: carries && previous ? previous.level : null,
    change,
    changePercent,
    observationDate: carries ? latest.date : null,
    publishedAt: carries ? latest.publishedAt : null,
    methodology,
    parentMethodology: parent,
    sources: UGAI_SOURCE_CATEGORIES,
  };
}

export async function loadUgaiSeries(sql: SqlExecutor, now?: string): Promise<UgaiSeriesModel> {
  // Sequential for the same reason as above.
  const rows = await publishedObservations(sql, 4000);
  const checks = await latestChecks(sql);
  const toleranceApproved = await staleToleranceApproved(sql);
  const evaluation = evaluateLifecycle({
    hasBaseObservation: rows.length > 0,
    latestPublishedAt: rows[0]?.publishedAt ?? null,
    checks,
    staleToleranceApproved: toleranceApproved,
    ...(now === undefined ? {} : { now }),
  });

  // Ascending for a chart, and only what was actually published. A requested range that predates
  // the series simply has fewer points; nothing is backfilled to make a window look full.
  const points: UgaiSeriesPoint[] = rows
    .map((r) => ({ date: r.date, level: r.level }))
    .reverse();

  return { symbol: UGAI_SYMBOL, lifecycle: evaluation.lifecycle, points };
}

/** The series for a server with no database configured. Empty, and not an error. */
export function unconfiguredUgaiSeries(): UgaiSeriesModel {
  return { symbol: UGAI_SYMBOL, lifecycle: "not_initialized", points: [] };
}
