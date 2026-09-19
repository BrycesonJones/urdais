/** Persistence for EIA-930 pages. Raw evidence is append-only; changed values supersede. */

import { randomUUID } from "node:crypto";

import { PD2_V1_AREA_BY_EIA_CODE } from "@/lib/power-delivery/universe";
import type { EiaPage, NormalizedPowerRecord } from "@/lib/power-delivery/types";

export interface PowerSqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type PowerLineage = {
  sourceInterfaceId: string;
  permissionGrantId: string;
  metricIds: Map<string, string>;
};

export async function resolvePowerLineage(sql: PowerSqlExecutor): Promise<PowerLineage> {
  const { rows } = await sql.query(
    `select s.id as source_interface_id, g.id as permission_grant_id
       from reference.source_interfaces s
       join reference.permission_grants g on g.source_interface_id = s.id
      where s.slug = 'eia-930-region-data'
        and s.production_access_state = 'production_approved'
        and g.effective_from <= now() and (g.effective_to is null or g.effective_to > now())
      order by g.effective_from desc limit 2`,
    [],
  );
  if (rows.length !== 1) throw new Error(`EIA-930 lineage resolved ${rows.length} active permission grants; expected one`);
  const metricRows = await sql.query(`select id, code from reference.power_metrics`, []);
  const metricIds = new Map(metricRows.rows.map((row) => [String(row.code), String(row.id)]));
  if (!metricIds.has("actual_load") || !metricIds.has("operational_demand_forecast")) {
    throw new Error("PD-2 metric reference rows are incomplete");
  }
  return {
    sourceInterfaceId: String(rows[0]!.source_interface_id),
    permissionGrantId: String(rows[0]!.permission_grant_id),
    metricIds,
  };
}

export type ObservationDecision = "inserted" | "unchanged" | "revised" | "unavailable";

export function decideObservation(currentValue: string | null, record: NormalizedPowerRecord): ObservationDecision {
  if (record.valueMw === null) return "unavailable";
  if (currentValue === null) return "inserted";
  return Number(currentValue) === record.valueMw ? "unchanged" : "revised";
}

export type PageWriteResult = {
  retrieval: "inserted" | "already_recorded";
  rawRecords: number;
  inserted: number;
  revised: number;
  unchanged: number;
  unavailable: number;
};

function retrievalKey(page: EiaPage): string {
  const start = String(page.requestParameters.start);
  const end = String(page.requestParameters.end);
  return `eia-930|${start}|${end}|${page.offset}|${page.length}|${page.responseHash}`;
}

export async function persistEiaPage(
  sql: PowerSqlExecutor,
  lineage: PowerLineage,
  page: EiaPage,
  collectorIdentity: string,
): Promise<PageWriteResult> {
  const pageIsComplete = page.offset === 0 && page.records.length >= page.total;
  await sql.query("begin", []);
  try {
    const insertedRetrieval = await sql.query(
      `insert into pipeline.source_retrievals
       (source_interface_id, idempotency_key, requested_at, completed_at, request_method,
        request_url, request_parameters, response_status, response_content_type, response_hash,
        response_byte_length, response_body, record_count, source_pagination,
        source_claimed_complete, enumeration_assessment, enumeration_evidence,
        collector_identity, retrieval_purpose, permission_grant_id)
     values ($1,$2,$3,$3,'GET',$4,$5::jsonb,200,'application/json',$6,$7,$8::jsonb,$9,$10::jsonb,
             $11,$12,$13,$14,'production',$15)
     on conflict (idempotency_key) do nothing returning id`,
      [
        lineage.sourceInterfaceId,
        retrievalKey(page),
        page.retrievedAt,
        page.requestUrl,
        JSON.stringify(page.requestParameters),
        page.responseHash,
        page.responseByteLength,
        JSON.stringify(page.responseBody),
        page.records.length,
        JSON.stringify({ offset: page.offset, length: page.length, total: page.total }),
        pageIsComplete,
        pageIsComplete ? "complete" : "incomplete",
        `EIA response total=${page.total}; page offset=${page.offset}, returned=${page.records.length}.`,
        collectorIdentity,
        lineage.permissionGrantId,
      ],
    );
    const retrievalId = insertedRetrieval.rows[0]?.id == null ? null : String(insertedRetrieval.rows[0]!.id);
    if (retrievalId === null) {
      const existing = await sql.query(`select id from pipeline.source_retrievals where idempotency_key = $1`, [retrievalKey(page)]);
      if (!existing.rows[0]) throw new Error("EIA retrieval was neither inserted nor found");
      await sql.query("commit", []);
      return { retrieval: "already_recorded", rawRecords: 0, inserted: 0, revised: 0, unchanged: 0, unavailable: 0 };
    }

    const result: PageWriteResult = { retrieval: "inserted", rawRecords: 0, inserted: 0, revised: 0, unchanged: 0, unavailable: 0 };
    for (const [ordinal, record] of page.records.entries()) {
      const area = PD2_V1_AREA_BY_EIA_CODE.get(record.respondent);
      if (!area) throw new Error(`no physical grid area for EIA code ${record.respondent}`);
      const metricId = lineage.metricIds.get(record.metric);
      if (!metricId) throw new Error(`no metric reference row for ${record.metric}`);
      const raw = await sql.query(
        `insert into pipeline.raw_power_records
           (retrieval_id,row_ordinal,record_hash,grid_area_id,power_metric_id,native_respondent,
            native_type,native_period,period_start,period_end,native_value,native_unit,
            normalized_value_mw,normalization_status,raw_payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12,$13::numeric,$14,$15::jsonb)
         returning id`,
        [retrievalId, ordinal, record.recordHash, area.id, metricId, record.respondent, record.type,
          record.nativePeriod, record.periodStart, record.periodEnd, record.nativeValue, record.nativeUnit,
          record.valueMw, record.normalizationStatus, JSON.stringify(record.rawPayload)],
      );
      const rawId = String(raw.rows[0]!.id);
      result.rawRecords += 1;
      if (record.valueMw === null) { result.unavailable += 1; continue; }

      const lockKey = `${area.id}|${metricId}|${record.periodStart}`;
      await sql.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [lockKey]);
      const current = await sql.query(
        `select id, value_mw::text as value_mw from pipeline.power_observations
          where grid_area_id=$1 and power_metric_id=$2 and period_start=$3::timestamptz
            and superseded_by_id is null`,
        [area.id, metricId, record.periodStart],
      );
      const existing = current.rows[0];
      const decision = decideObservation(existing ? String(existing.value_mw) : null, record);
      if (decision === "unchanged") { result.unchanged += 1; continue; }
      const nextId = randomUUID();
      if (decision === "revised") {
        await sql.query(
          `update pipeline.power_observations
              set superseded_by_id=$1, superseded_at=$2::timestamptz,
                  supersession_reason='EIA published a revised value for the same area, metric and UTC hour'
            where id=$3`,
          [nextId, page.retrievedAt, String(existing!.id)],
        );
      }
      await sql.query(
        `insert into pipeline.power_observations
           (id,raw_power_record_id,grid_area_id,power_metric_id,period_start,period_end,
            temporal_resolution,value_mw,unit,value_status,source_effective_at,retrieved_at,quality_status)
         values ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,'hourly',$7::numeric,'MW',$8,$5::timestamptz,$9::timestamptz,'accepted')`,
        [nextId, rawId, area.id, metricId, record.periodStart, record.periodEnd, record.valueMw,
          record.metric === "actual_load" ? "observed" : "forecast", page.retrievedAt],
      );
      if (decision === "revised") result.revised += 1; else result.inserted += 1;
    }
    await sql.query("commit", []);
    return result;
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}
