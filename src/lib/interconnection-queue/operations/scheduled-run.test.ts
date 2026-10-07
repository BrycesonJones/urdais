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

import { runQueueArchive } from "@/lib/interconnection-queue/ingest/run";
import type { QueueAdapter } from "@/lib/interconnection-queue/ingest/types";
import { recordSourceCheck, statusFor } from "@/lib/interconnection-queue/monitor";
import {
  SCHEDULED_ERCOT_LIMIT, runScheduledQueueRefresh,
} from "@/lib/interconnection-queue/operations/scheduled-run";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

const NOW = new Date("2026-10-06T09:30:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

/** The production monitor policies (cadence and threshold) for the seven sources. */
const MONITORS: Record<string, { slug: string; staleAfter: number; cadence: string }> = {
  pjm: { slug: "pjm-planning-queues", staleAfter: 168, cadence: "continuous" },
  miso: { slug: "miso-generator-interconnection-queue", staleAfter: 168, cadence: "continuous" },
  caiso: { slug: "caiso-public-queue-report", staleAfter: 72, cadence: "daily" },
  ercot: { slug: "ercot-gis-report", staleAfter: 1128, cadence: "monthly" },
  nyiso: { slug: "nyiso-interconnection-queue", staleAfter: 1128, cadence: "monthly" },
  "iso-ne": { slug: "iso-ne-interconnection-queue", staleAfter: 72, cadence: "daily" },
  spp: { slug: "spp-generator-interconnection-queue", staleAfter: 336, cadence: "weekly" },
};

/**
 * A stub database answering the lock, the currentness read and the check insert. `ages` is the
 * age in hours of each market's latest snapshot; null means it has none. `published` is the age of
 * the publisher's own timestamp, for the markets that have one. Checks the run records are
 * remembered and served back on the next currentness read, as the real table would.
 */
function executor(ages: Partial<Record<string, number | null>> = {},
  options: { locked?: boolean; published?: Partial<Record<string, number>> } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const recorded = new Map<string, { checkedAt: string; reachable: boolean; successful: boolean }[]>();
  const sql = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ sql: text, params });
      if (text.includes("pg_try_advisory_lock")) return { rows: [{ acquired: options.locked !== true }] };
      if (text.includes("insert into pipeline.interconnection_source_checks")) {
        const slug = String(params[0]);
        recorded.set(slug, [...(recorded.get(slug) ?? []), {
          checkedAt: NOW.toISOString(), reachable: params[1] === true,
          successful: params[1] === true && params[5] !== null,
        }]);
        return { rows: [] };
      }
      if (text.includes("from reference.interconnection_source_monitors")) {
        return {
          rows: Object.entries(MONITORS).map(([market, monitor]) => {
            const age = market in ages ? ages[market] : 1;
            const published = options.published?.[market];
            const history = recorded.get(monitor.slug) ?? [];
            const last = history.at(-1);
            const lastOk = history.filter((check) => check.successful).at(-1);
            return {
              slug: monitor.slug, expected_cadence: monitor.cadence, stale_after_hours: monitor.staleAfter,
              observed_at: age === null || age === undefined ? null : hoursAgo(age),
              source_published_at: published === undefined ? null : hoursAgo(published),
              last_checked_at: last?.checkedAt ?? null, last_check_reachable: last?.reachable ?? null,
              last_successful_check_at: lastOk?.checkedAt ?? null,
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

/** An ERCOT archive walk over three releases, with the named ones deferred. */
const backfilled = (deferred: { label: string; reportPeriod: string; reason: string }[] = [],
  options: { stored?: boolean } = {}) => ({
  status: "backfilled", source: "ercot", marketSlug: "ercot", artifactsDiscovered: 40, reportPeriods: 40,
  corrections: 0, artifactsParsed: 3 - deferred.length, artifactsDeferred: deferred,
  snapshotsCreated: 0, snapshotsExisting: 3 - deferred.length, rawRecordsInserted: 0, requestsInserted: 0,
  observationsInserted: 0, observationsConfirmed: 0, quantitiesInserted: 0, resourcesInserted: 0,
  deferralsRecorded: 0, historicalRange: { first: "2023-01-01", last: "2026-09-01" },
  artifactsSelected: 3, artifactsRetrieved: 3,
  latestArtifact: options.stored === false ? null : {
    sha256: "e".repeat(64), httpStatus: 200, snapshotId: "snap-ercot", sourcePublishedAt: "2026-08-05T00:00:00Z",
  },
  statements: 0, retrievalMs: 0, parseMs: 0, persistMs: 0,
});

const OLD_WORKBOOK = { label: "GIS_Report_2026-07", reportPeriod: "2026-07-01",
  reason: "unparseable: Error: no Project Details sheet" };
const NEWEST_WORKBOOK = { label: "GIS_Report_2026-09", reportPeriod: "2026-09-01",
  reason: "unparseable: Error: no Project Details sheet" };

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
      if (text.includes("insert into pipeline.interconnection_source_checks")) order.push(`check:${String(params?.[0])}`);
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
    expect(outcome.sources.find((source) => source.source === "miso")).toMatchObject({
      status: "failed", currentness: "unavailable",
    });
    // Fail closed: a published source that could not be reached is not current, however young its
    // last snapshot, so the analytics are held back rather than recalculated around it.
    expect(runQueueAnalytics).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("inputs_stale");
    expect(outcome.stale).toEqual([expect.objectContaining({
      marketSlug: "miso", status: "unavailable", condition: "unreachable",
    })]);
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

  it("records a deferred historical artifact without failing the run", async () => {
    const { sql, calls } = executor();
    runQueueSource.mockImplementation(async (_sql: unknown, source: string) => (source === "ercot"
      ? backfilled([OLD_WORKBOOK]) : ingested(source)));

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe("succeeded");
    expect(outcome.reason).toBeNull();
    expect(runQueueAnalytics).toHaveBeenCalledTimes(1);
    const ercot = outcome.sources.find((source) => source.source === "ercot")!;
    expect(ercot.status).toBe("ingested_with_deferrals");
    expect(ercot.reachable).toBe(true);
    expect(ercot.deferred).toEqual([{ artifact: "GIS_Report_2026-07", reportPeriod: "2026-07-01",
      reason: "unparseable: Error: no Project Details sheet" }]);
    // The check row names the deferral, and still records the evidence that was stored.
    const check = checks(calls).find((call) => call.params[0] === "ercot-gis-report")!;
    expect(check.params.slice(1, 7)).toEqual([true, 200, "e".repeat(64), "2026-08-05T00:00:00Z", "snap-ercot", "current"]);
    expect(String(check.params[7])).toMatch(/deferred 1: GIS_Report_2026-07 \(2026-07-01\): unparseable/);
    expect(checks(calls)).toHaveLength(7);
  });

  it("lets currentness decide when the deferred artifact is the newest, and coverage is still current", async () => {
    // ERCOT's threshold is 1128 hours; its last stored release is 800 hours old.
    const { sql } = executor({ ercot: 800 });
    runQueueSource.mockImplementation(async (_sql: unknown, source: string) => (source === "ercot"
      ? backfilled([NEWEST_WORKBOOK]) : ingested(source)));

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe("succeeded");
    expect(runQueueAnalytics).toHaveBeenCalledTimes(1);
    expect(outcome.sources.find((source) => source.source === "ercot")).toMatchObject({
      status: "ingested_with_deferrals", currentness: "current",
    });
  });

  it("fails on staleness, not on the deferral, when the newest artifact is deferred and coverage has aged out", async () => {
    const { sql, calls } = executor({ ercot: 1200 });
    runQueueSource.mockImplementation(async (_sql: unknown, source: string) => (source === "ercot"
      ? backfilled([NEWEST_WORKBOOK]) : ingested(source)));

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(runQueueAnalytics).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("inputs_stale");
    expect(outcome.stale).toEqual([expect.objectContaining({ marketSlug: "ercot", status: "stale" })]);
    // The source itself did not fail; its check says stale and names what was deferred.
    expect(outcome.sources.find((source) => source.source === "ercot")!.status).toBe("ingested_with_deferrals");
    const check = checks(calls).find((call) => call.params[0] === "ercot-gis-report")!;
    expect(check.params[6]).toBe("stale");
    expect(String(check.params[7])).toMatch(/GIS_Report_2026-09/);
  });

  it("fails a source whose archive walk stored nothing usable", async () => {
    const { sql, calls } = executor();
    runQueueSource.mockImplementation(async (_sql: unknown, source: string) => (source === "ercot"
      ? backfilled([OLD_WORKBOOK, { ...OLD_WORKBOOK, label: "GIS_Report_2026-08" }, NEWEST_WORKBOOK], { stored: false })
      : ingested(source)));

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    const ercot = outcome.sources.find((source) => source.source === "ercot")!;
    expect(ercot.status).toBe("failed");
    expect(ercot.deferred).toHaveLength(3);
    expect(String(checks(calls).find((call) => call.params[0] === "ercot-gis-report")!.params[7]))
      .toMatch(/no usable artifact among 3 selected; deferred 3/);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("source_failed");
  });

  it("fails ERCOT and records it unreachable when its listing page cannot be fetched", async () => {
    const { sql, calls } = executor();
    const fetcher = vi.fn(async () => { throw new Error("fetch failed"); });
    runQueueSource.mockImplementation(async (database: unknown, source: string, options: unknown) => (
      source === "ercot" ? actualIngest.runQueueSource!(database, source, options) : ingested(source)));

    const outcome = await runScheduledQueueRefresh(sql, { fetcher, now: () => NOW });

    const ercot = outcome.sources.find((source) => source.source === "ercot")!;
    expect(ercot).toMatchObject({ status: "failed", reachable: false, deferred: [] });
    const check = checks(calls).find((call) => call.params[0] === "ercot-gis-report")!;
    expect(check.params.slice(1, 6)).toEqual([false, null, null, null, null]);
    expect(String(check.params[7])).toMatch(/failed during retrieval: .*fetch failed/);
    expect(check.params[6]).toBe("unavailable");
    expect(checks(calls)).toHaveLength(7);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("inputs_stale");
    expect(outcome.stale.map((row) => [row.marketSlug, row.condition])).toEqual([["ercot", "unreachable"]]);
  });

  it("contains a source runner that throws, and still checks every source", async () => {
    const { sql, calls } = executor();
    runQueueSource.mockImplementation(async (_sql: unknown, source: string) => {
      if (source === "pjm") throw new Error("unexpected");
      return ingested(source);
    });

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(checks(calls)).toHaveLength(7);
    expect(outcome.sources.find((source) => source.source === "pjm")).toMatchObject({
      status: "failed", reachable: false,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("inputs_stale");
    expect(outcome.stale.map((row) => [row.marketSlug, row.condition])).toEqual([["pjm", "unreachable"]]);
    expect(calls.at(-1)!.sql).toMatch(/pg_advisory_unlock/);
  });

  it("releases the lock when the analytics throw", async () => {
    const { sql, calls } = executor();
    runQueueAnalytics.mockRejectedValue(new Error("connection reset"));

    await expect(runScheduledQueueRefresh(sql, { now: () => NOW })).rejects.toThrow("connection reset");
    expect(calls.at(-1)!.sql).toMatch(/pg_advisory_unlock/);
  });

  it("releases the lock when recording a check throws", async () => {
    const { sql, calls } = executor();
    const original = sql.query.bind(sql);
    sql.query = (async (text: string, params?: unknown[]) => {
      if (text.includes("insert into pipeline.interconnection_source_checks")) {
        calls.push({ sql: text, params: params ?? [] });
        throw new Error("insert failed");
      }
      return original(text, params ?? []);
    }) as typeof sql.query;

    await expect(runScheduledQueueRefresh(sql, { now: () => NOW })).rejects.toThrow("insert failed");
    expect(runQueueAnalytics).not.toHaveBeenCalled();
    expect(calls.at(-1)!.sql).toMatch(/pg_advisory_unlock/);
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
    expect(outcome).toMatchObject({ ok: true, status: "skipped_locked", reason: null, analytics: null });
    expect(runQueueSource).not.toHaveBeenCalled();
    expect(runQueueAnalytics).not.toHaveBeenCalled();
    // Nothing is written: no check, no snapshot, and no unlock of a lock it never held.
    expect(calls.map((call) => call.sql)).toEqual([expect.stringMatching(/pg_try_advisory_lock/)]);
  });

  it("reports an analytics failure as a failure", async () => {
    const { sql } = executor();
    runQueueAnalytics.mockResolvedValue({ status: "failed", error: "Error: boom" });
    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("analytics_failed");
  });
});

describe("unchanged content is not an outage", () => {
  it("keeps the run green when PJM answered with an artifact identical to one stored weeks ago", async () => {
    // The production case: PJM's latest snapshot is from Sept 21, 376 hours against a 168 threshold.
    const { sql, calls } = executor({ pjm: 376 });

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(outcome).toMatchObject({ ok: true, status: "succeeded", reason: null, stale: [] });
    expect(runQueueAnalytics).toHaveBeenCalledTimes(1);
    expect(outcome.currentness.find((row) => row.marketSlug === "pjm")).toMatchObject({
      status: "current", condition: "content_unchanged", contentUnchangedWarning: true,
      contentAgeHours: 376, latestObservedAt: hoursAgo(376), lastSuccessfulCheckAt: NOW.toISOString(),
    });
    // The check it records says current: the source was reached, and the snapshot is not restamped.
    const check = checks(calls).find((call) => call.params[0] === "pjm-planning-queues")!;
    expect(check.params.slice(1, 7)).toEqual([true, 200, "a".repeat(64), null, "snap-pjm", "current"]);
    expect(calls.some((call) => /update pipeline\.interconnection_queue_snapshots/.test(call.sql))).toBe(false);
  });

  it("clears the warning when PJM's artifact has changed and a new snapshot was stored", async () => {
    const { sql } = executor({ pjm: 0 });
    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });
    expect(outcome.ok).toBe(true);
    expect(outcome.currentness.find((row) => row.marketSlug === "pjm"))
      .toMatchObject({ status: "current", condition: "current", contentUnchangedWarning: false });
  });

  it("still fails closed when PJM, with old content, cannot be reached", async () => {
    const { sql } = executor({ pjm: 376 });
    runQueueSource.mockImplementation(async (_sql: unknown, source: string) => (source === "pjm"
      ? { status: "failed", source, phase: "retrieval", error: "Error: fetch failed" }
      : ingested(source)));

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(runQueueAnalytics).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: "inputs_stale" });
    expect(outcome.stale).toEqual([expect.objectContaining({ marketSlug: "pjm", condition: "unreachable" })]);
  });

  it("does not let a fresh check hide a publisher timestamp that is too old", async () => {
    // CAISO answered and matched its snapshot this run, but the report it serves is 100 hours old.
    const { sql } = executor({ caiso: 1 }, { published: { caiso: 100 } });

    const outcome = await runScheduledQueueRefresh(sql, { now: () => NOW });

    expect(runQueueAnalytics).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: "inputs_stale" });
    expect(outcome.stale).toEqual([expect.objectContaining({
      marketSlug: "caiso", status: "stale", condition: "source_data_stale",
    })]);
  });
});

describe("an archive walk with a deferred artifact", () => {
  const refs = ["2026-07-01", "2026-08-01", "2026-09-01"].map((period) => ({
    label: `GIS_Report_${period.slice(0, 7)}`, url: `https://example.test/${period}.xlsx`, reportPeriod: period,
    publishedAt: `${period.slice(0, 8)}05T00:00:00Z`, isCorrection: false, nativeDocumentId: null,
    archiveMetadata: {},
  }));
  const fetcher = vi.fn(async (ref: { label: string }) => ({
    label: ref.label, status: 200, sha256: ref.label.padEnd(64, "0"), retrievedAt: NOW.toISOString(),
  }));

  function adapter(unparseable: string) {
    return {
      key: "ercot", marketSlug: "ercot",
      discover: async () => refs,
      parse: (artifacts: Map<string, unknown>) => {
        if (artifacts.has(unparseable)) throw new Error("no Project Details sheet");
        return { records: [], deferrals: [] };
      },
    } as unknown as QueueAdapter;
  }

  it("names the deferred period and keeps the older stored release as the evidence when the newest fails", async () => {
    const outcome = await runQueueArchive(null, adapter("GIS_Report_2026-09"), {
      fetcher: fetcher as never, dryRun: true,
    });
    expect(outcome).toMatchObject({
      status: "backfilled", artifactsSelected: 3, artifactsRetrieved: 3, artifactsParsed: 2,
      artifactsDeferred: [{ label: "GIS_Report_2026-09", reportPeriod: "2026-09-01",
        reason: "unparseable: no Project Details sheet" }],
      latestArtifact: { sourcePublishedAt: "2026-08-05T00:00:00Z" },
    });
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
