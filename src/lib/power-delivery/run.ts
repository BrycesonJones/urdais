import { fetchEia930 } from "@/lib/power-delivery/source/eia930";
import { persistEiaPage, resolvePowerLineage, type PowerSqlExecutor } from "@/lib/power-delivery/store";

export const POWER_DELIVERY_COLLECTOR = "urdais-power-delivery-eia930-v1" as const;

export type PowerRunTrigger = "scheduled" | "operator" | "backfill";

export type PowerRunResult = {
  ok: boolean;
  outcome: "succeeded" | "partial" | "failed";
  requestedStart: string;
  requestedEnd: string;
  retrievals: number;
  rawRecords: number;
  inserted: number;
  revised: number;
  unchanged: number;
  unavailable: number;
  errors: string[];
};

function utcHour(date: Date): string {
  return date.toISOString().slice(0, 13);
}

/** Default scheduled window: the previous 48 completed UTC hours, allowing EIA revisions. */
export function scheduledPowerWindow(now = new Date()): { start: string; end: string } {
  const currentHour = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours());
  return { start: utcHour(new Date(currentHour - 48 * 3_600_000)), end: utcHour(new Date(currentHour - 3_600_000)) };
}

export async function runPowerIngestion(
  sql: PowerSqlExecutor,
  input: { start: string; end: string; trigger: PowerRunTrigger },
): Promise<PowerRunResult> {
  const startedAt = new Date().toISOString();
  const result: PowerRunResult = {
    ok: false, outcome: "failed", requestedStart: input.start, requestedEnd: input.end,
    retrievals: 0, rawRecords: 0, inserted: 0, revised: 0, unchanged: 0, unavailable: 0, errors: [],
  };
  try {
    const lineage = await resolvePowerLineage(sql);
    const pages = await fetchEia930({ start: input.start, end: input.end });
    for (const page of pages) {
      try {
        const written = await persistEiaPage(sql, lineage, page, POWER_DELIVERY_COLLECTOR);
        if (written.retrieval === "inserted") result.retrievals += 1;
        result.rawRecords += written.rawRecords;
        result.inserted += written.inserted;
        result.revised += written.revised;
        result.unchanged += written.unchanged;
        result.unavailable += written.unavailable;
      } catch (error) {
        result.errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      }
    }
    result.outcome = result.errors.length === 0 ? "succeeded" : result.retrievals > 0 ? "partial" : "failed";
    result.ok = result.outcome === "succeeded";
  } catch (error) {
    result.errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }

  const completedAt = new Date().toISOString();
  await sql.query(
    `insert into pipeline.power_ingestion_runs
       (trigger_kind,requested_start,requested_end,started_at,completed_at,outcome,retrieval_count,
        raw_record_count,observation_inserts,observation_revisions,unchanged_count,unavailable_count,detail)
     values ($1,$2::timestamptz,$3::timestamptz,$4::timestamptz,$5::timestamptz,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
    [input.trigger, `${input.start}:00:00Z`, new Date(new Date(`${input.end}:00:00Z`).valueOf() + 3_600_000).toISOString(),
      startedAt, completedAt, result.outcome, result.retrievals, result.rawRecords, result.inserted,
      result.revised, result.unchanged, result.unavailable, JSON.stringify({ errors: result.errors })],
  );
  return result;
}
