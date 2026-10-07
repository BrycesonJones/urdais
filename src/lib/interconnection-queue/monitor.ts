/**
 * Currentness, per source and never shared.
 *
 * CAISO regenerates daily and stamps a report run date; PJM and MISO refresh continuously and
 * stamp nothing at all. One threshold across the three would call CAISO stale over a weekend
 * while calling a PJM feed that had not moved in a month current. The threshold lives in
 * reference.interconnection_source_monitors, beside the rationale for it.
 *
 * Three different clocks are kept apart here, because conflating them was a defect:
 *
 *   last successful check  — the source answered and its artifact was stored or matched. This is
 *                            operational freshness: whether Urdais can still reach the publisher.
 *   latest content change  — the latest snapshot's `observed_at`. An identical artifact is matched
 *                            to the existing snapshot and never restamped, so this only moves
 *                            when the content does.
 *   source publication     — `source_published_at`, where the publisher stamps one.
 *
 * A `continuous` source (PJM, MISO) publishes no release and no timestamp, so content that has not
 * changed is not evidence the source is down: a recent successful check keeps it current, and
 * content older than the threshold surfaces as a warning instead. Every other cadence keeps the
 * release semantics it had: the publisher's own timestamp where it gives one, otherwise the age of
 * the latest observed release. A fresh check never hides old source data for those.
 *
 * Fails closed: never ingested, latest check unreachable, or no successful contact inside the
 * threshold all leave the source not current.
 */

import type { CurrentnessStatus } from "@/lib/interconnection-queue/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

/**
 * What the API and the page can tell apart. `status` remains the three-valued gate verdict that
 * the scheduler, the badge and the stored checks use; `condition` says why.
 */
export type FreshnessCondition =
  | "current"
  /** Reachable and checked recently, but the content has not changed in longer than expected. */
  | "content_unchanged"
  /** The latest check could not reach the publisher. */
  | "unreachable"
  /** No successful contact with the publisher inside the threshold. */
  | "check_stale"
  /** The publisher's own data is older than the threshold, however recently it was checked. */
  | "source_data_stale"
  /** Never ingested. */
  | "unavailable";

/** Which clock decides whether the source data itself is too old. */
export type FreshnessBasis =
  /** A continuously refreshed feed with no release: content age is diagnostic only. */
  | "continuous"
  /** The publisher's own timestamp. */
  | "source_published"
  /** A release-based source with no timestamp: the age of the latest observed release. */
  | "observed_release";

export type FreshnessInputs = {
  sourceInterfaceSlug: string;
  expectedCadence: string;
  staleAfterHours: number;
  latestObservedAt: string | null;
  sourcePublishedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckReachable: boolean | null;
  lastSuccessfulCheckAt: string | null;
};

/** A check made in this run but not yet recorded, so it can be judged before it is written. */
export type PendingCheck = {
  sourceInterfaceSlug: string;
  checkedAt: string;
  reachable: boolean;
  /** Reachable and produced or matched a snapshot. */
  successful: boolean;
};

export type SourceFreshness = {
  status: CurrentnessStatus;
  condition: FreshnessCondition;
  basis: FreshnessBasis;
  lastCheckedAt: string | null;
  lastSuccessfulCheckAt: string | null;
  /** The latest snapshot's `observed_at`: when the content last changed. */
  latestContentObservedAt: string | null;
  contentAgeHours: number | null;
  contentUnchangedWarning: boolean;
  sourcePublishedAt: string | null;
  publicationAgeHours: number | null;
};

export type SourceCurrentness = SourceFreshness & {
  sourceInterfaceSlug: string;
  expectedCadence: string;
  staleAfterHours: number;
  /** Same as `latestContentObservedAt`; kept for existing callers. */
  latestObservedAt: string | null;
  /** Content age; kept for existing callers. */
  ageHours: number | null;
};

export function statusFor(ageHours: number | null, staleAfterHours: number): CurrentnessStatus {
  if (ageHours === null) return "unavailable";
  return ageHours <= staleAfterHours ? "current" : "stale";
}

const hoursSince = (at: string | null, asOf: Date): number | null =>
  at === null ? null : (asOf.getTime() - new Date(at).getTime()) / 3_600_000;
const round = (hours: number | null): number | null =>
  hours === null ? null : Math.round(hours * 10) / 10;
const later = (a: string | null, b: string | null): string | null => {
  if (a === null) return b;
  if (b === null) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
};

export function freshnessBasis(expectedCadence: string, sourcePublishedAt: string | null): FreshnessBasis {
  if (expectedCadence === "continuous") return "continuous";
  return sourcePublishedAt === null ? "observed_release" : "source_published";
}

/** The one rule the scheduler, the stored checks and the public read model all apply. */
export function assessFreshness(
  input: FreshnessInputs, asOf: Date, pending: PendingCheck | null = null,
): SourceFreshness {
  const lastCheckedAt = pending?.checkedAt ?? input.lastCheckedAt;
  const lastCheckReachable = pending === null ? input.lastCheckReachable : pending.reachable;
  const lastSuccessfulCheckAt = pending?.successful === true ? pending.checkedAt : input.lastSuccessfulCheckAt;

  const basis = freshnessBasis(input.expectedCadence, input.sourcePublishedAt);
  const contentAge = hoursSince(input.latestObservedAt, asOf);
  const publicationAge = hoursSince(input.sourcePublishedAt, asOf);
  // Storing a snapshot is itself a successful contact, so a source that predates the scheduled
  // checks is judged exactly as it was before them.
  const contactAge = hoursSince(later(lastSuccessfulCheckAt, input.latestObservedAt), asOf);
  const threshold = input.staleAfterHours;
  const contentUnchangedWarning = basis === "continuous" && contentAge !== null && contentAge > threshold;

  const verdict = ((): { status: CurrentnessStatus; condition: FreshnessCondition } => {
    if (input.latestObservedAt === null) return { status: "unavailable", condition: "unavailable" };
    if (lastCheckReachable === false) return { status: "unavailable", condition: "unreachable" };
    if (contactAge === null || !(contactAge <= threshold)) return { status: "stale", condition: "check_stale" };
    const dataAge = basis === "source_published" ? publicationAge
      : basis === "observed_release" ? contentAge : null;
    if (dataAge !== null && !(dataAge <= threshold)) return { status: "stale", condition: "source_data_stale" };
    return { status: "current", condition: contentUnchangedWarning ? "content_unchanged" : "current" };
  })();

  return {
    ...verdict, basis, lastCheckedAt, lastSuccessfulCheckAt,
    latestContentObservedAt: input.latestObservedAt,
    contentAgeHours: round(contentAge), contentUnchangedWarning,
    sourcePublishedAt: input.sourcePublishedAt, publicationAgeHours: round(publicationAge),
  };
}

const text = (value: unknown): string | null => (value == null ? null : String(value));

/**
 * The columns `assessFreshness` needs, for a query that has the monitor as `m` and the latest
 * snapshot as `q`.
 */
export const FRESHNESS_COLUMNS = `
  m.expected_cadence, m.stale_after_hours,
  q.observed_at::text as observed_at, q.source_published_at::text as source_published_at,
  lc.checked_at::text as last_checked_at, lc.reachable as last_check_reachable,
  ok.checked_at::text as last_successful_check_at`;

/** The latest check, and the latest successful one, for the monitor `m`. */
export const FRESHNESS_CHECK_JOINS = `
  left join lateral (
    select c.checked_at, c.reachable from pipeline.interconnection_source_checks c
     where c.source_interface_id = m.source_interface_id
     order by c.checked_at desc limit 1) lc on true
  left join lateral (
    select max(c.checked_at) as checked_at from pipeline.interconnection_source_checks c
     where c.source_interface_id = m.source_interface_id and c.reachable and c.snapshot_id is not null) ok on true`;

export function freshnessInputsFromRow(slug: string, row: Record<string, unknown>): FreshnessInputs {
  return {
    sourceInterfaceSlug: slug,
    expectedCadence: String(row.expected_cadence ?? "unknown"),
    staleAfterHours: Number(row.stale_after_hours),
    latestObservedAt: text(row.observed_at),
    sourcePublishedAt: text(row.source_published_at),
    lastCheckedAt: text(row.last_checked_at),
    lastCheckReachable: row.last_check_reachable == null ? null : row.last_check_reachable === true,
    lastSuccessfulCheckAt: text(row.last_successful_check_at),
  };
}

export async function sourceCurrentness(
  sql: CapacitySqlExecutor, asOf: Date = new Date(), pending: PendingCheck | null = null,
): Promise<SourceCurrentness[]> {
  const result = await sql.query(
    `select s.slug, ${FRESHNESS_COLUMNS}
       from reference.interconnection_source_monitors m
       join reference.source_interfaces s on s.id = m.source_interface_id
       left join pipeline.interconnection_queue_snapshots q
              on q.source_interface_id = m.source_interface_id and q.is_latest
       ${FRESHNESS_CHECK_JOINS}
      order by s.slug`,
    [],
  );
  return result.rows.map((row) => {
    const input = freshnessInputsFromRow(String(row.slug), row);
    const freshness = assessFreshness(input, asOf,
      pending?.sourceInterfaceSlug === input.sourceInterfaceSlug ? pending : null);
    return {
      ...freshness,
      sourceInterfaceSlug: input.sourceInterfaceSlug,
      expectedCadence: input.expectedCadence,
      staleAfterHours: input.staleAfterHours,
      latestObservedAt: freshness.latestContentObservedAt,
      ageHours: freshness.contentAgeHours,
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
