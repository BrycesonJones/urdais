/** Orchestration for the derived analytics calculation. */

import { calculateQueueAnalytics, type AnalyticsRun } from "@/lib/interconnection-queue/analytics/calculate";
import { persistAnalyticsRun, type AnalyticsWriteResult } from "@/lib/interconnection-queue/analytics/store";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type AnalyticsRunOutcome =
  | ({ status: "calculated" } & AnalyticsWriteResult & { calculateMs: number; persistMs: number })
  | { status: "dry_run"; run: AnalyticsRun; calculateMs: number }
  | { status: "failed"; error: string };

export async function runQueueAnalytics(
  sql: CapacitySqlExecutor | null,
  options: { dryRun?: boolean; asOf?: string; repoRoot?: string; batchSize?: number } = {},
): Promise<AnalyticsRunOutcome> {
  try {
    if (sql === null) throw new Error("no database is configured");
    const calculateStart = Date.now();
    const run = await calculateQueueAnalytics(sql,
      options.asOf === undefined ? {} : { asOf: options.asOf });
    const calculateMs = Date.now() - calculateStart;

    if (options.dryRun === true) return { status: "dry_run", run, calculateMs };

    const persistStart = Date.now();
    const written = await persistAnalyticsRun(sql, run, {
      ...(options.batchSize === undefined ? {} : { batchSize: options.batchSize }),
      ...(options.repoRoot === undefined ? {} : { repoRoot: options.repoRoot }),
    });
    return { status: "calculated", ...written, calculateMs, persistMs: Date.now() - persistStart };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}
