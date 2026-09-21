/**
 * Batched persistence for the interconnection queue.
 *
 * Two things shape this file.
 *
 * The first is the deduplication model. Every retrieval writes raw evidence, because raw evidence
 * is the record of what the publisher served us and it must accumulate. Canonical observations do
 * not: an observation is written only when the publisher says something new about a request. The
 * comparison is a content hash over every material normalized field, and an unchanged request
 * advances `last_snapshot_id` instead of writing a second identical row. Without this, CAISO's
 * daily report alone would add 2,285 duplicate observations a day and PJM's would add 9,200.
 *
 * The second is statement count. Nothing here loops over records issuing queries. Writes go out
 * in batches of a thousand bound rows — the ceiling PostgreSQL's 65,535 bound parameters imposes
 * once a row carries twenty-odd columns — and generated ids come back by selecting the batch's
 * natural keys once, not by inserting rows one at a time to read their ids.
 */

import { observationHash, queueRecordHash, queueRetrievalKey, snapshotKey, QUEUE_EXTRACTION_VERSION }
  from "@/lib/interconnection-queue/ingest/artifact";
import type { QueueAdapter, QueueExtraction, NormalizedQueueRecord }
  from "@/lib/interconnection-queue/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

/** Sized to PostgreSQL's 65,535 bound-parameter ceiling at roughly twenty columns per row. */
export const QUEUE_WRITE_BATCH_SIZE = 1_000;

export type QueueWriteResult = {
  source: string;
  marketSlug: string;
  snapshotId: string;
  snapshotKey: string;
  snapshot: "created" | "existing";
  sourcePublishedAt: string | null;
  retrievalsInserted: number;
  retrievalsReused: number;
  rightsSnapshots: number;
  rawRecordsInserted: number;
  rawRecordsDuplicate: number;
  requestsInserted: number;
  requestsReused: number;
  observationsInserted: number;
  observationsConfirmed: number;
  quantitiesInserted: number;
  resourcesInserted: number;
  deferralsRecorded: number;
  /** Rows retained as raw evidence but denied a canonical identity, by collision. */
  nonCanonicalRows: number;
  statements: number;
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/** `($1,$2,$3),($4,$5,$6)` for a batch of rows with a fixed column count. */
function placeholders(rows: number, columns: number, offset = 0): string {
  const groups: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const slots: string[] = [];
    for (let column = 0; column < columns; column += 1) slots.push(`$${offset + row * columns + column + 1}`);
    groups.push(`(${slots.join(",")})`);
  }
  return groups.join(",");
}

type Lineage = {
  sourceInterfaceId: string;
  gridAreaId: string;
  permissionGrantId: string | null;
  rights: {
    purposeCode: string; permissionId: string; classification: string; disposition: string;
    attributionRequired: boolean; attributionText: string | null;
    conditions: string | null; unresolvedIssue: string | null;
  }[];
};

export async function resolveQueueLineage(
  sql: CapacitySqlExecutor,
  count: () => void,
  sourceInterfaceSlug: string,
  marketSlug: string,
): Promise<Lineage> {
  count();
  const source = await sql.query(
    `select id from reference.source_interfaces where slug = $1`, [sourceInterfaceSlug],
  );
  if (!source.rows[0]) throw new Error(`source interface ${sourceInterfaceSlug} is not registered`);
  count();
  const area = await sql.query(`select id from reference.grid_areas where slug = $1`, [marketSlug]);
  if (!area.rows[0]) throw new Error(`grid area ${marketSlug} is not registered`);
  count();
  const grant = await sql.query(
    `select id from reference.permission_grants where source_interface_id = $1
      order by effective_from desc limit 1`,
    [String(source.rows[0]!.id)],
  );
  count();
  const rights = await sql.query(
    `select id, purpose_code, rights_classification, disposition, attribution_required,
            attribution_text, conditions, unresolved_issue
       from reference.source_use_permissions
      where source_interface_id = $1`,
    [String(source.rows[0]!.id)],
  );
  return {
    sourceInterfaceId: String(source.rows[0]!.id),
    gridAreaId: String(area.rows[0]!.id),
    permissionGrantId: grant.rows[0] === undefined ? null : String(grant.rows[0]!.id),
    rights: rights.rows.map((row) => ({
      purposeCode: String(row.purpose_code), permissionId: String(row.id),
      classification: String(row.rights_classification), disposition: String(row.disposition),
      attributionRequired: row.attribution_required === true,
      attributionText: row.attribution_text == null ? null : String(row.attribution_text),
      conditions: row.conditions == null ? null : String(row.conditions),
      unresolvedIssue: row.unresolved_issue == null ? null : String(row.unresolved_issue),
    })),
  };
}

export async function persistQueueExtraction(
  sql: CapacitySqlExecutor,
  adapter: QueueAdapter,
  artifacts: ReadonlyMap<string, RetrievedArtifact>,
  extraction: QueueExtraction,
  collectorIdentity: string,
  options: { batchSize?: number; observedAt?: string } = {},
): Promise<QueueWriteResult> {
  const batchSize = options.batchSize ?? QUEUE_WRITE_BATCH_SIZE;
  let statements = 0;
  const count = () => { statements += 1; };

  const primary = artifacts.get(adapter.artifacts[0]!.label);
  if (primary === undefined) throw new Error(`primary artifact ${adapter.artifacts[0]!.label} was not retrieved`);
  const observedAt = options.observedAt ?? primary.retrievedAt;

  const lineage = await resolveQueueLineage(sql, count, adapter.sourceInterfaceSlug, adapter.marketSlug);
  const key = snapshotKey(extraction.snapshot.nativeSnapshotKey, primary.sha256);

  const result: QueueWriteResult = {
    source: adapter.key, marketSlug: adapter.marketSlug, snapshotId: "", snapshotKey: key,
    snapshot: "existing", sourcePublishedAt: extraction.snapshot.sourcePublishedAt,
    retrievalsInserted: 0, retrievalsReused: 0, rightsSnapshots: 0,
    rawRecordsInserted: 0, rawRecordsDuplicate: 0,
    requestsInserted: 0, requestsReused: 0,
    observationsInserted: 0, observationsConfirmed: 0,
    quantitiesInserted: 0, resourcesInserted: 0, deferralsRecorded: 0, nonCanonicalRows: 0,
    statements: 0,
  };

  count();
  await sql.query("begin", []);
  try {
    // --------------------------------------------------------------- retrieval and rights
    const retrievalKey = queueRetrievalKey(adapter.key, primary);
    count();
    const inserted = await sql.query(
      `insert into pipeline.source_retrievals
         (source_interface_id, idempotency_key, requested_at, completed_at, request_method,
          request_url, request_parameters, response_status, response_content_type, response_hash,
          response_byte_length, raw_artifact_ref, record_count, source_claimed_complete,
          enumeration_assessment, enumeration_evidence, collector_identity, retrieval_purpose,
          permission_grant_id)
       values ($1,$2,$3,$3,'GET',$4,$5::jsonb,$6,$7,$8,$9,$10,$11,null,'complete',$12,$13,$14,$15)
       on conflict (idempotency_key) do nothing returning id`,
      [
        lineage.sourceInterfaceId, retrievalKey, primary.retrievedAt, primary.url,
        JSON.stringify({ artifact: primary.label }), primary.status, primary.contentType,
        primary.sha256, primary.byteLength, `${adapter.key}/${primary.label}`,
        extraction.records.length,
        `Whole published artifact retrieved in one request; SHA-256 ${primary.sha256}.`,
        collectorIdentity, adapter.retrievalPurpose,
        adapter.retrievalPurpose === "production" ? lineage.permissionGrantId : null,
      ],
    );
    let retrievalId: string;
    if (inserted.rows[0] !== undefined) {
      retrievalId = String(inserted.rows[0]!.id);
      result.retrievalsInserted += 1;
    } else {
      count();
      const existing = await sql.query(
        `select id from pipeline.source_retrievals where idempotency_key = $1`, [retrievalKey],
      );
      if (!existing.rows[0]) throw new Error("the retrieval was neither inserted nor found");
      retrievalId = String(existing.rows[0]!.id);
      result.retrievalsReused += 1;
    }

    for (const right of lineage.rights) {
      count();
      const snapshot = await sql.query(
        `insert into pipeline.retrieval_rights_snapshots
           (retrieval_id, purpose_code, source_use_permission_id, rights_classification,
            disposition, attribution_required, attribution_text, conditions, unresolved_issue, captured_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (retrieval_id, purpose_code) do nothing returning id`,
        [retrievalId, right.purposeCode, right.permissionId, right.classification, right.disposition,
          right.attributionRequired, right.attributionText, right.conditions, right.unresolvedIssue,
          primary.retrievedAt],
      );
      if (snapshot.rows[0] !== undefined) result.rightsSnapshots += 1;
    }

    // --------------------------------------------------------------- the snapshot
    //
    // Identity is the interface, the content hash and the source's own key. Byte-identical
    // content resolves to the snapshot already recorded, which is what makes an exact rerun a
    // no-op rather than a second observed state.
    count();
    const snapshotInsert = await sql.query(
      `insert into pipeline.interconnection_queue_snapshots
         (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
          source_published_at, observed_at, currentness_status, is_latest, record_count)
       values ($1,$2,$3,$4,$5,$6,$7,'current',false,$8)
       on conflict (source_interface_id, artifact_sha256, native_snapshot_key) do nothing
       returning id`,
      [lineage.sourceInterfaceId, lineage.gridAreaId, retrievalId, key, primary.sha256,
        extraction.snapshot.sourcePublishedAt, observedAt, extraction.records.length],
    );
    let snapshotId: string;
    if (snapshotInsert.rows[0] !== undefined) {
      snapshotId = String(snapshotInsert.rows[0]!.id);
      result.snapshot = "created";
      // Exactly one snapshot per interface is the latest. The new row is inserted not-latest and
      // the flag moves in a single statement, because clearing the old one afterwards would leave
      // two rows claiming it for the duration of the insert and trip the unique index.
      count();
      await sql.query(
        `update pipeline.interconnection_queue_snapshots
            set is_latest = (id = $2)
          where source_interface_id = $1 and (is_latest or id = $2)`,
        [lineage.sourceInterfaceId, snapshotId],
      );
    } else {
      count();
      const existing = await sql.query(
        `select id from pipeline.interconnection_queue_snapshots
          where source_interface_id = $1 and artifact_sha256 = $2 and native_snapshot_key = $3`,
        [lineage.sourceInterfaceId, primary.sha256, key],
      );
      if (!existing.rows[0]) throw new Error("the snapshot was neither inserted nor found");
      snapshotId = String(existing.rows[0]!.id);
    }
    result.snapshotId = snapshotId;

    // --------------------------------------------------------------- raw evidence
    const hashed = extraction.records.map((record) => ({
      record,
      recordHash: queueRecordHash({
        artifactSha256: primary.sha256,
        nativeQueueId: record.nativeQueueId,
        locator: record.locator as unknown as Record<string, unknown>,
        payload: record.payload,
      }),
    }));

    for (const batch of chunk(hashed, batchSize)) {
      const values: unknown[] = [];
      for (const item of batch) {
        values.push(snapshotId, retrievalId, primary.sha256, item.recordHash,
          item.record.nativeQueueId, JSON.stringify(item.record.locator),
          JSON.stringify(item.record.payload), QUEUE_EXTRACTION_VERSION);
      }
      count();
      const written = await sql.query(
        `insert into pipeline.raw_interconnection_queue_records
           (snapshot_id, retrieval_id, artifact_sha256, record_hash, native_queue_id,
            locator, payload, extraction_version)
         select v.snapshot_id::uuid, v.retrieval_id::uuid, v.artifact_sha256, v.record_hash,
                v.native_queue_id, v.locator::jsonb, v.payload::jsonb, v.extraction_version
           from (values ${placeholders(batch.length, 8)}) as v(snapshot_id, retrieval_id,
                 artifact_sha256, record_hash, native_queue_id, locator, payload, extraction_version)
         on conflict (snapshot_id, record_hash) do nothing
         returning id`,
        values,
      );
      result.rawRecordsInserted += written.rows.length;
      result.rawRecordsDuplicate += batch.length - written.rows.length;
    }

    // One select builds the whole hash-to-id map, rather than a round trip per record.
    count();
    const rawRows = await sql.query(
      `select id, record_hash from pipeline.raw_interconnection_queue_records where snapshot_id = $1`,
      [snapshotId],
    );
    const rawIds = new Map<string, string>();
    for (const row of rawRows.rows) rawIds.set(String(row.record_hash), String(row.id));

    // --------------------------------------------------------------- stable identity
    //
    // Raw evidence above covers every row the publisher served. Canonical identity covers only
    // the unambiguous ones: a queue id served twice in one artifact yields no request, because
    // picking one of the two would assert something the publisher did not.
    const canonical = hashed.filter((item) => item.record.canonical);
    result.nonCanonicalRows = hashed.length - canonical.length;

    for (const batch of chunk(canonical, batchSize)) {
      const values: unknown[] = [];
      for (const item of batch) {
        values.push(lineage.gridAreaId, lineage.sourceInterfaceId, item.record.nativeQueueId,
          snapshotId, observedAt);
      }
      count();
      const written = await sql.query(
        `insert into pipeline.interconnection_requests
           (grid_area_id, source_interface_id, native_queue_id, first_seen_snapshot_id, first_seen_at)
         select v.grid_area_id::uuid, v.source_interface_id::uuid, v.native_queue_id,
                v.snapshot_id::uuid, v.first_seen_at::timestamptz
           from (values ${placeholders(batch.length, 5)}) as v(grid_area_id, source_interface_id,
                 native_queue_id, snapshot_id, first_seen_at)
         on conflict (grid_area_id, source_interface_id, native_queue_id) do nothing
         returning id`,
        values,
      );
      result.requestsInserted += written.rows.length;
      result.requestsReused += batch.length - written.rows.length;
    }

    count();
    const requestRows = await sql.query(
      `select id, native_queue_id from pipeline.interconnection_requests
        where grid_area_id = $1 and source_interface_id = $2`,
      [lineage.gridAreaId, lineage.sourceInterfaceId],
    );
    const requestIds = new Map<string, string>();
    for (const row of requestRows.rows) requestIds.set(String(row.native_queue_id), String(row.id));

    // --------------------------------------------------------------- observations
    //
    // The latest observation per request, so an unchanged record can be recognised without
    // reading its history.
    count();
    const latestRows = await sql.query(
      `select o.id, o.request_id, o.observation_hash, o.observation_ordinal
         from pipeline.interconnection_request_observations o
         join pipeline.interconnection_requests r on r.id = o.request_id
        where r.grid_area_id = $1 and r.source_interface_id = $2 and o.is_latest`,
      [lineage.gridAreaId, lineage.sourceInterfaceId],
    );
    const latest = new Map<string, { id: string; hash: string; ordinal: number }>();
    for (const row of latestRows.rows) {
      latest.set(String(row.request_id), {
        id: String(row.id), hash: String(row.observation_hash),
        ordinal: Number(row.observation_ordinal),
      });
    }

    type Pending = { record: NormalizedQueueRecord; requestId: string; hash: string; rawId: string; ordinal: number };
    const toInsert: Pending[] = [];
    const toConfirm: { observationId: string; rawId: string }[] = [];

    for (const item of canonical) {
      const requestId = requestIds.get(item.record.nativeQueueId);
      if (requestId === undefined) throw new Error(`request ${item.record.nativeQueueId} was neither inserted nor found`);
      const rawId = rawIds.get(item.recordHash);
      if (rawId === undefined) throw new Error(`raw record for ${item.record.nativeQueueId} was not found`);
      const hash = observationHash(item.record);
      const current = latest.get(requestId);
      if (current !== undefined && current.hash === hash) {
        toConfirm.push({ observationId: current.id, rawId });
      } else {
        toInsert.push({ record: item.record, requestId, hash, rawId, ordinal: (current?.ordinal ?? 0) + 1 });
      }
    }

    // An unchanged request: the same state, seen again. Evidence advances, history does not grow.
    for (const batch of chunk(toConfirm, batchSize)) {
      const values: unknown[] = [snapshotId];
      for (const item of batch) values.push(item.observationId, item.rawId);
      count();
      await sql.query(
        `update pipeline.interconnection_request_observations o
            set last_snapshot_id = $1::uuid, last_raw_record_id = v.raw_id::uuid
           from (values ${placeholders(batch.length, 2, 1)}) as v(observation_id, raw_id)
          where o.id = v.observation_id::uuid`,
        values,
      );
      result.observationsConfirmed += batch.length;
    }

    // A changed request supersedes its predecessor as latest and keeps it as history.
    if (toInsert.length > 0) {
      for (const batch of chunk(toInsert.filter((item) => item.ordinal > 1), batchSize)) {
        if (batch.length === 0) continue;
        const values: unknown[] = batch.map((item) => item.requestId);
        count();
        await sql.query(
          `update pipeline.interconnection_request_observations
              set is_latest = false
            where is_latest and request_id in (${values.map((_, index) => `$${index + 1}::uuid`).join(",")})`,
          values,
        );
      }

      const observationIds = new Map<string, string>();
      for (const batch of chunk(toInsert, Math.max(1, Math.floor(batchSize / 2)))) {
        const values: unknown[] = [];
        for (const item of batch) {
          const record = item.record;
          values.push(
            item.requestId, snapshotId, snapshotId, item.rawId, item.rawId,
            item.ordinal, item.hash,
            record.nativeProjectName, record.nativeCustomer,
            JSON.stringify(record.nativeStatus), record.nativeStatusDisplay,
            record.lifecycleStage, record.requestClass,
            record.requestedOn, record.proposedInServiceOn, record.revisedInServiceOn,
            record.actualInServiceOn, record.agreementExecutedOn, record.withdrawnOn,
            record.nativeState, record.nativeCounty, record.nativeZone, record.nativePoi,
            record.nativeSubstation, record.nativeTransmissionOwner, record.sourcePartition,
          );
        }
        count();
        const written = await sql.query(
          `insert into pipeline.interconnection_request_observations
             (request_id, first_snapshot_id, last_snapshot_id, first_raw_record_id, last_raw_record_id,
              observation_ordinal, observation_hash, native_project_name, native_customer,
              native_status, native_status_display, lifecycle_stage, request_class,
              requested_on, proposed_in_service_on, revised_in_service_on, actual_in_service_on,
              agreement_executed_on, withdrawn_on, native_state, native_county, native_zone,
              native_poi, native_substation, native_transmission_owner, source_partition)
           select v.request_id::uuid, v.first_snapshot_id::uuid, v.last_snapshot_id::uuid,
                  v.first_raw_record_id::uuid, v.last_raw_record_id::uuid,
                  v.observation_ordinal::integer, v.observation_hash,
                  v.native_project_name, v.native_customer, v.native_status::jsonb,
                  v.native_status_display, v.lifecycle_stage, v.request_class,
                  v.requested_on::date, v.proposed_in_service_on::date, v.revised_in_service_on::date,
                  v.actual_in_service_on::date, v.agreement_executed_on::date, v.withdrawn_on::date,
                  v.native_state, v.native_county, v.native_zone, v.native_poi,
                  v.native_substation, v.native_transmission_owner, v.source_partition
             from (values ${placeholders(batch.length, 26)}) as v(request_id, first_snapshot_id,
                   last_snapshot_id, first_raw_record_id, last_raw_record_id, observation_ordinal,
                   observation_hash, native_project_name, native_customer, native_status,
                   native_status_display, lifecycle_stage, request_class, requested_on,
                   proposed_in_service_on, revised_in_service_on, actual_in_service_on,
                   agreement_executed_on, withdrawn_on, native_state, native_county, native_zone,
                   native_poi, native_substation, native_transmission_owner, source_partition)
           returning id, request_id, observation_ordinal`,
          values,
        );
        for (const row of written.rows) {
          observationIds.set(`${String(row.request_id)}|${Number(row.observation_ordinal)}`, String(row.id));
        }
        result.observationsInserted += written.rows.length;
      }

      // Quantities and resources belong to the new observations only, which is the other half of
      // what keeps a daily retrieval cheap.
      const quantityRows: unknown[][] = [];
      const resourceRows: unknown[][] = [];
      for (const item of toInsert) {
        const observationId = observationIds.get(`${item.requestId}|${item.ordinal}`);
        if (observationId === undefined) throw new Error(`observation for ${item.record.nativeQueueId} was not returned`);
        for (const quantity of item.record.quantities) {
          quantityRows.push([observationId, quantity.nativeField, quantity.quantityKind,
            String(quantity.value), quantity.unit, quantity.resourceOrdinal, quantity.direction,
            JSON.stringify(item.record.locator)]);
        }
        for (const resource of item.record.resources) {
          resourceRows.push([observationId, resource.componentOrdinal, resource.nativeTechnology,
            resource.nativeFuel, resource.technology, resource.isSourceSeparated,
            JSON.stringify(item.record.locator)]);
        }
      }

      for (const batch of chunk(quantityRows, batchSize)) {
        count();
        const written = await sql.query(
          `insert into pipeline.interconnection_request_quantities
             (observation_id, native_field, quantity_kind, value, unit, resource_ordinal, direction, locator)
           select v.observation_id::uuid, v.native_field, v.quantity_kind, v.value::numeric, v.unit,
                  v.resource_ordinal::integer, v.direction, v.locator::jsonb
             from (values ${placeholders(batch.length, 8)}) as v(observation_id, native_field,
                   quantity_kind, value, unit, resource_ordinal, direction, locator)
           on conflict (observation_id, native_field, resource_ordinal) do nothing
           returning id`,
          batch.flat(),
        );
        result.quantitiesInserted += written.rows.length;
      }

      for (const batch of chunk(resourceRows, batchSize)) {
        count();
        const written = await sql.query(
          `insert into pipeline.interconnection_request_resources
             (observation_id, component_ordinal, native_technology, native_fuel, technology,
              is_source_separated, locator)
           select v.observation_id::uuid, v.component_ordinal::integer, v.native_technology,
                  v.native_fuel, v.technology, v.is_source_separated::boolean, v.locator::jsonb
             from (values ${placeholders(batch.length, 7)}) as v(observation_id, component_ordinal,
                   native_technology, native_fuel, technology, is_source_separated, locator)
           on conflict (observation_id, component_ordinal) do nothing
           returning id`,
          batch.flat(),
        );
        result.resourcesInserted += written.rows.length;
      }
    }

    // --------------------------------------------------------------- deferrals
    for (const batch of chunk(extraction.deferrals, batchSize)) {
      const values: unknown[] = [];
      for (const deferral of batch) {
        values.push(snapshotId, deferral.nativeQueueId, deferral.deferralKind,
          deferral.nativeValue, deferral.detail, JSON.stringify(deferral.locator));
      }
      count();
      const written = await sql.query(
        `insert into pipeline.interconnection_queue_deferrals
           (snapshot_id, native_queue_id, deferral_kind, native_value, detail, locator)
         select v.snapshot_id::uuid, v.native_queue_id, v.deferral_kind, v.native_value,
                v.detail, v.locator::jsonb
           from (values ${placeholders(batch.length, 6)}) as v(snapshot_id, native_queue_id,
                 deferral_kind, native_value, detail, locator)
         on conflict (snapshot_id, deferral_kind, coalesce(native_queue_id, ''),
                      coalesce(native_value, ''), md5(detail)) do nothing
         returning id`,
        values,
      );
      result.deferralsRecorded += written.rows.length;
    }

    count();
    await sql.query("commit", []);
    result.statements = statements;
    return result;
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}
