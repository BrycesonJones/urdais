/**
 * Loading the public UAVI state from canonical tables.
 *
 * Reads publication-eligible calculations and the publication checks recorded against the most
 * recent attempt. It does not evaluate publication rules — the database already did, and a second
 * implementation of a publication gate is one more than can be kept in agreement with the first.
 *
 * Nothing here has a fallback. If the query returns no published observation, the loader reports
 * no published observation; there is no mock path, no demo path, and no "last known" cache.
 */

import {
  evaluateLifecycle,
  lifecycleCarriesLevel,
  type PublicationCheck,
} from "@/lib/uavi/read/lifecycle";
import {
  UAVI_HORIZON_DAYS,
  UAVI_NAME,
  UAVI_SOURCE_CATEGORIES,
  UAVI_SYMBOL,
  UAVI_UNIT,
  type UaviReadModel,
  type UaviSeriesModel,
  type UaviSeriesPoint,
} from "@/lib/uavi/read/read-model";
import type { UnavailableReason } from "@/lib/uavi/parameters";

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
    // Anything not approved is presented as a draft. A superseded or retired methodology is
    // certainly not something to show a reader as final.
    status: (row && row.status === "approved" ? "approved" : "draft") as "draft" | "approved",
    documentPath,
    name,
  };
}

type PublishedObservation = {
  date: string;
  level: number;
  publishedAt: string;
  coveredParentWeight: number | null;
  coveredIssuerCount: number | null;
  uncoveredIssuerCount: number | null;
  maxConstituentWeight: number | null;
  effectiveIssuerCount: number | null;
};

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The most recent published observations, newest first. Empty where none exist.
 *
 * Only `publication_eligible` rows, which is what makes the change calculation compare against
 * the previous *published* level rather than against an intervening date the gates refused. A
 * blocked or unavailable date is not a level of zero and is not a point on the series.
 */
async function publishedObservations(
  sql: SqlExecutor,
  limit: number,
): Promise<PublishedObservation[]> {
  const { rows } = await sql.query(
    `select calculation_date::text as calculation_date,
            index_level::text     as index_level,
            covered_parent_weight::text   as covered_parent_weight,
            covered_issuer_count,
            uncovered_issuer_count,
            max_renormalized_weight::text as max_renormalized_weight,
            effective_issuer_count::text  as effective_issuer_count,
            created_at
       from pipeline.uavi_calculations
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
    coveredParentWeight: numberOrNull(r.covered_parent_weight),
    coveredIssuerCount: numberOrNull(r.covered_issuer_count),
    uncoveredIssuerCount: numberOrNull(r.uncovered_issuer_count),
    maxConstituentWeight: numberOrNull(r.max_renormalized_weight),
    effectiveIssuerCount: numberOrNull(r.effective_issuer_count),
  }));
}

/** The checks recorded against the most recent calculation attempt, published or not. */
async function latestChecks(sql: SqlExecutor): Promise<PublicationCheck[]> {
  const { rows } = await sql.query(
    `select c.check_name, c.result, c.parameter_key, c.basis
       from pipeline.uavi_publication_checks c
       join pipeline.uavi_calculations k on k.id = c.calculation_id
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

/**
 * The most recent attempt's structured withholding reason, and its coverage if it measured any.
 *
 * This is what separates `unavailable` from `blocked` on the public surface: a gate reason means
 * the arithmetic ran and was refused, and anything else means it never got that far.
 */
async function latestAttempt(sql: SqlExecutor): Promise<{
  unavailableReason: UnavailableReason | null;
  coveredParentWeight: number | null;
  coveredIssuerCount: number | null;
  uncoveredIssuerCount: number | null;
  maxConstituentWeight: number | null;
  effectiveIssuerCount: number | null;
} | null> {
  const { rows } = await sql.query(
    `select unavailable_reason,
            covered_parent_weight::text   as covered_parent_weight,
            covered_issuer_count,
            uncovered_issuer_count,
            max_renormalized_weight::text as max_renormalized_weight,
            effective_issuer_count::text  as effective_issuer_count
       from pipeline.uavi_calculations
      where superseded_by_id is null and state <> 'development'
      order by calculation_date desc
      limit 1`,
    [],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    unavailableReason:
      row.unavailable_reason === null || row.unavailable_reason === undefined
        ? null
        : (String(row.unavailable_reason) as UnavailableReason),
    coveredParentWeight: numberOrNull(row.covered_parent_weight),
    coveredIssuerCount: numberOrNull(row.covered_issuer_count),
    uncoveredIssuerCount: numberOrNull(row.uncovered_issuer_count),
    maxConstituentWeight: numberOrNull(row.max_renormalized_weight),
    effectiveIssuerCount: numberOrNull(row.effective_issuer_count),
  };
}

/** Whether the methodology's publication deadline is an approved parameter in force. */
async function freshnessApproved(sql: SqlExecutor): Promise<boolean> {
  const { rows } = await sql.query(
    `select 1
       from reference.methodology_parameters p
       join reference.methodology_versions mv on mv.id = p.methodology_version_id
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = 'uavi'
        and p.parameter_key = 'publication_deadline'
        and p.status = 'approved'
        and p.effective_from is not null
        and p.effective_from <= current_date
      limit 1`,
    [],
  );
  return rows.length > 0;
}

export async function loadUaviReadModel(sql: SqlExecutor, now?: string): Promise<UaviReadModel> {
  // Sequential, deliberately. These share one pooled client, and issuing a second query while the
  // first is in flight is deprecated in pg and unreliable in practice -- the trap that rendered a
  // healthy database behind an empty surface on the UBWI page.
  const observations = await publishedObservations(sql, 2);
  const checks = await latestChecks(sql);
  const attempt = await latestAttempt(sql);
  const deadlineApproved = await freshnessApproved(sql);
  const methodology = await methodologyRef(
    sql, "uavi", "0.2.0-draft", UAVI_NAME, "/docs/methodology/uavi",
  );
  const parent = await methodologyRef(
    sql, "ai-equity-universe", "0.4.0-draft", "Urdais AI Equity Universe",
    "/docs/methodology/ai-equity-universe",
  );

  const latest = observations[0];
  const previous = observations[1];

  const evaluation = evaluateLifecycle({
    hasPublishedObservation: observations.length > 0,
    latestPublishedAt: latest?.publishedAt ?? null,
    checks,
    latestUnavailableReason: attempt?.unavailableReason ?? null,
    freshnessApproved: deadlineApproved,
    ...(now === undefined ? {} : { now }),
  });

  const carries = lifecycleCarriesLevel(evaluation.lifecycle) && latest !== undefined;

  // A change needs two published observations. With one there is no previous level and therefore
  // no change -- not a change of zero, which renders as a flat day the index never had.
  const change = carries && previous ? latest.level - previous.level : null;
  const changePercent =
    carries && previous && previous.level !== 0 ? (change! / previous.level) * 100 : null;

  // Coverage from the published observation where one exists, and otherwise from the most recent
  // attempt -- because where a gate withheld the headline, the coverage is the explanation.
  const coverageSource = carries ? latest : attempt;

  return {
    symbol: UAVI_SYMBOL,
    name: UAVI_NAME,
    unit: UAVI_UNIT,
    horizonDays: UAVI_HORIZON_DAYS,
    lifecycle: evaluation.lifecycle,
    publicReason: evaluation.publicReason,
    level: carries ? latest.level : null,
    previousLevel: carries && previous ? previous.level : null,
    change,
    changePercent,
    observationDate: carries ? latest.date : null,
    publishedAt: carries ? latest.publishedAt : null,
    coverage: {
      coveredParentWeight: coverageSource?.coveredParentWeight ?? null,
      coveredIssuerCount: coverageSource?.coveredIssuerCount ?? null,
      uncoveredIssuerCount: coverageSource?.uncoveredIssuerCount ?? null,
      maxConstituentWeight: coverageSource?.maxConstituentWeight ?? null,
      effectiveIssuerCount: coverageSource?.effectiveIssuerCount ?? null,
    },
    methodology,
    parentMethodology: parent,
    sources: UAVI_SOURCE_CATEGORIES,
  };
}

export async function loadUaviSeries(sql: SqlExecutor, now?: string): Promise<UaviSeriesModel> {
  const rows = await publishedObservations(sql, 4000);
  const checks = await latestChecks(sql);
  const attempt = await latestAttempt(sql);
  const deadlineApproved = await freshnessApproved(sql);

  const evaluation = evaluateLifecycle({
    hasPublishedObservation: rows.length > 0,
    latestPublishedAt: rows[0]?.publishedAt ?? null,
    checks,
    latestUnavailableReason: attempt?.unavailableReason ?? null,
    freshnessApproved: deadlineApproved,
    ...(now === undefined ? {} : { now }),
  });

  // Ascending for a chart, and only what was actually published. A requested range that predates
  // the series simply has fewer points; nothing is backfilled to make a window look full.
  const points: UaviSeriesPoint[] = rows.map((r) => ({ date: r.date, level: r.level })).reverse();

  return { symbol: UAVI_SYMBOL, lifecycle: evaluation.lifecycle, points };
}

/** The series for a server with no database configured. Empty, and not an error. */
export function unconfiguredUaviSeries(): UaviSeriesModel {
  return { symbol: UAVI_SYMBOL, lifecycle: "not_initialized", points: [] };
}
