/**
 * Server-only Postgres access for the token-price catalog.
 *
 * Production never falls back to the local harness URL. Tests do not open a
 * database unless DATABASE_URL / URDAIS_DATABASE_URL is set. The browser
 * never imports this module.
 */

import pg from "pg";

import { isProductionRuntime, type ProcessEnvLike } from "@/lib/tokens/read/publication";
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

type GlobalTokenPool = {
  __urdaisTokenPool?: { url: string; query: TokenSqlExecutor["query"]; end: () => Promise<void> };
};

async function tokenSqlExecutor(url: string): Promise<TokenSqlExecutor & { end?: () => Promise<void> }> {
  const globalForPool = globalThis as typeof globalThis & GlobalTokenPool;
  if (globalForPool.__urdaisTokenPool?.url === url) return globalForPool.__urdaisTokenPool;

  const pool = new pg.Pool({ connectionString: url, max: 4 });
  const executor = {
    url,
    async query(text: string, params: readonly unknown[]) {
      const result = await pool.query(text, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[] };
    },
    async end() {
      if (globalForPool.__urdaisTokenPool === executor) delete globalForPool.__urdaisTokenPool;
      await pool.end();
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
