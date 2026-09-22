/**
 * The one write path for UMPI source evidence.
 *
 * Everything an adapter produces arrives here and nowhere else, so the append-only and vintage
 * rules live in a single place. The rules, in order:
 *
 *   1. resolve lineage — series, source series, interface, methodology version — from the
 *      registry, by code. Nothing is passed in as a name.
 *   2. record the retrieval in the shared `pipeline.source_retrievals`.
 *   3. open a run in `pipeline.umpi_ingestion_runs`.
 *   4. for each admitted row: if an observation already exists for this source series, month
 *      and provenance hash, it is the same evidence and nothing is written.
 *   5. otherwise append the next vintage and supersede the previous current one.
 *   6. close the run with honest counts.
 *
 * Steps 4 and 5 run in one transaction per run, so a failure halfway leaves no half-superseded
 * month behind.
 */

import { UmpiPersistenceError } from "./errors";
import type { ParsedRow, SourceFetchResult } from "./types";
import type { UmpiSeriesCode } from "../types";

/** Who wrote the evidence. Recorded on every retrieval, as the other collectors do. */
export const UMPI_COLLECTOR_IDENTITY = "umpi-source-ingestion/1";

export interface UmpiSqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type UmpiLineage = {
  seriesId: string;
  seriesCode: UmpiSeriesCode;
  sourceSeriesId: string;
  sourceInterfaceId: string;
  methodologyVersionId: string;
  observationKind: "bok_index_level" | "kcs_trade_month";
};

export type UmpiWriteResult = {
  runId: string;
  retrievalId: string;
  rowsReceived: number;
  rowsInserted: number;
  rowsUnchanged: number;
  rowsRevised: number;
  rowsRejected: number;
  errorCount: number;
  idempotenceState: "no_change" | "changed" | "failed";
  payloadDigest: string;
};

const text = (value: unknown): string => String(value);

/**
 * Lineage by code, never by display name. The query also proves the series is bound to exactly
 * one active source identity: a series with two would make "which one did this row come from"
 * a guess, and the store refuses to guess.
 */
export async function resolveUmpiLineage(sql: UmpiSqlExecutor, seriesCode: UmpiSeriesCode): Promise<UmpiLineage> {
  const { rows } = await sql.query(
    `select s.id as series_id, s.series_code, s.methodology_version_id,
            ss.id as source_series_id, ss.source_interface_id, ss.identity_kind
       from reference.umpi_series s
       join reference.umpi_source_series ss on ss.series_id = s.id and ss.is_active
      where s.series_code = $1`,
    [seriesCode],
  );
  if (rows.length === 0) throw new UmpiPersistenceError(`no active source identity is registered for ${seriesCode}`);
  if (rows.length > 1) throw new UmpiPersistenceError(`${seriesCode} has ${rows.length} active source identities; exactly one is required`);
  const row = rows[0]!;
  return {
    seriesId: text(row.series_id),
    seriesCode,
    sourceSeriesId: text(row.source_series_id),
    sourceInterfaceId: text(row.source_interface_id),
    methodologyVersionId: text(row.methodology_version_id),
    observationKind: text(row.identity_kind) === "bok_ecos_series" ? "bok_index_level" : "kcs_trade_month",
  };
}

/**
 * The retrieval record. Every HTTP attempt gets one, including a repeated one: a retrieval is
 * an audit fact about the network, and it is deliberately not the same thing as an observation.
 * Two identical retrievals produce two retrieval rows and zero new observations.
 */
async function recordRetrieval(
  sql: UmpiSqlExecutor,
  lineage: UmpiLineage,
  fetched: SourceFetchResult,
  idempotencyKey: string,
): Promise<string> {
  const { rows } = await sql.query(
    `insert into pipeline.source_retrievals
       (source_interface_id, idempotency_key, requested_at, completed_at, request_method,
        request_url, request_parameters, response_status, response_content_type, response_hash,
        response_byte_length, record_count, source_claimed_complete,
        enumeration_assessment, enumeration_evidence, collector_identity)
     values ($1, $2, $3, $3, 'GET', $4, $5, $6, $7, $8, $9, $10, null, $11, $12, $13)
     on conflict (idempotency_key) do update set completed_at = excluded.completed_at
     returning id`,
    [
      lineage.sourceInterfaceId,
      idempotencyKey,
      fetched.retrievedAt,
      // Already redacted by the adapter. Asserted here so a future adapter cannot regress it.
      fetched.requestUrl,
      JSON.stringify(fetched.requestParameters),
      fetched.httpStatus,
      fetched.contentType,
      fetched.payloadDigest,
      fetched.responseByteLength,
      fetched.rows.length,
      fetched.enumerationAssessment,
      fetched.enumerationEvidence,
      UMPI_COLLECTOR_IDENTITY,
    ],
  );
  return text(rows[0]!.id);
}

async function openRun(
  sql: UmpiSqlExecutor,
  lineage: UmpiLineage,
  fetched: SourceFetchResult,
  options: { fromMonth: string; toMonth: string; runKind: string; idempotencyKey: string },
): Promise<string> {
  const { rows } = await sql.query(
    `insert into pipeline.umpi_ingestion_runs
       (series_id, source_series_id, source_interface_id, methodology_version_id, idempotency_key,
        run_kind, retrieval_mode, requested_from_month, requested_to_month, started_at,
        payload_digest, rows_received)
     values ($1, $2, $3, $4, $5, $6, 'api', $7::date, $8::date, now(), $9, $10)
     returning id`,
    [
      lineage.seriesId,
      lineage.sourceSeriesId,
      lineage.sourceInterfaceId,
      lineage.methodologyVersionId,
      options.idempotencyKey,
      options.runKind,
      `${options.fromMonth}-01`,
      `${options.toMonth}-01`,
      fetched.payloadDigest,
      fetched.rows.length,
      fetched.enumerationAssessment,
      fetched.enumerationEvidence,
      UMPI_COLLECTOR_IDENTITY,
    ],
  );
  return text(rows[0]!.id);
}

/**
 * Write one admitted row.
 *
 * Returns what happened rather than throwing on a duplicate, because a duplicate is the normal
 * and expected outcome of a rerun, not an error.
 */
async function writeObservation(
  sql: UmpiSqlExecutor,
  lineage: UmpiLineage,
  runId: string,
  row: Extract<ParsedRow, { state: "admitted" }>,
): Promise<"inserted" | "unchanged" | "revised"> {
  const referenceMonth = `${row.observation.referenceMonth}-01`;

  // Exact same evidence, already stored: the retrieval confirmed it and nothing is written.
  const existing = await sql.query(
    `select id from pipeline.umpi_observations
      where source_series_id = $1 and reference_month = $2::date and provenance_hash = $3`,
    [lineage.sourceSeriesId, referenceMonth, row.provenanceHash],
  );
  if (existing.rows.length > 0) return "unchanged";

  // The current vintage for this month, if any. Its presence is what makes this a revision.
  const current = await sql.query(
    `select id, vintage_ordinal from pipeline.umpi_observations
      where source_series_id = $1 and reference_month = $2::date and superseded_by_id is null
      order by vintage_ordinal desc limit 1`,
    [lineage.sourceSeriesId, referenceMonth],
  );
  const priorId = current.rows[0] ? text(current.rows[0].id) : null;
  const nextOrdinal = current.rows[0] ? Number(current.rows[0].vintage_ordinal) + 1 : 1;

  // Narrow once, on the discriminant, so each shape contributes only its own columns and the
  // other shape's columns are explicitly null rather than incidentally undefined.
  const observation = row.observation;
  const shape =
    observation.kind === "bok_index_level"
      ? {
          nativeUnit: "index_2020_equals_100",
          indexLevel: observation.indexLevel as number | null,
          baseLabel: observation.baseLabel as string | null,
          exportValueUsd: null as number | null,
          exportWeightKg: null as number | null,
        }
      : {
          nativeUnit: "usd_and_kg",
          indexLevel: null as number | null,
          baseLabel: null as string | null,
          exportValueUsd: observation.exportValueUsd as number | null,
          exportWeightKg: observation.exportWeightKg as number | null,
        };

  const inserted = await sql.query(
    `insert into pipeline.umpi_observations
       (series_id, source_series_id, source_interface_id, ingestion_run_id, methodology_version_id,
        observation_kind, reference_month, retrieved_at, vintage_ordinal, source_native_unit,
        index_level, index_base_label, export_value_usd, export_weight_kg,
        provenance_hash, raw_payload)
     values ($1, $2, $3, $4, $5, $6, $7::date, now(), $8, $9, $10, $11, $12, $13, $14, $15)
     returning id`,
    [
      lineage.seriesId,
      lineage.sourceSeriesId,
      lineage.sourceInterfaceId,
      runId,
      lineage.methodologyVersionId,
      observation.kind,
      referenceMonth,
      nextOrdinal,
      shape.nativeUnit,
      shape.indexLevel,
      shape.baseLabel,
      shape.exportValueUsd,
      shape.exportWeightKg,
      row.provenanceHash,
      JSON.stringify(row.rawPayload),
    ],
  );

  if (priorId !== null) {
    // Supersede, never edit. The prior row keeps its value and becomes immutable.
    await sql.query(
      `update pipeline.umpi_observations
          set superseded_by_id = $1, superseded_at = now(), supersession_reason = 'official revision'
        where id = $2`,
      [text(inserted.rows[0]!.id), priorId],
    );
    return "revised";
  }
  return "inserted";
}

export async function persistUmpiFetch(
  sql: UmpiSqlExecutor,
  lineage: UmpiLineage,
  fetched: SourceFetchResult,
  options: { fromMonth: string; toMonth: string; runKind?: string; idempotencyKey: string },
): Promise<UmpiWriteResult> {
  const retrievalId = await recordRetrieval(sql, lineage, fetched, `${options.idempotencyKey}:retrieval`);
  const runId = await openRun(sql, lineage, fetched, {
    fromMonth: options.fromMonth,
    toMonth: options.toMonth,
    runKind: options.runKind ?? "production",
    idempotencyKey: options.idempotencyKey,
  });

  let inserted = 0;
  let unchanged = 0;
  let revised = 0;
  const rejected = fetched.rows.filter((row) => row.state === "rejected").length;

  try {
    await sql.query("begin", []);
    for (const row of fetched.rows) {
      if (row.state !== "admitted") continue;
      const outcome = await writeObservation(sql, lineage, runId, row);
      if (outcome === "inserted") inserted += 1;
      else if (outcome === "revised") revised += 1;
      else unchanged += 1;
    }
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    // A failed run is recorded as failed. It is never closed as a success with partial counts.
    await sql.query(
      `update pipeline.umpi_ingestion_runs
          set completed_at = now(), idempotence_state = 'failed', error_count = 1,
              rows_rejected = $2, notes = $3
        where id = $1`,
      [runId, rejected, error instanceof Error ? `${error.name}: ${error.message}` : String(error)],
    );
    throw error instanceof UmpiPersistenceError
      ? error
      : new UmpiPersistenceError(`the UMPI write path failed for run ${runId}`, { cause: error });
  }

  const idempotenceState = inserted === 0 && revised === 0 ? "no_change" : "changed";
  await sql.query(
    `update pipeline.umpi_ingestion_runs
        set completed_at = now(), rows_inserted = $2, rows_unchanged = $3, rows_revised = $4,
            rows_rejected = $5, error_count = 0, idempotence_state = $6
      where id = $1`,
    [runId, inserted, unchanged, revised, rejected, idempotenceState],
  );

  return {
    runId,
    retrievalId,
    rowsReceived: fetched.rows.length,
    rowsInserted: inserted,
    rowsUnchanged: unchanged,
    rowsRevised: revised,
    rowsRejected: rejected,
    errorCount: 0,
    idempotenceState,
    payloadDigest: fetched.payloadDigest,
  };
}
