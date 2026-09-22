/**
 * The analytical universe: canonical GBV-2 rows, filtered and resolved under methodology 1.0.0.
 *
 * This is the only place canonical evidence becomes analytical projects, and it reads. It never
 * writes to, updates or deletes a canonical row -- the resolution CAISO needs exists here and in
 * the run record, not in storage.
 */

import {
  CAISO_SOURCE_SLUG, ERCOT_SOURCE_SLUG, EXCLUDED_DRIVER_CLASSES, analyticalProjectKey,
  resolvesDuplicateOccurrences, type AnalyticalMarket,
} from "@/lib/grid-buildout/analytics/methodology";
import type {
  AnalyticalProject, AnalyticalUniverse, CanonicalOccurrence,
} from "@/lib/grid-buildout/analytics/types";
import { assertOccurrenceDomain, assertUniverseDomain } from "@/lib/grid-buildout/analytics/validate";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import type { LifecycleState } from "@/lib/grid-buildout/types";

const SOURCE_SLUGS: Record<AnalyticalMarket, string> = {
  ercot: ERCOT_SOURCE_SLUG,
  caiso: CAISO_SOURCE_SLUG,
};

/**
 * Everything the metrics need, in one query per market, from the latest snapshot for that source.
 *
 * Only milestones whose quality is `reported` yield a date; a sentinel arrives as a null date with
 * its flag set, so no arithmetic can ever reach a placeholder.
 */
const OCCURRENCE_SQL = `
  with latest as (
    select s.id, s.native_snapshot_key, s.observed_at
      from pipeline.buildout_snapshots s
      join reference.source_interfaces si on si.id = s.source_interface_id
     where si.slug = $1
     order by s.observed_at desc, s.created_at desc
     limit 1
  )
  select l.id as snapshot_id, l.native_snapshot_key, l.observed_at,
         p.id as project_id, p.native_id, p.occurrence,
         o.raw_record_id, o.native_list, o.sponsor, o.driver_class,
         lc.lifecycle_state, lc.basis as lifecycle_basis,
         (select q.value_numeric from pipeline.buildout_quantities q
           where q.project_id = p.id and q.snapshot_id = l.id and q.kind = 'service_level_kv') as service_kv,
         (select q.value_numeric from pipeline.buildout_quantities q
           where q.project_id = p.id and q.snapshot_id = l.id and q.kind = 'circuit_miles_new') as new_miles,
         (select q.is_reported from pipeline.buildout_quantities q
           where q.project_id = p.id and q.snapshot_id = l.id and q.kind = 'circuit_miles_new') as new_reported,
         (select q.value_numeric from pipeline.buildout_quantities q
           where q.project_id = p.id and q.snapshot_id = l.id and q.kind = 'circuit_miles_rebuilt') as rebuilt_miles,
         (select q.is_reported from pipeline.buildout_quantities q
           where q.project_id = p.id and q.snapshot_id = l.id and q.kind = 'circuit_miles_rebuilt') as rebuilt_reported,
         (select m.observed_date from pipeline.buildout_milestones m
           where m.project_id = p.id and m.snapshot_id = l.id and m.kind = 'actual_in_service'
             and m.date_quality = 'reported') as actual_in_service,
         (select count(*) > 0 from pipeline.buildout_milestones m
           where m.project_id = p.id and m.snapshot_id = l.id and m.kind = 'actual_in_service'
             and m.date_quality = 'sentinel_unknown') as actual_sentinel,
         (select m.observed_date from pipeline.buildout_milestones m
           where m.project_id = p.id and m.snapshot_id = l.id
             and m.kind = 'target_in_service_at_approval' and m.date_quality = 'reported') as target_at_approval,
         (select m.date_precision from pipeline.buildout_milestones m
           where m.project_id = p.id and m.snapshot_id = l.id
             and m.kind = 'target_in_service_at_approval' and m.date_quality = 'reported') as target_at_approval_precision,
         (select m.observed_date from pipeline.buildout_milestones m
           where m.project_id = p.id and m.snapshot_id = l.id
             and m.kind = 'target_in_service_current' and m.date_quality = 'reported') as target_current,
         (select m.date_precision from pipeline.buildout_milestones m
           where m.project_id = p.id and m.snapshot_id = l.id
             and m.kind = 'target_in_service_current' and m.date_quality = 'reported') as target_current_precision,
         o.description as cancellation_reason
    from latest l
    join pipeline.buildout_project_observations o on o.snapshot_id = l.id
    join pipeline.buildout_projects p on p.id = o.project_id
    join pipeline.buildout_lifecycle_observations lc
      on lc.project_id = p.id and lc.snapshot_id = l.id
   order by p.native_id, p.occurrence`;

function asDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadUniverse(
  sql: CapacitySqlExecutor,
  market: AnalyticalMarket,
): Promise<AnalyticalUniverse> {
  const result = await sql.query(OCCURRENCE_SQL, [SOURCE_SLUGS[market]]);
  if (result.rows.length === 0) {
    throw new Error(`grid buildout: no ingested snapshot for ${SOURCE_SLUGS[market]}`);
  }

  const head = result.rows[0]!;
  const snapshotId = String(head.snapshot_id);
  const snapshotKey = String(head.native_snapshot_key);
  const observedAt = head.observed_at instanceof Date
    ? head.observed_at.toISOString()
    : String(head.observed_at);

  const excluded = new Map<string, number>();
  const note = (reason: string) => excluded.set(reason, (excluded.get(reason) ?? 0) + 1);

  const occurrences: CanonicalOccurrence[] = [];
  let unknownDriverCount = 0;

  for (const row of result.rows) {
    const driverClass = String(row.driver_class);
    if ((EXCLUDED_DRIVER_CLASSES as readonly string[]).includes(driverClass)) {
      note(`driver_${driverClass}`);
      continue;
    }
    if (driverClass === "unknown") unknownDriverCount += 1;

    const occurrence: CanonicalOccurrence = {
      projectId: String(row.project_id),
      snapshotId,
      rawRecordId: String(row.raw_record_id),
      nativeId: String(row.native_id),
      nativeList: String(row.native_list),
      occurrence: Number(row.occurrence),
      sponsor: row.sponsor === null ? null : String(row.sponsor),
      lifecycle: String(row.lifecycle_state) as LifecycleState,
      lifecycleBasis: String(row.lifecycle_basis),
      driverClass,
      serviceLevelKv: asNumber(row.service_kv),
      newMiles: { value: asNumber(row.new_miles), isReported: row.new_reported === true },
      rebuiltMiles: { value: asNumber(row.rebuilt_miles), isReported: row.rebuilt_reported === true },
      actualInService: asDate(row.actual_in_service),
      actualInServiceSentinel: row.actual_sentinel === true,
      targetAtApproval: asDate(row.target_at_approval),
      targetAtApprovalPrecision: row.target_at_approval_precision === null ? null : String(row.target_at_approval_precision),
      targetCurrent: asDate(row.target_current),
      targetCurrentPrecision: row.target_current_precision === null ? null : String(row.target_current_precision),
      cancellationReason: row.cancellation_reason === null ? null : String(row.cancellation_reason),
    };
    // Refuse impossible canonical data rather than letting it become a metric.
    assertOccurrenceDomain(occurrence, market);
    occurrences.push(occurrence);
  }

  const projects = resolveProjects(market, occurrences);

  const duplicateResolutions = projects
    .filter((project) => project.occurrences.length > 1)
    .map((project) => ({
      nativeId: project.nativeId,
      occurrences: project.occurrences.length,
      owners: project.contributingOwners,
      projectIds: project.occurrences.map((item) => item.projectId),
    }));

  const universe: AnalyticalUniverse = {
    market, snapshotId, snapshotKey, observedAt,
    occurrencesRead: result.rows.length,
    projects,
    excluded: [...excluded].map(([reason, count]) => ({ reason, count })),
    unknownDriverCount,
    duplicateResolutions,
  };
  assertUniverseDomain(universe);
  return universe;
}

/**
 * Group occurrences into analytical projects.
 *
 * ERCOT never groups: its five repeated project numbers sit inside one sheet and the publisher has
 * simply reused a number, so each occurrence stays its own project. CAISO groups by exact
 * identifier, which is methodology §6.
 */
export function resolveProjects(
  market: AnalyticalMarket,
  occurrences: readonly CanonicalOccurrence[],
): AnalyticalProject[] {
  const groups = new Map<string, CanonicalOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = resolvesDuplicateOccurrences(market)
      ? analyticalProjectKey(market, occurrence.nativeId)
      // Not resolving: occurrence is part of the key, so nothing merges.
      : `${analyticalProjectKey(market, occurrence.nativeId)}#${occurrence.occurrence}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(occurrence);
    groups.set(key, bucket);
  }

  const projects: AnalyticalProject[] = [];
  for (const [key, members] of groups) {
    // Deterministic order: the publisher's own sheet order, then occurrence.
    const ordered = [...members].sort((a, b) =>
      a.nativeList === b.nativeList ? a.occurrence - b.occurrence : a.nativeList < b.nativeList ? -1 : 1);
    const primary = ordered[0]!;

    const disagreements: AnalyticalProject["disagreements"] = [];
    if (ordered.length > 1) {
      for (const field of ["targetAtApproval", "targetCurrent", "lifecycle"] as const) {
        const values = [...new Set(ordered.map((item) => String(item[field] ?? "")))].filter((v) => v !== "");
        if (values.length > 1) disagreements.push({ field, values });
      }
    }

    projects.push({
      key,
      market,
      nativeId: primary.nativeId,
      occurrences: ordered,
      primary,
      contributingOwners: [...new Set(ordered.map((item) => item.sponsor ?? item.nativeList))],
      disagreements,
    });
  }
  return projects.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
