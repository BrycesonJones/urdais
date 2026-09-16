/**
 * Persistence for UTVI. Every write goes through here, and every one of them is append-only
 * or a supersession — nothing in this module edits a value in place.
 *
 * The idempotency rule is the interesting part, and it is decided by content rather than by
 * time. A re-read of a date that returns the same rows is a *confirmation*: the retrieval is
 * recorded, because Urdais did look again and that is worth knowing, and no new snapshot is
 * created because nothing about the date changed. A re-read that returns different rows is a
 * *revision*: a new snapshot is inserted and the previous one is marked superseded, so the
 * old value remains readable and auditable while the live value moves.
 *
 * What decides which of those happened is `date_content_hash`. It is not `meta.as_of`, which
 * Phase 1A measured changing on every request whether the data moved or not — keying
 * supersession on that would manufacture a revision every time anyone looked.
 */

import { randomUUID } from "node:crypto";

import { renderCitation } from "@/lib/utvi/attribution";
import {
  UTVI_SERVING_PLATFORM_SLUG,
  UTVI_SOURCE_SLUG,
  UtviContractError,
  type DailySnapshot,
  type RetrievalResult,
  type SettlementState,
  type UtviCalculation,
} from "@/lib/utvi/types";

export interface SqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Identifiers resolved from the database at run time, never hardcoded. */
export type UtviLineage = {
  instrumentId: string;
  instrumentSpecVersionId: string;
  methodologyVersionId: string;
  methodologyVersion: string;
  methodologyStatus: string;
  sourceInterfaceId: string;
  permissionGrantId: string;
  servingPlatformId: string;
  /** Lab provider slug to id, for the namespaces Urdais has evidence for. */
  labProviderIds: Map<string, string>;
};

const one = (rows: Record<string, unknown>[], what: string): Record<string, unknown> => {
  const row = rows[0];
  if (row === undefined) throw new UtviContractError(`${what} is not present in the database`);
  return row;
};

/**
 * Resolve everything the pipeline needs by lookup.
 *
 * A promotion that changes which methodology version is approved therefore changes what the
 * job may publish, with no code change and no possibility of the two disagreeing.
 */
export async function resolveLineage(sql: SqlExecutor): Promise<UtviLineage> {
  const instrument = one(
    (
      await sql.query(
        `select i.id as instrument_id, sv.id as spec_version_id, mv.id as methodology_version_id,
                mv.version as methodology_version, mv.status as methodology_status
           from reference.instruments i
           join reference.instrument_spec_versions sv on sv.instrument_id = i.id
           join reference.methodology_versions mv on mv.id = sv.methodology_version_id
          where i.symbol = $1
          order by sv.created_at desc
          limit 1`,
        ["UTVI"],
      )
    ).rows,
    "the UTVI instrument and its specification version",
  );

  const iface = one(
    (
      await sql.query(
        `select si.id as source_interface_id, si.provider_id,
                (select pg.id from reference.permission_grants pg
                  where pg.source_interface_id = si.id
                    and pg.covers_collection and pg.covers_index_use
                  order by pg.effective_from desc limit 1) as permission_grant_id
           from reference.source_interfaces si
          where si.slug = $1`,
        [UTVI_SOURCE_SLUG],
      )
    ).rows,
    `the source interface '${UTVI_SOURCE_SLUG}'`,
  );
  if (iface.permission_grant_id === null) {
    throw new UtviContractError(
      `${UTVI_SOURCE_SLUG} has no permission grant covering both collection and index use; no production retrieval may be recorded`,
    );
  }

  const platform = one(
    (await sql.query(`select id from reference.providers where slug = $1`, [UTVI_SERVING_PLATFORM_SLUG])).rows,
    `the serving platform provider '${UTVI_SERVING_PLATFORM_SLUG}'`,
  );

  const labs = await sql.query(`select slug, id from reference.providers`, []);
  const labProviderIds = new Map<string, string>();
  for (const row of labs.rows) labProviderIds.set(String(row.slug), String(row.id));

  return {
    instrumentId: String(instrument.instrument_id),
    instrumentSpecVersionId: String(instrument.spec_version_id),
    methodologyVersionId: String(instrument.methodology_version_id),
    methodologyVersion: String(instrument.methodology_version),
    methodologyStatus: String(instrument.methodology_status),
    sourceInterfaceId: String(iface.source_interface_id),
    permissionGrantId: String(iface.permission_grant_id),
    servingPlatformId: String(platform.id),
    labProviderIds,
  };
}

/**
 * A deterministic key for one read of one window.
 *
 * Built from the *requested* window plus the retrieval time to the second, so a deliberate
 * re-read is a new retrieval rather than a rejected duplicate. Deduplication of *content*
 * happens at the snapshot layer, where it belongs: two reads that returned the same rows are
 * two real observations of the same fact, and both are worth recording.
 */
export function retrievalIdempotencyKey(result: RetrievalResult): string {
  return [
    UTVI_SOURCE_SLUG,
    result.requestedStartDate,
    result.requestedEndDate,
    "day",
    result.retrievedAt,
  ].join("|");
}

export type RecordedRetrieval = { utviRetrievalId: string; sourceRetrievalId: string };

/** Record one read, successful or not. A failure is a fact; an unrecorded failure is a gap. */
export async function recordRetrieval(
  sql: SqlExecutor,
  lineage: UtviLineage,
  result: RetrievalResult,
  collectorIdentity: string,
): Promise<RecordedRetrieval> {
  const inserted = one(
    (
      await sql.query(
        `insert into pipeline.source_retrievals (
           source_interface_id, idempotency_key, requested_at, completed_at, request_method,
           request_url, request_parameters, response_status, response_content_type,
           response_hash, response_byte_length, record_count, enumeration_assessment,
           enumeration_evidence, collector_identity, retrieval_purpose, permission_grant_id,
           error
         ) values ($1,$2,$3,$3,'GET',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'production',$14,$15)
         returning id`,
        [
          lineage.sourceInterfaceId,
          retrievalIdempotencyKey(result),
          result.retrievedAt,
          result.requestUrl,
          JSON.stringify(result.requestParameters),
          result.httpStatus,
          result.outcome === "succeeded" ? "application/json" : null,
          result.responseHash,
          result.responseByteLength,
          result.rowCount,
          // The source states the tail row sums everything outside the top 50, so a
          // successful daily read enumerates the population. It is not independently
          // verifiable against a figure the API supplies, and that is recorded as the
          // evidence rather than asserted as a proof.
          result.outcome === "succeeded" ? "complete" : "unknown",
          result.outcome === "succeeded"
            ? "Top 50 named rows plus the reserved aggregate tail row, which the source documents as summing every model outside that top 50. No separate platform total is returned."
            : null,
          collectorIdentity,
          lineage.permissionGrantId,
          result.outcome === "succeeded" ? null : JSON.stringify({ outcome: result.outcome, detail: result.outcomeDetail }),
        ],
      )
    ).rows,
    "the inserted source retrieval",
  );

  const utvi = one(
    (
      await sql.query(
        `insert into pipeline.utvi_retrievals (
           source_retrieval_id, source_interface_id, requested_start_date, requested_end_date,
           actual_start_date, actual_end_date, source_as_of, dataset_version, retrieved_at,
           row_count, outcome, outcome_detail
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning id`,
        [
          inserted.id,
          lineage.sourceInterfaceId,
          result.requestedStartDate,
          result.requestedEndDate,
          result.actualStartDate,
          result.actualEndDate,
          result.sourceAsOf,
          result.datasetVersion,
          result.retrievedAt,
          result.rowCount,
          result.outcome,
          result.outcomeDetail,
        ],
      )
    ).rows,
    "the inserted UTVI retrieval",
  );

  return { utviRetrievalId: String(utvi.id), sourceRetrievalId: String(inserted.id) };
}

export type ActiveSnapshot = {
  id: string;
  observationDate: string;
  coverageState: string;
  dateContentHash: string | null;
  settlementState: SettlementState;
  totalTokens: bigint | null;
  /**
   * What is actually persisted beneath the snapshot, as distinct from what it claims.
   *
   * A snapshot row records aggregates and a content hash computed from the source rows. Its
   * child observations are a separate write, and before the transaction fix below they could
   * be absent or incomplete while the parent row still read as complete and correct. So the
   * count and the sum are read here, and `representationComplete` compares them against the
   * claim rather than trusting it.
   */
  persistedRowCount: number;
  persistedTokenSum: bigint;
};

/**
 * Whether a snapshot's persisted observations actually account for what the snapshot claims.
 *
 * The invariant: the rows beneath a snapshot must sum exactly to its total, and there must be
 * one row per named model plus at most one residual. Exact, not tolerant — these are integers
 * copied from the same source rows, so any difference at all is a defect rather than rounding.
 *
 * This is the check that would have caught the 2025-09-16 defect at the moment the backfill
 * resumed, instead of eleven months of history later when something finally read the rows.
 */
export function representationComplete(snapshot: ActiveSnapshot): boolean {
  if (snapshot.coverageState !== "covered_observed") return snapshot.persistedRowCount === 0;
  if (snapshot.totalTokens === null) return false;
  return snapshot.persistedTokenSum === snapshot.totalTokens && snapshot.persistedRowCount > 0;
}

export async function activeSnapshot(sql: SqlExecutor, observationDate: string): Promise<ActiveSnapshot | null> {
  const { rows } = await sql.query(
    `select s.id, s.observation_date::text as observation_date, s.coverage_state,
            s.date_content_hash, s.settlement_state, s.total_tokens::text as total_tokens,
            (select count(*) from pipeline.utvi_model_observations o
              where o.daily_snapshot_id = s.id) as persisted_row_count,
            coalesce((select sum(o.source_total_tokens) from pipeline.utvi_model_observations o
                       where o.daily_snapshot_id = s.id), 0)::text as persisted_token_sum
       from pipeline.utvi_daily_snapshots s
      where s.observation_date = $1 and s.superseded_by_id is null`,
    [observationDate],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: String(row.id),
    observationDate: String(row.observation_date),
    coverageState: String(row.coverage_state),
    dateContentHash: row.date_content_hash === null ? null : String(row.date_content_hash),
    settlementState: String(row.settlement_state) as SettlementState,
    totalTokens: row.total_tokens === null ? null : BigInt(String(row.total_tokens)),
    persistedRowCount: Number(row.persisted_row_count),
    persistedTokenSum: BigInt(String(row.persisted_token_sum)),
  };
}

/** What happened to one date when a snapshot was applied. */
export type SnapshotOutcome =
  /** No snapshot existed for the date. */
  | { kind: "created"; snapshotId: string }
  /**
   * The content was unchanged but what had been persisted for it was incomplete, and the
   * complete representation replaced it. Not a revision: the source did not move, the value
   * does not change, and the supersession records a repair of Urdais's own storage.
   */
  | { kind: "repaired"; snapshotId: string; supersededId: string; recoveredRowCount: number }
  /** The same rows came back. The retrieval is recorded; the date did not change. */
  | { kind: "confirmed"; snapshotId: string }
  /** Different rows came back. A new snapshot supersedes the previous one. */
  | { kind: "revised"; snapshotId: string; supersededId: string; previousTotal: bigint | null }
  /** The same rows, and the date has now settled. */
  | { kind: "settled"; snapshotId: string }
  /** The date carried no rows, so there is nothing to record beyond the retrieval. */
  | { kind: "no_rows" };

/**
 * Apply one date's snapshot.
 *
 * A date with no rows writes no snapshot at all. The retrieval already records that Urdais
 * looked; writing a row with a null total would add nothing, and writing one with a zero
 * total would be the exact failure this design exists to prevent.
 */
export async function applySnapshot(
  sql: SqlExecutor,
  lineage: UtviLineage,
  utviRetrievalId: string,
  snapshot: DailySnapshot,
  sourceAsOf: string,
): Promise<SnapshotOutcome> {
  if (snapshot.coverageState !== "covered_observed") return { kind: "no_rows" };
  if (snapshot.dateContentHash === null) {
    throw new UtviContractError(`${snapshot.observationDate}: an observed snapshot must carry a content hash`);
  }

  const existing = await activeSnapshot(sql, snapshot.observationDate);

  if (existing !== null && existing.dateContentHash === snapshot.dateContentHash) {
    // Identical content -- but identical content is a statement about the *source*, and it says
    // nothing about whether Urdais actually stored the rows. Measured on 2025-09-16: a backfill
    // was interrupted partway through writing one date's observations, the snapshot row and its
    // aggregates survived intact, and the resumed run took this branch and confirmed a date
    // whose child rows were two thirds missing. The hash matched, because the hash is computed
    // from the source response and the source had not changed.
    //
    // So the representation is verified before it is confirmed, and a defective one is repaired
    // rather than blessed.
    if (!representationComplete(existing)) {
      return await repairRepresentation(sql, lineage, utviRetrievalId, snapshot, sourceAsOf, existing);
    }
    // If the date has since settled, record that and nothing else; the arithmetic is untouched
    // and the trigger enforces that it stays untouched.
    if (existing.settlementState === "provisional" && snapshot.settlementState === "final") {
      await sql.query(
        `update pipeline.utvi_daily_snapshots set settlement_state = 'final' where id = $1`,
        [existing.id],
      );
      return { kind: "settled", snapshotId: existing.id };
    }
    return { kind: "confirmed", snapshotId: existing.id };
  }

  if (existing === null) {
    // One transaction, for the same reason the revision path below takes one: the snapshot row
    // and its observations are two statements, and a crash between them leaves a snapshot
    // claiming rows that are not there. That is not hypothetical -- it is exactly what happened
    // to 2025-09-16 during the production backfill, and nothing noticed for eleven months
    // because nothing read the child rows until Market Share did.
    let insertedId: string;
    await sql.query("begin", []);
    try {
      insertedId = await insertSnapshot(sql, lineage, utviRetrievalId, snapshot, sourceAsOf, randomUUID());
      await sql.query("commit", []);
    } catch (error) {
      await sql.query("rollback", []);
      throw error;
    }
    return { kind: "created", snapshotId: insertedId };
  }

  // A revision, and the order of these two writes is not a matter of taste.
  //
  // One live snapshot per date is enforced by a partial unique index, and a unique index is
  // checked the instant a row is inserted. Inserting the new snapshot before superseding the
  // old one therefore puts two live rows on the date for an instant and is rejected — which is
  // the index doing exactly its job.
  //
  // So the old row is superseded first, pointing at an id that does not exist yet. That is
  // permitted because the self-reference is `deferrable initially deferred` and is checked at
  // commit, by which time the row it names exists. Both writes must be in one transaction for
  // that to hold, which is why this path takes one.
  const newId = randomUUID();
  const reason = `source revised ${snapshot.observationDate}: content hash ${existing.dateContentHash?.slice(0, 12) ?? "none"} became ${snapshot.dateContentHash.slice(0, 12)}`;

  await sql.query("begin", []);
  try {
    await sql.query(
      `update pipeline.utvi_daily_snapshots
          set superseded_by_id = $2, superseded_at = now(), supersession_reason = $3
        where id = $1`,
      [existing.id, newId, reason],
    );
    await insertSnapshot(sql, lineage, utviRetrievalId, snapshot, sourceAsOf, newId);
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }

  return {
    kind: "revised",
    snapshotId: newId,
    supersededId: existing.id,
    previousTotal: existing.totalTokens,
  };
}

/**
 * Replace a defective persisted representation with a complete one.
 *
 * Reached only when the source content hash is *identical* to what is stored and the rows
 * beneath it do not account for the snapshot's own total. That combination means one thing and
 * cannot mean anything else: the source did not move, and Urdais failed to write what it saw.
 *
 * It is a supersession rather than an in-place fill, and the distinction matters for audit. The
 * defective snapshot is not deleted or edited -- it stays, marked superseded, with its 16 rows
 * and its reason, so the repair is visible in the history rather than erasing the evidence that
 * it was needed. The replacement carries the same date, the same aggregates, the same content
 * hash and the same settlement state, because none of those was wrong; only the child rows
 * were missing.
 *
 * It is deliberately *not* called a revision. A revision means the source changed and the
 * published value may move. Here the value is arithmetically identical and any republication
 * restates the same number -- the thing that changed is Urdais's storage of the evidence.
 *
 * Nothing is synthesised. Every row written here comes from a live retrieval whose bytes hashed
 * to the stored hash; a caller that cannot show that never reaches this function.
 */
async function repairRepresentation(
  sql: SqlExecutor,
  lineage: UtviLineage,
  utviRetrievalId: string,
  snapshot: DailySnapshot,
  sourceAsOf: string,
  existing: ActiveSnapshot,
): Promise<SnapshotOutcome> {
  if (snapshot.dateContentHash === null) {
    throw new UtviContractError(`${snapshot.observationDate}: cannot repair against a snapshot with no content hash`);
  }
  if (existing.dateContentHash !== snapshot.dateContentHash) {
    // Belt and braces: the caller already checked, and if that ever stops being true this is a
    // revision and must go down the revision path, not this one.
    throw new UtviContractError(
      `${snapshot.observationDate}: repair requires an identical content hash; stored ${existing.dateContentHash}, live ${snapshot.dateContentHash}`,
    );
  }
  if (snapshot.totalTokens !== existing.totalTokens) {
    throw new UtviContractError(
      `${snapshot.observationDate}: content hash matches but totals differ (${existing.totalTokens} stored, ${snapshot.totalTokens} live); refusing to repair`,
    );
  }

  const newId = randomUUID();
  const reason =
    `repaired defective persisted representation of ${snapshot.observationDate}: ` +
    `${existing.persistedRowCount} observation row(s) persisted summing to ${existing.persistedTokenSum}, ` +
    `against a snapshot total of ${existing.totalTokens}. Source content hash unchanged ` +
    `(${snapshot.dateContentHash.slice(0, 12)}); no value is revised.`;

  // The same ordering constraint as a revision, and for the same reason: one live snapshot per
  // date is a partial unique index, so the old row is superseded first, naming an id that does
  // not exist yet, which the deferred self-reference permits until commit.
  await sql.query("begin", []);
  try {
    await sql.query(
      `update pipeline.utvi_daily_snapshots
          set superseded_by_id = $2, superseded_at = now(), supersession_reason = $3
        where id = $1`,
      [existing.id, newId, reason],
    );
    await insertSnapshot(sql, lineage, utviRetrievalId, snapshot, sourceAsOf, newId);
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }

  return {
    kind: "repaired",
    snapshotId: newId,
    supersededId: existing.id,
    recoveredRowCount: snapshot.observations.length - existing.persistedRowCount,
  };
}

async function insertSnapshot(
  sql: SqlExecutor,
  lineage: UtviLineage,
  utviRetrievalId: string,
  snapshot: DailySnapshot,
  sourceAsOf: string,
  id: string,
): Promise<string> {
  const inserted = one(
    (
      await sql.query(
        `insert into pipeline.utvi_daily_snapshots (
           id, utvi_retrieval_id, source_interface_id, observation_date, coverage_state,
           total_tokens, attributed_tokens, residual_tokens, named_row_count,
           residual_row_present, date_content_hash, settlement_state, observed_at
         ) values ($13,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning id`,
        [
          utviRetrievalId,
          lineage.sourceInterfaceId,
          snapshot.observationDate,
          snapshot.coverageState,
          snapshot.totalTokens?.toString() ?? null,
          snapshot.attributedTokens?.toString() ?? null,
          snapshot.residualTokens?.toString() ?? null,
          snapshot.namedRowCount,
          snapshot.residualRowPresent,
          snapshot.dateContentHash,
          snapshot.settlementState,
          sourceAsOf,
          id,
        ],
      )
    ).rows,
    "the inserted daily snapshot",
  );
  const snapshotId = String(inserted.id);

  // The required citation, rendered once per retrieval and carried onto every row derived
  // from it. A static credit line could not satisfy a template that interpolates as_of.
  const citation = renderCitation(sourceAsOf);

  // One statement for the whole date, not one per row.
  //
  // A day is fifty-one rows and a full backfill is six hundred days, so row-at-a-time
  // inserts are thirty thousand round trips. Against a local socket that is nine seconds;
  // against a pooler in another region it was several hours, and a backfill nobody can
  // finish is a backfill nobody runs. The rows, the columns and every constraint they must
  // satisfy are identical — only the number of round trips changes.
  const columns = 12;
  const values: unknown[] = [];
  const tuples: string[] = [];

  for (const observation of snapshot.observations) {
    const labProviderId =
      observation.labAttributionState === "evidenced" && observation.labSlug !== null
        ? lineage.labProviderIds.get(observation.labSlug) ?? null
        : null;
    // An evidenced lab with no provider row is a reference-data gap, and it degrades to
    // unmapped rather than silently dropping the attribution state's meaning.
    const state = observation.labAttributionState === "evidenced" && labProviderId === null
      ? "unmapped"
      : observation.labAttributionState;
    const flags =
      state === observation.labAttributionState
        ? observation.qualityFlags
        : [...observation.qualityFlags, "LAB_PROVIDER_ROW_MISSING"];

    const base = values.length;
    tuples.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},null,$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`,
    );
    values.push(
      snapshotId,
      snapshot.observationDate,
      observation.permaslug,
      observation.namespace,
      observation.variant,
      observation.tokens.toString(),
      observation.isResidual,
      labProviderId,
      lineage.servingPlatformId,
      state,
      citation,
      flags,
    );
  }

  if (tuples.length > 0) {
    if (values.length !== tuples.length * columns) {
      throw new UtviContractError("observation parameter count does not match its tuples");
    }
    await sql.query(
      `insert into pipeline.utvi_model_observations (
         daily_snapshot_id, observation_date, source_model_permaslug, source_namespace,
         source_variant, source_total_tokens, is_residual, model_id, lab_provider_id,
         serving_platform_id, lab_attribution_state, source_attribution, quality_flags
       ) values ${tuples.join(", ")}`,
      values,
    );
  }

  return snapshotId;
}

/** Record a calculation. The database checks it against its snapshot; this only writes it. */
export async function recordCalculation(
  sql: SqlExecutor,
  lineage: UtviLineage,
  snapshotId: string,
  calculation: UtviCalculation,
  calculatorIdentity: string,
): Promise<string> {
  const inserted = one(
    (
      await sql.query(
        `insert into pipeline.utvi_calculations (
           instrument_id, instrument_spec_version_id, methodology_version_id, daily_snapshot_id,
           calculation_date, calculated_at, calculator_identity, run_kind,
           total_observed_tokens, model_residual_tokens, lab_residual_tokens, attributed_tokens,
           eligible_row_count, excluded_row_count, exclusions, coverage_state,
           settlement_state, source_content_hash
         ) values ($1,$2,$3,$4,$5,now(),$6,'production',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         returning id`,
        [
          lineage.instrumentId,
          lineage.instrumentSpecVersionId,
          lineage.methodologyVersionId,
          snapshotId,
          calculation.calculationDate,
          calculatorIdentity,
          calculation.totalObservedTokens.toString(),
          calculation.modelResidualTokens.toString(),
          calculation.labResidualTokens.toString(),
          calculation.attributedTokens.toString(),
          calculation.eligibleRowCount,
          calculation.excludedRowCount,
          JSON.stringify(calculation.exclusions),
          calculation.coverageState,
          calculation.settlementState,
          calculation.sourceContentHash,
        ],
      )
    ).rows,
    "the inserted calculation",
  );
  return String(inserted.id);
}

/** Why a publication was not attempted, or could not be. */
export type PublicationRefusal =
  | { reason: "methodology_not_approved"; detail: string }
  | { reason: "no_change"; detail: string };

export type PublicationOutcome =
  | { kind: "published"; publicationId: string; revisionNumber: number }
  | { kind: "superseded"; publicationId: string; supersededId: string; revisionNumber: number }
  | { kind: "refused"; refusal: PublicationRefusal };

/**
 * Publish a calculation, or decline.
 *
 * Two declines, and they are different in kind. A draft methodology is a governance refusal:
 * the database's own trigger would reject the insert, and asking it to is pointless noise, so
 * the gate is checked here first and reported by name. A revision whose value did not change
 * is a *content* decline: the source's rows moved but UTVI did not, so a second public point
 * would tell a reader that something happened when nothing did. The revised provenance is
 * already recorded on the new snapshot and calculation; the public series stays still.
 */
export async function publishCalculation(
  sql: SqlExecutor,
  lineage: UtviLineage,
  calculationId: string,
  calculation: UtviCalculation,
  universeDescriptor: string,
  sourceAsOf: string,
  publisherIdentity: string,
): Promise<PublicationOutcome> {
  if (lineage.methodologyStatus !== "approved") {
    return {
      kind: "refused",
      refusal: {
        reason: "methodology_not_approved",
        detail: `methodology version ${lineage.methodologyVersion} is ${lineage.methodologyStatus}; no value may be published under it`,
      },
    };
  }

  const { rows } = await sql.query(
    `select p.id, p.value_tokens_per_day::text as value, p.revision_number,
            (s.superseded_by_id is null) as evidence_is_live
       from pipeline.utvi_publications p
       join pipeline.utvi_calculations c on c.id = p.calculation_id
       join pipeline.utvi_daily_snapshots s on s.id = c.daily_snapshot_id
      where p.calculation_date = $1 and p.superseded_by_id is null`,
    [calculation.calculationDate],
  );
  const existing = rows[0];
  const evidenceIsLive = existing === undefined ? true : Boolean(existing.evidence_is_live);

  // An unchanged value is normally not republished: the source's rows moved, UTVI did not, and
  // a second public point would tell a reader something happened when nothing did.
  //
  // Unless the standing publication's evidence is no longer live. A publication reaches its
  // snapshot through its calculation, and once that snapshot is superseded the published point
  // is anchored to a representation the database no longer serves -- so every consumer that
  // reads through live snapshots, Market Share included, loses the date entirely. Re-pointing
  // is therefore not an optional tidy-up: the value stays identical and its evidence follows
  // the live snapshot, which is what keeps the point readable at all.
  if (
    existing !== undefined &&
    evidenceIsLive &&
    BigInt(String(existing.value)) === calculation.totalObservedTokens
  ) {
    return {
      kind: "refused",
      refusal: {
        reason: "no_change",
        detail: `${calculation.calculationDate} already publishes ${calculation.totalObservedTokens} tokens/day; the revision changed provenance, not the value`,
      },
    };
  }

  const revisionNumber = existing === undefined ? 1 : Number(existing.revision_number) + 1;
  const publicationId = randomUUID();

  const insert = async () => {
    await sql.query(
      `insert into pipeline.utvi_publications (
         id, calculation_id, calculation_date, published_at, publisher_identity,
         value_tokens_per_day, published_model_residual, published_lab_residual,
         settlement_state, methodology_version, universe_descriptor, source_attribution,
         source_content_hash, revision_number
       ) values ($13,$1,$2,now(),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        calculationId,
        calculation.calculationDate,
        publisherIdentity,
        calculation.totalObservedTokens.toString(),
        calculation.modelResidualTokens.toString(),
        calculation.labResidualTokens.toString(),
        calculation.settlementState,
        lineage.methodologyVersion,
        universeDescriptor,
        renderCitation(sourceAsOf),
        calculation.sourceContentHash,
        revisionNumber,
        publicationId,
      ],
    );
  };

  if (existing === undefined) {
    await insert();
    return { kind: "published", publicationId, revisionNumber };
  }

  // Supersede first, then insert -- the same ordering the snapshot supersession uses, and for
  // the same reason. One live publication per date is a partial unique index, and a unique
  // index is checked the instant a row is inserted, so inserting the replacement while the old
  // row is still live puts two live points on the date and is rejected outright. Superseding
  // first names an id that does not exist yet, which the deferred self-reference permits until
  // commit, by which time it does.
  //
  // This ordering was wrong from the beginning and had never fired: all 621 production points
  // are first publications, so nothing had ever superseded one until a storage repair needed to
  // re-point a date's evidence, and the insert failed on the index.
  await sql.query("begin", []);
  try {
    await sql.query(
      `update pipeline.utvi_publications
          set superseded_by_id = $2, superseded_at = now(), supersession_reason = $3
        where id = $1`,
      [
        existing.id,
        publicationId,
        BigInt(String(existing.value)) === calculation.totalObservedTokens
          ? `re-pointed to the live snapshot after a storage repair; the value is unchanged at ${calculation.totalObservedTokens} tokens/day`
          : `revised to ${calculation.totalObservedTokens} tokens/day after a source revision`,
      ],
    );
    await insert();
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
  return { kind: "superseded", publicationId, supersededId: String(existing.id), revisionNumber };
}

/**
 * Whether a snapshot already has a calculation.
 *
 * Asked whenever a re-read confirms an unchanged date, because "the rows did not change" and
 * "this date has a value" are different facts and a run can be interrupted between them. A
 * process killed after writing a snapshot but before writing its calculation leaves a date
 * with coverage and no value, and without this check every later run would confirm the
 * snapshot and skip straight past the hole. Found in production: one date of 621.
 */
export async function snapshotHasCalculation(sql: SqlExecutor, snapshotId: string): Promise<boolean> {
  return (await calculationIdForSnapshot(sql, snapshotId)) !== null;
}

/**
 * The most recent calculation recorded against a snapshot, or null.
 *
 * Wanted whenever a date already has a value but its *publication* needs attention: recording a
 * second identical calculation to reach the publication step would grow the ledger with a fact
 * it already holds.
 */
export async function calculationIdForSnapshot(sql: SqlExecutor, snapshotId: string): Promise<string | null> {
  const { rows } = await sql.query(
    `select id from pipeline.utvi_calculations
      where daily_snapshot_id = $1
      order by calculated_at desc limit 1`,
    [snapshotId],
  );
  const row = rows[0];
  return row === undefined ? null : String(row.id);
}

/**
 * Whether the date's live publication is backed by a live snapshot.
 *
 * A publication reaches its evidence through its calculation, and a repair or revision can
 * supersede that snapshot underneath it. The value stays readable, but every consumer that
 * reads through live snapshots -- Market Share among them -- loses the date, because the
 * evidence it joins to is no longer served.
 *
 * Returns true when there is no publication at all: nothing is orphaned if nothing is published,
 * and the caller's other checks decide what to do about the absence.
 */
export async function publicationEvidenceIsLive(sql: SqlExecutor, calculationDate: string): Promise<boolean> {
  const { rows } = await sql.query(
    `select (s.superseded_by_id is null) as live
       from pipeline.utvi_publications p
       join pipeline.utvi_calculations c on c.id = p.calculation_id
       join pipeline.utvi_daily_snapshots s on s.id = c.daily_snapshot_id
      where p.calculation_date = $1 and p.superseded_by_id is null`,
    [calculationDate],
  );
  const row = rows[0];
  return row === undefined ? true : Boolean(row.live);
}

/** Dates that already have a live snapshot, so a backfill can skip what it has. */
export async function coveredDates(sql: SqlExecutor, startDate: string, endDate: string): Promise<string[]> {
  const { rows } = await sql.query(
    `select observation_date::text as observation_date
       from pipeline.utvi_daily_snapshots
      where superseded_by_id is null
        and coverage_state = 'covered_observed'
        and observation_date between $1 and $2
      order by observation_date`,
    [startDate, endDate],
  );
  return rows.map((row) => String(row.observation_date));
}
