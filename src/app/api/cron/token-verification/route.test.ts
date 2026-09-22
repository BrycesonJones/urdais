import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted with the vi.mock calls, which run before the imports below.
const { loadPersistedBenchmarks, loadVerificationEvents, createTokenSqlExecutor, end } = vi.hoisted(() => ({
  loadPersistedBenchmarks: vi.fn(),
  loadVerificationEvents: vi.fn(),
  createTokenSqlExecutor: vi.fn(),
  end: vi.fn(async () => {}),
}));

vi.mock("@/lib/tokens/read/benchmark-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tokens/read/benchmark-store")>();
  return { ...actual, loadPersistedBenchmarks };
});
vi.mock("@/lib/tokens/read/verification-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tokens/read/verification-events")>();
  return { ...actual, loadVerificationEvents };
});
vi.mock("@/lib/tokens/read/database", () => ({ createTokenSqlExecutor }));

import { GET, cronRequestAuthorized } from "@/app/api/cron/token-verification/route";
import { WAVE1_PROVIDERS } from "@/lib/tokens/types";
import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import type { TokenVerificationEvent } from "@/lib/tokens/read/verification-events";

const SECRET = "a-long-enough-shared-secret";

function request(auth: string | null = `Bearer ${SECRET}`): Request {
  return new Request("https://urdais.com/api/cron/token-verification", {
    headers: auth === null ? {} : { authorization: auth },
  });
}

function frozen(provider: string, calculatedAt: string): PersistedBenchmarkRow {
  return {
    id: `${provider}-1`,
    providerSlug: provider,
    methodologyVersion: "1.2",
    benchmarkModelId: "model",
    benchmarkModelName: "Model",
    calculationStatus: "value",
    withheldReason: null,
    priceUsdPer1m: 30,
    inputObservationId: "in",
    outputObservationId: "out",
    inputPriceUsdPer1m: 10,
    outputPriceUsdPer1m: 50,
    inputObservedAt: calculatedAt,
    outputObservedAt: calculatedAt,
    calculatedAt,
  };
}

/** The attestation the operator command writes beside each frozen row. */
function attested(rows: PersistedBenchmarkRow[], verifiedAt: string): TokenVerificationEvent[] {
  return rows.map((row) => ({
    id: `verified-${row.id}`,
    providerSlug: row.providerSlug,
    verifiedBy: "Bryceson",
    verifiedAt,
    evidence: "read the first-party pricing surface",
    observedState: row.calculationStatus,
    benchmarkId: row.id,
    verificationPurpose: "production" as const,
  }));
}

/**
 * Both halves of what the watchdog reads. Events default to one attestation per
 * frozen row at the row's own instant, which is the shape a verification run
 * leaves behind; a caller that wants them to diverge passes its own.
 */
function serveRows(rows: PersistedBenchmarkRow[], events?: TokenVerificationEvent[]) {
  createTokenSqlExecutor.mockResolvedValue({ query: vi.fn(), end });
  loadPersistedBenchmarks.mockResolvedValue(rows);
  loadVerificationEvents.mockResolvedValue(events ?? rows.map((row) => attested([row], row.calculatedAt)[0]!));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("the trigger is closed", () => {
  it("accepts the project's own bearer secret", () => {
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("fails closed when no secret is configured", () => {
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, "   ")).toBe(false);
  });

  it("rejects a missing, malformed, wrong or differently sized credential", () => {
    expect(cronRequestAuthorized(null, SECRET)).toBe(false);
    expect(cronRequestAuthorized(SECRET, SECRET)).toBe(false);
    expect(cronRequestAuthorized(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(cronRequestAuthorized("Bearer wrong-secret-same-len", SECRET)).toBe(false);
    expect(() => cronRequestAuthorized("Bearer short", SECRET)).not.toThrow();
    expect(cronRequestAuthorized("Bearer short", SECRET)).toBe(false);
  });

  it("answers 401 to an unauthorized invocation and never opens the database", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://example/db");
    const response = await GET(request("Bearer nope-wrong-length-here"));
    expect(response.status).toBe(401);
    expect(createTokenSqlExecutor).not.toHaveBeenCalled();
  });
});

describe("the run reports what it read", () => {
  it("reports every provider current on freshly verified rows", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://example/db");
    vi.setSystemTime(new Date("2026-09-16T07:00:00Z"));
    serveRows(WAVE1_PROVIDERS.map((p) => frozen(p, "2026-09-14T12:03:02.002Z")));

    const response = await GET(request());
    const body = (await response.json()) as { ok: boolean; providers: { provider: string; ageDays: number }[] };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.providers).toHaveLength(WAVE1_PROVIDERS.length);
    expect(body.providers.every((p) => p.ageDays === 1)).toBe(true);
    vi.useRealTimers();
  });

  it("answers 200 with ok:false when a review is due, because that wants a person and not a pager", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://example/db");
    vi.setSystemTime(new Date("2026-09-30T07:00:00Z"));
    serveRows(WAVE1_PROVIDERS.map((p) => frozen(p, "2026-09-14T12:03:02.002Z")));

    const response = await GET(request());
    const body = (await response.json()) as { ok: boolean; reviewDue: string[] };
    // A due review is a finding about Urdais's own discipline, not a broken job.
    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.reviewDue).toEqual([...WAVE1_PROVIDERS]);
    vi.useRealTimers();
  });

  it("reports a review as due from the age of the attestation, not the calculation", async () => {
    // The bug, at the route: on 22 September a person had re-read every page that
    // morning, and the newest frozen calculation was still 14 September because no
    // price had moved. The watchdog paged for a review that had just happened.
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://example/db");
    vi.setSystemTime(new Date("2026-09-22T07:00:00Z"));
    const rows = WAVE1_PROVIDERS.map((p) => frozen(p, "2026-09-14T12:03:02.002Z"));
    serveRows(rows, attested(rows, "2026-09-22T06:00:00Z"));

    const response = await GET(request());
    const body = (await response.json()) as { ok: boolean; reviewDue: string[]; providers: { ageDays: number }[] };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.reviewDue).toEqual([]);
    expect(body.providers.every((p) => p.ageDays === 0)).toBe(true);
    vi.useRealTimers();
  });

  it("refuses to call a provider current on an attestation with nothing frozen behind it", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://example/db");
    vi.setSystemTime(new Date("2026-09-22T07:00:00Z"));
    const rows = WAVE1_PROVIDERS.map((p) => frozen(p, "2026-09-14T12:03:02.002Z"));
    serveRows([], attested(rows, "2026-09-22T06:00:00Z"));

    const response = await GET(request());
    const body = (await response.json()) as { ok: boolean; neverVerified: string[] };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.neverVerified).toEqual([...WAVE1_PROVIDERS]);
    vi.useRealTimers();
  });

  it("closes the connection it opened, on both paths", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://example/db");
    serveRows([]);
    await GET(request());
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe("a systemic failure is visible as a failure", () => {
  it("answers 503 with no DATABASE_URL rather than reporting a healthy check", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("URDAIS_DATABASE_URL", "");
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "no_database_configured" });
  });

  it("answers 500 when the store cannot be read, never 200 with an empty report", async () => {
    // The failure that would otherwise look exactly like "nobody has verified anything".
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://example/db");
    createTokenSqlExecutor.mockResolvedValue({ query: vi.fn(), end });
    loadVerificationEvents.mockResolvedValue([]);
    loadPersistedBenchmarks.mockRejectedValue(new Error("connection terminated"));

    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, reason: "check_failed" });
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("does not put the connection string in the response on a failure", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATABASE_URL", "postgresql://user:hunter2@host/db");
    createTokenSqlExecutor.mockResolvedValue({ query: vi.fn(), end });
    loadVerificationEvents.mockResolvedValue([]);
    loadPersistedBenchmarks.mockRejectedValue(new Error("connection terminated"));
    const text = await (await GET(request())).text();
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("postgresql://");
  });
});

describe("the schedule is configured, which is what was missing", () => {
  const vercel = JSON.parse(
    readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
  ) as { crons: { path: string; schedule: string }[] };

  it("registers this route with the production scheduler", () => {
    // Fix 1 and Fix 2 were code faults; this one was a job that was never scheduled. A test
    // that reads the deployment config is the only kind that would have caught it.
    const entry = vercel.crons.find((c) => c.path === "/api/cron/token-verification");
    expect(entry).toBeDefined();
    expect(entry!.schedule).toBe("0 7 * * *");
  });

  it("does not collide with the existing daily jobs", () => {
    const schedules = vercel.crons.map((c) => c.schedule);
    expect(new Set(schedules).size).toBe(schedules.length);
  });

  it("registers no token collection job, because no source permits one", () => {
    // The guard against a future reader "finishing the job" by adding the cron this
    // investigation found is forbidden. Every Wave-1 token source is research_usable and
    // under_review; docs/methodology/token-price.md leaves scheduled retrieval open.
    expect(vercel.crons.some((c) => c.path === "/api/cron/tokens")).toBe(false);
  });
});
