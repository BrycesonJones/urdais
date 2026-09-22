/**
 * Persistence for transmission evidence.
 *
 * Three properties matter more than speed, though the batching exists because NYISO's archive is
 * roughly 43 million observations and row-by-row SQL would never finish:
 *
 *   A retrieved artifact already held is a complete no-op. Snapshot identity is the source
 *   interface, the content hash and the publisher's key, so re-running over the same bytes writes
 *   nothing at all rather than writing the same rows again and relying on conflict clauses
 *   downstream. The Interconnection Queue learned this the expensive way when an archive replay
 *   wrote 23,165 backwards-dated observations.
 *
 *   Raw evidence is written before anything is normalised, and normalisation never writes back
 *   into it.
 *
 *   A margin is assembled only where a flow and an eligible limit already agree about the entity,
 *   the instant, the source and the contingency. The composite foreign keys in the schema enforce
 *   that; this file simply never tries to build one that would fail.
 */

import { createHash } from "node:crypto";

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { ENTITY_KEY_SEPARATOR } from "@/lib/transmission-headroom/ingest/adapters/ercot";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import {
  classifyLimit, deriveDirectionalMargin, deriveOrientedMargin, isEligibleLimit,
  type DirectionalLimit, type MarginOutcome,
} from "@/lib/transmission-headroom/derive";
import type {
  ParsedObservation, ParseResult, TransmissionAdapter, TransmissionArtifactRef,
} from "@/lib/transmission-headroom/ingest/types";
import { EXTRACTION_VERSION, IMPLAUSIBLE_LIMIT_MW } from "@/lib/transmission-headroom/types";

/** PostgreSQL binds at most 65,535 parameters per statement; the row cap keeps well inside it. */
export const WRITE_BATCH_ROWS = 1_000;

export type TransmissionWriteResult = {
  source: string;
  snapshotId: string;
  snapshot: "created" | "existing";
  artifactSha256: string;
  retrievalsInserted: number;
  retrievalsReused: number;
  rightsSnapshots: number;
  rawRecordsInserted: number;
  entitiesInserted: number;
  entitiesReused: number;
  flowObservations: number;
  limitObservations: number;
  marginsInserted: number;
  marginsByState: Record<string, number>;
  deferralsRecorded: number;
  statements: number;
  persistMs: number;
};

function emptyResult(source: string): TransmissionWriteResult {
  return {
    source, snapshotId: "", snapshot: "existing", artifactSha256: "",
    retrievalsInserted: 0, retrievalsReused: 0, rightsSnapshots: 0, rawRecordsInserted: 0,
    entitiesInserted: 0, entitiesReused: 0, flowObservations: 0, limitObservations: 0,
    marginsInserted: 0, marginsByState: {}, deferralsRecorded: 0, statements: 0, persistMs: 0,
  };
}

function chunkFor<T>(items: readonly T[], paramsPerRow: number): T[][] {
  const perStatement = Math.max(1, Math.min(WRITE_BATCH_ROWS, Math.floor(60_000 / paramsPerRow)));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perStatement) out.push(items.slice(i, i + perStatement));
  return out;
}

/**
 * `($1,$2,...),($3,$4,...)` for a multi-row insert.
 *
 * `casts` names the zero-based columns needing an explicit type, because a jsonb column fed a bare
 * parameter is rejected rather than coerced.
 */
function placeholders(rows: number, cols: number, casts: Record<number, string> = {}): string {
  const groups: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    const slots = Array.from({ length: cols }, (_, c) => {
      const slot = `$${r * cols + c + 1}`;
      const cast = casts[c];
      return cast === undefined ? slot : `${slot}::${cast}`;
    });
    groups.push(`(${slots.join(",")})`);
  }
  return groups.join(",");
}

/** In-memory lookup keys. Separator-joined so an entity id cannot run into a timestamp. */
function flowKey(entityId: string, observedAt: string): string {
  return `${entityId}${ENTITY_KEY_SEPARATOR}${new Date(observedAt).toISOString()}`;
}

function limitKey(entityId: string, observedAt: string, direction: string): string {
  return `${flowKey(entityId, observedAt)}${ENTITY_KEY_SEPARATOR}${direction}`;
}

function recordHash(observation: ParsedObservation): string {
  return createHash("sha256").update(JSON.stringify([
    observation.nativeEntityKey, observation.nativeTimestamp, observation.flowRawValue,
    observation.limits.map((limit) => [limit.nativeField, limit.rawValue]),
    observation.rowOrdinal,
  ])).digest("hex");
}

type Lineage = {
  sourceInterfaceId: string;
  gridAreaId: string;
  calculationVersionId: string;
  rights: {
    purposeCode: string; permissionId: string; classification: string; disposition: string;
    attributionRequired: boolean; attributionText: string | null; conditions: string | null;
    unresolvedIssue: string | null;
  }[];
};

async function resolveLineage(
  sql: CapacitySqlExecutor, count: () => void, interfaceSlug: string, gridAreaSlug: string,
  calculationVersion: string,
): Promise<Lineage> {
  count();
  const meta = await sql.query(
    `select si.id as source_interface_id, ga.id as grid_area_id, cv.id as calculation_version_id
       from reference.source_interfaces si
       cross join reference.grid_areas ga
       cross join reference.transmission_calculation_versions cv
      where si.slug = $1 and ga.slug = $2 and cv.version = $3`,
    [interfaceSlug, gridAreaSlug, calculationVersion],
  );
  const row = meta.rows[0];
  if (row === undefined) {
    throw new Error(`no lineage for ${interfaceSlug}/${gridAreaSlug}/${calculationVersion}`);
  }
  count();
  const rights = await sql.query(
    `select purpose_code, id, rights_classification, disposition, attribution_required,
            attribution_text, conditions, unresolved_issue
       from reference.source_use_permissions
      where source_interface_id = $1
        and (purpose_code like 'transmission%'
             or purpose_code like 'public_transmission%'
             or purpose_code = 'internal_retention')`,
    [String(row.source_interface_id)],
  );
  return {
    sourceInterfaceId: String(row.source_interface_id),
    gridAreaId: String(row.grid_area_id),
    calculationVersionId: String(row.calculation_version_id),
    rights: rights.rows.map((r) => ({
      purposeCode: String(r.purpose_code), permissionId: String(r.id),
      classification: String(r.rights_classification), disposition: String(r.disposition),
      attributionRequired: Boolean(r.attribution_required),
      attributionText: r.attribution_text == null ? null : String(r.attribution_text),
      conditions: r.conditions == null ? null : String(r.conditions),
      unresolvedIssue: r.unresolved_issue == null ? null : String(r.unresolved_issue),
    })),
  };
}

export async function persistTransmissionExtraction(
  sql: CapacitySqlExecutor,
  adapter: TransmissionAdapter,
  artifact: RetrievedArtifact,
  ref: TransmissionArtifactRef,
  extraction: ParseResult,
  collectorIdentity: string,
  options: { calculationVersion?: string; implausibleAboveMw?: number } = {},
): Promise<TransmissionWriteResult> {
  const startedAt = Date.now();
  const calculationVersion = options.calculationVersion ?? "0.1.0";
  const implausibleAboveMw = options.implausibleAboveMw ?? IMPLAUSIBLE_LIMIT_MW;
  const result = emptyResult(adapter.key);
  result.artifactSha256 = artifact.sha256;
  let statements = 0;
  const count = () => { statements += 1; };

  const lineage = await resolveLineage(
    sql, count, adapter.sourceInterfaceSlug, adapter.gridAreaSlug, calculationVersion);

  count();
  await sql.query("begin", []);
  try {
    // ------------------------------------------------------------- snapshot first
    // Identity before work: if these bytes are already held, there is nothing to do and doing
    // anything would be writing a second copy of the same evidence.
    count();
    const existing = await sql.query(
      `select id from pipeline.transmission_snapshots
        where source_interface_id = $1 and artifact_sha256 = $2 and native_snapshot_key = $3`,
      [lineage.sourceInterfaceId, artifact.sha256, ref.nativeKey],
    );
    if (existing.rows[0] !== undefined) {
      count();
      await sql.query("commit", []);
      result.snapshotId = String(existing.rows[0]!.id);
      result.snapshot = "existing";
      result.statements = statements;
      result.persistMs = Date.now() - startedAt;
      return result;
    }

    // ------------------------------------------------------------- retrieval and rights
    const retrievalKey = `transmission-headroom:${adapter.key}:${artifact.sha256}`;
    count();
    const inserted = await sql.query(
      `insert into pipeline.source_retrievals
         (source_interface_id, idempotency_key, requested_at, completed_at, request_method,
          request_url, request_parameters, response_status, response_content_type, response_hash,
          response_byte_length, raw_artifact_ref, record_count, source_claimed_complete,
          enumeration_assessment, enumeration_evidence, collector_identity, retrieval_purpose,
          permission_grant_id)
       values ($1,$2,$3,$3,'GET',$4,$5::jsonb,$6,$7,$8,$9,$10,$11,null,'complete',$12,$13,'research',null)
       on conflict (idempotency_key) do nothing returning id`,
      [
        lineage.sourceInterfaceId, retrievalKey, artifact.retrievedAt, artifact.url,
        JSON.stringify({ artifact: ref.nativeKey }), artifact.status, artifact.contentType,
        artifact.sha256, artifact.byteLength, `${adapter.key}/${ref.nativeKey}`,
        extraction.observations.length,
        `Whole published artifact retrieved in one request; SHA-256 ${artifact.sha256}.`,
        collectorIdentity,
      ],
    );
    let retrievalId: string;
    if (inserted.rows[0] !== undefined) {
      retrievalId = String(inserted.rows[0]!.id);
      result.retrievalsInserted += 1;
    } else {
      count();
      const found = await sql.query(
        `select id from pipeline.source_retrievals where idempotency_key = $1`, [retrievalKey]);
      if (!found.rows[0]) throw new Error("the retrieval was neither inserted nor found");
      retrievalId = String(found.rows[0]!.id);
      result.retrievalsReused += 1;
    }

    // The rights in force at the moment of retrieval, frozen. A later reclassification never
    // rewrites what was true when the bytes were taken.
    for (const right of lineage.rights) {
      count();
      const snap = await sql.query(
        `insert into pipeline.retrieval_rights_snapshots
           (retrieval_id, purpose_code, source_use_permission_id, rights_classification,
            disposition, attribution_required, attribution_text, conditions, unresolved_issue, captured_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing returning id`,
        [retrievalId, right.purposeCode, right.permissionId, right.classification,
          right.disposition, right.attributionRequired, right.attributionText, right.conditions,
          right.unresolvedIssue, artifact.retrievedAt],
      );
      if (snap.rows[0] !== undefined) result.rightsSnapshots += 1;
    }

    // ------------------------------------------------------------- snapshot
    count();
    const snapshot = await sql.query(
      `insert into pipeline.transmission_snapshots
         (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
          coverage_start, coverage_end, source_published_at, observed_at, currentness_status,
          record_count, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'current',$10,$11) returning id`,
      [
        lineage.sourceInterfaceId, lineage.gridAreaId, retrievalId, ref.nativeKey, artifact.sha256,
        ref.coverageStart ?? null, ref.coverageEnd ?? null,
        extraction.sourcePublishedAt?.toISOString() ?? null, artifact.retrievedAt,
        extraction.observations.length,
        `${extraction.observations.length} rows parsed, ${extraction.deferrals.length} deferred.`,
      ],
    );
    const snapshotId = String(snapshot.rows[0]!.id);
    result.snapshotId = snapshotId;
    result.snapshot = "created";

    // ------------------------------------------------------------- raw evidence, before anything
    const rawRows = extraction.observations.map((observation) => ({
      observation, hash: recordHash(observation),
    }));
    const rawIds = new Map<string, string>();
    for (const batch of chunkFor(rawRows, 11)) {
      const params: unknown[] = [];
      for (const { observation, hash } of batch) {
        params.push(snapshotId, retrievalId, artifact.sha256, hash, observation.nativeEntityKey,
          observation.nativeTimestamp, observation.rowOrdinal,
          JSON.stringify({ artifact: ref.nativeKey, rowOrdinal: observation.rowOrdinal }),
          JSON.stringify(observation.payload), EXTRACTION_VERSION, artifact.retrievedAt);
      }
      count();
      const written = await sql.query(
        `insert into pipeline.raw_transmission_records
           (snapshot_id, retrieval_id, artifact_sha256, record_hash, native_entity_key,
            native_timestamp, row_ordinal, locator, payload, extraction_version, created_at)
         values ${placeholders(batch.length, 11, { 7: "jsonb", 8: "jsonb" })}
         on conflict (snapshot_id, record_hash) do nothing
         returning id, record_hash`,
        params,
      );
      result.rawRecordsInserted += written.rows.length;
      for (const row of written.rows) rawIds.set(String(row.record_hash), String(row.id));
    }
    // A row whose hash collided with one already in this snapshot is genuinely the same row.
    const missing = rawRows.filter(({ hash }) => !rawIds.has(hash));
    if (missing.length > 0) {
      for (const batch of chunkFor(missing, 1)) {
        count();
        const found = await sql.query(
          `select id, record_hash from pipeline.raw_transmission_records
            where snapshot_id = $1 and record_hash = any($2::text[])`,
          [snapshotId, batch.map(({ hash }) => hash)],
        );
        for (const row of found.rows) rawIds.set(String(row.record_hash), String(row.id));
        break;
      }
    }

    // ------------------------------------------------------------- canonical entities
    const entityIds = await upsertEntities(
      sql, count, adapter, lineage, extraction.observations, result);

    // ------------------------------------------------------------- flow and limit observations
    const flowIds = await insertFlows(
      sql, count, adapter, lineage, snapshotId, extraction.observations, entityIds, rawIds,
      rawRows, result);
    const limitIds = await insertLimits(
      sql, count, adapter, lineage, snapshotId, extraction.observations, entityIds, rawIds,
      rawRows, implausibleAboveMw, result);

    // ------------------------------------------------------------- derived margins
    await insertMargins(
      sql, count, adapter, lineage, extraction.observations, entityIds, flowIds, limitIds,
      implausibleAboveMw, result);

    // ------------------------------------------------------------- deferrals
    if (extraction.deferrals.length > 0) {
      for (const batch of chunkFor(extraction.deferrals, 6)) {
        const params: unknown[] = [];
        for (const d of batch) {
          params.push(snapshotId, d.reason, d.nativeEntityKey ?? null, d.nativeValue ?? null,
            d.detail, d.rowOrdinal ?? null);
        }
        count();
        const written = await sql.query(
          `insert into pipeline.transmission_deferrals
             (snapshot_id, reason, native_entity_key, native_value, detail, row_ordinal)
           values ${placeholders(batch.length, 6)}
           on conflict do nothing returning id`,
          params,
        );
        result.deferralsRecorded += written.rows.length;
      }
    }

    count();
    await sql.query("commit", []);
  } catch (error) {
    count();
    await sql.query("rollback", []);
    throw error;
  }

  result.statements = statements;
  result.persistMs = Date.now() - startedAt;
  return result;
}

async function upsertEntities(
  sql: CapacitySqlExecutor, count: () => void, adapter: TransmissionAdapter, lineage: Lineage,
  observations: readonly ParsedObservation[], result: TransmissionWriteResult,
): Promise<Map<string, string>> {
  const byKey = new Map<string, ParsedObservation>();
  const seenAt = new Map<string, { first: Date; last: Date }>();
  for (const observation of observations) {
    if (!byKey.has(observation.nativeEntityKey)) byKey.set(observation.nativeEntityKey, observation);
    const window = seenAt.get(observation.nativeEntityKey);
    if (window === undefined) {
      seenAt.set(observation.nativeEntityKey, { first: observation.observedAt, last: observation.observedAt });
    } else {
      if (observation.observedAt < window.first) window.first = observation.observedAt;
      if (observation.observedAt > window.last) window.last = observation.observedAt;
    }
  }

  const ids = new Map<string, string>();
  const entries = [...byKey.entries()];

  if (adapter.entityKind === "interface") {
    for (const batch of chunkFor(entries, 6)) {
      const params: unknown[] = [];
      for (const [key, observation] of batch) {
        const window = seenAt.get(key)!;
        params.push(lineage.sourceInterfaceId, lineage.gridAreaId, key, observation.nativeName,
          window.first.toISOString(), window.last.toISOString());
      }
      count();
      // The name is refreshed because it is a display attribute that genuinely changes; the Point
      // ID is what identifies the interface and it never moves.
      const written = await sql.query(
        `insert into pipeline.transmission_interfaces
           (source_interface_id, grid_area_id, native_id, native_name, first_seen_at, last_seen_at)
         values ${placeholders(batch.length, 6)}
         on conflict (source_interface_id, native_id) do update set
           native_name = excluded.native_name,
           first_seen_at = least(pipeline.transmission_interfaces.first_seen_at, excluded.first_seen_at),
           last_seen_at = greatest(pipeline.transmission_interfaces.last_seen_at, excluded.last_seen_at)
         returning id, native_id, (xmax = 0) as is_new`,
        params,
      );
      for (const row of written.rows) {
        ids.set(String(row.native_id), String(row.id));
        if (row.is_new) result.entitiesInserted += 1; else result.entitiesReused += 1;
      }
    }
    return ids;
  }

  for (const batch of chunkFor(entries, 11)) {
    const params: unknown[] = [];
    for (const [, observation] of batch) {
      params.push(lineage.sourceInterfaceId, lineage.gridAreaId, observation.nativeName,
        observation.nativeContingencyName ?? "", observation.contingencyKind,
        observation.fromStation ?? null, observation.toStation ?? null,
        observation.fromStationKv ?? null, observation.toStationKv ?? null,
        seenAt.get(observation.nativeEntityKey)!.first.toISOString(),
        seenAt.get(observation.nativeEntityKey)!.last.toISOString());
    }
    count();
    const written = await sql.query(
      `insert into pipeline.transmission_elements
         (source_interface_id, grid_area_id, native_constraint_name, native_contingency_name,
          contingency_kind, from_station, to_station, from_station_kv, to_station_kv,
          first_seen_at, last_seen_at)
       values ${placeholders(batch.length, 11)}
       on conflict (source_interface_id, native_constraint_name, native_contingency_name) do update set
         from_station = coalesce(excluded.from_station, pipeline.transmission_elements.from_station),
         to_station = coalesce(excluded.to_station, pipeline.transmission_elements.to_station),
         first_seen_at = least(pipeline.transmission_elements.first_seen_at, excluded.first_seen_at),
         last_seen_at = greatest(pipeline.transmission_elements.last_seen_at, excluded.last_seen_at)
       returning id, native_constraint_name, native_contingency_name, (xmax = 0) as is_new`,
      params,
    );
    for (const row of written.rows) {
      ids.set(`${String(row.native_constraint_name)}${ENTITY_KEY_SEPARATOR}${String(row.native_contingency_name)}`,
        String(row.id));
      if (row.is_new) result.entitiesInserted += 1; else result.entitiesReused += 1;
    }
  }
  return ids;
}

function flowDirection(flowMw: number, kind: string): string {
  if (kind === "element") return "unspecified";
  if (flowMw > 0) return "positive";
  if (flowMw < 0) return "negative";
  return "zero";
}

async function insertFlows(
  sql: CapacitySqlExecutor, count: () => void, adapter: TransmissionAdapter, lineage: Lineage,
  snapshotId: string, observations: readonly ParsedObservation[], entityIds: Map<string, string>,
  rawIds: Map<string, string>, rawRows: { observation: ParsedObservation; hash: string }[],
  result: TransmissionWriteResult,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const rows = rawRows.filter(({ observation, hash }) =>
    entityIds.has(observation.nativeEntityKey) && rawIds.has(hash));

  for (const batch of chunkFor(rows, 16)) {
    const params: unknown[] = [];
    for (const { observation, hash } of batch) {
      const entityId = entityIds.get(observation.nativeEntityKey)!;
      params.push(
        lineage.sourceInterfaceId, snapshotId, rawIds.get(hash)!, adapter.entityKind,
        adapter.entityKind === "interface" ? entityId : null,
        adapter.entityKind === "element" ? entityId : null,
        entityId, observation.contingencyKind, observation.observedAt.toISOString(),
        observation.nativeTimestamp, observation.timestampZoneStatus, observation.flowMw,
        flowDirection(observation.flowMw, adapter.entityKind), observation.flowNativeField,
        observation.unitAsPublished, observation.rowOrdinal);
    }
    count();
    const written = await sql.query(
      `insert into pipeline.transmission_flow_observations
         (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, element_id,
          entity_id, contingency_kind, observed_at, native_timestamp, timestamp_zone_status,
          flow_mw, flow_direction, native_field, unit_as_published, row_ordinal)
       values ${placeholders(batch.length, 16)}
       on conflict (source_interface_id, entity_id, observed_at, contingency_kind) do nothing
       returning id, entity_id, observed_at`,
      params,
    );
    for (const row of written.rows) {
      ids.set(flowKey(String(row.entity_id), String(row.observed_at)),
        String(row.id));
    }
    result.flowObservations += written.rows.length;
  }
  return ids;
}

async function insertLimits(
  sql: CapacitySqlExecutor, count: () => void, adapter: TransmissionAdapter, lineage: Lineage,
  snapshotId: string, observations: readonly ParsedObservation[], entityIds: Map<string, string>,
  rawIds: Map<string, string>, rawRows: { observation: ParsedObservation; hash: string }[],
  implausibleAboveMw: number, result: TransmissionWriteResult,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  type Row = {
    observation: ParsedObservation; hash: string;
    limit: ParsedObservation["limits"][number]; state: string;
  };
  const rows: Row[] = [];
  for (const { observation, hash } of rawRows) {
    if (!entityIds.has(observation.nativeEntityKey) || !rawIds.has(hash)) continue;
    for (const limit of observation.limits) {
      rows.push({
        observation, hash, limit,
        state: classifyLimit(limit.limitMw, {
          sentinel: adapter.entityKind === "interface", implausibleAboveMw,
        }),
      });
    }
  }

  for (const batch of chunkFor(rows, 16)) {
    const params: unknown[] = [];
    for (const { observation, hash, limit, state } of batch) {
      const entityId = entityIds.get(observation.nativeEntityKey)!;
      params.push(
        lineage.sourceInterfaceId, snapshotId, rawIds.get(hash)!, adapter.entityKind,
        adapter.entityKind === "interface" ? entityId : null,
        adapter.entityKind === "element" ? entityId : null,
        entityId, observation.contingencyKind, observation.observedAt.toISOString(),
        observation.nativeTimestamp, limit.nativeField, limit.direction, limit.limitMw, state,
        observation.unitAsPublished, observation.rowOrdinal);
    }
    count();
    const written = await sql.query(
      `insert into pipeline.transmission_limit_observations
         (source_interface_id, snapshot_id, raw_record_id, entity_kind, interface_id, element_id,
          entity_id, contingency_kind, observed_at, native_timestamp, native_field, direction,
          limit_mw, limit_state, unit_as_published, row_ordinal)
       values ${placeholders(batch.length, 16)}
       on conflict (source_interface_id, entity_id, observed_at, contingency_kind, direction) do nothing
       returning id, entity_id, observed_at, direction`,
      params,
    );
    for (const row of written.rows) {
      ids.set(limitKey(String(row.entity_id), String(row.observed_at), String(row.direction)),
        String(row.id));
    }
    result.limitObservations += written.rows.length;
  }
  return ids;
}

async function insertMargins(
  sql: CapacitySqlExecutor, count: () => void, adapter: TransmissionAdapter, lineage: Lineage,
  observations: readonly ParsedObservation[], entityIds: Map<string, string>,
  flowIds: Map<string, string>, limitIds: Map<string, string>, implausibleAboveMw: number,
  result: TransmissionWriteResult,
): Promise<void> {
  type Row = {
    entityId: string; observation: ParsedObservation; flowId: string;
    outcome: MarginOutcome; limitId: string | null;
  };
  const rows: Row[] = [];

  for (const observation of observations) {
    const entityId = entityIds.get(observation.nativeEntityKey);
    if (entityId === undefined) continue;
    const at = observation.observedAt.toISOString();
    const flowId = flowIds.get(flowKey(entityId, at));
    if (flowId === undefined) continue;

    const find = (direction: string): DirectionalLimit => {
      const limit = observation.limits.find((candidate) => candidate.direction === direction);
      if (limit === undefined) {
        return { limitMw: 0, state: "implausible", nativeField: `${direction} (absent)` };
      }
      return {
        limitMw: limit.limitMw, nativeField: limit.nativeField,
        state: classifyLimit(limit.limitMw, {
          sentinel: adapter.entityKind === "interface", implausibleAboveMw,
        }),
      };
    };

    const outcome = adapter.entityKind === "interface"
      ? deriveDirectionalMargin(observation.flowMw, find("positive"), find("negative"))
      : deriveOrientedMargin(observation.flowMw, find("undirected"));

    const limitId = outcome.selectedLimit === null ? null
      : limitIds.get(limitKey(entityId, at,
        outcome.selectedDirection === "undetermined" ? "undirected" : outcome.selectedDirection)) ?? null;

    // A state that must carry a limit and cannot find the row it measured against is a defect,
    // not something to paper over with a null.
    if (outcome.state === "ok" && limitId === null) continue;

    rows.push({ entityId, observation, flowId, outcome, limitId });
  }

  for (const batch of chunkFor(rows, 12)) {
    const params: unknown[] = [];
    for (const { entityId, observation, flowId, outcome, limitId } of batch) {
      params.push(
        lineage.sourceInterfaceId, lineage.calculationVersionId, adapter.entityKind, entityId,
        observation.contingencyKind, observation.observedAt.toISOString(), flowId,
        outcome.state === "zero_flow_direction_undetermined" ? null : limitId,
        outcome.selectedDirection,
        outcome.selectedLimit === null ? null : outcome.selectedLimit.nativeField,
        outcome.state, outcome.headroomMw);
    }
    count();
    const written = await sql.query(
      `insert into pipeline.transmission_margins
         (source_interface_id, calculation_version_id, entity_kind, entity_id, contingency_kind,
          observed_at, flow_observation_id, limit_observation_id, selected_direction,
          limit_field_used, state, headroom_mw)
       values ${placeholders(batch.length, 12)}
       on conflict (calculation_version_id, entity_id, observed_at, contingency_kind, selected_direction)
         do nothing
       returning id, state`,
      params,
    );
    result.marginsInserted += written.rows.length;
    for (const row of written.rows) {
      const state = String(row.state);
      result.marginsByState[state] = (result.marginsByState[state] ?? 0) + 1;
    }
  }
}

export { isEligibleLimit };
