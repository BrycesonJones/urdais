/**
 * Server-only Postgres access for the token-price catalog.
 *
 * Production never falls back to the local harness URL. Tests do not open a
 * database unless DATABASE_URL / URDAIS_DATABASE_URL is set. The browser
 * never imports this module.
 */

import pg from "pg";

import {
  SERVERLESS_POOL_OPTIONS,
  describeDatabaseError,
  redactConnectionString,
  serverlessRuntimeUrl,
} from "@/lib/db/connection";
import { isProductionRuntime, type ProcessEnvLike } from "@/lib/tokens/read/publication";
import { loadPersistedBenchmarks, type PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { loadTokenReadCatalogFromSql, type TokenSqlExecutor } from "@/lib/tokens/read/sql";
import type { TokenReadCatalog } from "@/lib/tokens/read/series";

export type ResolveDatabaseUrlOptions = {
  allowLocalDefault?: boolean;
};

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function localTokenDatabaseUrl(env: ProcessEnvLike = process.env): string {
  const host = env.PGHOST?.trim() || "localhost";
  const port = env.PGPORT?.trim() || env.URDAIS_PG_PORT?.trim() || "54329";
  const user = env.PGUSER?.trim() || "postgres";
  const name = env.URDAIS_DB_NAME?.trim() || "urdais_local";
  const password = env.PGPASSWORD;
  if (password) return `postgresql://${user}:${password}@${host}:${port}/${name}`;
  return `postgresql://${user}@${host}:${port}/${name}`;
}

export function resolveTokenDatabaseUrl(
  env: ProcessEnvLike = process.env,
  options: ResolveDatabaseUrlOptions = {},
): string | null {
  const inTest = env.VITEST === "true" || env.NODE_ENV === "test";
  if (inTest && env.URDAIS_TOKEN_TEST_DATABASE !== "1" && !options.allowLocalDefault) {
    return null;
  }
  const explicit = firstNonEmpty(env.DATABASE_URL, env.URDAIS_DATABASE_URL);
  if (explicit) return explicit;
  if (isProductionRuntime(env)) return null;
  if (options.allowLocalDefault) return localTokenDatabaseUrl(env);
  return null;
}

type SharedTokenExecutor = TokenSqlExecutor & { url: string };

type GlobalTokenPool = {
  __urdaisTokenPool?: SharedTokenExecutor;
};

/**
 * The process-wide pooled executor, shared by the token, UBWI and news reads.
 *
 * It deliberately offers no way to close the pool. Every caller here is a
 * borrower serving one request out of a pool that outlives it, and `pg` makes
 * closing a shared pool unrecoverable: `Pool.end()` sets `ending` immediately
 * and every later `query()` on that pool rejects with "Cannot use a pool after
 * calling end on the pool". A reader that closed the pool on its way out would
 * not be releasing its connection -- the pool does that by itself -- it would
 * be revoking the database from every request still in flight.
 *
 * That is not hypothetical. The UBWI read paths used to close this pool in a
 * `finally`, and on a warm server a homepage request that finished reading
 * UBWI could leave a concurrent request with no database at all: the UBWI row
 * gone from the Urdais Indices panel and all three production News rails
 * showing "unavailable right now", over a database that was healthy
 * throughout, healing on the next request because the closing call also
 * cleared this global. Returning the bare `TokenSqlExecutor` is what keeps it
 * fixed: there is no `end` to call, so TypeScript rejects any attempt to
 * reintroduce one at a call site.
 *
 * Work that really does own its connection -- the cron routes, which run once
 * and exit -- uses `createTokenSqlExecutor` below and closes that, which is
 * private to the caller and safe to end.
 *
 * This is connection class A. The URL it is handed is the *configured* one; the
 * one it connects with is `serverlessRuntimeUrl`'s, which on Supabase moves
 * this path off the session pooler's fifteen-client budget and onto the
 * transaction pooler. The pool is `max: 1`, not the `max: 4` it was: four
 * concurrent warm Vercel instances used to be able to claim the whole session
 * budget between them, and every production read then failed at once over a
 * healthy database. See @/lib/db/connection for the full account.
 */
export async function tokenSqlExecutor(url: string): Promise<TokenSqlExecutor> {
  const globalForPool = globalThis as typeof globalThis & GlobalTokenPool;
  // Keyed on the configured URL, so a caller need not know about the rewrite to
  // get the process's one pool back.
  if (globalForPool.__urdaisTokenPool?.url === url) return globalForPool.__urdaisTokenPool;

  const runtime = serverlessRuntimeUrl(url);
  // Once per cold start, not per request: which of the three cases produced the
  // runtime URL is the first thing to check when capacity is in question.
  console.info(
    `db: serverless read pool (max ${SERVERLESS_POOL_OPTIONS.max}, ${runtime.source}) -> ${redactConnectionString(runtime.url)}`,
  );

  const pool = new pg.Pool({ connectionString: runtime.url, ...SERVERLESS_POOL_OPTIONS });
  // A pool-level error -- a backend closing an idle connection, the pooler
  // dropping one -- is emitted on the pool, not on any query. `pg` treats an
  // unhandled one as an uncaught exception, which on a serverless instance ends
  // the whole process rather than one request.
  pool.on("error", (error) => {
    console.error(`db: serverless read pool error (${describeDatabaseError(error)})`);
  });
  const executor: SharedTokenExecutor = {
    url,
    async query(text: string, params: readonly unknown[]) {
      const result = await pool.query(text, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[] };
    },
  };
  globalForPool.__urdaisTokenPool = executor;
  return executor;
}

/**
 * A private, caller-owned connection: connection classes B and C.
 *
 * The cron routes and the `scripts/` commands each run one multi-statement
 * transaction and exit, and they close what they opened -- so unlike the shared
 * pool above, this executor does expose `end`, and its callers must call it.
 *
 * It connects with the configured URL **verbatim**, with no rewrite to the
 * transaction pooler. That is deliberate on both counts: one client once a day
 * is not what exhausts a session pooler, and the migration/admin tooling in
 * class C reads server bookkeeping that wants a session connection. A caller
 * that wants the other topology can point `DATABASE_URL` at it.
 */
export async function createTokenSqlExecutor(url: string): Promise<TokenSqlExecutor & { end: () => Promise<void> }> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    async query(text: string, params: readonly unknown[]) {
      const result = await client.query(text, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[] };
    },
    async end() {
      await client.end();
    },
  };
}

/** Frozen Urdais Token Price rows, the authoritative history once written. */
export async function loadFrozenBenchmarksFromDatabase(
  env: ProcessEnvLike = process.env,
): Promise<PersistedBenchmarkRow[] | null> {
  const allowLocalDefault = env.NODE_ENV === "development";
  const url = resolveTokenDatabaseUrl(env, { allowLocalDefault });
  if (!url) return null;
  try {
    const sql = await tokenSqlExecutor(url);
    return await loadPersistedBenchmarks(sql);
  } catch (error) {
    console.warn(`token benchmarks: database unavailable (${describeDatabaseError(error)}); falling back to calculation`);
    return null;
  }
}

export async function loadTokenReadCatalogFromDatabase(
  env: ProcessEnvLike = process.env,
): Promise<TokenReadCatalog | null> {
  const allowLocalDefault = env.NODE_ENV === "development";
  const url = resolveTokenDatabaseUrl(env, { allowLocalDefault });
  if (!url) return null;
  try {
    const sql = await tokenSqlExecutor(url);
    return await loadTokenReadCatalogFromSql(sql);
  } catch (error) {
    console.warn(`token catalog: database unavailable (${describeDatabaseError(error)}); returning empty catalog`);
    return null;
  }
}
