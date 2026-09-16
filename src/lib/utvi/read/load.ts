/**
 * Server-only loading of the published UTVI series.
 *
 * Reads only live publications — the ones no supersession points past — and joins each to the
 * retrieval whose `as_of` its citation interpolates, because that timestamp is part of the
 * attribution and not decoration. A point whose source timestamp cannot be resolved does not
 * serve, for the same reason a point whose citation is a paraphrase does not: the licence's
 * single condition is attribution and a partial one does not meet it.
 *
 * Production never falls back to a local database, and an unconfigured deployment serves
 * "no value published" rather than guessing.
 */

import { buildReadModel, type PublicationRow, type UtviReadModel } from "@/lib/utvi/read/read-model";
import type { SettlementState } from "@/lib/utvi/types";
import type { SqlExecutor } from "@/lib/utvi/store";

/**
 * Every live published point, oldest first.
 *
 * The join reaches the retrieval through the calculation's snapshot, which is the lineage the
 * schema already guarantees: a publication has exactly one calculation, a calculation exactly
 * one snapshot, and a snapshot exactly one retrieval.
 */
export async function loadPublications(sql: SqlExecutor): Promise<PublicationRow[]> {
  const { rows } = await sql.query(
    `select p.calculation_date::text             as calculation_date,
            p.value_tokens_per_day::text         as value_tokens_per_day,
            p.settlement_state                   as settlement_state,
            p.revision_number                    as revision_number,
            p.methodology_version                as methodology_version,
            p.universe_descriptor                as universe_descriptor,
            p.source_attribution                 as source_attribution,
            p.published_at                       as published_at,
            r.source_as_of                       as source_as_of
       from pipeline.utvi_publications p
       join pipeline.utvi_calculations c on c.id = p.calculation_id
       join pipeline.utvi_daily_snapshots s on s.id = c.daily_snapshot_id
       join pipeline.utvi_retrievals r on r.id = s.utvi_retrieval_id
      where p.superseded_by_id is null
      order by p.calculation_date`,
    [],
  );

  return rows
    .filter((row) => row.source_as_of !== null)
    .map((row) => ({
      calculationDate: String(row.calculation_date),
      valueTokensPerDay: String(row.value_tokens_per_day),
      settlementState: String(row.settlement_state) as SettlementState,
      revisionNumber: Number(row.revision_number),
      methodologyVersion: String(row.methodology_version),
      universeDescriptor: String(row.universe_descriptor),
      sourceAttribution: String(row.source_attribution),
      publishedAt: new Date(String(row.published_at)).toISOString(),
      sourceAsOf: new Date(String(row.source_as_of)).toISOString(),
    }));
}

/** The read model, or an explicit unavailability. */
export async function loadUtviReadModel(sql: SqlExecutor): Promise<UtviReadModel> {
  return buildReadModel(await loadPublications(sql));
}

/** What the surface serves when no database is configured. Not an error, and not a value. */
export function unconfiguredUtviReadModel(): UtviReadModel {
  return {
    snapshot: null,
    series: [],
    unavailableReason: "no database is configured for this deployment",
  };
}
