/**
 * Persistence for Grid Buildout Velocity evidence.
 *
 * Snapshot identity is the source interface, the content hash and the publisher's vintage key, and
 * it is checked before any work. Both publishers republish in place at a stable URL, so the bytes
 * are the only reliable change signal — and a rerun over unchanged bytes writes nothing at all
 * rather than re-deriving rows and leaning on conflict clauses downstream.
 *
 * Raw rows are written before anything is canonicalised, and canonicalisation never writes back
 * into them. Every canonical row cites the raw row it came from, in the same snapshot; the domain
 * check rejects any that do not.
 */

import { createHash } from "node:crypto";

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type { BuildoutAdapter, ParsedProjectRow, ParsedSnapshot } from "@/lib/grid-buildout/ingest/types";

/** PostgreSQL binds at most 65,535 parameters per statement; this stays well inside it. */
const WRITE_BATCH_ROWS = 500;

export type BuildoutWriteResult = {
  source: string;
  snapshot: "created" | "existing";
  snapshotId: string;
  artifactSha256: string;
  retrievalsInserted: number;
  rawRecordsInserted: number;
  projectsInserted: number;
  projectsReused: number;
  projectObservations: number;
  lifecycleObservations: number;
  milestones: number;
  quantities: number;
  relationships: number;
  relationshipsResolved: number;
  deferrals: number;
  lifecycleCounts: Record<string, number>;
  milestoneCounts: Record<string, number>;
  statements: number;
};

function emptyResult(source: string): BuildoutWriteResult {
  return {
    source, snapshot: "existing", snapshotId: "", artifactSha256: "",
    retrievalsInserted: 0, rawRecordsInserted: 0, projectsInserted: 0, projectsReused: 0,
    projectObservations: 0, lifecycleObservations: 0, milestones: 0, quantities: 0,
    relationships: 0, relationshipsResolved: 0, deferrals: 0,
    lifecycleCounts: {}, milestoneCounts: {}, statements: 0,
  };
}

function chunk<T>(items: readonly T[], paramsPerRow: number): T[][] {
  const perStatement = Math.max(1, Math.min(WRITE_BATCH_ROWS, Math.floor(60_000 / paramsPerRow)));
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += perStatement) out.push(items.slice(at, at + perStatement));
  return out;
}

function placeholders(rows: number, columns: number, offset = 0): string {
  const groups: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const slots: string[] = [];
    for (let column = 0; column < columns; column += 1) slots.push(`$${offset + row * columns + column + 1}`);
    groups.push(`(${slots.join(",")})`);
  }
  return groups.join(",");
}

export async function persistSnapshot(
  sql: CapacitySqlExecutor,
  adapter: BuildoutAdapter,
  artifact: RetrievedArtifact,
  parsed: ParsedSnapshot,
): Promise<BuildoutWriteResult> {
  const result = emptyResult(adapter.key);
  result.artifactSha256 = artifact.sha256;
  let statements = 0;
  const count = () => { statements += 1; };

  const lineage = await sql.query(
    `select si.id as source_interface_id, ga.id as grid_area_id
       from reference.source_interfaces si
       cross join reference.grid_areas ga
      where si.slug = $1 and ga.slug = $2`,
    [adapter.sourceSlug, adapter.marketSlug],
  );
  count();
  const lineageRow = lineage.rows[0];
  if (lineageRow === undefined) {
    throw new Error(`no source interface ${adapter.sourceSlug} or grid area ${adapter.marketSlug}`);
  }
  const sourceInterfaceId = String(lineageRow.source_interface_id);
  const gridAreaId = String(lineageRow.grid_area_id);

  // Snapshot-first: identity is checked before a single row is derived.
  const existing = await sql.query(
    `select id from pipeline.buildout_snapshots
      where source_interface_id = $1 and artifact_sha256 = $2 and native_snapshot_key = $3`,
    [sourceInterfaceId, artifact.sha256, parsed.nativeSnapshotKey],
  );
  count();
  if (existing.rows[0] !== undefined) {
    result.snapshot = "existing";
    result.snapshotId = String(existing.rows[0]!.id);
    result.statements = statements;
    return result;
  }

  const rowCount = parsed.lists.reduce((total, list) => total + list.rows.length, 0);
  const retrievalKey = createHash("sha256")
    .update(`gbv/${adapter.key}/${parsed.nativeSnapshotKey}/${artifact.sha256}`).digest("hex");

  const retrieval = await sql.query(
    `insert into pipeline.source_retrievals
       (source_interface_id, idempotency_key, requested_at, completed_at, request_method,
        request_url, request_parameters, response_status, response_content_type, response_hash,
        response_byte_length, raw_artifact_ref, record_count, source_claimed_complete,
        enumeration_assessment, enumeration_evidence, collector_identity, retrieval_purpose,
        permission_grant_id)
     values ($1,$2,$3,$3,'GET',$4,$5::jsonb,$6,$7,$8,$9,$10,$11,null,'complete',$12,$13,'research',null)
     on conflict (idempotency_key) do nothing returning id`,
    [
      sourceInterfaceId, retrievalKey, artifact.retrievedAt, artifact.url,
      JSON.stringify({ vintage: parsed.nativeSnapshotKey }), artifact.status, artifact.contentType,
      artifact.sha256, artifact.byteLength, `grid-buildout/${adapter.key}/${parsed.nativeSnapshotKey}`,
      rowCount,
      `Whole published workbook retrieved in one request; SHA-256 ${artifact.sha256}.`,
      `urdais-grid-buildout-v1/${adapter.key}`,
    ],
  );
  count();
  let retrievalId: string;
  if (retrieval.rows[0] !== undefined) {
    retrievalId = String(retrieval.rows[0]!.id);
    result.retrievalsInserted += 1;
  } else {
    const found = await sql.query(
      `select id from pipeline.source_retrievals where idempotency_key = $1`, [retrievalKey]);
    count();
    retrievalId = String(found.rows[0]!.id);
  }

  const snapshot = await sql.query(
    `insert into pipeline.buildout_snapshots
       (source_interface_id, grid_area_id, retrieval_id, native_snapshot_key, artifact_sha256,
        artifact_url, artifact_bytes, source_published_at, observed_at, record_count, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [
      sourceInterfaceId, gridAreaId, retrievalId, parsed.nativeSnapshotKey, artifact.sha256,
      artifact.url, artifact.byteLength, parsed.sourcePublishedAt, artifact.retrievedAt, rowCount,
      `${parsed.lists.length} list(s): ${parsed.lists.map((l) => `${l.name}=${l.rows.length}`).join(", ")}`,
    ],
  );
  count();
  const snapshotId = String(snapshot.rows[0]!.id);
  result.snapshot = "created";
  result.snapshotId = snapshotId;

  // ---- raw evidence, before anything is canonicalised
  type RawKey = string;
  const rawIds = new Map<RawKey, string>();
  const rawRows = parsed.lists.flatMap((list) =>
    list.rows.map((row) => ({ list: list.name, row })));

  for (const batch of chunk(rawRows, 5)) {
    const values: unknown[] = [];
    for (const item of batch) {
      values.push(snapshotId, item.list, item.row.rowOrdinal, item.row.nativeId,
        JSON.stringify(item.row.payload));
    }
    const inserted = await sql.query(
      `insert into pipeline.raw_buildout_records
         (snapshot_id, native_list, row_ordinal, native_id, payload)
       values ${placeholders(batch.length, 5)}
       returning id, native_list, row_ordinal`,
      values,
    );
    count();
    for (const row of inserted.rows) {
      rawIds.set(`${String(row.native_list)}#${String(row.row_ordinal)}`, String(row.id));
    }
    result.rawRecordsInserted += batch.length;
  }

  // ---- durable identity
  //
  // Occurrence disambiguates a project number that repeats within one snapshot. ERCOT's Future
  // sheet holds five such repeats. Both rows are kept and neither is merged into the other.
  const occurrences = new Map<string, number>();
  const listsById = new Map<string, Set<string>>();
  const identified: { list: string; row: ParsedProjectRow; occurrence: number }[] = [];
  const ambiguities: { key: string; detail: string }[] = [];
  for (const { list, row } of rawRows) {
    if (row.nativeId === null) continue;
    const next = (occurrences.get(row.nativeId) ?? 0) + 1;
    occurrences.set(row.nativeId, next);
    const lists = listsById.get(row.nativeId) ?? new Set<string>();
    lists.add(list);
    listsById.set(row.nativeId, lists);
    if (next > 1) {
      // Two shapes of repeat, and neither is resolved by guessing.
      //
      // Within one list (ERCOT's five Future rows) the publisher has simply used a number twice.
      // Across lists is different: CAISO puts one TP Project ID on several transmission-owner
      // sheets when the work is co-owned, and those rows plainly describe one project. Merging
      // them would be defensible only with a rule the publisher has not stated, so both stay
      // separate occurrences and the ambiguity is recorded for GBV-3 rather than decided here.
      const across = lists.size > 1;
      ambiguities.push({
        key: row.nativeId,
        detail: across
          ? `Identifier appears on ${lists.size} lists (${[...lists].sort().join(", ")}), occurrence ${next}. `
            + "Likely one co-owned project split across owners. Held as separate occurrences; a metric "
            + "counting distinct projects must resolve this before treating them as independent."
          : `Identifier repeats within list ${list} (occurrence ${next}). Every row is retained and `
            + "none is merged into another.",
      });
    }
    identified.push({ list, row, occurrence: next });
  }

  const projectIds = new Map<string, string>();
  const existingProjects = await sql.query(
    `select id, native_id, occurrence from pipeline.buildout_projects where source_interface_id = $1`,
    [sourceInterfaceId],
  );
  count();
  for (const row of existingProjects.rows) {
    projectIds.set(`${String(row.native_id)}#${String(row.occurrence)}`, String(row.id));
  }

  const missing = identified.filter((item) => !projectIds.has(`${item.row.nativeId}#${item.occurrence}`));
  for (const batch of chunk(missing, 5)) {
    const values: unknown[] = [];
    for (const item of batch) {
      values.push(sourceInterfaceId, gridAreaId, item.row.nativeId, item.occurrence, snapshotId);
    }
    const inserted = await sql.query(
      `insert into pipeline.buildout_projects
         (source_interface_id, grid_area_id, native_id, occurrence, first_snapshot_id)
       values ${placeholders(batch.length, 5)}
       on conflict (source_interface_id, native_id, occurrence) do nothing
       returning id, native_id, occurrence`,
      values,
    );
    count();
    for (const row of inserted.rows) {
      projectIds.set(`${String(row.native_id)}#${String(row.occurrence)}`, String(row.id));
    }
    result.projectsInserted += inserted.rows.length;
  }
  result.projectsReused = identified.length - result.projectsInserted;

  const resolve = (item: { list: string; row: ParsedProjectRow; occurrence: number }) => ({
    projectId: projectIds.get(`${item.row.nativeId}#${item.occurrence}`)!,
    rawId: rawIds.get(`${item.list}#${item.row.rowOrdinal}`)!,
  });

  // ---- project observations
  for (const batch of chunk(identified, 12)) {
    const values: unknown[] = [];
    for (const item of batch) {
      const { projectId, rawId } = resolve(item);
      values.push(projectId, snapshotId, rawId, item.list, item.row.title, item.row.description,
        item.row.sponsor, item.row.nativeStatus, item.row.tier,
        item.row.driver.klass, item.row.driver.basis, item.row.driver.evidence);
    }
    const written = await sql.query(
      `insert into pipeline.buildout_project_observations
         (project_id, snapshot_id, raw_record_id, native_list, title, description, sponsor,
          native_status, tier, driver_class, driver_basis, driver_evidence)
       values ${placeholders(batch.length, 12)}
       on conflict (project_id, snapshot_id) do nothing returning id`,
      values,
    );
    count();
    result.projectObservations += written.rows.length;
  }

  // ---- lifecycle
  for (const batch of chunk(identified, 7)) {
    const values: unknown[] = [];
    for (const item of batch) {
      const { projectId, rawId } = resolve(item);
      values.push(projectId, snapshotId, rawId, item.row.lifecycle.state, item.row.lifecycle.basis,
        item.row.nativeStatus, item.list);
      result.lifecycleCounts[item.row.lifecycle.state] =
        (result.lifecycleCounts[item.row.lifecycle.state] ?? 0) + 1;
    }
    const written = await sql.query(
      `insert into pipeline.buildout_lifecycle_observations
         (project_id, snapshot_id, raw_record_id, lifecycle_state, basis, native_status, native_list)
       values ${placeholders(batch.length, 7)}
       on conflict (project_id, snapshot_id) do nothing returning id`,
      values,
    );
    count();
    result.lifecycleObservations += written.rows.length;
  }

  // ---- milestones
  const milestoneRows = identified.flatMap((item) => {
    const { projectId, rawId } = resolve(item);
    return item.row.milestones.map((milestone) => ({ projectId, rawId, milestone }));
  });
  for (const batch of chunk(milestoneRows, 10)) {
    const values: unknown[] = [];
    for (const { projectId, rawId, milestone } of batch) {
      values.push(projectId, snapshotId, rawId, milestone.kind, milestone.vintageLabel,
        milestone.date, milestone.precision, milestone.quality, milestone.native, milestone.sourceField);
      result.milestoneCounts[milestone.kind] = (result.milestoneCounts[milestone.kind] ?? 0) + 1;
    }
    const written = await sql.query(
      `insert into pipeline.buildout_milestones
         (project_id, snapshot_id, raw_record_id, kind, vintage_label, observed_date,
          date_precision, date_quality, native_value, source_field)
       values ${placeholders(batch.length, 10)}
       on conflict do nothing returning id`,
      values,
    );
    count();
    result.milestones += written.rows.length;
  }

  // ---- quantities
  const quantityRows = identified.flatMap((item) => {
    const { projectId, rawId } = resolve(item);
    return item.row.quantities.map((quantity) => ({ projectId, rawId, quantity }));
  });
  for (const batch of chunk(quantityRows, 7)) {
    const values: unknown[] = [];
    for (const { projectId, rawId, quantity } of batch) {
      values.push(projectId, snapshotId, rawId, quantity.kind, quantity.value,
        quantity.native, quantity.isReported);
    }
    const written = await sql.query(
      `insert into pipeline.buildout_quantities
         (project_id, snapshot_id, raw_record_id, kind, value_numeric, native_value, is_reported)
       values ${placeholders(batch.length, 7)}
       on conflict (project_id, snapshot_id, kind) do nothing returning id`,
      values,
    );
    count();
    result.quantities += written.rows.length;
  }

  // ---- relationships
  //
  // A related identifier is resolved only against projects this source already holds. An
  // unresolved reference stays a stated relationship with a null target and a deferral, never a
  // guess at which project was meant.
  const relationshipRows = identified.flatMap((item) => {
    const { projectId } = resolve(item);
    return item.row.relationships.map((relationship) => ({ projectId, relationship }));
  });
  const unresolved: { key: string; detail: string }[] = [];
  for (const batch of chunk(relationshipRows, 5)) {
    const values: unknown[] = [];
    for (const { projectId, relationship } of batch) {
      const target = projectIds.get(`${relationship.relatedNativeId}#1`) ?? null;
      if (target === null) {
        unresolved.push({
          key: relationship.relatedNativeId,
          detail: `Stated ${relationship.kind} target ${relationship.relatedNativeId} is not a project in this snapshot.`,
        });
      } else {
        result.relationshipsResolved += 1;
      }
      values.push(projectId, snapshotId, relationship.kind, relationship.relatedNativeId,
        target === projectId ? null : target);
    }
    const written = await sql.query(
      `insert into pipeline.buildout_relationships
         (project_id, snapshot_id, kind, related_native_id, related_project_id)
       values ${placeholders(batch.length, 5)}
       on conflict (project_id, snapshot_id, kind, related_native_id) do nothing returning id`,
      values,
    );
    count();
    result.relationships += written.rows.length;
  }

  // ---- deferrals
  const deferrals = [
    ...parsed.deferrals,
    ...ambiguities.map((item) => ({
      reason: "duplicate_native_id" as const, nativeList: null, nativeKey: item.key,
      nativeValue: null, detail: item.detail, rowOrdinal: null,
    })),
    ...unresolved.map((item) => ({
      reason: "unresolved_relationship" as const, nativeList: null, nativeKey: item.key,
      nativeValue: null, detail: item.detail, rowOrdinal: null,
    })),
  ];
  for (const batch of chunk(deferrals, 7)) {
    const values: unknown[] = [];
    for (const deferral of batch) {
      values.push(snapshotId, deferral.reason, deferral.nativeList, deferral.nativeKey,
        deferral.nativeValue, deferral.detail, deferral.rowOrdinal);
    }
    const written = await sql.query(
      `insert into pipeline.buildout_deferrals
         (snapshot_id, reason, native_list, native_key, native_value, detail, row_ordinal)
       values ${placeholders(batch.length, 7)}
       on conflict do nothing returning id`,
      values,
    );
    count();
    result.deferrals += written.rows.length;
  }

  result.statements = statements;
  return result;
}
