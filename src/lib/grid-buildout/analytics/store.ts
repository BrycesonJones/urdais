/**
 * Persistence for Grid Buildout analytics.
 *
 * A run is identified by its methodology version and its input digest, so recalculating against
 * unchanged evidence resolves to the run already recorded and writes nothing. Nothing is written
 * at all until the methodology is confirmed approved in the registry and the output has passed its
 * contract.
 */

import {
  METHODOLOGY_VERSION, assertMethodologyApproved,
} from "@/lib/grid-buildout/analytics/methodology";
import type { AnalyticalUniverse, GridBuildoutAnalytics } from "@/lib/grid-buildout/analytics/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type AnalyticsWriteResult = {
  runId: string;
  run: "created" | "existing";
  methodologyVersion: string;
  inputDigest: string;
  metricsWritten: number;
  resolutionsWritten: number;
  resolvedGroups: number;
};

export async function persistAnalytics(
  sql: CapacitySqlExecutor,
  analytics: GridBuildoutAnalytics,
  universes: { ercot: AnalyticalUniverse; caiso: AnalyticalUniverse },
): Promise<AnalyticsWriteResult> {
  // Authorisation first, and from the registry. Nothing below runs for an unapproved version.
  const { methodologyVersionId } = await assertMethodologyApproved(sql);

  const existing = await sql.query(
    `select id from pipeline.buildout_analytics_runs
      where methodology_version_id = $1 and input_digest = $2`,
    [methodologyVersionId, analytics.inputDigest],
  );
  if (existing.rows[0] !== undefined) {
    return {
      runId: String(existing.rows[0]!.id), run: "existing",
      methodologyVersion: METHODOLOGY_VERSION, inputDigest: analytics.inputDigest,
      metricsWritten: 0, resolutionsWritten: 0,
      resolvedGroups: analytics.coverage.caisoDuplicateGroups,
    };
  }

  const inserted = await sql.query(
    `insert into pipeline.buildout_analytics_runs
       (methodology_version_id, input_digest, ercot_snapshot_id, caiso_snapshot_id,
        calculated_at, run_status, ercot_projects, caiso_projects, coverage)
     values ($1,$2,$3,$4,$5,'validated',$6,$7,$8::jsonb)
     returning id`,
    [
      methodologyVersionId, analytics.inputDigest,
      analytics.markets.ercot.snapshotId, analytics.markets.caiso.snapshotId,
      analytics.calculatedAt, analytics.markets.ercot.projects, analytics.markets.caiso.projects,
      JSON.stringify(analytics.coverage),
    ],
  );
  const runId = String(inserted.rows[0]!.id);

  const metrics = [analytics.m1, analytics.m2, analytics.m3, analytics.m4, analytics.m5];
  for (const metric of metrics) {
    await sql.query(
      `insert into pipeline.buildout_metric_results (run_id, metric, payload)
       values ($1,$2,$3::jsonb) on conflict (run_id, metric) do nothing`,
      [runId, metric.metric, JSON.stringify(metric)],
    );
  }

  // One row per contributing occurrence, so a counted project points back at every canonical row
  // behind it. ERCOT writes group_size 1 throughout; CAISO's co-owned projects write several.
  let resolutionsWritten = 0;
  for (const universe of [universes.ercot, universes.caiso]) {
    for (const project of universe.projects) {
      for (const occurrence of project.occurrences) {
        await sql.query(
          `insert into pipeline.buildout_project_resolutions
             (run_id, market, analytical_key, native_id, project_id, occurrence,
              contributing_owner, is_primary, group_size, disagreements)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           on conflict (run_id, analytical_key, project_id) do nothing`,
          [
            runId, universe.market, project.key, project.nativeId, occurrence.projectId,
            occurrence.occurrence, occurrence.sponsor, occurrence === project.primary,
            project.occurrences.length, JSON.stringify(project.disagreements),
          ],
        );
        resolutionsWritten += 1;
      }
    }
  }

  return {
    runId, run: "created",
    methodologyVersion: METHODOLOGY_VERSION, inputDigest: analytics.inputDigest,
    metricsWritten: metrics.length, resolutionsWritten,
    resolvedGroups: analytics.coverage.caisoDuplicateGroups,
  };
}
