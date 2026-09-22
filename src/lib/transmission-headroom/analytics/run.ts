/**
 * Orchestration: guard the methodology, read the canonical population, calculate per market,
 * persist once.
 *
 * The guard runs first and unconditionally. Publishing numbers under a methodology document that
 * has since been edited is the failure this ordering prevents.
 */

import {
  calculateAll, deferredResults, type MetricResult,
} from "@/lib/transmission-headroom/analytics/calculate";
import { assertMethodologyApproved, assertMethodologyDocument, METHODOLOGY_VERSION }
  from "@/lib/transmission-headroom/analytics/methodology";
import {
  buildMarketInputs, inputDigest, loadMetricDefinitions, persistRun,
} from "@/lib/transmission-headroom/analytics/store";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type AnalyticsOutcome = {
  status: "calculated" | "dry_run" | "failed";
  methodologyVersion: string;
  inputDigest?: string;
  runId?: string;
  run?: "created" | "existing";
  results?: number;
  byStatus?: Record<string, number>;
  markets?: { market: string; entities: number; sourceStatus: string }[];
  calculateMs?: number;
  persistMs?: number;
  statements?: number;
  error?: string;
};

export async function runTransmissionAnalytics(
  sql: CapacitySqlExecutor, options: { dryRun?: boolean } = {},
): Promise<AnalyticsOutcome> {
  try {
    // The registry check is the one that must hold wherever this runs; the document check adds
    // the stronger guarantee wherever the repository is actually present.
    await assertMethodologyApproved(sql);
    await assertMethodologyDocument();

    const startedAt = Date.now();
    const definitions = await loadMetricDefinitions(sql);
    const inputs = await buildMarketInputs(sql, definitions);

    const results: MetricResult[] = calculateAll(inputs);
    results.push(...deferredResults(
      definitions.filter((definition) => !definition.isLive).map((definition) => ({
        code: definition.code, reason: definition.deferredReason ?? "",
        marketSlug: definition.marketSlug, unit: definition.unit,
      }))));

    const digest = inputDigest(METHODOLOGY_VERSION, inputs);
    const calculateMs = Date.now() - startedAt;

    const markets = inputs.map((input) => ({
      market: input.market, entities: input.latest.length, sourceStatus: input.sourceStatus,
    }));

    if (options.dryRun === true) {
      const byStatus: Record<string, number> = {};
      for (const result of results) byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
      return {
        status: "dry_run", methodologyVersion: METHODOLOGY_VERSION, inputDigest: digest,
        results: results.length, byStatus, markets, calculateMs,
      };
    }

    const persistStart = Date.now();
    const outcome = await persistRun(sql, inputs, results, digest);
    return {
      status: "calculated", methodologyVersion: outcome.methodologyVersion,
      inputDigest: outcome.inputDigest, runId: outcome.runId, run: outcome.run,
      results: outcome.resultsInserted, byStatus: outcome.byStatus, markets,
      calculateMs, persistMs: Date.now() - persistStart, statements: outcome.statements,
    };
  } catch (error) {
    return {
      status: "failed", methodologyVersion: METHODOLOGY_VERSION,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}
