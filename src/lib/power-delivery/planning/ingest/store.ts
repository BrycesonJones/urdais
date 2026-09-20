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
  ExtractedPlanningRecord, PlanningAdapter, PlanningExtraction, RetrievedArtifact,
} from "@/lib/power-delivery/planning/ingest/types";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

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
): Promise<PlanningWriteResult> {
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
    const ordinals = new Map<string, number>();
    for (const record of extraction.records) {
      const retrievalId = retrievalIds.get(record.artifactLabel);
      if (retrievalId === undefined) throw new Error(`record cites unretrieved artifact ${record.artifactLabel}`);
      const artifact = artifacts.get(record.artifactLabel)!;
      const ordinal = ordinals.get(record.artifactLabel) ?? 0;
      ordinals.set(record.artifactLabel, ordinal + 1);
      const columns = locatorColumns(record);
      const recordHash = planningRecordHash({
        artifactSha256: artifact.sha256,
        nativeGeography: record.nativeGeography,
        nativePeriod: record.nativePeriod,
        nativeScenario: record.nativeScenario,
        nativeValue: record.nativeValue,
        nativeUnit: record.nativeUnit,
        locator: { ...columns, extraction_method: record.locator.extractionMethod },
      });
      const insertedRaw = await sql.query(
        `insert into pipeline.raw_planning_forecast_records
           (retrieval_id,row_ordinal,record_hash,artifact_ref,native_geography,native_period,
            native_scenario,native_value,native_unit,raw_payload,extraction_method,extraction_version,
            workbook_sheet,workbook_range,workbook_cell,pdf_page,pdf_table,csv_row_number,html_selector,
            archive_ref,archive_member,archive_member_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         on conflict do nothing returning id`,
        [retrievalId, ordinal, recordHash, `${adapter.key}/${record.artifactLabel}`,
          record.nativeGeography, record.nativePeriod, record.nativeScenario, record.nativeValue,
          record.nativeUnit, JSON.stringify(record.rawPayload), record.locator.extractionMethod,
          PLANNING_EXTRACTION_VERSION,
          columns.workbook_sheet, columns.workbook_range, columns.workbook_cell, columns.pdf_page,
          columns.pdf_table, columns.csv_row_number, columns.html_selector,
          columns.archive_ref, columns.archive_member, columns.archive_member_hash],
      );
      let rawId: string;
      if (insertedRaw.rows[0] !== undefined) {
        rawId = String(insertedRaw.rows[0]!.id);
        result.rawRecordsInserted += 1;
      } else {
        const existing = await sql.query(
          `select id from pipeline.raw_planning_forecast_records where retrieval_id = $1 and record_hash = $2`,
          [retrievalId, recordHash],
        );
        if (!existing.rows[0]) {
          throw new Error(`raw planning record ${recordHash} collided on ordinal ${ordinal} without matching content`);
        }
        rawId = String(existing.rows[0]!.id);
        result.rawRecordsDuplicate += 1;
      }

      const point = record.point;
      const scenarioId = scenarioIds.get(point.scenarioKey);
      if (scenarioId === undefined) throw new Error(`record cites undeclared scenario ${point.scenarioKey}`);
      const identity = [scenarioId, point.geographicGrain, point.nativeGeographyLabel,
        point.targetPeriodKind, point.targetYear, point.targetSeason, point.targetMonth,
        point.targetTimestamp, point.peakType, point.unit];
      const current = await sql.query(
        // `value::text`, not `value::float8`. A numeric rendered as float8 is printed with
        // `extra_float_digits` significant digits, and production runs that setting at 0, which
        // truncates to fifteen. Every ERCOT value needing sixteen came back short, compared
        // unequal to the number it was stored from, and was superseded and re-inserted on every
        // run -- 285 phantom revisions of 982 points, with the old and new values numerically
        // identical. `::text` is the exact stored decimal and does not depend on a server
        // setting, so the comparison means the same thing on every database.
        `select id, value::text as value from pipeline.planning_forecast_points
          where scenario_id=$1 and geographic_grain=$2 and native_geography_label is not distinct from $3
            and target_period_kind=$4 and target_year=$5 and target_season is not distinct from $6
            and target_month is not distinct from $7
            and target_timestamp is not distinct from $8::timestamptz
            and peak_type=$9 and unit=$10 and superseded_by_id is null`,
        identity,
      );
      const live = current.rows[0];
      // Parsed back to a number so the comparison keeps the semantics it always had: equal
      // values are unchanged, and a genuinely restated value is still one revision.
      if (live !== undefined && Number(live.value) === point.value) {
        result.pointsUnchanged += 1;
        continue;
      }
      const nextId = randomUUID();
      if (live !== undefined) {
        await sql.query(
          `update pipeline.planning_forecast_points
              set superseded_by_id=$1, superseded_at=now(),
                  supersession_reason='the publisher restated this value in a corrected or reissued artifact'
            where id=$2`,
          [nextId, String(live.id)],
        );
      }
      await sql.query(
        `insert into pipeline.planning_forecast_points
           (id,vintage_id,scenario_id,grid_area_id,raw_record_id,geographic_grain,native_geography_label,
            target_period_kind,target_year,target_season,target_month,target_timestamp,value,unit,
            peak_type,weather_basis,load_basis,large_load_policy,source_methodology_name,
            source_methodology_version,quality_status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13::numeric,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [nextId, vintageId, scenarioId, lineage.gridAreaId, rawId, point.geographicGrain,
          point.nativeGeographyLabel, point.targetPeriodKind, point.targetYear, point.targetSeason,
          point.targetMonth, point.targetTimestamp, point.value, point.unit, point.peakType,
          point.weatherBasis, point.loadBasis, point.largeLoadPolicy,
          extraction.vintage.sourceMethodologyName, extraction.vintage.sourceMethodologyVersion,
          extraction.vintage.qualityStatus],
      );
      if (live !== undefined) result.pointsRevised += 1;
      else result.pointsInserted += 1;
    }

    await sql.query("commit", []);
    return result;
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}

/** Bumped when an extraction changes meaning, so evidence records which reader produced them. */
export const PLANNING_EXTRACTION_VERSION = "urdais-planning-extractor/1.0.0";
