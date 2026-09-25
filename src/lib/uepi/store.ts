/**
 * Persistence for one operating day, on the UEPI-1 schema and its rules.
 *
 * Three properties matter more than anything else here, and each is enforced rather than intended:
 *
 *   **Idempotence.** A backfill that is interrupted and re-run must not double-write a year of
 *   history. Identity is content-based -- the retrieval key is a digest of the artifacts, a raw
 *   row's hash is a digest of its fields -- so an unchanged day re-ingests to exactly the rows
 *   that are already there and writes nothing.
 *
 *   **Supersession, never overwrite.** When a source revises a day, the old observation stays and
 *   gains a pointer to the new one. The partial unique index enforces the order, which is why the
 *   supersession update happens before the replacement insert.
 *
 *   **Separation of release from publication.** This module writes released daily values for
 *   markets Urdais may never display. That is correct: the rights gate lives at read time, and a
 *   stored value for PJM, MISO or SPP is an internal record, not a publication.
 */

import { randomUUID } from "node:crypto";

import { UEPI_COLLECTOR, UEPI_EXTRACTION_VERSION, uepiRecordHash, uepiRetrievalKey } from "@/lib/uepi/source/artifact";
import type { AdapterParseResult, RetrievedArtifact, UepiSourceAdapter } from "@/lib/uepi/source/types";
import type { DailyCalculation } from "@/lib/uepi/calculate";
import { SPECIFICATION_DIGEST, SPECIFICATION_SLUG, SPECIFICATION_VERSION } from "@/lib/uepi/methodology";
import type { NormalizedHourlyPrice, QualityCheckResult, ReleaseKind, UepiBenchmark } from "@/lib/uepi/types";

/** The executor shape the rest of the repository already passes around. */
export type SqlExecutor = {
  query: (text: string, params: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * Whether a failure is the connection dropping rather than the write being wrong.
 *
 * The distinction decides whether retrying is sensible or dishonest. A pooler culling an idle
 * session, a backend restarting, a socket reset: the same write will very likely succeed a moment
 * later. A constraint violation, a missing benchmark, a draft specification: retrying only repeats
 * the same refusal, and hiding it behind three attempts would turn a clear error into a slow one.
 *
 * Postgres class 08 is connection exception; 57P01 is the server telling us it is going away.
 */
export function isConnectionFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && (code.startsWith("08") || code === "57P01")) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /connection terminated|connection closed|socket hang up|ECONNRESET|EPIPE|ETIMEDOUT|server closed the connection|Client has encountered a connection error|terminating connection/i
    .test(message);
}

export type StoreOutcome = {
  retrievalId: string;
  retrievalWasNew: boolean;
  rawRecordsInserted: number;
  observationsInserted: number;
  observationsSuperseded: number;
  observationsUnchanged: number;
  dailyValue: "inserted" | "unchanged" | "superseded" | "not_released";
};

async function one(sql: SqlExecutor, text: string, params: readonly unknown[]): Promise<Record<string, unknown> | undefined> {
  const result = await sql.query(text, params);
  return result.rows[0];
}

export async function benchmarkRowId(sql: SqlExecutor, benchmark: UepiBenchmark): Promise<string> {
  const row = await one(sql,
    "select id from reference.power_price_benchmarks where slug = $1", [benchmark.seriesId]);
  if (row === undefined) throw new Error(`${benchmark.seriesId} is not registered in reference.power_price_benchmarks`);
  return String(row.id);
}

export async function approvedSpecificationVersionId(sql: SqlExecutor): Promise<string> {
  const row = await one(sql,
    `select mv.id from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1 and mv.version = $2 and mv.status = 'approved' and mv.content_hash = $3`,
    [SPECIFICATION_SLUG, SPECIFICATION_VERSION, SPECIFICATION_DIGEST]);
  if (row === undefined) {
    throw new Error(
      `UEPI ${SPECIFICATION_VERSION} is not registered as approved with digest ${SPECIFICATION_DIGEST}; `
      + "the foundation migration has not been applied to this database");
  }
  return String(row.id);
}

export type StoreInput = {
  adapter: UepiSourceAdapter;
  benchmark: UepiBenchmark;
  operatingDate: string;
  artifacts: readonly RetrievedArtifact[];
  parsed: AdapterParseResult;
  hours: readonly NormalizedHourlyPrice[];
  /** Present only when the day passed release validation. */
  calculation: DailyCalculation | null;
  qualityChecks: readonly QualityCheckResult[];
  releaseKind: ReleaseKind;
  now: Date;
};

async function insertObservation(
  sql: SqlExecutor, id: string, benchmarkId: string, rawId: string,
  hour: NormalizedHourlyPrice, now: Date,
): Promise<void> {
  await sql.query(
    `insert into pipeline.uepi_price_observations
       (id, raw_uepi_price_record_id, benchmark_id, operating_date, interval_start, interval_end,
        hour_ordinal, price_usd_per_mwh, price_construct, value_derivation, derivation_expression,
        source_version, retrieved_at, quality_status, quality_notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id, rawId, benchmarkId, hour.operatingDate, hour.intervalStartUtc, hour.intervalEndUtc,
      hour.hourOrdinal, hour.priceUsdPerMwh, hour.construct, hour.derivation,
      hour.derivationExpression,
      hour.sourceVersion === null ? null : JSON.stringify(hour.sourceVersion),
      now.toISOString(), hour.qualityStatus, hour.qualityNotes,
    ]);
}

/**
 * Write one operating day.
 *
 * Everything happens in one transaction, because a half-written day -- raw evidence with no
 * observations, or observations with no released value -- is a state nothing downstream knows how
 * to interpret.
 */
export async function storeOperatingDay(sql: SqlExecutor, input: StoreInput): Promise<StoreOutcome> {
  const { adapter, benchmark, operatingDate, artifacts, parsed, hours, calculation } = input;
  const benchmarkId = await benchmarkRowId(sql, benchmark);
  const versionId = await approvedSpecificationVersionId(sql);
  const sourceInterface = await one(sql,
    "select id from reference.source_interfaces where slug = $1", [adapter.sourceInterfaceSlug]);
  if (sourceInterface === undefined) {
    throw new Error(`${adapter.sourceInterfaceSlug} is not registered in reference.source_interfaces`);
  }

  const idempotencyKey = uepiRetrievalKey(benchmark.seriesId, operatingDate, artifacts);
  const outcome: StoreOutcome = {
    retrievalId: "",
    retrievalWasNew: false,
    rawRecordsInserted: 0,
    observationsInserted: 0,
    observationsSuperseded: 0,
    observationsUnchanged: 0,
    dailyValue: "not_released",
  };

  await sql.query("begin", []);
  try {
    const primary = artifacts[0];
    const inserted = await one(sql,
      `insert into pipeline.source_retrievals
         (source_interface_id, idempotency_key, requested_at, completed_at, request_method,
          request_url, request_parameters, response_status, response_content_type, response_hash,
          response_byte_length, enumeration_assessment, enumeration_evidence, collector_identity,
          retrieval_purpose, record_count)
       values ($1, $2, $3, $4, 'GET', $5, $6, $7, $8, $9, $10, 'complete', $11, $12, $13, $14)
       on conflict (idempotency_key) do nothing
       returning id`,
      [
        sourceInterface.id, idempotencyKey, input.now.toISOString(), input.now.toISOString(),
        primary?.url ?? "", JSON.stringify({ operatingDate, artifacts: artifacts.map((a) => a.label) }),
        primary?.status ?? 200, primary?.contentType ?? null, primary?.sha256 ?? null,
        artifacts.reduce((total, artifact) => total + artifact.byteLength, 0),
        // The reader that produced these rows, and what the file said about its own shape. A
        // later schema change is diagnosable from the retrieval alone.
        JSON.stringify({ extractor: UEPI_EXTRACTION_VERSION, sourceSchema: parsed.sourceSchema,
          warnings: parsed.warnings, examinedRowCount: parsed.examinedRowCount }),
        UEPI_COLLECTOR, adapter.retrievalPurpose, parsed.records.length,
      ]);

    if (inserted === undefined) {
      const existing = await one(sql,
        "select id from pipeline.source_retrievals where idempotency_key = $1", [idempotencyKey]);
      outcome.retrievalId = String(existing!.id);
    } else {
      outcome.retrievalId = String(inserted.id);
      outcome.retrievalWasNew = true;
    }

    // Raw evidence. Append-only by trigger, and keyed by content, so a re-run of an unchanged day
    // conflicts on every row and inserts none.
    const rawIdByInstant = new Map<string, string>();
    for (const record of parsed.records) {
      const hash = uepiRecordHash({
        seriesId: benchmark.seriesId,
        artifactSha256: artifacts[0]?.sha256 ?? "",
        rowOrdinal: record.raw.rowOrdinal,
        record: record.raw,
      });
      const row = await one(sql,
        `insert into pipeline.raw_uepi_price_records
           (retrieval_id, benchmark_id, row_ordinal, record_hash, native_operating_date,
            native_interval_label, native_interval_utc, native_value, native_components,
            native_source_version, raw_payload)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (retrieval_id, record_hash) do nothing
         returning id`,
        [
          outcome.retrievalId, benchmarkId, record.raw.rowOrdinal, hash,
          record.raw.nativeOperatingDate, record.raw.nativeIntervalLabel, record.raw.nativeIntervalUtc,
          record.raw.nativeValue, JSON.stringify(record.raw.nativeComponents),
          record.raw.nativeSourceVersion === null ? null : JSON.stringify(record.raw.nativeSourceVersion),
          JSON.stringify(record.raw.rawPayload),
        ]);
      if (row !== undefined) {
        outcome.rawRecordsInserted += 1;
        rawIdByInstant.set(record.intervalStartUtc, String(row.id));
      } else {
        const existing = await one(sql,
          "select id from pipeline.raw_uepi_price_records where retrieval_id = $1 and record_hash = $2",
          [outcome.retrievalId, hash]);
        rawIdByInstant.set(record.intervalStartUtc, String(existing!.id));
      }
    }

    for (const hour of hours) {
      const rawId = rawIdByInstant.get(hour.intervalStartUtc);
      if (rawId === undefined) throw new Error(`no raw record was stored for ${hour.intervalStartUtc}`);

      const current = await one(sql,
        `select id, price_usd_per_mwh::text as price
           from pipeline.uepi_price_observations
          where benchmark_id = $1 and interval_start = $2 and superseded_by_id is null`,
        [benchmarkId, hour.intervalStartUtc]);

      if (current !== undefined) {
        if (Number(current.price) === Number(hour.priceUsdPerMwh)) {
          outcome.observationsUnchanged += 1;
          continue;
        }
        // The replacement's id is generated first: the partial unique index will not hold two
        // current rows for one instant, so the old row has to point at the new one before it exists.
        const replacementId = randomUUID();
        await sql.query(
          `update pipeline.uepi_price_observations
              set superseded_by_id = $1, superseded_at = $2, supersession_reason = 'source_revision'
            where id = $3`,
          [replacementId, input.now.toISOString(), current.id]);
        await insertObservation(sql, replacementId, benchmarkId, rawId, hour, input.now);
        outcome.observationsSuperseded += 1;
        outcome.observationsInserted += 1;
        continue;
      }
      await insertObservation(sql, randomUUID(), benchmarkId, rawId, hour, input.now);
      outcome.observationsInserted += 1;
    }

    if (calculation !== null) {
      const current = await one(sql,
        `select id, input_digest from pipeline.uepi_daily_values
          where benchmark_id = $1 and operating_date = $2 and superseded_by_id is null`,
        [benchmarkId, operatingDate]);

      if (current !== undefined && String(current.input_digest) === calculation.inputDigest) {
        outcome.dailyValue = "unchanged";
      } else {
        const replacementId = randomUUID();
        if (current !== undefined) {
          await sql.query(
            `update pipeline.uepi_daily_values
                set superseded_by_id = $1, superseded_at = $2, supersession_reason = 'source_revision'
              where id = $3`,
            [replacementId, input.now.toISOString(), current.id]);
        }
        await sql.query(
          `insert into pipeline.uepi_daily_values
             (id, benchmark_id, operating_date, value_usd_per_mwh, observation_count,
              expected_observation_count, hour_span_start, hour_span_end, input_digest,
              price_construct, methodology_version_id, specification_digest, quality_checks,
              released_at, release_kind, revision_of_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            replacementId, benchmarkId, operatingDate, calculation.valueUsdPerMwh,
            calculation.observationCount, calculation.expectedObservationCount,
            calculation.hourSpanStartUtc, calculation.hourSpanEndUtc, calculation.inputDigest,
            calculation.construct, versionId, calculation.specificationDigest,
            JSON.stringify(input.qualityChecks), input.now.toISOString(), input.releaseKind,
            current === undefined ? null : current.id,
          ]);
        outcome.dailyValue = current === undefined ? "inserted" : "superseded";
      }
    }

    await sql.query("commit", []);
    return outcome;
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}
