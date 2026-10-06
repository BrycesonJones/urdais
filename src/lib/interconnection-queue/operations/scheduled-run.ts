/**
 * The unattended interconnection queue refresh.
 *
 * Sequence: claim a lock, ingest each of the seven sources in turn and record a source check
 * after each, measure currentness, and only then recalculate the analytics. Every stage is an
 * existing, reviewed runner; nothing here parses a queue or calculates a metric.
 *
 * The rule this file exists to enforce is that a recalculation never launders stale inputs into a
 * fresh-looking run. If any market that is published is stale, or has never been ingested, the
 * analytics are not attempted at all: the previous validated run stays the one served, and the
 * read model reports its sources' ages honestly. SPP is collected like every other source but
 * never gates anything, because nothing derived from it is ever published.
 */

import { runQueueAnalytics, type AnalyticsRunOutcome } from "@/lib/interconnection-queue/analytics/run";
import { mayPublishMarketMetric } from "@/lib/interconnection-queue/analytics/methodology";
import { QUEUE_ADAPTERS } from "@/lib/interconnection-queue/ingest/registry";
import { runQueueSource, type QueueRunOutcome } from "@/lib/interconnection-queue/ingest/run";
import { QUEUE_SOURCE_KEYS, type QueueSourceKey } from "@/lib/interconnection-queue/ingest/types";
import {
  recordSourceCheck, sourceCurrentness, type SourceCurrentness,
} from "@/lib/interconnection-queue/monitor";
import type { CurrentnessStatus } from "@/lib/interconnection-queue/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import type { ArtifactFetcher } from "@/lib/power-delivery/planning/ingest/artifact";

/** One advisory lock for the whole product, so two invocations cannot interleave. */
const LOCK_KEY = "urdais:interconnection-queue:scheduled-run";

/**
 * ERCOT's archive walk retrieves every selected workbook before the store notices it already
 * holds one, so an unbounded walk would download all of its monthly reports every day. Three
 * covers the newest release plus a correction or two to an earlier period.
 */
export const SCHEDULED_ERCOT_LIMIT = 3;

export type ScheduledSourceResult = {
  source: QueueSourceKey;
  marketSlug: string;
  sourceInterfaceSlug: string;
  status: "ingested" | "failed";
  reachable: boolean;
  snapshotId: string | null;
  currentness: CurrentnessStatus;
  detail: string;
};

export type MarketCurrentness = SourceCurrentness & { marketSlug: string; publishable: boolean };

export type ScheduledQueueRunOutcome = {
  ok: boolean;
  status: "succeeded" | "failed" | "skipped_locked";
  reason: "source_failed" | "inputs_stale" | "analytics_failed" | null;
  /** Published markets whose inputs held the analytics back. Empty unless the gate closed. */
  stale: { marketSlug: string; status: CurrentnessStatus; latestObservedAt: string | null;
    ageHours: number | null; staleAfterHours: number | null }[];
  sources: ScheduledSourceResult[];
  currentness: MarketCurrentness[];
  analytics: AnalyticsRunOutcome | null;
  elapsedMs: number;
};

/** What one source run saw, in the terms a source check records. */
function describe(outcome: QueueRunOutcome): {
  status: "ingested" | "failed"; reachable: boolean; httpStatus: number | null;
  artifactSha256: string | null; sourcePublishedAt: string | null; snapshotId: string | null;
  detail: string;
} {
  switch (outcome.status) {
    case "ingested":
      return {
        status: "ingested", reachable: true, httpStatus: outcome.httpStatus,
        artifactSha256: outcome.artifactSha256, sourcePublishedAt: outcome.sourcePublishedAt,
        snapshotId: outcome.snapshotId, detail: `snapshot ${outcome.snapshot}`,
      };
    case "backfilled": {
      const latest = outcome.latestArtifact;
      // Reachable means something was actually retrieved, not merely that the index answered.
      const reachable = outcome.artifactsSelected === 0 || latest !== null;
      const deferred = outcome.artifactsDeferred.map((item) => `${item.label} ${item.reason}`);
      return {
        // A deferred artifact in a three-release window is a reader or publisher problem worth a
        // failure, not a footnote: the newest release may be the one that was skipped.
        status: reachable && deferred.length === 0 ? "ingested" : "failed",
        reachable,
        httpStatus: latest?.httpStatus ?? null, artifactSha256: latest?.sha256 ?? null,
        sourcePublishedAt: latest?.sourcePublishedAt ?? null, snapshotId: latest?.snapshotId ?? null,
        detail: `${outcome.snapshotsCreated} snapshot(s) created, ${outcome.snapshotsExisting} existing`
          + (deferred.length === 0 ? "" : `; deferred: ${deferred.join("; ")}`),
      };
    }
    case "failed":
      return {
        status: "failed",
        // Only a retrieval failure says the publisher could not be reached. A parse or write
        // failure happened after the bytes arrived.
        reachable: outcome.phase !== undefined && outcome.phase !== "retrieval",
        httpStatus: null, artifactSha256: null, sourcePublishedAt: null, snapshotId: null,
        detail: `failed during ${outcome.phase ?? "setup"}: ${outcome.error}`,
      };
    default:
      return {
        status: "failed", reachable: true, httpStatus: null, artifactSha256: null,
        sourcePublishedAt: null, snapshotId: null, detail: `unexpected outcome ${outcome.status}`,
      };
  }
}

/** Currentness keyed by market, with the publication rule beside it. */
function byMarket(rows: SourceCurrentness[]): MarketCurrentness[] {
  return QUEUE_SOURCE_KEYS.map((key) => {
    const adapter = QUEUE_ADAPTERS[key];
    const row = rows.find((candidate) => candidate.sourceInterfaceSlug === adapter.sourceInterfaceSlug);
    return {
      // A source with no monitor row is reported as unavailable rather than skipped.
      ...(row ?? {
        sourceInterfaceSlug: adapter.sourceInterfaceSlug, expectedCadence: "unknown",
        staleAfterHours: Number.NaN, latestObservedAt: null, sourcePublishedAt: null,
        ageHours: null, status: "unavailable" as const,
      }),
      marketSlug: adapter.marketSlug,
      publishable: mayPublishMarketMetric(adapter.marketSlug),
    };
  });
}

export async function runScheduledQueueRefresh(
  sql: CapacitySqlExecutor,
  options: { fetcher?: ArtifactFetcher; now?: () => Date } = {},
): Promise<ScheduledQueueRunOutcome> {
  const startedAt = Date.now();
  const now = options.now ?? (() => new Date());
  const base: ScheduledQueueRunOutcome = {
    ok: false, status: "failed", reason: null, stale: [], sources: [], currentness: [],
    analytics: null, elapsedMs: 0,
  };

  // Session-level, not transaction-level: each source writes in its own transaction.
  const lock = await sql.query(`select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired`, [LOCK_KEY]);
  if (lock.rows[0]?.acquired !== true) {
    // Overlapping invocations are an ordinary condition, not an incident.
    return { ...base, ok: true, status: "skipped_locked", elapsedMs: Date.now() - startedAt };
  }

  try {
    const sources: ScheduledSourceResult[] = [];
    for (const key of QUEUE_SOURCE_KEYS) {
      const adapter = QUEUE_ADAPTERS[key];
      // Sequential and isolated: one publisher failing leaves every other source to run.
      const outcome = await runQueueSource(sql, key, {
        ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
        ...(key === "ercot" ? { limit: SCHEDULED_ERCOT_LIMIT } : {}),
      });
      const seen = describe(outcome);
      // Measured after the attempt, so the check records the state the source is actually in.
      const current = (await sourceCurrentness(sql, now()))
        .find((row) => row.sourceInterfaceSlug === adapter.sourceInterfaceSlug);
      const currentness = current?.status ?? "unavailable";
      await recordSourceCheck(sql, {
        sourceInterfaceSlug: adapter.sourceInterfaceSlug, reachable: seen.reachable,
        httpStatus: seen.httpStatus, artifactSha256: seen.artifactSha256,
        sourcePublishedAt: seen.sourcePublishedAt, snapshotId: seen.snapshotId,
        status: currentness, detail: seen.detail.slice(0, 2000),
      });
      sources.push({
        source: key, marketSlug: adapter.marketSlug, sourceInterfaceSlug: adapter.sourceInterfaceSlug,
        status: seen.status, reachable: seen.reachable, snapshotId: seen.snapshotId,
        currentness, detail: seen.detail,
      });
    }

    const currentness = byMarket(await sourceCurrentness(sql, now()));
    const stale = currentness
      .filter((row) => row.publishable && row.status !== "current")
      .map((row) => ({
        marketSlug: row.marketSlug, status: row.status, latestObservedAt: row.latestObservedAt,
        ageHours: row.ageHours,
        staleAfterHours: Number.isFinite(row.staleAfterHours) ? row.staleAfterHours : null,
      }));
    const sourceFailed = sources.some((source) => source.status === "failed");

    if (stale.length > 0) {
      // Fail closed. Recalculating over stale inputs would stamp old snapshots with a new date.
      return {
        ...base, reason: "inputs_stale", stale, sources, currentness,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const analytics = await runQueueAnalytics(sql);
    const calculated = analytics.status === "calculated";
    return {
      ok: calculated && !sourceFailed,
      status: calculated && !sourceFailed ? "succeeded" : "failed",
      reason: !calculated ? "analytics_failed" : sourceFailed ? "source_failed" : null,
      stale, sources, currentness, analytics, elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await sql.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, [LOCK_KEY]);
  }
}
