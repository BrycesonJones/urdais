/**
 * How much of a shared connection budget one warm process may claim.
 *
 * `./shared-pool.test.ts` holds the *lifecycle* contract shut -- no borrower
 * may close the pool it shares. This file holds the *capacity* contract shut,
 * which is the second way the same blank page happened.
 *
 * Supabase's session pooler allots roughly fifteen clients to a role/database
 * pair. The serverless read path opened `pg.Pool({ max: 4 })` per instance, so
 * four concurrent warm Vercel instances could take the whole budget between
 * them. Past that, Supavisor answers `(EMAXCONNSESSION) max clients reached in
 * session mode - max clients are limited to pool_size: 15` and every
 * production-backed read fails at once over a database that is entirely
 * healthy -- UBWI gone from the Urdais Indices panel, all three News rails
 * "unavailable right now", `/api/tokens/prices` answering `{"benchmarks":[]}`.
 * It heals two or three minutes after the load stops, so there is nothing left
 * to find afterwards.
 *
 * Reproducing that needs concurrency, and concurrency is exactly what must
 * never be aimed at production: a fifty-request smoke test is what took the
 * site down for three minutes in the first place. So the pooler is a fake here.
 * It is faithful to the two behaviours under test -- it enforces `max` with a
 * waiter queue, and it refuses past a server-side ceiling with the real
 * Supavisor message -- and it records the peak, which is the number the whole
 * change is about.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SERVERLESS_POOL_MAX } from "@/lib/db/connection";

/** Every pool built during a test, in construction order. */
const pools: FakePool[] = [];

/** Connections checked out across every pool in the process, and the high-water mark. */
let live = 0;
let peakLive = 0;

/** How many connections the fake server will hand out before refusing. */
let serverCeiling = Number.POSITIVE_INFINITY;

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * A `pg.Pool` faithful to the behaviours this file tests: it never exceeds
 * `max` checked-out connections, it queues callers past that, and the server
 * behind it refuses past `serverCeiling` the way Supavisor does.
 */
class FakePool {
  readonly max: number;
  private inUse = 0;
  private readonly waiting: Array<() => void> = [];
  ending = false;
  queries: string[] = [];

  constructor(public readonly config: { connectionString: string; max?: number; idleTimeoutMillis?: number }) {
    this.max = config.max ?? 10;
    pools.push(this);
  }

  private async acquire(): Promise<void> {
    if (this.inUse >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.inUse += 1;
    live += 1;
    if (live > peakLive) peakLive = live;
    if (live > serverCeiling) {
      // Supavisor's wording, verbatim, so the classifier is tested against the
      // string production actually produces.
      this.release();
      throw Object.assign(
        new Error("max clients reached in session mode - max clients are limited to pool_size: 15"),
        { code: "XX000" },
      );
    }
  }

  private release(): void {
    this.inUse -= 1;
    live -= 1;
    this.waiting.shift()?.();
  }

  async query(text: string) {
    if (this.ending) throw new Error("Cannot use a pool after calling end on the pool");
    await this.acquire();
    try {
      // A real round trip is not instantaneous, and a query that resolved
      // synchronously would never overlap another -- which would make the peak
      // this file measures meaningless.
      await nextTick();
      this.queries.push(text);
      if (/ubwi_publications/i.test(text)) {
        return {
          rows: [
            {
              published_at: "2026-09-15T04:33:47.738Z",
              frozen_at: "2026-09-15T04:33:47.738Z",
              superseded_by_id: null,
              published_value_percent: "0.26716309468662236",
              methodology_version: "1.2.0",
              residual_model_version: "1.0.0",
            },
          ],
        };
      }
      return { rows: [] };
    } finally {
      this.release();
    }
  }

  events: string[] = [];

  on(event: string) {
    this.events.push(event);
    return this;
  }

  async end() {
    this.ending = true;
  }
}

vi.mock("pg", () => ({
  default: { Pool: FakePool, Client: FakePool },
  Pool: FakePool,
  Client: FakePool,
}));

const DATABASE_URL =
  "postgresql://postgres.cyqtaydtfuwaexjkuynq:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

const env = {
  NODE_ENV: "test",
  VITEST: "true",
  URDAIS_TOKEN_TEST_DATABASE: "1",
  DATABASE_URL,
} as unknown as NodeJS.ProcessEnv;

type PoolGlobal = typeof globalThis & { __urdaisTokenPool?: unknown };

beforeEach(() => {
  pools.length = 0;
  live = 0;
  peakLive = 0;
  serverCeiling = Number.POSITIVE_INFINITY;
  delete (globalThis as PoolGlobal).__urdaisTokenPool;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete (globalThis as PoolGlobal).__urdaisTokenPool;
  vi.restoreAllMocks();
  vi.resetModules();
});

/** The process's one pool, asserted rather than indexed: there must be exactly one. */
function onlyPool(): FakePool {
  expect(pools).toHaveLength(1);
  const pool = pools[0];
  if (!pool) throw new Error("no pool was constructed");
  return pool;
}

/** Twenty concurrent homepage-shaped reads. Bounded, local, and never aimed at production. */
async function concurrentHomepageReads(count = 20) {
  const { loadFrozenUbwiPublication } = await import("@/lib/ubwi/read/publication-store");
  const { loadFrozenUbwiHistory } = await import("@/lib/ubwi/read/publication-history");

  return Promise.all(
    Array.from({ length: count }, (_, index) =>
      index % 2 === 0 ? loadFrozenUbwiPublication(env) : loadFrozenUbwiHistory(env),
    ),
  );
}

describe("the serverless read pool under concurrency", () => {
  it("builds the pool with the small per-instance max, on the transaction pooler", async () => {
    const { tokenSqlExecutor } = await import("@/lib/tokens/read/database");
    await tokenSqlExecutor(DATABASE_URL);

    const pool = onlyPool();
    expect(pool.config.max).toBe(SERVERLESS_POOL_MAX);
    expect(new URL(pool.config.connectionString).port).toBe("6543");
  });

  it("subscribes to the pool's error event, which is otherwise fatal", async () => {
    const { tokenSqlExecutor } = await import("@/lib/tokens/read/database");
    await tokenSqlExecutor(DATABASE_URL);

    // `pg.Pool` emits a backend or pooler disconnect on the pool rather than on
    // any query. Unhandled, node treats it as an uncaught exception and the
    // serverless instance dies -- taking every request on it, not just the one.
    expect(onlyPool().events).toContain("error");
  });

  it("opens one pool for a warm process, however many concurrent requests arrive", async () => {
    await concurrentHomepageReads();

    // A pool per request is the other way to exhaust a pooler, and it is the
    // shape a "just open a client here" fix takes.
    expect(pools).toHaveLength(1);
  });

  it("never checks out more connections at once than its max", async () => {
    await concurrentHomepageReads();

    expect(peakLive).toBe(SERVERLESS_POOL_MAX);
    // Proves the reads really did overlap: a serialised run would not queue.
    expect(onlyPool().queries.length).toBe(20);
  });

  it("still serves every one of those requests real data", async () => {
    const results = await concurrentHomepageReads();

    const publications = results.filter((value) => value !== null && !Array.isArray(value));
    const histories = results.filter(Array.isArray);
    expect(publications).toHaveLength(10);
    expect(histories).toHaveLength(10);
    // The failure being guarded against is not an error; it is data quietly
    // becoming absent. So the assertion has to be that it is present.
    for (const history of histories) expect(history).toHaveLength(1);
  });

  it("does not let a finished reader close the pool the others share", async () => {
    await concurrentHomepageReads();

    expect(onlyPool().ending).toBe(false);

    const { tokenSqlExecutor } = await import("@/lib/tokens/read/database");
    const sql = await tokenSqlExecutor(DATABASE_URL);
    await expect(sql.query("select 1", [])).resolves.toEqual({ rows: [] });
  });

  it("would survive twenty concurrent instances against a fifteen-client budget", async () => {
    // One process cannot model twenty machines, but it can model the budget:
    // at this max, twenty instances claim twenty connections, and the point is
    // that one instance claims one. At the old max: 4 the same twenty claimed
    // eighty, and four of them were already enough to exhaust fifteen.
    expect(SERVERLESS_POOL_MAX * 4).toBeLessThan(15);
  });
});

describe("when the pooler is exhausted anyway", () => {
  it("logs DB_POOL_EXHAUSTED rather than failing silently, and renders honestly", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    serverCeiling = 0;

    const { loadFrozenUbwiHistory } = await import("@/lib/ubwi/read/publication-history");
    const history = await loadFrozenUbwiHistory(env);

    // Honest: an empty chart, not an invented point.
    expect(history).toEqual([]);
    // Visible: the reason reached the log, with a code an operator can search
    // for in a window that heals itself in two minutes.
    const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("DB_POOL_EXHAUSTED");
    expect(logged).not.toContain("postgres.cyqtaydtfuwaexjkuynq");
  });

  it("logs the same code from the news rail, which degrades to the same empty state", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    serverCeiling = 0;

    const { loadNewsRail } = await import("@/lib/news/read/load");
    const rail = await loadNewsRail("compute", env as unknown as Record<string, string | undefined>);

    expect(rail).toEqual({ articles: [], available: false });
    expect(warn.mock.calls.map((call) => String(call[0])).join("\n")).toContain("DB_POOL_EXHAUSTED");
  });

  it("writes nothing and corrupts nothing when it fails", async () => {
    serverCeiling = 0;

    const { loadFrozenUbwiHistory } = await import("@/lib/ubwi/read/publication-history");
    await loadFrozenUbwiHistory(env);

    // The read paths issue no statement but the select, so an exhausted pooler
    // cannot leave a half-written anything behind.
    for (const pool of pools) {
      for (const text of pool.queries) expect(text).not.toMatch(/insert|update|delete|begin|commit/i);
    }
  });
});
