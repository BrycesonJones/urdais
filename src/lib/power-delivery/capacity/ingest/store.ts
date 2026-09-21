/**
 * The write path every capacity adapter shares.
 *
 * Idempotence is enforced at four levels rather than assumed: a retrieval is keyed by artifact
 * content, a raw record by a hash of the value, its term and its locator, a vintage by the
 * publisher's release key, and a canonical row by the identity its partial unique index enforces.
 * Running the same artifact twice writes nothing the second time; running a corrected artifact
 * supersedes only the values that changed and leaves the earlier evidence in place.
 *
 * Two canonical layers, written the same way. A component is what a publisher said a quantity is;
 * a constraint is what the network permits. They are separate tables because Transmission Headroom
 * will read the constraints without reading the capacity, and neither should keep a private copy
 * of the other.
 *
 * One transaction per source. A publisher that has reorganised its workbook fails alone.
 */

import { randomUUID } from "node:crypto";

import { CAPACITY_EXTRACTION_VERSION, capacityRecordHash, capacityRetrievalKey } from "@/lib/power-delivery/capacity/ingest/artifact";
import type {
  CapacityAdapter, CapacityExtraction, ComponentTarget, ConstraintTarget, NormalizedCapacityRecord,
} from "@/lib/power-delivery/capacity/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

/**
 * How many rows go into one statement.
 *
 * Chosen from the binding limit, not by feel: PostgreSQL accepts at most 65,535 bound parameters
 * per statement, and the widest row written here is a raw capacity record at 24 columns, so 1,000
 * rows costs 24,000 parameters -- well under the ceiling, with room for the schema to gain columns
 * without anyone having to remember this arithmetic. CAISO's 19,368 rows are twenty statements.
 *
 * A parameter rather than a constant so tests can cross batch boundaries with small fixtures.
 */
export const CAPACITY_WRITE_BATCH_SIZE = 1_000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("batch size must be at least one row");
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function multiRowValues(
  rows: readonly (readonly unknown[])[],
  casts: Readonly<Record<number, string>>,
): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((value, column) => {
      params.push(value);
      const cast = casts[column];
      return cast === undefined ? `$${params.length}` : `$${params.length}::${cast}`;
    });
    return `(${placeholders.join(",")})`;
  });
  return { text: tuples.join(","), params };
}

export type CapacityWriteResult = {
  source: string;
  marketSlug: string;
  vintageId: string;
  vintage: "created" | "existing";
  nativeVintageKey: string;
  retrievalsInserted: number;
  retrievalsReused: number;
  rightsSnapshots: number;
  scenariosCreated: number;
  scenariosExisting: number;
  subareasCreated: number;
  subareasExisting: number;
  interfacesCreated: number;
  interfacesExisting: number;
  rawRecordsInserted: number;
  rawRecordsDuplicate: number;
  componentsInserted: number;
  componentsUnchanged: number;
  componentsRevised: number;
  constraintsInserted: number;
  constraintsUnchanged: number;
  constraintsRevised: number;
  /** Rows kept as evidence with no canonical value, and why each adapter declined to create one. */
  evidenceOnly: number;
  evidenceOnlyReasons: string[];
};

type Lineage = {
  sourceInterfaceId: string;
  gridAreaId: string;
  permissionGrantId: string | null;
  productionAccessState: string;
  rights: {
    purposeCode: string; permissionId: string; classification: string; disposition: string;
    attributionRequired: boolean; attributionText: string | null; conditions: string | null;
    unresolvedIssue: string | null;
  }[];
};

export async function resolveCapacityLineage(
  sql: CapacitySqlExecutor,
  sourceInterfaceSlug: string,
  marketSlug: string,
): Promise<Lineage> {
  const { rows } = await sql.query(
    `select s.id as source_interface_id, s.production_access_state, a.id as grid_area_id,
            (select g.id from reference.permission_grants g
              where g.source_interface_id = s.id and g.effective_from <= now()
                and (g.effective_to is null or g.effective_to > now())
              order by g.effective_from desc limit 1) as permission_grant_id
       from reference.source_interfaces s
       join reference.grid_areas a on a.slug = $2
      where s.slug = $1`,
    [sourceInterfaceSlug, marketSlug],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`no source interface ${sourceInterfaceSlug} or grid area ${marketSlug}`);
  const rights = await sql.query(
    `select id, purpose_code, rights_classification, disposition, attribution_required,
            attribution_text, conditions, unresolved_issue
       from reference.source_use_permissions
      where source_interface_id = $1 and effective_from <= now()
        and (effective_to is null or effective_to > now())
      order by purpose_code`,
    [String(row.source_interface_id)],
  );
  return {
    sourceInterfaceId: String(row.source_interface_id),
    gridAreaId: String(row.grid_area_id),
    permissionGrantId: row.permission_grant_id == null ? null : String(row.permission_grant_id),
    productionAccessState: String(row.production_access_state),
    rights: rights.rows.map((r) => ({
      purposeCode: String(r.purpose_code),
      permissionId: String(r.id),
      classification: String(r.rights_classification),
      disposition: String(r.disposition),
      attributionRequired: r.attribution_required === true,
      attributionText: r.attribution_text == null ? null : String(r.attribution_text),
      conditions: r.conditions == null ? null : String(r.conditions),
      unresolvedIssue: r.unresolved_issue == null ? null : String(r.unresolved_issue),
    })),
  };
}

function locatorColumns(record: NormalizedCapacityRecord): Record<string, unknown> {
  const l = record.locator;
  return {
    workbook_sheet: l.workbookSheet ?? null,
    workbook_range: l.workbookRange ?? null,
    workbook_cell: l.workbookCell ?? null,
    pdf_page: l.pdfPage ?? null,
    pdf_table: l.pdfTable ?? null,
    csv_row_number: l.csvRowNumber ?? null,
    html_selector: l.htmlSelector ?? null,
    document_section: l.documentSection ?? null,
    clause_reference: l.clauseReference ?? null,
    archive_ref: l.archiveRef ?? null,
    archive_member: l.archiveMember ?? null,
    archive_member_hash: l.archiveMemberHash ?? null,
  };
}

export async function persistCapacityExtraction(
  sql: CapacitySqlExecutor,
  adapter: CapacityAdapter,
  artifacts: ReadonlyMap<string, RetrievedArtifact>,
  extraction: CapacityExtraction,
  collectorIdentity: string,
  options: { batchSize?: number } = {},
): Promise<CapacityWriteResult> {
  const batchSize = options.batchSize ?? CAPACITY_WRITE_BATCH_SIZE;
  const lineage = await resolveCapacityLineage(sql, adapter.sourceInterfaceSlug, adapter.marketSlug);
  const result: CapacityWriteResult = {
    source: adapter.key, marketSlug: adapter.marketSlug, vintageId: "", vintage: "existing",
    nativeVintageKey: extraction.vintage.nativeVintageKey,
    retrievalsInserted: 0, retrievalsReused: 0, rightsSnapshots: 0,
    scenariosCreated: 0, scenariosExisting: 0,
    subareasCreated: 0, subareasExisting: 0, interfacesCreated: 0, interfacesExisting: 0,
    rawRecordsInserted: 0, rawRecordsDuplicate: 0,
    componentsInserted: 0, componentsUnchanged: 0, componentsRevised: 0,
    constraintsInserted: 0, constraintsUnchanged: 0, constraintsRevised: 0,
    evidenceOnly: 0, evidenceOnlyReasons: [],
  };

  await sql.query("begin", []);
  try {
    // ------------------------------------------------------------------ retrievals and rights
    const retrievalIds = new Map<string, string>();
    for (const artifact of artifacts.values()) {
      const key = capacityRetrievalKey(adapter.key, artifact);
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
          lineage.sourceInterfaceId, key, artifact.retrievedAt, artifact.url,
          JSON.stringify({ artifact: artifact.label }), artifact.status, artifact.contentType,
          artifact.sha256, artifact.byteLength, `${adapter.key}/${artifact.label}`,
          extraction.records.filter((record) => record.artifactLabel === artifact.label).length,
          `Whole published artifact retrieved in one request; SHA-256 ${artifact.sha256}.`,
          collectorIdentity, adapter.retrievalPurpose,
          adapter.retrievalPurpose === "production" ? lineage.permissionGrantId : null,
        ],
      );
      let retrievalId = inserted.rows[0]?.id == null ? null : String(inserted.rows[0]!.id);
      if (retrievalId === null) {
        const existing = await sql.query(`select id from pipeline.source_retrievals where idempotency_key = $1`, [key]);
        if (!existing.rows[0]) throw new Error(`retrieval for ${artifact.label} was neither inserted nor found`);
        retrievalId = String(existing.rows[0]!.id);
        result.retrievalsReused += 1;
      } else {
        result.retrievalsInserted += 1;
      }
      retrievalIds.set(artifact.label, retrievalId);

      // Freeze the determination each purpose was collected under, at collection time.
      for (const right of lineage.rights) {
        const snapshot = await sql.query(
          `insert into pipeline.retrieval_rights_snapshots
             (retrieval_id, purpose_code, source_use_permission_id, rights_classification,
              disposition, attribution_required, attribution_text, conditions, unresolved_issue, captured_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           on conflict (retrieval_id, purpose_code) do nothing returning id`,
          [retrievalId, right.purposeCode, right.permissionId, right.classification, right.disposition,
            right.attributionRequired, right.attributionText, right.conditions, right.unresolvedIssue,
            artifact.retrievedAt],
        );
        if (snapshot.rows[0] !== undefined) result.rightsSnapshots += 1;
      }
    }

    // ----------------------------------------------------------------------------- geography
    //
    // Localities and interfaces are reference data, not evidence: they outlive any one vintage
    // and are shared with Transmission Headroom. They are matched on the publisher's own key so
    // a second release of the same report reuses them instead of duplicating the map.
    const subareaIds = await resolveSubareas(sql, lineage.gridAreaId, extraction, result);
    const interfaceIds = await resolveInterfaces(sql, lineage.gridAreaId, extraction, subareaIds, result);

    // -------------------------------------------------------------------- vintage and scenarios
    const primaryLabel = adapter.artifacts[0]!.label;
    const primaryRetrieval = retrievalIds.get(primaryLabel);
    if (primaryRetrieval === undefined) throw new Error(`primary artifact ${primaryLabel} was not retrieved`);
    const existingVintage = await sql.query(
      `select id from pipeline.grid_capacity_vintages
        where source_interface_id = $1 and grid_area_id = $2 and native_vintage_key = $3
          and superseded_by_id is null`,
      [lineage.sourceInterfaceId, lineage.gridAreaId, extraction.vintage.nativeVintageKey],
    );
    let vintageId: string;
    if (existingVintage.rows[0] !== undefined) {
      vintageId = String(existingVintage.rows[0]!.id);
    } else {
      const v = extraction.vintage;
      // The determination governing public display of a source value, because that is the one a
      // reader of this vintage is downstream of. It is copied, never decided here.
      const rightsClassification = lineage.rights
        .find((r) => r.purposeCode === "public_raw_grid_capacity_value_display")?.classification;
      if (rightsClassification === undefined) {
        throw new Error(
          `no public_raw_grid_capacity_value_display determination in force for ${adapter.sourceInterfaceSlug}; a vintage is not recorded without one`,
        );
      }
      const created = await sql.query(
        `insert into pipeline.grid_capacity_vintages
           (grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key,
            native_report_id, report_title, release_kind, published_at, published_at_precision,
            retrieved_at, source_methodology_name, source_methodology_version, rights_classification,
            publication_state, quality_status)
         values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10::timestamptz,$11,$12,$13,$14,$15) returning id`,
        [lineage.gridAreaId, lineage.sourceInterfaceId, primaryRetrieval, v.nativeVintageKey,
          v.nativeReportId, v.reportTitle, v.releaseKind, v.publishedAt, v.publishedAtPrecision,
          artifacts.get(primaryLabel)!.retrievedAt, v.sourceMethodologyName, v.sourceMethodologyVersion,
          rightsClassification, v.publicationState, v.qualityStatus],
      );
      vintageId = String(created.rows[0]!.id);
      result.vintage = "created";
    }
    result.vintageId = vintageId;

    const scenarioIds = new Map<string, string>();
    for (const scenario of extraction.scenarios) {
      const found = await sql.query(
        `select id from pipeline.grid_capacity_scenarios where vintage_id = $1 and native_scenario_key = $2`,
        [vintageId, scenario.nativeScenarioKey],
      );
      if (found.rows[0] !== undefined) {
        scenarioIds.set(scenario.nativeScenarioKey, String(found.rows[0]!.id));
        result.scenariosExisting += 1;
        continue;
      }
      const created = await sql.query(
        `insert into pipeline.grid_capacity_scenarios
           (vintage_id, native_scenario_key, native_scenario_label, canonical_class, is_reference,
            assumptions, assumptions_text)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7) returning id`,
        [vintageId, scenario.nativeScenarioKey, scenario.nativeScenarioLabel, scenario.canonicalClass,
          scenario.isReference, JSON.stringify(scenario.assumptions), scenario.assumptionsText],
      );
      scenarioIds.set(scenario.nativeScenarioKey, String(created.rows[0]!.id));
      result.scenariosCreated += 1;
    }

    // ------------------------------------------------------ raw evidence and canonical values
    const candidates = buildRawCandidates(extraction, artifacts, retrievalIds, adapter.key);
    const rawIds = await writeRawRecords(sql, candidates, batchSize, result);

    const liveComponents = await loadLiveComponents(sql, vintageId);
    const liveConstraints = await loadLiveConstraints(sql, vintageId);
    const plan = planCanonicalWrites(
      candidates, rawIds, scenarioIds, subareaIds, interfaceIds, liveComponents, liveConstraints, result,
    );

    // Supersessions first: the partial unique index permits one live row per identity, so a
    // replacement cannot be inserted while the row it replaces is still live. The forward
    // reference is deferrable, so pointing at a row inserted later in this transaction is fine.
    await applySupersessions(sql, "pipeline.grid_capacity_components", plan.componentSupersessions, batchSize);
    await applySupersessions(sql, "pipeline.grid_constraint_values", plan.constraintSupersessions, batchSize);
    await insertComponents(sql, plan.componentInserts, vintageId, lineage.gridAreaId, extraction, batchSize);
    await insertConstraints(sql, plan.constraintInserts, vintageId, lineage.gridAreaId, extraction, batchSize);

    await sql.query("commit", []);
    return result;
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}

// ------------------------------------------------------------------------------- geography

async function resolveSubareas(
  sql: CapacitySqlExecutor,
  gridAreaId: string,
  extraction: CapacityExtraction,
  result: CapacityWriteResult,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const subarea of extraction.subareas) {
    const found = await sql.query(
      `select id from reference.grid_subareas
        where grid_area_id = $1 and subarea_kind = $2 and native_key = $3 and effective_to is null`,
      [gridAreaId, subarea.subareaKind, subarea.nativeKey],
    );
    if (found.rows[0] !== undefined) {
      ids.set(subarea.nativeKey, String(found.rows[0]!.id));
      result.subareasExisting += 1;
      continue;
    }
    const created = await sql.query(
      `insert into reference.grid_subareas
         (grid_area_id, subarea_kind, native_key, native_label, notes, effective_from)
       values ($1,$2,$3,$4,$5,now()) returning id`,
      [gridAreaId, subarea.subareaKind, subarea.nativeKey, subarea.nativeLabel, subarea.notes],
    );
    ids.set(subarea.nativeKey, String(created.rows[0]!.id));
    result.subareasCreated += 1;
  }
  return ids;
}

async function resolveInterfaces(
  sql: CapacitySqlExecutor,
  gridAreaId: string,
  extraction: CapacityExtraction,
  subareaIds: ReadonlyMap<string, string>,
  result: CapacityWriteResult,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const iface of extraction.interfaces) {
    const found = await sql.query(
      `select id from reference.grid_interfaces
        where grid_area_id = $1 and native_key = $2 and effective_to is null`,
      [gridAreaId, iface.nativeKey],
    );
    if (found.rows[0] !== undefined) {
      ids.set(iface.nativeKey, String(found.rows[0]!.id));
      result.interfacesExisting += 1;
      continue;
    }
    const end = (nativeKey: string | null): string | null => {
      if (nativeKey === null) return null;
      const id = subareaIds.get(nativeKey);
      if (id === undefined) throw new Error(`interface ${iface.nativeKey} names undeclared locality ${nativeKey}`);
      return id;
    };
    const created = await sql.query(
      `insert into reference.grid_interfaces
         (grid_area_id, from_subarea_id, to_subarea_id, interface_kind, native_key, native_label,
          external_counterparty, notes, effective_from)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now()) returning id`,
      [gridAreaId, end(iface.fromSubareaNativeKey), end(iface.toSubareaNativeKey), iface.interfaceKind,
        iface.nativeKey, iface.nativeLabel, iface.externalCounterparty, iface.notes],
    );
    ids.set(iface.nativeKey, String(created.rows[0]!.id));
    result.interfacesCreated += 1;
  }
  return ids;
}

// ------------------------------------------------------------------ batched write internals

type RawCandidate = {
  record: NormalizedCapacityRecord;
  retrievalId: string;
  ordinal: number;
  recordHash: string;
  columns: Record<string, unknown>;
  artifactRef: string;
};

/** Pure: everything a raw row needs, computed before any statement is issued. */
function buildRawCandidates(
  extraction: CapacityExtraction,
  artifacts: ReadonlyMap<string, RetrievedArtifact>,
  retrievalIds: ReadonlyMap<string, string>,
  sourceKey: string,
): RawCandidate[] {
  const ordinals = new Map<string, number>();
  return extraction.records.map((record) => {
    const retrievalId = retrievalIds.get(record.artifactLabel);
    if (retrievalId === undefined) throw new Error(`record cites unretrieved artifact ${record.artifactLabel}`);
    const artifact = artifacts.get(record.artifactLabel)!;
    const ordinal = ordinals.get(record.artifactLabel) ?? 0;
    ordinals.set(record.artifactLabel, ordinal + 1);
    const columns = locatorColumns(record);
    return {
      record, retrievalId, ordinal, columns,
      artifactRef: `${sourceKey}/${record.artifactLabel}`,
      recordHash: capacityRecordHash({
        artifactSha256: artifact.sha256,
        nativeGeography: record.nativeGeography,
        nativePeriod: record.nativePeriod,
        nativeScenario: record.nativeScenario,
        nativeTerm: record.nativeTerm,
        nativeValue: record.nativeValue,
        nativeUnit: record.nativeUnit,
        locator: { ...columns, extraction_method: record.locator.extractionMethod },
      }),
    };
  });
}

const RAW_COLUMNS = `retrieval_id,row_ordinal,record_hash,artifact_ref,native_geography,native_period,
  native_scenario,native_term,native_value,native_unit,raw_payload,extraction_method,extraction_version,
  workbook_sheet,workbook_range,workbook_cell,pdf_page,pdf_table,csv_row_number,html_selector,
  document_section,clause_reference,archive_ref,archive_member,archive_member_hash`;
/** Only raw_payload needs a cast; every other column's type is inferable from its target. */
const RAW_CASTS = { 10: "jsonb" } as const;

async function writeRawRecords(
  sql: CapacitySqlExecutor,
  candidates: readonly RawCandidate[],
  batchSize: number,
  result: CapacityWriteResult,
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  const key = (retrievalId: string, hash: string): string => `${retrievalId}|${hash}`;

  for (const batch of chunk(candidates, batchSize)) {
    const rows = batch.map((candidate) => [
      candidate.retrievalId, candidate.ordinal, candidate.recordHash, candidate.artifactRef,
      candidate.record.nativeGeography, candidate.record.nativePeriod, candidate.record.nativeScenario,
      candidate.record.nativeTerm, candidate.record.nativeValue, candidate.record.nativeUnit,
      JSON.stringify(candidate.record.rawPayload), candidate.record.locator.extractionMethod,
      CAPACITY_EXTRACTION_VERSION,
      candidate.columns.workbook_sheet, candidate.columns.workbook_range, candidate.columns.workbook_cell,
      candidate.columns.pdf_page, candidate.columns.pdf_table, candidate.columns.csv_row_number,
      candidate.columns.html_selector, candidate.columns.document_section, candidate.columns.clause_reference,
      candidate.columns.archive_ref, candidate.columns.archive_member, candidate.columns.archive_member_hash,
    ]);
    const values = multiRowValues(rows, RAW_CASTS);
    const inserted = await sql.query(
      `insert into pipeline.raw_grid_capacity_records (${RAW_COLUMNS})
       values ${values.text} on conflict do nothing returning id, retrieval_id, record_hash`,
      values.params,
    );
    for (const row of inserted.rows) {
      idByKey.set(key(String(row.retrieval_id), String(row.record_hash)), String(row.id));
      result.rawRecordsInserted += 1;
    }

    const missing = batch.filter((candidate) => !idByKey.has(key(candidate.retrievalId, candidate.recordHash)));
    if (missing.length === 0) continue;
    const existing = await sql.query(
      `select id, retrieval_id, record_hash from pipeline.raw_grid_capacity_records
        where (retrieval_id, record_hash) in (select r.retrieval_id::uuid, r.record_hash
               from unnest($1::uuid[], $2::text[]) as r(retrieval_id, record_hash))`,
      [missing.map((candidate) => candidate.retrievalId), missing.map((candidate) => candidate.recordHash)],
    );
    for (const row of existing.rows) {
      idByKey.set(key(String(row.retrieval_id), String(row.record_hash)), String(row.id));
    }
    for (const candidate of missing) {
      if (!idByKey.has(key(candidate.retrievalId, candidate.recordHash))) {
        throw new Error(`raw capacity record ${candidate.recordHash} was neither inserted nor found`);
      }
      result.rawRecordsDuplicate += 1;
    }
  }
  return idByKey;
}

/**
 * The identity each partial unique index enforces, as a string. Both sides are normalised the
 * same way so a value read back from PostgreSQL and one parsed from a workbook key identically.
 */
function componentIdentityKey(parts: {
  scenarioId: string; subareaId: string | null; interfaceId: string | null;
  quantityKind: string; componentKind: string; periodBasis: string; targetYear: number;
  targetSeason: string | null; unit: string; capacityBasis: string;
}): string {
  return JSON.stringify([
    parts.scenarioId, parts.subareaId, parts.interfaceId, parts.quantityKind, parts.componentKind,
    parts.periodBasis, parts.targetYear, parts.targetSeason, parts.unit, parts.capacityBasis,
  ]);
}

function constraintIdentityKey(parts: {
  scenarioId: string; interfaceId: string; subareaId: string | null; constraintKind: string;
  direction: string; periodBasis: string; targetYear: number; targetSeason: string | null; unit: string;
}): string {
  return JSON.stringify([
    parts.scenarioId, parts.interfaceId, parts.subareaId, parts.constraintKind, parts.direction,
    parts.periodBasis, parts.targetYear, parts.targetSeason, parts.unit,
  ]);
}

type LiveValue = { id: string; value: number; fromThisRun: boolean };

/**
 * Every live row of this vintage, in one statement instead of one lookup per record.
 *
 * `value::text`, never `value::float8`. PD-3E lost a day to that: production renders float8 at
 * fifteen significant digits and a sixteen-digit value came back different from what it was stored
 * from, so every rerun superseded it. Numeric rendered as text is what was written.
 */
async function loadLiveComponents(sql: CapacitySqlExecutor, vintageId: string): Promise<Map<string, LiveValue>> {
  const { rows } = await sql.query(
    `select id, scenario_id, grid_subarea_id, grid_interface_id, quantity_kind, component_kind,
            period_basis, target_year, target_season, unit, capacity_basis, value::text as value
       from pipeline.grid_capacity_components
      where vintage_id = $1 and superseded_by_id is null`,
    [vintageId],
  );
  const live = new Map<string, LiveValue>();
  for (const row of rows) {
    live.set(componentIdentityKey({
      scenarioId: String(row.scenario_id),
      subareaId: row.grid_subarea_id == null ? null : String(row.grid_subarea_id),
      interfaceId: row.grid_interface_id == null ? null : String(row.grid_interface_id),
      quantityKind: String(row.quantity_kind),
      componentKind: String(row.component_kind),
      periodBasis: String(row.period_basis),
      targetYear: Number(row.target_year),
      targetSeason: row.target_season == null ? null : String(row.target_season),
      unit: String(row.unit),
      capacityBasis: String(row.capacity_basis),
    }), { id: String(row.id), value: Number(row.value), fromThisRun: false });
  }
  return live;
}

async function loadLiveConstraints(sql: CapacitySqlExecutor, vintageId: string): Promise<Map<string, LiveValue>> {
  const { rows } = await sql.query(
    `select id, scenario_id, grid_interface_id, grid_subarea_id, constraint_kind, direction,
            period_basis, target_year, target_season, unit, value::text as value
       from pipeline.grid_constraint_values
      where vintage_id = $1 and superseded_by_id is null`,
    [vintageId],
  );
  const live = new Map<string, LiveValue>();
  for (const row of rows) {
    live.set(constraintIdentityKey({
      scenarioId: String(row.scenario_id),
      interfaceId: String(row.grid_interface_id),
      subareaId: row.grid_subarea_id == null ? null : String(row.grid_subarea_id),
      constraintKind: String(row.constraint_kind),
      direction: String(row.direction),
      periodBasis: String(row.period_basis),
      targetYear: Number(row.target_year),
      targetSeason: row.target_season == null ? null : String(row.target_season),
      unit: String(row.unit),
    }), { id: String(row.id), value: Number(row.value), fromThisRun: false });
  }
  return live;
}

type ComponentInsert = {
  id: string; rawId: string; scenarioId: string; subareaId: string | null; interfaceId: string | null;
  sourceTerm: string; target: ComponentTarget;
};
type ConstraintInsert = {
  id: string; rawId: string; scenarioId: string; interfaceId: string; subareaId: string | null;
  sourceTerm: string; target: ConstraintTarget;
};
type CanonicalPlan = {
  componentInserts: ComponentInsert[];
  constraintInserts: ConstraintInsert[];
  componentSupersessions: { oldId: string; nextId: string }[];
  constraintSupersessions: { oldId: string; nextId: string }[];
};

/**
 * Classify every incoming record against what is live. Records are walked in order and each map
 * is updated as they are classified, so a second record claiming an identity the first just
 * created is compared against it rather than silently superseding it.
 */
function planCanonicalWrites(
  candidates: readonly RawCandidate[],
  rawIds: ReadonlyMap<string, string>,
  scenarioIds: ReadonlyMap<string, string>,
  subareaIds: ReadonlyMap<string, string>,
  interfaceIds: ReadonlyMap<string, string>,
  liveComponents: Map<string, LiveValue>,
  liveConstraints: Map<string, LiveValue>,
  result: CapacityWriteResult,
): CanonicalPlan {
  const plan: CanonicalPlan = {
    componentInserts: [], constraintInserts: [], componentSupersessions: [], constraintSupersessions: [],
  };
  const reasons = new Set<string>();

  const locality = (nativeKey: string | null, term: string): string | null => {
    if (nativeKey === null) return null;
    const id = subareaIds.get(nativeKey);
    if (id === undefined) throw new Error(`record "${term}" names undeclared locality ${nativeKey}`);
    return id;
  };
  const boundary = (nativeKey: string | null, term: string): string | null => {
    if (nativeKey === null) return null;
    const id = interfaceIds.get(nativeKey);
    if (id === undefined) throw new Error(`record "${term}" names undeclared interface ${nativeKey}`);
    return id;
  };

  for (const candidate of candidates) {
    const record = candidate.record;
    if (record.target.kind === "evidence_only") {
      result.evidenceOnly += 1;
      reasons.add(record.target.reason);
      continue;
    }
    const scenarioId = scenarioIds.get(record.target.scenarioKey);
    if (scenarioId === undefined) throw new Error(`record cites undeclared scenario ${record.target.scenarioKey}`);
    const rawId = rawIds.get(`${candidate.retrievalId}|${candidate.recordHash}`);
    if (rawId === undefined) throw new Error(`raw capacity record ${candidate.recordHash} has no id`);

    if (record.target.kind === "component") {
      const target = record.target;
      const subareaId = locality(target.subareaNativeKey, record.nativeTerm);
      const interfaceId = boundary(target.interfaceNativeKey, record.nativeTerm);
      const key = componentIdentityKey({
        scenarioId, subareaId, interfaceId,
        quantityKind: target.quantityKind, componentKind: target.componentKind,
        periodBasis: target.period.periodBasis, targetYear: target.period.targetYear,
        targetSeason: target.period.targetSeason, unit: target.unit, capacityBasis: target.capacityBasis,
      });
      const current = liveComponents.get(key);
      if (current !== undefined && current.value === target.value) {
        result.componentsUnchanged += 1;
        continue;
      }
      if (current !== undefined && current.fromThisRun) {
        throw new Error(
          `two extracted records claim the same capacity identity with different values (${current.value} then ${target.value}); the source has duplicate rows`,
        );
      }
      const nextId = randomUUID();
      if (current !== undefined) {
        plan.componentSupersessions.push({ oldId: current.id, nextId });
        result.componentsRevised += 1;
      } else {
        result.componentsInserted += 1;
      }
      plan.componentInserts.push({ id: nextId, rawId, scenarioId, subareaId, interfaceId, sourceTerm: record.nativeTerm, target });
      liveComponents.set(key, { id: nextId, value: target.value, fromThisRun: true });
      continue;
    }

    const target = record.target;
    const interfaceId = boundary(target.interfaceNativeKey, record.nativeTerm)!;
    const subareaId = locality(target.subareaNativeKey, record.nativeTerm);
    const key = constraintIdentityKey({
      scenarioId, interfaceId, subareaId, constraintKind: target.constraintKind,
      direction: target.direction, periodBasis: target.period.periodBasis,
      targetYear: target.period.targetYear, targetSeason: target.period.targetSeason, unit: target.unit,
    });
    const current = liveConstraints.get(key);
    if (current !== undefined && current.value === target.value) {
      result.constraintsUnchanged += 1;
      continue;
    }
    if (current !== undefined && current.fromThisRun) {
      throw new Error(
        `two extracted records claim the same constraint identity with different values (${current.value} then ${target.value}); the source has duplicate rows`,
      );
    }
    const nextId = randomUUID();
    if (current !== undefined) {
      plan.constraintSupersessions.push({ oldId: current.id, nextId });
      result.constraintsRevised += 1;
    } else {
      result.constraintsInserted += 1;
    }
    plan.constraintInserts.push({ id: nextId, rawId, scenarioId, interfaceId, subareaId, sourceTerm: record.nativeTerm, target });
    liveConstraints.set(key, { id: nextId, value: target.value, fromThisRun: true });
  }

  result.evidenceOnlyReasons = [...reasons].sort();
  return plan;
}

async function applySupersessions(
  sql: CapacitySqlExecutor,
  table: "pipeline.grid_capacity_components" | "pipeline.grid_constraint_values",
  supersessions: readonly { oldId: string; nextId: string }[],
  batchSize: number,
): Promise<void> {
  for (const batch of chunk(supersessions, batchSize)) {
    await sql.query(
      `update ${table} t
          set superseded_by_id = s.next_id, superseded_at = now(),
              supersession_reason = 'the publisher restated this value in a corrected or reissued artifact'
         from unnest($1::uuid[], $2::uuid[]) as s(old_id, next_id)
        where t.id = s.old_id`,
      [batch.map((entry) => entry.oldId), batch.map((entry) => entry.nextId)],
    );
  }
}

const COMPONENT_COLUMNS = `id,vintage_id,scenario_id,grid_area_id,grid_subarea_id,grid_interface_id,
  raw_record_id,quantity_kind,component_kind,source_term,period_basis,target_year,target_season,
  period_start,period_end,value,unit,capacity_basis,quality_status`;
const COMPONENT_CASTS = { 13: "date", 14: "date", 15: "numeric" } as const;

async function insertComponents(
  sql: CapacitySqlExecutor,
  inserts: readonly ComponentInsert[],
  vintageId: string,
  gridAreaId: string,
  extraction: CapacityExtraction,
  batchSize: number,
): Promise<void> {
  for (const batch of chunk(inserts, batchSize)) {
    const rows = batch.map((entry) => [
      entry.id, vintageId, entry.scenarioId, gridAreaId, entry.subareaId, entry.interfaceId, entry.rawId,
      entry.target.quantityKind, entry.target.componentKind, entry.sourceTerm,
      entry.target.period.periodBasis, entry.target.period.targetYear, entry.target.period.targetSeason,
      entry.target.period.periodStart, entry.target.period.periodEnd,
      entry.target.value, entry.target.unit, entry.target.capacityBasis, extraction.vintage.qualityStatus,
    ]);
    const values = multiRowValues(rows, COMPONENT_CASTS);
    await sql.query(
      `insert into pipeline.grid_capacity_components (${COMPONENT_COLUMNS}) values ${values.text}`,
      values.params,
    );
  }
}

const CONSTRAINT_COLUMNS = `id,vintage_id,scenario_id,grid_area_id,grid_interface_id,grid_subarea_id,
  raw_record_id,constraint_kind,direction,source_term,period_basis,target_year,target_season,
  period_start,period_end,value,unit,quality_status`;
const CONSTRAINT_CASTS = { 13: "date", 14: "date", 15: "numeric" } as const;

async function insertConstraints(
  sql: CapacitySqlExecutor,
  inserts: readonly ConstraintInsert[],
  vintageId: string,
  gridAreaId: string,
  extraction: CapacityExtraction,
  batchSize: number,
): Promise<void> {
  for (const batch of chunk(inserts, batchSize)) {
    const rows = batch.map((entry) => [
      entry.id, vintageId, entry.scenarioId, gridAreaId, entry.interfaceId, entry.subareaId, entry.rawId,
      entry.target.constraintKind, entry.target.direction, entry.sourceTerm,
      entry.target.period.periodBasis, entry.target.period.targetYear, entry.target.period.targetSeason,
      entry.target.period.periodStart, entry.target.period.periodEnd,
      entry.target.value, entry.target.unit, extraction.vintage.qualityStatus,
    ]);
    const values = multiRowValues(rows, CONSTRAINT_CASTS);
    await sql.query(
      `insert into pipeline.grid_constraint_values (${CONSTRAINT_COLUMNS}) values ${values.text}`,
      values.params,
    );
  }
}
