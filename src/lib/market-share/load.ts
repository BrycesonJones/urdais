/**
 * Server-only loading of Market Share from UTVI's production tables.
 *
 * There is no Market Share table, and the absence is the design. Shares are aggregations of
 * rows UTVI already holds, the newest date is fifty-one of those rows, and the whole history is
 * thirty-one thousand — a query that plans in under a millisecond against an index Postgres
 * already maintains. Persisting a second copy would buy nothing and would introduce the one
 * failure mode this product cannot afford: a derived row that outlives the observation it was
 * derived from.
 *
 * That is also how revision is handled, structurally rather than by procedure. Every query here
 * joins through `superseded_by_id is null` on both the publication and the snapshot, so a
 * revised UTVI date changes what Market Share returns on its next read, with nothing to
 * invalidate and nothing that can go stale. A superseded snapshot cannot be the basis of a
 * share because it cannot be reached.
 *
 * Lineage travels with the numbers: each derivation names the publication, calculation and
 * snapshot it came from, so a share on the page can be traced to the exact evidence UTVI
 * published for that date.
 */

import { checkDerivation } from "@/lib/market-share/checks";
import { deriveMarketShare } from "@/lib/market-share/derive";
import {
  type MarketShareDerivation,
  type ShareCheckFailure,
  type ShareObservation,
} from "@/lib/market-share/types";
import type { SqlExecutor } from "@/lib/utvi/store";
import type { LabAttributionState, SettlementState } from "@/lib/utvi/types";

/** The active UTVI lineage behind one date's shares. */
export type ShareLineage = {
  date: string;
  publicationId: string;
  calculationId: string;
  snapshotId: string;
  revisionNumber: number;
  methodologyVersion: string;
  universeDescriptor: string;
  sourceAttribution: string;
  publishedAt: string;
  sourceAsOf: string | null;
  settlementState: SettlementState;
  totalObservedTokens: bigint;
};

/** One date's shares plus the lineage they were derived through. */
export type DatedShare = {
  derivation: MarketShareDerivation;
  lineage: ShareLineage;
  /** Empty when the date's persisted observations account for its published total. */
  failures: ShareCheckFailure[];
};

/**
 * Whether a date may be served.
 *
 * The gate exists because a UTVI snapshot's aggregates and its child observation rows are
 * separate facts, and production proved they can disagree: 2025-09-16 carried sixteen of its
 * fifty-one rows beneath a snapshot whose totals were computed from all fifty-one. UTVI's own
 * value was unaffected, because UTVI reads the aggregates — but Market Share reads the rows,
 * and rows that do not account for the denominator produce a table where every figure looks
 * reasonable and all of them are wrong.
 *
 * So a share is usable only if its decomposition closes. This is enforced here rather than left
 * to each caller, so there is no path to a rendered share that skipped the check.
 */
export function usableForMarketShare(share: DatedShare): boolean {
  return share.failures.length === 0;
}

/**
 * Live publications only, joined to the live snapshot behind each.
 *
 * A publication whose snapshot has been superseded is excluded rather than served from the
 * stale snapshot: the publication is the claim, the snapshot is the evidence, and a claim whose
 * evidence has been withdrawn is not a basis for a derived statistic.
 */
const LINEAGE_COLUMNS = `
  p.id                          as publication_id,
  c.id                          as calculation_id,
  s.id                          as snapshot_id,
  p.calculation_date::text      as date,
  p.value_tokens_per_day::text  as total_observed_tokens,
  p.settlement_state            as settlement_state,
  p.revision_number             as revision_number,
  p.methodology_version         as methodology_version,
  p.universe_descriptor         as universe_descriptor,
  p.source_attribution          as source_attribution,
  p.published_at                as published_at,
  r.source_as_of                as source_as_of
`;

const LINEAGE_FROM = `
  from pipeline.utvi_publications p
  join pipeline.utvi_calculations c on c.id = p.calculation_id
  join pipeline.utvi_daily_snapshots s on s.id = c.daily_snapshot_id
  join pipeline.utvi_retrievals r on r.id = s.utvi_retrieval_id
 where p.superseded_by_id is null
   and s.superseded_by_id is null
`;

function toLineage(row: Record<string, unknown>): ShareLineage {
  return {
    date: String(row.date),
    publicationId: String(row.publication_id),
    calculationId: String(row.calculation_id),
    snapshotId: String(row.snapshot_id),
    revisionNumber: Number(row.revision_number),
    methodologyVersion: String(row.methodology_version),
    universeDescriptor: String(row.universe_descriptor),
    sourceAttribution: String(row.source_attribution),
    publishedAt: new Date(String(row.published_at)).toISOString(),
    sourceAsOf: row.source_as_of === null ? null : new Date(String(row.source_as_of)).toISOString(),
    settlementState: String(row.settlement_state) as SettlementState,
    totalObservedTokens: BigInt(String(row.total_observed_tokens)),
  };
}

/** Every observation behind one snapshot, with its lab resolved to canonical reference data. */
export async function loadObservations(
  sql: SqlExecutor,
  snapshotId: string,
): Promise<ShareObservation[]> {
  const { rows } = await sql.query(
    `select o.source_model_permaslug   as permaslug,
            o.source_namespace         as namespace,
            o.is_residual              as is_residual,
            o.source_total_tokens::text as tokens,
            o.lab_attribution_state    as lab_attribution_state,
            o.quality_flags            as quality_flags,
            pr.slug                    as lab_slug,
            pr.name                    as lab_name
       from pipeline.utvi_model_observations o
       left join reference.providers pr on pr.id = o.lab_provider_id
      where o.daily_snapshot_id = $1`,
    [snapshotId],
  );

  return rows.map((row) => ({
    permaslug: String(row.permaslug),
    namespace: row.namespace === null ? null : String(row.namespace),
    isResidual: Boolean(row.is_residual),
    tokens: BigInt(String(row.tokens)),
    labSlug: row.lab_slug === null ? null : String(row.lab_slug),
    labName: row.lab_name === null ? null : String(row.lab_name),
    labAttributionState: String(row.lab_attribution_state) as LabAttributionState,
    qualityFlags: Array.isArray(row.quality_flags) ? (row.quality_flags as string[]) : [],
  }));
}

/** The most recent published date's shares, or null when nothing is published. */
export async function loadLatestShare(sql: SqlExecutor): Promise<DatedShare | null> {
  const { rows } = await sql.query(
    `select ${LINEAGE_COLUMNS} ${LINEAGE_FROM} order by p.calculation_date desc limit 1`,
    [],
  );
  const row = rows[0];
  if (row === undefined) return null;

  const lineage = toLineage(row);
  const share = await deriveFor(sql, lineage);
  // A date that does not reconcile is not served at all. Returning it with a flag would put the
  // decision in every caller, and one of them would eventually get it wrong.
  return usableForMarketShare(share) ? share : null;
}

/** Derive one date and check it, in the one place both loaders go through. */
async function deriveFor(sql: SqlExecutor, lineage: ShareLineage): Promise<DatedShare> {
  const observations = await loadObservations(sql, lineage.snapshotId);
  const derivation = deriveMarketShare(
    lineage.date,
    lineage.settlementState,
    lineage.totalObservedTokens,
    observations,
  );
  return { derivation, lineage, failures: checkDerivation(derivation) };
}

/**
 * Every published date's shares, oldest first.
 *
 * For the production report and the reconciliation sweep rather than for the page. A date the
 * source never covered is simply absent — there is no publication for it, so there is no share
 * point, and nothing here fills, interpolates or zeroes the gap.
 */
export async function loadAllShares(sql: SqlExecutor): Promise<DatedShare[]> {
  const { rows } = await sql.query(
    `select ${LINEAGE_COLUMNS} ${LINEAGE_FROM} order by p.calculation_date`,
    [],
  );

  // Every date, checked but not filtered: the report's job is to name what is wrong, and a
  // sweep that silently dropped the failing dates would report a clean series for ever.
  const shares: DatedShare[] = [];
  for (const row of rows) shares.push(await deriveFor(sql, toLineage(row)));
  return shares;
}
