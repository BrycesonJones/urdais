/**
 * Currentness, per source and never shared.
 *
 * CAISO regenerates daily and stamps a report run date; PJM and MISO refresh continuously and
 * stamp nothing at all. One threshold across the three would call CAISO stale over a weekend
 * while calling a PJM feed that had not moved in a month current. The threshold lives in
 * reference.interconnection_source_monitors, beside the rationale for it.
 */

import type { CurrentnessStatus } from "@/lib/interconnection-queue/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type SourceCurrentness = {
  sourceInterfaceSlug: string;
  expectedCadence: string;
  staleAfterHours: number;
  latestObservedAt: string | null;
  sourcePublishedAt: string | null;
  ageHours: number | null;
  status: CurrentnessStatus;
};

export function statusFor(ageHours: number | null, staleAfterHours: number): CurrentnessStatus {
  if (ageHours === null) return "unavailable";
  return ageHours <= staleAfterHours ? "current" : "stale";
}

export async function sourceCurrentness(
  sql: CapacitySqlExecutor, asOf: Date = new Date(),
): Promise<SourceCurrentness[]> {
  const result = await sql.query(
    `select s.slug, m.expected_cadence, m.stale_after_hours,
            q.observed_at::text as observed_at, q.source_published_at::text as source_published_at
       from reference.interconnection_source_monitors m
       join reference.source_interfaces s on s.id = m.source_interface_id
       left join pipeline.interconnection_queue_snapshots q
              on q.source_interface_id = m.source_interface_id and q.is_latest
      order by s.slug`,
    [],
  );
  return result.rows.map((row) => {
    const observedAt = row.observed_at == null ? null : String(row.observed_at);
    const ageHours = observedAt === null ? null
      : (asOf.getTime() - new Date(observedAt).getTime()) / 3_600_000;
    const staleAfterHours = Number(row.stale_after_hours);
    return {
      sourceInterfaceSlug: String(row.slug),
      expectedCadence: String(row.expected_cadence),
      staleAfterHours,
      latestObservedAt: observedAt,
      sourcePublishedAt: row.source_published_at == null ? null : String(row.source_published_at),
      ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      status: statusFor(ageHours, staleAfterHours),
    };
  });
}

/** Record one currentness check, so a source going quiet leaves a trail rather than a silence. */
export async function recordSourceCheck(
  sql: CapacitySqlExecutor,
  input: {
    sourceInterfaceSlug: string; reachable: boolean; httpStatus: number | null;
    artifactSha256: string | null; sourcePublishedAt: string | null;
    snapshotId: string | null; status: CurrentnessStatus; detail: string | null;
  },
): Promise<void> {
  await sql.query(
    `insert into pipeline.interconnection_source_checks
       (source_interface_id, checked_at, reachable, http_status, artifact_sha256,
        source_published_at, snapshot_id, currentness_status, detail)
     select s.id, now(), $2, $3, $4, $5::timestamptz, $6::uuid, $7, $8
       from reference.source_interfaces s where s.slug = $1`,
    [input.sourceInterfaceSlug, input.reachable, input.httpStatus, input.artifactSha256,
      input.sourcePublishedAt, input.snapshotId, input.status, input.detail],
  );
}
