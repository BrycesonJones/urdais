import { describe, expect, it, vi } from "vitest";

import { cronRequestAuthorized } from "@/app/api/cron/ubwi/route";

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
    // An unconfigured deployment must have no publication trigger at all, not a public
    // one. Every one of these would be an open endpoint if it passed.
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, "")).toBe(false);
    expect(cronRequestAuthorized("Bearer ", "")).toBe(false);
    expect(cronRequestAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});

describe("the scheduled publication route", () => {
  it("refuses an unauthenticated request before it reaches the database", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://never.used.invalid/db");
    const connect = vi.fn();
    vi.doMock("@/lib/tokens/read/database", () => ({ createTokenSqlExecutor: connect }));

    const { GET } = await import("@/app/api/cron/ubwi/route");
    const response = await GET(new Request("https://urdais.com/api/cron/ubwi"));

    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/tokens/read/database");
  });

  it("answers 503 without publishing when no database is configured", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("URDAIS_DATABASE_URL", "");
    const run = vi.fn();
    vi.doMock("@/lib/ubwi/run", () => ({ runDailyUbwiPublication: run, ubwiRunSummary: () => ({}) }));

    const { GET } = await import("@/app/api/cron/ubwi/route");
    const response = await GET(
      new Request("https://urdais.com/api/cron/ubwi", { headers: { authorization: `Bearer ${SECRET}` } }),
    );

    expect(response.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/ubwi/run");
  });

  it("runs the shared pipeline and cannot be told to publish anything else", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://stub/db");
    const end = vi.fn();
    const run = vi.fn().mockResolvedValue({
      outcome: "published",
      observationDate: "2026-09-16",
      calculatedAt: "2026-09-16T06:00:00.000Z",
      valuePercent: 0.2702,
      methodologyVersion: "1.2.0",
      residualModelVersion: "1.0.0",
      publicationId: "pub-2",
      calculationId: "calc-2",
      gateFailures: [],
      priceAgeSeconds: 300,
      detail: "published and frozen pub-2 for 2026-09-16",
    });
    vi.doMock("@/lib/tokens/read/database", () => ({
      createTokenSqlExecutor: vi.fn().mockResolvedValue({ end }),
    }));
    vi.doMock("@/lib/ubwi/run", async () => {
      const actual = await vi.importActual<typeof import("@/lib/ubwi/run")>("@/lib/ubwi/run");
      return { ...actual, runDailyUbwiPublication: run };
    });

    const { GET } = await import("@/app/api/cron/ubwi/route");
    // Query parameters a caller might hope would change the published point.
    const response = await GET(
      new Request(
        "https://urdais.com/api/cron/ubwi?date=2026-01-01&value=99&force=true&observationDate=2020-01-01",
        { headers: { authorization: `Bearer ${SECRET}` } },
      ),
    );

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
    // The executor, and an options object holding only the server's own instant. No date,
    // no value, nothing the request could have supplied.
    const [, options] = run.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(Object.keys(options)).toEqual(["now"]);
    expect(typeof options.now).toBe("string");
    expect(options.now).not.toContain("2020");
    expect(end).toHaveBeenCalled();

    const body = (await response.json()) as { ok: boolean; outcome: string; observationDate: string };
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe("published");
    expect(body.observationDate).toBe("2026-09-16");
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/tokens/read/database");
    vi.doUnmock("@/lib/ubwi/run");
  });

  it("reports a gate refusal as a completed run, not an outage", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://stub/db");
    vi.doMock("@/lib/tokens/read/database", () => ({
      createTokenSqlExecutor: vi.fn().mockResolvedValue({ end: vi.fn() }),
    }));
    vi.doMock("@/lib/ubwi/run", async () => {
      const actual = await vi.importActual<typeof import("@/lib/ubwi/run")>("@/lib/ubwi/run");
      return {
        ...actual,
        runDailyUbwiPublication: vi.fn().mockResolvedValue({
          outcome: "gate_refused",
          observationDate: "2026-09-18",
          calculatedAt: "2026-09-18T06:00:00.000Z",
          valuePercent: 0.2671,
          methodologyVersion: "1.2.0",
          residualModelVersion: "1.0.0",
          publicationId: null,
          calculationId: "calc-9",
          gateFailures: ["COVERAGE_BELOW_FLOOR"],
          priceAgeSeconds: 300,
          detail: "the publication gate refused this calculation",
        }),
      };
    });

    const { GET } = await import("@/app/api/cron/ubwi/route");
    const response = await GET(
      new Request("https://urdais.com/api/cron/ubwi", { headers: { authorization: `Bearer ${SECRET}` } }),
    );

    // A refusal is the gate working. Answering 500 would make the scheduler retry
    // something that must not change, and would page an operator over correct behaviour.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { outcome: string; publicationId: string | null };
    expect(body.outcome).toBe("gate_refused");
    expect(body.publicationId).toBeNull();
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/tokens/read/database");
    vi.doUnmock("@/lib/ubwi/run");
  });

  it("reports an unexpected failure as a failure", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://stub/db");
    vi.doMock("@/lib/tokens/read/database", () => ({
      createTokenSqlExecutor: vi.fn().mockResolvedValue({ end: vi.fn() }),
    }));
    vi.doMock("@/lib/ubwi/run", async () => {
      const actual = await vi.importActual<typeof import("@/lib/ubwi/run")>("@/lib/ubwi/run");
      return {
        ...actual,
        runDailyUbwiPublication: vi.fn().mockRejectedValue(new Error("connection terminated")),
      };
    });

    const { GET } = await import("@/app/api/cron/ubwi/route");
    const response = await GET(
      new Request("https://urdais.com/api/cron/ubwi", { headers: { authorization: `Bearer ${SECRET}` } }),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("run_failed");
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/tokens/read/database");
    vi.doUnmock("@/lib/ubwi/run");
  });
});

/**
 * The route is the production publication path, so what it *cannot* do matters as much as
 * what it does. It cannot supply an observation, which is what makes every scheduled run a
 * live retrieval rather than a recalculation of a committed constant.
 */
describe("the scheduled route retrieves its numerator", () => {
  it("passes no calculation and no numerator, leaving the run to retrieve one", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@example.invalid/db");
    const run = vi.fn(async () => ({
      outcome: "published",
      observationDate: "2026-09-16",
      valuePercent: 0.2671,
      publicationId: "pub-1",
      detail: "published",
    }));
    vi.doMock("@/lib/ubwi/run", () => ({
      runDailyUbwiPublication: run,
      ubwiRunSummary: (r: { outcome: string }) => ({ outcome: r.outcome }),
    }));
    vi.doMock("@/lib/tokens/read/database", () => ({
      createTokenSqlExecutor: async () => ({ query: async () => ({ rows: [] }), end: async () => {} }),
    }));

    const { GET } = await import("@/app/api/cron/ubwi/route");
    const response = await GET(
      new Request("https://urdais.com/api/cron/ubwi", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
    const [, options] = run.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    // No `calculation` and no `retrieveNumerator` override: the run falls through to the
    // live provider. A route that supplied either could publish something it was handed.
    expect(options.calculation).toBeUndefined();
    expect(options.retrieveNumerator).toBeUndefined();
    expect(Object.keys(options)).toEqual(["now"]);

    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/ubwi/run");
    vi.doUnmock("@/lib/tokens/read/database");
  });

  it("answers 200 for a fail-closed retrieval skip, not 500", async () => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://user:pw@example.invalid/db");
    vi.doMock("@/lib/ubwi/run", () => ({
      runDailyUbwiPublication: async () => ({
        outcome: "retrieval_failed",
        retrievalProblem: "RPC_UNAVAILABLE",
        valuePercent: null,
        detail: "nothing was written",
      }),
      ubwiRunSummary: (r: { outcome: string; retrievalProblem: string }) => ({
        outcome: r.outcome,
        retrievalProblem: r.retrievalProblem,
      }),
    }));
    vi.doMock("@/lib/tokens/read/database", () => ({
      createTokenSqlExecutor: async () => ({ query: async () => ({ rows: [] }), end: async () => {} }),
    }));

    const { GET } = await import("@/app/api/cron/ubwi/route");
    const response = await GET(
      new Request("https://urdais.com/api/cron/ubwi", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    // A source that could not be read is the pipeline working, not an outage. A 500 here
    // would tell a scheduler to retry something that must not be retried into a duplicate.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; outcome: string };
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe("retrieval_failed");

    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/ubwi/run");
    vi.doUnmock("@/lib/tokens/read/database");
  });
});
