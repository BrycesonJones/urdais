/**
 * The lifecycle contract of the process-wide pooled executor.
 *
 * `tokenSqlExecutor` hands every caller in a process the same `pg.Pool`, keyed
 * on the connection URL. That is deliberate -- one pool per process, shared by
 * the token, UBWI and news read paths -- and it carries one hazard, which these
 * tests exist to hold shut: a borrower that closes the shared pool when it
 * finishes closes it for everybody, including requests still running.
 *
 * `pg` makes that failure total rather than partial. `Pool.end()` sets
 * `ending` synchronously, and every subsequent `connect()` -- which is every
 * subsequent `query()` -- rejects with "Cannot use a pool after calling end on
 * the pool" for the remaining life of the process's pool object. A reader that
 * closed the pool on its way out therefore did not release a connection; it
 * revoked the database from every concurrent reader.
 *
 * On the homepage that surfaced as the UBWI row disappearing from the Urdais
 * Indices panel and all three production News rails rendering "unavailable
 * right now", over a database that was healthy the entire time -- and then
 * healing on the next request, because closing the pool also clears the global
 * and the next caller builds a fresh one. It is a race, so it leaves nothing
 * behind to find afterwards. These tests are how it stays fixed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Pools constructed during a test, in construction order. */
const pools: FakePool[] = [];

/**
 * A `pg.Pool` faithful to the one behaviour under test: `end()` is terminal,
 * and it is terminal for every holder of the pool, not just the caller.
 */
class FakePool {
  ending = false;
  queries: string[] = [];

  constructor(public readonly config: { connectionString: string; max?: number }) {
    pools.push(this);
  }

  async query(text: string) {
    if (this.ending) {
      // The exact message pg-pool raises from connect() once end() has been called.
      throw new Error("Cannot use a pool after calling end on the pool");
    }
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

const DATABASE_URL = "postgresql://reader@example.invalid:5432/urdais";

/** Enough of an env for the read paths to resolve a URL inside vitest. */
const env = {
  NODE_ENV: "test",
  VITEST: "true",
  URDAIS_TOKEN_TEST_DATABASE: "1",
  DATABASE_URL,
} as unknown as NodeJS.ProcessEnv;

type PoolGlobal = typeof globalThis & { __urdaisTokenPool?: unknown };

beforeEach(() => {
  pools.length = 0;
  delete (globalThis as PoolGlobal).__urdaisTokenPool;
});

afterEach(() => {
  delete (globalThis as PoolGlobal).__urdaisTokenPool;
  vi.restoreAllMocks();
});

describe("the shared pooled executor", () => {
  it("hands the same pool to every caller on one URL", async () => {
    const { tokenSqlExecutor } = await import("@/lib/tokens/read/database");

    const first = await tokenSqlExecutor(DATABASE_URL);
    const second = await tokenSqlExecutor(DATABASE_URL);

    expect(second).toBe(first);
    expect(pools).toHaveLength(1);
  });

  it("does not give a borrower any way to close it", async () => {
    const { tokenSqlExecutor } = await import("@/lib/tokens/read/database");

    const sql = await tokenSqlExecutor(DATABASE_URL);

    // A shared resource must not expose a destructive lifecycle method to the
    // requests that merely borrow it. This assertion is the guard: as long as
    // there is no `end` here, no reader can revoke the pool, and TypeScript
    // refuses any attempt to reintroduce `sql.end?.()` at a call site.
    expect((sql as { end?: unknown }).end).toBeUndefined();
  });
});

describe("the homepage read path", () => {
  it("still reads news after the UBWI row has been loaded", async () => {
    const { loadFrozenUbwiPublication } = await import("@/lib/ubwi/read/publication-store");
    const { loadNewsRail } = await import("@/lib/news/read/load");

    // The homepage's real order: page.tsx awaits the UBWI publication, then
    // renders <NewsSections />, which loads the three production rails.
    const publication = await loadFrozenUbwiPublication(env);
    expect(publication?.valuePercent).toBeCloseTo(0.26716309468662236);

    const rails = await Promise.all([
      loadNewsRail("compute", env),
      loadNewsRail("energy-power", env),
      loadNewsRail("crypto", env),
    ]);

    // `available: false` is what renders "<Category> news is unavailable right
    // now." Before the fix all three were false here, because loading UBWI
    // closed the pool they were about to use.
    for (const rail of rails) {
      expect(rail.available).toBe(true);
    }
    expect(pools).toHaveLength(1);
    expect(pools[0]?.ending).toBe(false);
  });

  it("survives a second, concurrent request against the same process", async () => {
    const { loadFrozenUbwiPublication } = await import("@/lib/ubwi/read/publication-store");
    const { loadNewsRail } = await import("@/lib/news/read/load");

    // Two overlapping homepage requests in one warm server. The pool is
    // process-wide, so request A's UBWI read and request B's news reads share
    // it even though each request is internally sequential. This is the
    // arrangement the deployed symptom came from, and it cannot be reproduced
    // by loading the page once.
    const [publication, ...rails] = await Promise.all([
      loadFrozenUbwiPublication(env),
      loadNewsRail("compute", env),
      loadNewsRail("energy-power", env),
      loadNewsRail("crypto", env),
    ]);

    expect(publication).not.toBeNull();
    for (const rail of rails) {
      expect(rail.available).toBe(true);
    }
  });

  it("keeps the UBWI headline and its history readable together", async () => {
    const { loadFrozenUbwiPublication } = await import("@/lib/ubwi/read/publication-store");
    const { loadFrozenUbwiHistory } = await import("@/lib/ubwi/read/publication-history");

    // The market page's pair. A previous phase fixed this by making the two
    // sequential, which left the shared pool closable and only moved the race
    // out of one request and into the gap between two.
    const [publication, history] = await Promise.all([
      loadFrozenUbwiPublication(env),
      loadFrozenUbwiHistory(env),
    ]);

    expect(publication).not.toBeNull();
    expect(history).toHaveLength(1);
  });
});

describe("a read that genuinely fails", () => {
  it("says so in the server log rather than vanishing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { tokenSqlExecutor } = await import("@/lib/tokens/read/database");
    const { loadFrozenUbwiPublication } = await import("@/lib/ubwi/read/publication-store");

    const sql = await tokenSqlExecutor(DATABASE_URL);
    vi.spyOn(sql, "query").mockRejectedValue(new Error("connection terminated unexpectedly"));

    // A missing UBWI row and an unreachable database look identical on the
    // page. They must not look identical to an operator reading the logs,
    // otherwise a transient fault leaves no trace and cannot be diagnosed
    // after it heals -- which is exactly what happened here.
    await expect(loadFrozenUbwiPublication(env)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("connection terminated unexpectedly"),
    );
  });
});
