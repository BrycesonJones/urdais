import { describe, expect, it, vi } from "vitest";

import { cronRequestAuthorized } from "@/app/api/cron/news/route";

const SECRET = "a-random-cron-secret-value";

describe("cron authentication", () => {
  it("accepts exactly the bearer token Vercel sends", () => {
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a missing, malformed or wrong credential", () => {
    expect(cronRequestAuthorized(null, SECRET)).toBe(false);
    expect(cronRequestAuthorized("", SECRET)).toBe(false);
    expect(cronRequestAuthorized(SECRET, SECRET)).toBe(false);
    expect(cronRequestAuthorized(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
    expect(cronRequestAuthorized("Bearer ", SECRET)).toBe(false);
  });

  it("fails closed when the deployment has no secret configured", () => {
    // An unconfigured deployment must have no ingestion trigger at all, not a
    // public one. Every one of these would be an open endpoint if it passed.
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, "")).toBe(false);
    expect(cronRequestAuthorized("Bearer ", "")).toBe(false);
    expect(cronRequestAuthorized("Bearer undefined", undefined)).toBe(false);
  });

  it("does not treat a secret with surrounding whitespace as a different secret", () => {
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, `  ${SECRET}  `)).toBe(true);
  });
});

describe("the scheduled route", () => {
  it("refuses an unauthenticated request before it reaches the database", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://never.used.invalid/db");
    const connect = vi.fn();
    vi.doMock("@/lib/tokens/read/database", () => ({ createTokenSqlExecutor: connect }));

    const { GET } = await import("@/app/api/cron/news/route");
    const response = await GET(new Request("https://urdais.com/api/cron/news"));

    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/tokens/read/database");
  });

  it("answers 503 without ingesting when no database is configured", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("URDAIS_DATABASE_URL", "");
    const run = vi.fn();
    vi.doMock("@/lib/news/run", () => ({ runProductionNewsIngestion: run, productionRunSummary: () => ({}) }));

    const { GET } = await import("@/app/api/cron/news/route");
    const response = await GET(
      new Request("https://urdais.com/api/cron/news", { headers: { authorization: `Bearer ${SECRET}` } }),
    );

    expect(response.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/news/run");
  });

  it("runs the shared production pipeline and cannot be told to run anything else", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://stub/db");
    const end = vi.fn();
    const run = vi.fn().mockResolvedValue({
      startedAt: "2026-09-15T00:00:00.000Z",
      finishedAt: "2026-09-15T00:00:04.000Z",
      durationMs: 4000,
      sourcesAttempted: 8,
      sourcesSucceeded: 8,
      sourcesFailed: 0,
      retrievalsInserted: 8,
      articlesInserted: 3,
      run: { startedAt: "2026-09-15T00:00:00.000Z", outcomes: [], articlesInserted: 3, sourcesSucceeded: 8, sourcesFailed: 0 },
    });
    vi.doMock("@/lib/tokens/read/database", () => ({ createTokenSqlExecutor: vi.fn().mockResolvedValue({ end }) }));
    vi.doMock("@/lib/news/run", async () => {
      const actual = await vi.importActual<typeof import("@/lib/news/run")>("@/lib/news/run");
      return { ...actual, runProductionNewsIngestion: run };
    });

    const { GET } = await import("@/app/api/cron/news/route");
    // Query parameters a caller might hope would widen the run.
    const response = await GET(
      new Request("https://urdais.com/api/cron/news?mode=research&source=nvidia-newsroom&write=false", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    expect(response.status).toBe(200);
    // Called with the executor and nothing else: no mode, no source list, no
    // option the request could have supplied.
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]).toHaveLength(1);
    expect(end).toHaveBeenCalled();
    const body = (await response.json()) as { ok: boolean; articlesInserted: number; sourcesAttempted: number };
    expect(body.ok).toBe(true);
    expect(body.articlesInserted).toBe(3);
    expect(body.sourcesAttempted).toBe(8);
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/tokens/read/database");
    vi.doUnmock("@/lib/news/run");
  });

  it("reports a run in which every source failed as a failure", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://stub/db");
    vi.doMock("@/lib/tokens/read/database", () => ({
      createTokenSqlExecutor: vi.fn().mockResolvedValue({ end: vi.fn() }),
    }));
    vi.doMock("@/lib/news/run", async () => {
      const actual = await vi.importActual<typeof import("@/lib/news/run")>("@/lib/news/run");
      return {
        ...actual,
        runProductionNewsIngestion: vi.fn().mockResolvedValue({
          startedAt: "2026-09-15T00:00:00.000Z",
          finishedAt: "2026-09-15T00:00:01.000Z",
          durationMs: 1000,
          sourcesAttempted: 8,
          sourcesSucceeded: 0,
          sourcesFailed: 8,
          retrievalsInserted: 0,
          articlesInserted: 0,
          run: { startedAt: "2026-09-15T00:00:00.000Z", outcomes: [], articlesInserted: 0, sourcesSucceeded: 0, sourcesFailed: 8 },
        }),
      };
    });

    const { GET } = await import("@/app/api/cron/news/route");
    const response = await GET(
      new Request("https://urdais.com/api/cron/news", { headers: { authorization: `Bearer ${SECRET}` } }),
    );
    expect(response.status).toBe(500);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(false);
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/tokens/read/database");
    vi.doUnmock("@/lib/news/run");
  });
});
