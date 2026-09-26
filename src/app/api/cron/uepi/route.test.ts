/**
 * The scheduled UEPI endpoint.
 *
 * Two properties matter more than the rest. It must be unreachable without the secret, including
 * when the secret is not configured at all. And its HTTP status must describe the *run*, while
 * the freshness verdict it carries describes the *product* -- so that a green run over a frozen
 * market is visibly exactly that, and not a 200 that means nothing is wrong.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ended = vi.fn();
const queries: { text: string; params: readonly unknown[] }[] = [];
let released: string[] = [];
let latestOperatingDate: Record<string, string> = {};
let sourceFailures: string[] = [];

vi.mock("@/lib/tokens/read/database", () => ({
  createTokenSqlExecutor: async () => ({
    query: async (text: string, params: readonly unknown[]) => {
      queries.push({ text, params });
      if (text.includes("max(d.operating_date)")) {
        return { rows: Object.entries(latestOperatingDate).map(([slug, latest]) => ({ slug, latest })) };
      }
      return { rows: [] };
    },
    end: ended,
  }),
}));

// The pipeline itself is exercised by its own suite; the route is tested against a seam so
// these cases stay about authorisation, status codes and the run/freshness split.
vi.mock("@/lib/uepi/backfill", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/uepi/backfill")>();
  return {
    ...actual,
    backfill: async (options: import("@/lib/uepi/backfill").BackfillOptions) => {
      const failed = sourceFailures.includes(options.seriesId);
      const advance = released.includes(options.seriesId);
      const outcome = {
        operatingDate: options.to,
        status: failed ? ("failed" as const) : advance ? ("released" as const) : ("skipped" as const),
        valueUsdPerMwh: advance ? "36.400000" : null,
        observationCount: advance ? 24 : null,
        expectedObservationCount: 24,
        reason: failed ? ("SOURCE_UNAVAILABLE" as const) : null,
        detail: null,
        warnings: [],
        wrote: null,
      };
      return {
        seriesId: options.seriesId, from: options.from, to: options.to, dryRun: false,
        startedAt: "2026-09-26T10:45:00.000Z", completedAt: "2026-09-26T10:45:30.000Z",
        requested: 1,
        released: advance ? 1 : 0, withheld: 0, failed: failed ? 1 : 0, skipped: advance || failed ? 0 : 1,
        days: [outcome],
      };
    },
  };
});

const ORIGINAL = { secret: process.env.CRON_SECRET, url: process.env.DATABASE_URL };

beforeEach(() => {
  queries.length = 0;
  ended.mockClear();
  released = [];
  sourceFailures = [];
  latestOperatingDate = {};
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.DATABASE_URL = "postgres://fake/urdais";
});

afterEach(() => {
  if (ORIGINAL.secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = ORIGINAL.secret;
  if (ORIGINAL.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = ORIGINAL.url;
  vi.resetModules();
});

async function get(authorization: string | null = "Bearer test-cron-secret") {
  const { GET } = await import("@/app/api/cron/uepi/route");
  return GET(new Request("https://urdais.test/api/cron/uepi", {
    headers: authorization === null ? {} : { authorization },
  }));
}

describe("authorisation", () => {
  it("runs for the configured secret", async () => {
    expect((await get()).status).toBe(200);
  });

  it("refuses a missing, wrong or malformed authorization header", async () => {
    for (const header of [null, "Bearer wrong", "test-cron-secret", "Basic test-cron-secret", "Bearer "]) {
      expect((await get(header)).status, String(header)).toBe(401);
    }
  });

  it("fails closed when no secret is configured, rather than running unauthenticated", async () => {
    delete process.env.CRON_SECRET;
    expect((await get()).status).toBe(401);
    expect((await get(null)).status).toBe(401);
  });

  it("performs no work at all when unauthorised", async () => {
    await get("Bearer wrong");
    expect(queries).toHaveLength(0);
    expect(ended).not.toHaveBeenCalled();
  });
});

describe("configuration", () => {
  it("answers 503 rather than 500 when no database is configured", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.URDAIS_DATABASE_URL;
    const response = await get();
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe("no_database_configured");
  });
});

describe("the status code describes the run", () => {
  it("200 when every market completed, including when none had anything new", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("succeeded");
    expect(body.released).toBe(0);
  });

  it("207 when some markets errored and others advanced", async () => {
    released = ["uepi-ercot", "uepi-caiso"];
    sourceFailures = ["uepi-spp"];
    const response = await get();
    expect(response.status).toBe(207);
    expect((await response.json()).outcome).toBe("partial");
  });

  it("502 when every market errored", async () => {
    sourceFailures = ["uepi-ercot", "uepi-caiso", "uepi-nyiso", "uepi-miso", "uepi-spp", "uepi-iso-ne"];
    expect((await get()).status).toBe(502);
  });
});

describe("the run and the freshness verdict are separate answers", () => {
  it("returns 200 for a clean run while reporting a market as failing", async () => {
    // The acceptance case. Nothing new anywhere, so the run is a success; ERCOT's head is
    // weeks old, so freshness says so. An operator watching only the status code would see
    // a green morning over a frozen product.
    latestOperatingDate = {
      "uepi-ercot": "2026-08-01",
      "uepi-caiso": new Date().toISOString().slice(0, 10),
    };
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("succeeded");
    expect(body.freshness.worstStatus).not.toBe("current");
    const ercot = body.freshness.series.find((s: { seriesId: string }) => s.seriesId === "uepi-ercot");
    expect(ercot.status).toBe("fail");
  });

  it("evaluates freshness from the released head, not from what the run just did", async () => {
    released = ["uepi-ercot"];
    latestOperatingDate = { "uepi-ercot": "2026-08-01" };
    const body = await (await get()).json();
    // The run advanced ERCOT, and freshness still reports the stored head it read back.
    expect(body.markets.find((m: { seriesId: string }) => m.seriesId === "uepi-ercot").status).toBe("advanced");
    expect(body.freshness.series.find((s: { seriesId: string }) => s.seriesId === "uepi-ercot").latestOperatingDate)
      .toBe("2026-08-01");
  });

  it("carries every series' verdict, not one aggregate", async () => {
    const body = await (await get()).json();
    expect(body.freshness.series).toHaveLength(7);
    expect(body.freshness.thresholds).toBeDefined();
  });
});

describe("the run ledger", () => {
  it("records the run, including a run in which nothing happened", async () => {
    await get();
    const insert = queries.find((query) => query.text.includes("insert into pipeline.uepi_ingestion_runs"));
    expect(insert).toBeDefined();
    expect(insert!.params[0]).toBe("scheduled");
    expect(insert!.params[5]).toBe("succeeded");
  });

  it("carries the per-market breakdown and the freshness verdict into the ledger row", async () => {
    released = ["uepi-ercot"];
    await get();
    const insert = queries.find((query) => query.text.includes("insert into pipeline.uepi_ingestion_runs"))!;
    const detail = JSON.parse(String(insert.params[12]));
    expect(detail.markets).toHaveLength(6);
    expect(detail.markets.find((m: { seriesId: string }) => m.seriesId === "uepi-ercot").status).toBe("advanced");
    expect(detail.freshness.series).toHaveLength(7);
  });

  it("closes the connection", async () => {
    await get();
    expect(ended).toHaveBeenCalledTimes(1);
  });
});
