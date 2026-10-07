import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted with the vi.mock calls, which run before the imports below.
const { runScheduledQueueRefresh, createTokenSqlExecutor, end } = vi.hoisted(() => ({
  runScheduledQueueRefresh: vi.fn(),
  createTokenSqlExecutor: vi.fn(),
  end: vi.fn(async () => {}),
}));

vi.mock("@/lib/interconnection-queue/operations/scheduled-run", () => ({ runScheduledQueueRefresh }));
vi.mock("@/lib/tokens/read/database", () => ({ createTokenSqlExecutor }));

import { GET, cronRequestAuthorized, maxDuration } from "@/app/api/cron/interconnection-queue/route";
import type { ScheduledQueueRunOutcome } from "@/lib/interconnection-queue/operations/scheduled-run";

const SECRET = "a-long-enough-shared-secret";

function request(auth: string | null = `Bearer ${SECRET}`): Request {
  return new Request("https://urdais.com/api/cron/interconnection-queue", {
    headers: auth === null ? {} : { authorization: auth },
  });
}

const currentness = [{
  sourceInterfaceSlug: "pjm-planning-queues", expectedCadence: "continuous", staleAfterHours: 168,
  latestObservedAt: "2026-10-06T09:00:00Z", sourcePublishedAt: null, ageHours: 0.5,
  status: "current" as const, marketSlug: "pjm", publishable: true,
  condition: "current" as const, basis: "continuous" as const,
  lastCheckedAt: "2026-10-06T09:30:00Z", lastSuccessfulCheckAt: "2026-10-06T09:30:00Z",
  latestContentObservedAt: "2026-10-06T09:00:00Z", contentAgeHours: 0.5,
  contentUnchangedWarning: false, publicationAgeHours: null,
}];

function outcome(overrides: Partial<ScheduledQueueRunOutcome> = {}): ScheduledQueueRunOutcome {
  return {
    ok: true, status: "succeeded", reason: null, stale: [],
    sources: [{ source: "pjm", marketSlug: "pjm", sourceInterfaceSlug: "pjm-planning-queues",
      status: "ingested", reachable: true, snapshotId: "snap", currentness: "current", deferred: [],
      detail: "snapshot existing" }],
    currentness,
    analytics: { status: "calculated", runId: "run-1", run: "existing", methodologyVersion: "1.0.0",
      inputDigest: "d", resultsInserted: 0, liveResults: 0, blockedResults: 0, deferredResults: 0,
      statements: 1, calculateMs: 1, persistMs: 1 },
    elapsedMs: 10, ...overrides,
  };
}

function configured() {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("DATABASE_URL", "postgresql://example/db");
  createTokenSqlExecutor.mockResolvedValue({ query: vi.fn(), end });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("interconnection queue cron", () => {
  it("refuses a request without the cron secret", async () => {
    configured();
    expect((await GET(request(null))).status).toBe(401);
    expect((await GET(request("Bearer wrong-secret-value"))).status).toBe(401);
    expect(cronRequestAuthorized("Bearer anything", undefined)).toBe(false);
    expect(runScheduledQueueRefresh).not.toHaveBeenCalled();
  });

  it("answers 503 when no database is configured", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("URDAIS_DATABASE_URL", "");
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "no_database_configured" });
  });

  it("answers 200 with per-source currentness when everything ran", async () => {
    configured();
    runScheduledQueueRefresh.mockResolvedValue(outcome());
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.currentness).toEqual([expect.objectContaining({
      marketSlug: "pjm", status: "current", staleAfterHours: 168, latestObservedAt: "2026-10-06T09:00:00Z",
    })]);
    expect(body.analytics).toMatchObject({ runId: "run-1", methodologyVersion: "1.0.0" });
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("answers 200 for a reachable source whose content is unchanged, and reports the warning", async () => {
    configured();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    runScheduledQueueRefresh.mockResolvedValue(outcome({
      currentness: [{ ...currentness[0]!, condition: "content_unchanged", contentUnchangedWarning: true,
        latestObservedAt: "2026-09-21T20:59:34Z", latestContentObservedAt: "2026-09-21T20:59:34Z",
        ageHours: 376, contentAgeHours: 376 }],
    }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.currentness).toEqual([expect.objectContaining({
      marketSlug: "pjm", status: "current", condition: "content_unchanged", contentUnchangedWarning: true,
      contentAgeHours: 376, lastSuccessfulCheckAt: "2026-10-06T09:30:00Z", basis: "continuous",
    })]);
    expect(String(log.mock.calls.at(-1)?.[0])).toMatch(/content unchanged: pjm 376h/);
  });

  it("answers 500 and names the stale markets when the gate holds the analytics back", async () => {
    configured();
    runScheduledQueueRefresh.mockResolvedValue(outcome({
      ok: false, status: "failed", reason: "inputs_stale", analytics: null,
      stale: [{ marketSlug: "caiso", status: "stale", condition: "source_data_stale", latestObservedAt: "2026-09-21T00:00:00Z",
        ageHours: 360, staleAfterHours: 72 }],
    }));
    const response = await GET(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.reason).toBe("inputs_stale");
    expect(body.stale[0].marketSlug).toBe("caiso");
    expect(body.analytics).toBeNull();
  });

  it("answers 500 when a source failed, even if the analytics ran", async () => {
    configured();
    runScheduledQueueRefresh.mockResolvedValue(outcome({ ok: false, status: "failed", reason: "source_failed" }));
    expect((await GET(request())).status).toBe(500);
  });

  it("answers 200 when a source ingested with a deferred archive artifact, and lists it", async () => {
    configured();
    const deferred = [{ artifact: "GIS_Report_2023-01", reportPeriod: "2023-01",
      reason: "unparseable: Error: missing sheet" }];
    runScheduledQueueRefresh.mockResolvedValue(outcome({
      sources: [{ source: "ercot", marketSlug: "ercot", sourceInterfaceSlug: "ercot-gis-report",
        status: "ingested_with_deferrals", reachable: true, snapshotId: "snap", currentness: "current",
        deferred, detail: "0 snapshot(s) created, 2 existing; deferred 1: GIS_Report_2023-01 (2023-01): unparseable" }],
    }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.sources[0]).toMatchObject({ status: "ingested_with_deferrals", deferred });
  });

  it("answers 500 for stale inputs even when the only source news is a deferral", async () => {
    configured();
    runScheduledQueueRefresh.mockResolvedValue(outcome({
      ok: false, status: "failed", reason: "inputs_stale", analytics: null,
      stale: [{ marketSlug: "ercot", status: "stale", condition: "source_data_stale", latestObservedAt: "2026-08-01T00:00:00Z",
        ageHours: 1600, staleAfterHours: 1128 }],
    }));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect((await response.json()).reason).toBe("inputs_stale");
  });

  it("answers 200 and names the status when another run holds the lock", async () => {
    configured();
    runScheduledQueueRefresh.mockResolvedValue({
      ok: true, status: "skipped_locked", reason: null, stale: [], sources: [], currentness: [],
      analytics: null, elapsedMs: 1,
    } satisfies ScheduledQueueRunOutcome);
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: "skipped_locked", sources: [], analytics: null });
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when the runner throws, and still releases the connection", async () => {
    configured();
    runScheduledQueueRefresh.mockRejectedValue(new Error("connection reset"));
    expect((await GET(request())).status).toBe(500);
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe("the cron's runtime and schedule", () => {
  it("allows five minutes for seven sequential sources", () => {
    expect(maxDuration).toBe(300);
  });

  it("stays on its once-daily slot", () => {
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../../vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const cron = vercel.crons.find((entry) => entry.path === "/api/cron/interconnection-queue");
    expect(cron?.schedule).toBe("30 9 * * *");
  });
});
