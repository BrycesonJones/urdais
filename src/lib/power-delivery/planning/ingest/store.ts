/**
 * The write path every planning adapter shares.
 *
 * Idempotence is the property this module exists to guarantee, and it is enforced at four
 * levels rather than assumed: a retrieval is keyed by artifact content, a raw record by a hash
 * of the value and its locator, a vintage by the publisher's release key, and a canonical point
 * by its scenario, geography, period and measure. Running the same artifact twice therefore
 * writes nothing the second time, and running a corrected artifact supersedes the points that
 * changed while leaving the earlier evidence and the earlier values in place.
 *
 * One transaction per source. A publisher that has reorganised its workbook fails alone.
 */

import { randomUUID } from "node:crypto";

import { planningRecordHash, planningRetrievalKey } from "@/lib/power-delivery/planning/ingest/artifact";
import type {
  CanonicalPointDraft, ExtractedPlanningRecord, PlanningAdapter, PlanningExtraction, RetrievedArtifact,
} from "@/lib/power-delivery/planning/ingest/types";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

/**
 * How many rows go into one statement.
 *
 * Chosen from the binding limit rather than by feel: PostgreSQL accepts at most 65,535 bound
 * parameters per statement, and the widest row written here is a raw planning record at 22
 * columns, so 1,000 rows costs 22,000 parameters -- roughly a third of the ceiling, with room
 * for the schema to gain columns without anyone having to remember this arithmetic. At PJM's
 * typical row width that is a few hundred kilobytes per statement, which is an ordinary request.
 *
 * It is a parameter rather than a constant so tests can cross batch boundaries with small
 * fixtures instead of fifteen thousand rows.
 */
export const PLANNING_WRITE_BATCH_SIZE = 1_000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("batch size must be at least one row");
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/**
 * Build the VALUES list for a multi-row insert. `casts` names the SQL type for columns whose
 * type PostgreSQL cannot infer from a bound parameter; every row is cast, not just the first,
 * so the statement does not depend on which row happens to come first.
 */
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

export type PlanningWriteResult = {
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
  rawRecordsInserted: number;
  rawRecordsDuplicate: number;
  pointsInserted: number;
  pointsUnchanged: number;
  pointsRevised: number;
};

type Lineage = {
  sourceInterfaceId: string;
  gridAreaId: string;
  permissionGrantId: string | null;
  productionAccessState: string;
  rights: { purposeCode: string; permissionId: string; classification: string; disposition: string;
            attributionRequired: boolean; attributionText: string | null; conditions: string | null;
            unresolvedIssue: string | null }[];
};

export async function resolvePlanningLineage(
  sql: PlanningSqlExecutor,
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

function locatorColumns(record: ExtractedPlanningRecord): Record<string, unknown> {
  const l = record.locator;
  return {
    workbook_sheet: l.workbookSheet ?? null,
    workbook_range: l.workbookRange ?? null,
    workbook_cell: l.workbookCell ?? null,
    pdf_page: l.pdfPage ?? null,
    pdf_table: l.pdfTable ?? null,
    csv_row_number: l.csvRowNumber ?? null,
    html_selector: l.htmlSelector ?? null,
    archive_ref: l.archiveRef ?? null,
    archive_member: l.archiveMember ?? null,
    archive_member_hash: l.archiveMemberHash ?? null,
  };
}

export async function persistPlanningExtraction(
  sql: PlanningSqlExecutor,
  adapter: PlanningAdapter,
  artifacts: ReadonlyMap<string, RetrievedArtifact>,
  extraction: PlanningExtraction,
  collectorIdentity: string,
  options: { batchSize?: number } = {},
): Promise<PlanningWriteResult> {
  const batchSize = options.batchSize ?? PLANNING_WRITE_BATCH_SIZE;
  const lineage = await resolvePlanningLineage(sql, adapter.sourceInterfaceSlug, adapter.marketSlug);
  const result: PlanningWriteResult = {
    source: adapter.key, marketSlug: adapter.marketSlug, vintageId: "", vintage: "existing",
    nativeVintageKey: extraction.vintage.nativeVintageKey,
    retrievalsInserted: 0, retrievalsReused: 0, rightsSnapshots: 0,
    scenariosCreated: 0, scenariosExisting: 0, rawRecordsInserted: 0, rawRecordsDuplicate: 0,
    pointsInserted: 0, pointsUnchanged: 0, pointsRevised: 0,
  };

  await sql.query("begin", []);
  try {
    // ------------------------------------------------------------------ retrievals and rights
    const retrievalIds = new Map<string, string>();
    for (const artifact of artifacts.values()) {
      const key = planningRetrievalKey(adapter.key, artifact);
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

    // -------------------------------------------------------------------- vintage and scenarios
    const primaryLabel = adapter.artifacts[0]!.label;
    const primaryRetrieval = retrievalIds.get(primaryLabel);
    if (primaryRetrieval === undefined) throw new Error(`primary artifact ${primaryLabel} was not retrieved`);
    const existingVintage = await sql.query(
      `select id from pipeline.planning_forecast_vintages
        where source_interface_id = $1 and grid_area_id = $2 and native_vintage_key = $3
          and superseded_by_id is null`,
      [lineage.sourceInterfaceId, lineage.gridAreaId, extraction.vintage.nativeVintageKey],
    );
    let vintageId: string;
    if (existingVintage.rows[0] !== undefined) {
      vintageId = String(existingVintage.rows[0]!.id);
    } else {
      const v = extraction.vintage;
      const rightsClassification = lineage.rights.find((r) => r.purposeCode === "public_raw_planning_value_display")
        ?.classification ?? lineage.rights[0]?.classification;
      if (rightsClassification === undefined) {
        throw new Error(`no rights determination in force for ${adapter.sourceInterfaceSlug}`);
      }
      const created = await sql.query(
        `insert into pipeline.planning_forecast_vintages
           (grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key,
            native_report_id, report_title, published_at, published_at_precision, retrieved_at,
            source_methodology_name, source_methodology_version, rights_classification,
            publication_state, quality_status)
         values ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9::timestamptz,$10,$11,$12,$13,$14) returning id`,
        [lineage.gridAreaId, lineage.sourceInterfaceId, primaryRetrieval, v.nativeVintageKey,
          v.nativeReportId, v.reportTitle, v.publishedAt, v.publishedAtPrecision,
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
        `select id from pipeline.planning_forecast_scenarios where vintage_id = $1 and native_scenario_key = $2`,
        [vintageId, scenario.nativeScenarioKey],
      );
      if (found.rows[0] !== undefined) {
        scenarioIds.set(scenario.nativeScenarioKey, String(found.rows[0]!.id));
        result.scenariosExisting += 1;
        continue;
      }
      const created = await sql.query(
        `insert into pipeline.planning_forecast_scenarios
           (vintage_id, native_scenario_key, native_scenario_label, canonical_class, is_reference,
            weather_basis, load_basis, large_load_policy, assumptions, assumptions_text)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) returning id`,
        [vintageId, scenario.nativeScenarioKey, scenario.nativeScenarioLabel, scenario.canonicalClass,
          scenario.isReference, scenario.weatherBasis, scenario.loadBasis, scenario.largeLoadPolicy,
          JSON.stringify(scenario.assumptions), scenario.assumptionsText],
      );
      scenarioIds.set(scenario.nativeScenarioKey, String(created.rows[0]!.id));
      result.scenariosCreated += 1;
    }

    // -------------------------------------------------------- raw evidence and canonical points
    //
    // Written in bulk rather than a row at a time. The per-record path cost three statements
    // for every record -- insert the evidence, look up the live point, write the point -- which
    // is fine locally and is fifty minutes of network latency for PJM's 15,624 rows against a
    // pooler. The classification each record receives is unchanged; only the number of round
    // trips it takes to reach it is.
    const candidates = buildRawCandidates(extraction, artifacts, retrievalIds, adapter.key);
    const rawIds = await writeRawRecords(sql, candidates, batchSize, result);

    const live = await loadLivePoints(sql, vintageId);
    const plan = planPointWrites(extraction, candidates, rawIds, scenarioIds, live, result);

    // Supersessions first: the partial unique index permits one live row per identity, so a
    // replacement cannot be inserted while the row it replaces is still live. The forward
    // reference is deferrable, so pointing at a row inserted later in this transaction is fine.
    await applySupersessions(sql, plan.supersessions, batchSize);
    await insertPoints(sql, plan.inserts, vintageId, lineage.gridAreaId, extraction, batchSize);


    await sql.query("commit", []);
    return result;
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}

// ------------------------------------------------------------------ batched write internals

type RawCandidate = {
  record: ExtractedPlanningRecord;
  retrievalId: string;
  ordinal: number;
  recordHash: string;
  columns: Record<string, unknown>;
  artifactRef: string;
};

/** Pure: everything a raw row needs, computed before any statement is issued. */
function buildRawCandidates(
  extraction: PlanningExtraction,
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
      // Matches the per-record path exactly: the source key, then the artifact label.
      artifactRef: `${sourceKey}/${record.artifactLabel}`,
      recordHash: planningRecordHash({
        artifactSha256: artifact.sha256,
        nativeGeography: record.nativeGeography,
        nativePeriod: record.nativePeriod,
        nativeScenario: record.nativeScenario,
        nativeValue: record.nativeValue,
        nativeUnit: record.nativeUnit,
        locator: { ...columns, extraction_method: record.locator.extractionMethod },
      }),
    };
  });
}

const RAW_COLUMNS = `retrieval_id,row_ordinal,record_hash,artifact_ref,native_geography,native_period,
  native_scenario,native_value,native_unit,raw_payload,extraction_method,extraction_version,
  workbook_sheet,workbook_range,workbook_cell,pdf_page,pdf_table,csv_row_number,html_selector,
  archive_ref,archive_member,archive_member_hash`;
/** Only raw_payload needs a cast; every other column's type is inferable from its target. */
const RAW_CASTS = { 9: "jsonb" } as const;

/**
 * Insert evidence in batches and return the row id for every candidate, whether it was written
 * now or already present. `on conflict do nothing` keeps the `(retrieval_id, record_hash)`
 * idempotence exactly as it was; the ids of rows it skipped are recovered in one lookup per
 * batch instead of one per record.
 */
async function writeRawRecords(
  sql: PlanningSqlExecutor,
  candidates: readonly RawCandidate[],
  batchSize: number,
  result: PlanningWriteResult,
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  const key = (retrievalId: string, hash: string): string => `${retrievalId}|${hash}`;

  for (const batch of chunk(candidates, batchSize)) {
    const rows = batch.map((candidate) => [
      candidate.retrievalId, candidate.ordinal, candidate.recordHash,
      candidate.artifactRef, candidate.record.nativeGeography, candidate.record.nativePeriod,
      candidate.record.nativeScenario, candidate.record.nativeValue, candidate.record.nativeUnit,
      JSON.stringify(candidate.record.rawPayload), candidate.record.locator.extractionMethod,
      PLANNING_EXTRACTION_VERSION,
      candidate.columns.workbook_sheet, candidate.columns.workbook_range, candidate.columns.workbook_cell,
      candidate.columns.pdf_page, candidate.columns.pdf_table, candidate.columns.csv_row_number,
      candidate.columns.html_selector, candidate.columns.archive_ref, candidate.columns.archive_member,
      candidate.columns.archive_member_hash,
    ]);
    const values = multiRowValues(rows, RAW_CASTS);
    const inserted = await sql.query(
      `insert into pipeline.raw_planning_forecast_records (${RAW_COLUMNS})
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
      `select id, retrieval_id, record_hash from pipeline.raw_planning_forecast_records
        where (retrieval_id, record_hash) in (select r.retrieval_id::uuid, r.record_hash
               from unnest($1::uuid[], $2::text[]) as r(retrieval_id, record_hash))`,
      [missing.map((candidate) => candidate.retrievalId), missing.map((candidate) => candidate.recordHash)],
    );
    for (const row of existing.rows) {
      idByKey.set(key(String(row.retrieval_id), String(row.record_hash)), String(row.id));
    }
    for (const candidate of missing) {
      if (!idByKey.has(key(candidate.retrievalId, candidate.recordHash))) {
        throw new Error(`raw planning record ${candidate.recordHash} was neither inserted nor found`);
      }
      result.rawRecordsDuplicate += 1;
    }
  }
  return idByKey;
}

/**
 * The identity the live index enforces, as a string. Both sides are normalised the same way so
 * a value read back from PostgreSQL and one parsed from a workbook key identically.
 */
function pointIdentityKey(parts: {
  scenarioId: string; geographicGrain: string; nativeGeographyLabel: string | null;
  targetPeriodKind: string; targetYear: number; targetSeason: string | null;
  targetMonth: number | null; targetTimestamp: string | null; peakType: string; unit: string;
}): string {
  return JSON.stringify([
    parts.scenarioId, parts.geographicGrain, parts.nativeGeographyLabel, parts.targetPeriodKind,
    parts.targetYear, parts.targetSeason, parts.targetMonth,
    parts.targetTimestamp === null ? null : new Date(parts.targetTimestamp).toISOString(),
    parts.peakType, parts.unit,
  ]);
}

type LivePoint = { id: string; value: number; fromThisRun: boolean };

/** Every live point of this vintage, in one statement instead of one lookup per record. */
async function loadLivePoints(sql: PlanningSqlExecutor, vintageId: string): Promise<Map<string, LivePoint>> {
  const { rows } = await sql.query(
    `select id, scenario_id, geographic_grain, native_geography_label, target_period_kind,
            target_year, target_season, target_month, target_timestamp, peak_type, unit,
            value::text as value
       from pipeline.planning_forecast_points
      where vintage_id = $1 and superseded_by_id is null`,
    [vintageId],
  );
  const live = new Map<string, LivePoint>();
  for (const row of rows) {
    live.set(pointIdentityKey({
      scenarioId: String(row.scenario_id),
      geographicGrain: String(row.geographic_grain),
      nativeGeographyLabel: row.native_geography_label == null ? null : String(row.native_geography_label),
      targetPeriodKind: String(row.target_period_kind),
      targetYear: Number(row.target_year),
      targetSeason: row.target_season == null ? null : String(row.target_season),
      targetMonth: row.target_month == null ? null : Number(row.target_month),
      targetTimestamp: row.target_timestamp == null ? null : new Date(String(row.target_timestamp)).toISOString(),
      peakType: String(row.peak_type),
      unit: String(row.unit),
    }), { id: String(row.id), value: Number(row.value), fromThisRun: false });
  }
  return live;
}

type PointInsert = { id: string; rawId: string; scenarioId: string; point: CanonicalPointDraft };
type PointPlan = { inserts: PointInsert[]; supersessions: { oldId: string; nextId: string }[] };

/**
 * Classify every incoming point against what is live. Records are walked in order and the map is
 * updated as they are classified, so a second record claiming an identity the first just created
 * is compared against it -- the behaviour the per-record path had, preserved.
 */
function planPointWrites(
  extraction: PlanningExtraction,
  candidates: readonly RawCandidate[],
  rawIds: ReadonlyMap<string, string>,
  scenarioIds: ReadonlyMap<string, string>,
  live: Map<string, LivePoint>,
  result: PlanningWriteResult,
): PointPlan {
  const plan: PointPlan = { inserts: [], supersessions: [] };
  for (const candidate of candidates) {
    const point = candidate.record.point;
    const scenarioId = scenarioIds.get(point.scenarioKey);
    if (scenarioId === undefined) throw new Error(`record cites undeclared scenario ${point.scenarioKey}`);
    const rawId = rawIds.get(`${candidate.retrievalId}|${candidate.recordHash}`);
    if (rawId === undefined) throw new Error(`raw planning record ${candidate.recordHash} has no id`);

    const key = pointIdentityKey({ ...point, scenarioId });
    const current = live.get(key);
    if (current !== undefined && current.value === point.value) {
      result.pointsUnchanged += 1;
      continue;
    }
    if (current !== undefined && current.fromThisRun) {
      // Two source rows claiming one canonical identity with different values. The per-record
      // path would have superseded a row it had just written; that is a source-format fault, and
      // failing loudly is better than recording a restatement nobody made.
      throw new Error(
        `two extracted records claim the same canonical identity with different values (${current.value} then ${point.value}); the source has duplicate rows`,
      );
    }
    const nextId = randomUUID();
    if (current !== undefined) {
      plan.supersessions.push({ oldId: current.id, nextId });
      result.pointsRevised += 1;
    } else {
      result.pointsInserted += 1;
    }
    plan.inserts.push({ id: nextId, rawId, scenarioId, point });
    live.set(key, { id: nextId, value: point.value, fromThisRun: true });
  }
  return plan;
}

async function applySupersessions(
  sql: PlanningSqlExecutor,
  supersessions: readonly { oldId: string; nextId: string }[],
  batchSize: number,
): Promise<void> {
  for (const batch of chunk(supersessions, batchSize)) {
    await sql.query(
      `update pipeline.planning_forecast_points p
          set superseded_by_id = s.next_id, superseded_at = now(),
              supersession_reason = 'the publisher restated this value in a corrected or reissued artifact'
         from unnest($1::uuid[], $2::uuid[]) as s(old_id, next_id)
        where p.id = s.old_id`,
      [batch.map((entry) => entry.oldId), batch.map((entry) => entry.nextId)],
    );
  }
}

const POINT_COLUMNS = `id,vintage_id,scenario_id,grid_area_id,raw_record_id,geographic_grain,
  native_geography_label,target_period_kind,target_year,target_season,target_month,target_timestamp,
  value,unit,peak_type,weather_basis,load_basis,large_load_policy,source_methodology_name,
  source_methodology_version,quality_status`;
const POINT_CASTS = { 11: "timestamptz", 12: "numeric" } as const;

async function insertPoints(
  sql: PlanningSqlExecutor,
  inserts: readonly PointInsert[],
  vintageId: string,
  gridAreaId: string,
  extraction: PlanningExtraction,
  batchSize: number,
): Promise<void> {
  for (const batch of chunk(inserts, batchSize)) {
    const rows = batch.map((entry) => [
      entry.id, vintageId, entry.scenarioId, gridAreaId, entry.rawId,
      entry.point.geographicGrain, entry.point.nativeGeographyLabel, entry.point.targetPeriodKind,
      entry.point.targetYear, entry.point.targetSeason, entry.point.targetMonth,
      entry.point.targetTimestamp, entry.point.value, entry.point.unit, entry.point.peakType,
      entry.point.weatherBasis, entry.point.loadBasis, entry.point.largeLoadPolicy,
      extraction.vintage.sourceMethodologyName, extraction.vintage.sourceMethodologyVersion,
      extraction.vintage.qualityStatus,
    ]);
    const values = multiRowValues(rows, POINT_CASTS);
    await sql.query(
      `insert into pipeline.planning_forecast_points (${POINT_COLUMNS}) values ${values.text}`,
      values.params,
    );
  }
}

/** Bumped when an extraction changes meaning, so evidence records which reader produced them. */
export const PLANNING_EXTRACTION_VERSION = "urdais-planning-extractor/1.0.0";
