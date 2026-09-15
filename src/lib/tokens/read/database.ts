/**
 * Server-only Postgres access for the token-price catalog.
 *
 * Production never falls back to the local harness URL. Tests do not open a
 * database unless DATABASE_URL / URDAIS_DATABASE_URL is set. The browser
 * never imports this module.
 */

import pg from "pg";

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
 */
export async function tokenSqlExecutor(url: string): Promise<TokenSqlExecutor> {
  const globalForPool = globalThis as typeof globalThis & GlobalTokenPool;
  if (globalForPool.__urdaisTokenPool?.url === url) return globalForPool.__urdaisTokenPool;

  const pool = new pg.Pool({ connectionString: url, max: 4 });
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
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`token benchmarks: database unavailable (${detail}); falling back to calculation`);
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
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`token catalog: database unavailable (${detail}); returning empty catalog`);
    return null;
  }
}
