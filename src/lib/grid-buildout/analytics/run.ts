/** Orchestration: load both universes, calculate, validate, persist. */

import { calculateAnalytics } from "@/lib/grid-buildout/analytics/calculate";
import { persistAnalytics, type AnalyticsWriteResult } from "@/lib/grid-buildout/analytics/store";
import type { GridBuildoutAnalytics } from "@/lib/grid-buildout/analytics/types";
import { loadUniverse } from "@/lib/grid-buildout/analytics/universe";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type BuildoutAnalyticsOutcome =
  | ({ status: "calculated"; analytics: GridBuildoutAnalytics } & AnalyticsWriteResult)
  | { status: "dry_run"; analytics: GridBuildoutAnalytics }
  | { status: "failed"; error: string };

export async function runBuildoutAnalytics(
  sql: CapacitySqlExecutor,
  options: { dryRun?: boolean; calculatedAt?: string } = {},
): Promise<BuildoutAnalyticsOutcome> {
  try {
    const ercot = await loadUniverse(sql, "ercot");
    const caiso = await loadUniverse(sql, "caiso");
    const analytics = calculateAnalytics(ercot, caiso,
      options.calculatedAt === undefined ? {} : { calculatedAt: options.calculatedAt });
    if (options.dryRun === true) return { status: "dry_run", analytics };
    const written = await persistAnalytics(sql, analytics, { ercot, caiso });
    return { status: "calculated", analytics, ...written };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}
