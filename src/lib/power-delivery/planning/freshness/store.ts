/**
 * Reading and writing planning freshness evidence.
 *
 * Currentness is derived from rows, never from a scrape held in memory. A check that ran and was
 * not written down cannot support a claim tomorrow, and the whole point of this phase is that
 * "current" is something Urdais can show its working for.
 *
 * A check records its own HTTP evidence rather than creating a `pipeline.source_retrievals` row.
 * A retrieval is the record of collecting a published value; a check reads a listing page to
 * find out whether a value exists to collect. Conflating the two would put listing-page reads
 * into the evidence chain behind canonical points, which is exactly the chain that should stay
 * only about the artifacts those points came from. `retrieval_id` is kept for a future check
 * that downloads a full artifact.
 */

import { PLANNING_CHECKER_VERSION, type DiscoveredVintage } from "@/lib/power-delivery/planning/freshness/discovery/types";
import { resolvePlanningCurrentness } from "@/lib/power-delivery/planning/freshness/status";
import type {
  PlanningCurrentnessInput, PlanningFreshness, PlanningSourceCheck, PlanningSourceMonitor,
} from "@/lib/power-delivery/planning/freshness/types";
import type { QualityStatus } from "@/lib/power-delivery/planning/types";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

const text = (value: unknown): string | null => (value == null ? null : String(value));
const iso = (value: unknown): string | null => (value == null ? null : new Date(String(value)).toISOString());

export async function recordPlanningSourceCheck(
  sql: PlanningSqlExecutor,
  input: {
    sourceInterfaceSlug: string;
    checkedAt: string;
    checkedUrl: string;
    responseStatus: number | null;
    outcome: "succeeded" | "failed";
    discovered: DiscoveredVintage | null;
    artifactHash: string | null;
    error: string | null;
    evidence: Record<string, unknown>;
  },
): Promise<string> {
  const { rows } = await sql.query(
    `insert into pipeline.planning_source_checks
       (source_interface_id, checked_at, outcome, checker_version, checked_url, response_status,
        discovered_vintage_key, discovered_published_at, discovered_published_at_precision,
        discovered_artifact_url, discovered_artifact_hash, evidence, error)
     select s.id, $2::timestamptz, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11, $12::jsonb, $13
       from reference.source_interfaces s where s.slug = $1
     returning id`,
    [
      input.sourceInterfaceSlug, input.checkedAt, input.outcome, PLANNING_CHECKER_VERSION,
      input.checkedUrl, input.responseStatus,
      input.discovered?.nativeVintageKey ?? null,
      input.discovered?.publishedAt ?? null,
      input.discovered?.publishedAtPrecision ?? null,
      input.discovered?.artifactUrl ?? null,
      input.artifactHash,
      JSON.stringify(input.evidence),
      input.error,
    ],
  );
  const id = rows[0]?.id;
  if (id == null) throw new Error(`no source interface ${input.sourceInterfaceSlug} to record a check against`);
  return String(id);
}

function monitorOf(row: Record<string, unknown>): PlanningSourceMonitor {
  return {
    sourceInterfaceSlug: String(row.source_slug),
    marketSlug: String(row.market_slug),
    discoveryUrl: String(row.discovery_url),
    discoveryMethod: String(row.discovery_method) as PlanningSourceMonitor["discoveryMethod"],
    expectedCadence: String(row.expected_cadence) as PlanningSourceMonitor["expectedCadence"],
    checkIntervalMs: Number(row.check_interval_ms),
    monitoringState: String(row.monitoring_state) as PlanningSourceMonitor["monitoringState"],
    blockedKind: text(row.blocked_kind) as PlanningSourceMonitor["blockedKind"],
    blockedReason: text(row.blocked_reason),
  };
}

function checkOf(row: Record<string, unknown>, prefix: "latest" | "success"): PlanningSourceCheck | null {
  const id = row[`${prefix}_id`];
  if (id == null) return null;
  return {
    id: String(id),
    sourceInterfaceSlug: String(row.source_slug),
    checkedAt: iso(row[`${prefix}_checked_at`])!,
    outcome: String(row[`${prefix}_outcome`]) as "succeeded" | "failed",
    checkerVersion: String(row[`${prefix}_checker_version`]),
    checkedUrl: String(row[`${prefix}_checked_url`]),
    responseStatus: row[`${prefix}_response_status`] == null ? null : Number(row[`${prefix}_response_status`]),
    discoveredVintageKey: text(row[`${prefix}_discovered_vintage_key`]),
    discoveredPublishedAt: iso(row[`${prefix}_discovered_published_at`]),
    discoveredArtifactUrl: text(row[`${prefix}_discovered_artifact_url`]),
    discoveredArtifactHash: text(row[`${prefix}_discovered_artifact_hash`]),
    error: text(row[`${prefix}_error`]),
  };
}

const CHECK_COLUMNS = (alias: string, prefix: string): string => [
  "id", "checked_at", "outcome", "checker_version", "checked_url", "response_status",
  "discovered_vintage_key", "discovered_published_at", "discovered_artifact_url",
  "discovered_artifact_hash", "error",
].map((column) => `${alias}.${column} as ${prefix}_${column}`).join(", ");

/**
 * Every monitored source, with the evidence behind its currentness. One query: a per-market
 * round trip would let two markets be resolved against different moments.
 */
export async function loadPlanningFreshness(
  sql: PlanningSqlExecutor,
  now = new Date(),
): Promise<PlanningFreshness[]> {
  const { rows } = await sql.query(
    `select s.slug as source_slug, a.slug as market_slug, a.display_name as market_name,
            m.discovery_url, m.discovery_method, m.expected_cadence, m.monitoring_state,
            m.blocked_kind, m.blocked_reason,
            (extract(epoch from m.check_interval) * 1000)::bigint as check_interval_ms,
            ${CHECK_COLUMNS("lc", "latest")},
            ${CHECK_COLUMNS("ls", "success")},
            sv.native_vintage_key as served_key, sv.published_at as served_published_at,
            sv.quality_status as served_quality,
            dv.native_vintage_key as discovered_key, dv.quality_status as discovered_quality
       from reference.planning_source_monitors m
       join reference.source_interfaces s on s.id = m.source_interface_id
       join reference.grid_areas a on a.id = m.grid_area_id
       left join lateral (
         select * from pipeline.planning_source_checks c
          where c.source_interface_id = m.source_interface_id
          order by c.checked_at desc, c.created_at desc limit 1) lc on true
       left join lateral (
         select * from pipeline.planning_source_checks c
          where c.source_interface_id = m.source_interface_id and c.outcome = 'succeeded'
          order by c.checked_at desc, c.created_at desc limit 1) ls on true
       left join lateral (
         select v.native_vintage_key, v.published_at, v.quality_status
           from pipeline.planning_forecast_vintages v
          where v.source_interface_id = m.source_interface_id and v.grid_area_id = m.grid_area_id
            and v.superseded_by_id is null
          order by v.published_at desc limit 1) sv on true
       left join lateral (
         select v.native_vintage_key, v.quality_status
           from pipeline.planning_forecast_vintages v
          where v.source_interface_id = m.source_interface_id and v.grid_area_id = m.grid_area_id
            and v.native_vintage_key = ls.discovered_vintage_key
          order by v.created_at desc limit 1) dv on true
      order by a.display_name`,
    [],
  );

  return rows.map((row) => {
    const monitor = monitorOf(row);
    const input: PlanningCurrentnessInput = {
      monitor,
      latestCheck: checkOf(row, "latest"),
      latestSuccessfulCheck: checkOf(row, "success"),
      servedVintage: row.served_key == null ? null : {
        nativeVintageKey: String(row.served_key),
        publishedAt: iso(row.served_published_at)!,
        qualityStatus: String(row.served_quality) as QualityStatus,
      },
      discoveredVintage: row.discovered_key == null ? null : {
        nativeVintageKey: String(row.discovered_key),
        qualityStatus: String(row.discovered_quality) as QualityStatus,
      },
      now,
    };
    return {
      ...resolvePlanningCurrentness(input),
      marketSlug: monitor.marketSlug,
      sourceInterfaceSlug: monitor.sourceInterfaceSlug,
      expectedCadence: monitor.expectedCadence,
      monitoringState: monitor.monitoringState,
      blockedKind: monitor.blockedKind,
      blockedReason: monitor.blockedReason,
    };
  });
}
