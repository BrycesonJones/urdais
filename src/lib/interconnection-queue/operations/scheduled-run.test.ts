/**
 * The unattended interconnection queue refresh.
 *
 * What these protect is the order and the gate. Each source is ingested and then checked before
 * the next is touched; a publisher that fails is recorded as unreachable without a placeholder
 * snapshot; and a published market whose inputs are stale holds the analytics back entirely, so a
 * daily recalculation can never stamp a fortnight-old snapshot with today's date.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { runQueueSource, runQueueAnalytics, actualIngest } = vi.hoisted(() => ({
  runQueueSource: vi.fn(),
  runQueueAnalytics: vi.fn(),
  actualIngest: {} as { runQueueSource?: (...args: unknown[]) => Promise<unknown> },
}));

// The real ingest runner stays reachable through the mock, so one test can drive it end to end
// against a fetcher that fails.
vi.mock("@/lib/interconnection-queue/ingest/run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/interconnection-queue/ingest/run")>();
  actualIngest.runQueueSource = actual.runQueueSource as (...args: unknown[]) => Promise<unknown>;
  return { ...actual, runQueueSource };
});
vi.mock("@/lib/interconnection-queue/analytics/run", () => ({ runQueueAnalytics }));

import { recordSourceCheck, statusFor } from "@/lib/interconnection-queue/monitor";
import {
  SCHEDULED_ERCOT_LIMIT, runScheduledQueueRefresh,
} from "@/lib/interconnection-queue/operations/scheduled-run";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

const NOW = new Date("2026-10-06T09:30:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const MONITORS: Record<string, { slug: string; staleAfter: number }> = {
  pjm: { slug: "pjm-planning-queues", staleAfter: 168 },
  miso: { slug: "miso-generator-interconnection-queue", staleAfter: 168 },
  caiso: { slug: "caiso-public-queue-report", staleAfter: 72 },
  ercot: { slug: "ercot-gis-report", staleAfter: 1128 },
  nyiso: { slug: "nyiso-interconnection-queue", staleAfter: 1128 },
  "iso-ne": { slug: "iso-ne-interconnection-queue", staleAfter: 72 },
  spp: { slug: "spp-generator-interconnection-queue", staleAfter: 336 },
};

/**
 * A stub database answering the lock, the currentness read and the check insert. `ages` is the
 * age in hours of each market's latest snapshot; null means it has none.
 */
function executor(ages: Partial<Record<string, number | null>> = {}, options: { locked?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const sql = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ sql: text, params });
      if (text.includes("pg_try_advisory_lock")) return { rows: [{ acquired: options.locked !== true }] };
      if (text.includes("from reference.interconnection_source_monitors")) {
        return {
          rows: Object.entries(MONITORS).map(([market, monitor]) => {
            const age = market in ages ? ages[market] : 1;
            return {
              slug: monitor.slug, expected_cadence: "daily", stale_after_hours: monitor.staleAfter,
              observed_at: age === null || age === undefined ? null : hoursAgo(age),
              source_published_at: null,
            };
          }),
        };
      }
      return { rows: [] };
    },
    end: async () => {},
  };
  return { sql: sql as unknown as CapacitySqlExecutor, calls };
}

const ingested = (source: string) => ({
  status: "ingested", source, marketSlug: source, snapshotId: `snap-${source}`, snapshotKey: "k",
  snapshot: "existing", sourcePublishedAt: null, artifactSha256: "a".repeat(64), httpStatus: 200,
  retrievalsInserted: 0, retrievalsReused: 1, rightsSnapshots: 0, rawRecordsInserted: 0,
  rawRecordsDuplicate: 0, requestsInserted: 0, requestsReused: 0, observationsInserted: 0,
  observationsConfirmed: 0, quantitiesInserted: 0, resourcesInserted: 0, deferralsRecorded: 0,
  nonCanonicalRows: 0, statements: 0, retrievalMs: 0, parseMs: 0, persistMs: 0, identityCollisions: [],
});

const calculated = {
  status: "calculated", runId: "run-1", run: "created", methodologyVersion: "1.0.0", inputDigest: "d",
  resultsInserted: 10, liveResults: 8, blockedResults: 2, deferredResults: 0, statements: 3,
  calculateMs: 1, persistMs: 1,
};

const checks = (calls: { sql: string; params: unknown[] }[]) =>
  calls.filter((call) => call.sql.includes("insert into pipeline.interconnection_source_checks"));

beforeEach(() => {
  runQueueSource.mockReset();
  runQueueAnalytics.mockReset();
  runQueueSource.mockImplementation(async (_sql: unknown, source: string) => ingested(source));
  runQueueAnalytics.mockResolvedValue(calculated);
});

describe("the scheduled refresh", () => {
  it("ingests and checks each source in turn, then calculates", async () => {
    const { sql, calls } = executor();
    const order: string[] = [];
    runQueueSource.mockImplementation(async (_sql: unknown, source: string) => {
      order.push(`ingest:${source}`);
      return ingested(source);
    });
    runQueueAnalytics.mockImplementation(async () => { order.push("analytics"); return calculated; });
    const original = sql.query.bind(sql);
    sql.query = (async (text: string, params?: unknown[]) => {
      if (text.includes("interconnection_source_checks")) order.push(`check:${String(params?.[0])}`);
      return original(text, params ?? []);
    }) as typeof sql.query;

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(order).toEqual([
      "ingest:pjm", "check:pjm-planning-queues",
      "ingest:miso", "check:miso-generator-interconnection-queue",
      "ingest:caiso", "check:caiso-public-queue-report",
      "ingest:ercot", "check:ercot-gis-report",
      "ingest:nyiso", "check:nyiso-interconnection-queue",
      "ingest:iso-ne", "check:iso-ne-interconnection-queue",
      "ingest:spp", "check:spp-generator-interconnection-queue",
      "analytics",
    ]);
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe("succeeded");
    expect(outcome.sources.every((source) => source.currentness === "current")).toBe(true);
    // The lock is taken first and released last.
    expect(calls[0]!.sql).toMatch(/pg_try_advisory_lock/);
    expect(calls.at(-1)!.sql).toMatch(/pg_advisory_unlock/);
  });

  it("bounds ERCOT's archive walk and no other source", async () => {
    const { sql } = executor();
    await runScheduledQueueRefresh(sql, { now: () => NOW });
    expect(SCHEDULED_ERCOT_LIMIT).toBe(3);
    const ercot = runQueueSource.mock.calls.find((call) => call[1] === "ercot")!;
    expect(ercot[2]).toMatchObject({ limit: 3 });
    for (const call of runQueueSource.mock.calls.filter((entry) => entry[1] !== "ercot")) {
      expect(call[2]).not.toHaveProperty("limit");
    }
  });

  it("lets every other source run when one fails, and records it as unreachable", async () => {
    const { sql, calls } = executor();
    runQueueSource.mockImplementation(async (_sql: unknown, source: string) => (source === "miso"
      ? { status: "failed", source, phase: "retrieval", error: "Error: fetch failed" }
      : ingested(source)));

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(runQueueSource).toHaveBeenCalledTimes(7);
    const miso = checks(calls).find((call) => call.params[0] === "miso-generator-interconnection-queue")!;
    // reachable, http status, artifact hash, published at, snapshot id
    expect(miso.params.slice(1, 6)).toEqual([false, null, null, null, null]);
    expect(String(miso.params[7])).toMatch(/fetch failed/);
    expect(outcome.sources.find((source) => source.source === "miso")!.status).toBe("failed");
    // The older MISO snapshot is still current, so the others are recalculated, but the run is
    // still reported as failed.
    expect(runQueueAnalytics).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("source_failed");
  });

  it("writes no snapshot when retrieval fails, only the check", async () => {
    const { sql, calls } = executor();
    const fetcher = vi.fn(async () => { throw new Error("fetch failed"); });
    runQueueSource.mockImplementation(actualIngest.runQueueSource!);

    const outcome = await runScheduledQueueRefresh(sql, { fetcher, now: () => NOW });

    expect(fetcher).toHaveBeenCalled();
    // Nothing is written but the checks: no retrieval, no snapshot, not even a transaction.
    expect(calls.some((call) => /insert into pipeline\.(interconnection_queue_snapshots|source_retrievals)|^begin$/
      .test(call.sql.trim()))).toBe(false);
    expect(checks(calls)).toHaveLength(7);
    for (const check of checks(calls)) expect(check.params[1]).toBe(false);
    expect(outcome.sources.every((source) => source.status === "failed" && !source.reachable)).toBe(true);
  });

  it("holds the analytics back when a published market is stale", async () => {
    // CAISO's threshold is 72 hours.
    const { sql } = executor({ caiso: 72.5 });
    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(runQueueAnalytics).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("inputs_stale");
    expect(outcome.stale).toEqual([expect.objectContaining({ marketSlug: "caiso", status: "stale" })]);
  });

  it("holds the analytics back when a published market has never been ingested", async () => {
    const { sql } = executor({ nyiso: null });
    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(runQueueAnalytics).not.toHaveBeenCalled();
    expect(outcome.reason).toBe("inputs_stale");
    expect(outcome.stale.map((row) => [row.marketSlug, row.status])).toEqual([["nyiso", "unavailable"]]);
  });

  it("does not let SPP alone block publication, because nothing of it is published", async () => {
    const { sql } = executor({ spp: 5000 });
    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(runQueueAnalytics).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(true);
    const spp = outcome.currentness.find((row) => row.marketSlug === "spp")!;
    expect(spp.status).toBe("stale");
    expect(spp.publishable).toBe(false);
  });

  it("collapses into a no-op when another run holds the lock", async () => {
    const { sql, calls } = executor({}, { locked: true });
    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });
    expect(outcome.status).toBe("skipped_locked");
    expect(runQueueSource).not.toHaveBeenCalled();
    expect(calls.some((call) => call.sql.includes("pg_advisory_unlock"))).toBe(false);
  });

  it("reports an analytics failure as a failure", async () => {
    const { sql } = executor();
    runQueueAnalytics.mockResolvedValue({ status: "failed", error: "Error: boom" });
    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("analytics_failed");
  });
});

describe("source currentness", () => {
  it("is current at the threshold, stale just past it, and unavailable without a snapshot", () => {
    expect(statusFor(0, 72)).toBe("current");
    expect(statusFor(72, 72)).toBe("current");
    expect(statusFor(72.01, 72)).toBe("stale");
    expect(statusFor(null, 72)).toBe("unavailable");
  });
});

describe("recording a source check", () => {
  it("maps every field to its column, in order", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const sql = {
      query: async (text: string, params: unknown[] = []) => { calls.push({ sql: text, params }); return { rows: [] }; },
    } as unknown as CapacitySqlExecutor;

    await recordSourceCheck(sql, {
      sourceInterfaceSlug: "pjm-planning-queues", reachable: true, httpStatus: 200,
      artifactSha256: "b".repeat(64), sourcePublishedAt: "2026-10-05T00:00:00Z",
      snapshotId: "00000000-0000-0000-0000-000000000001", status: "current", detail: "snapshot existing",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/insert into pipeline\.interconnection_source_checks/);
    expect(calls[0]!.params).toEqual([
      "pjm-planning-queues", true, 200, "b".repeat(64), "2026-10-05T00:00:00Z",
      "00000000-0000-0000-0000-000000000001", "current", "snapshot existing",
    ]);
  });
});
