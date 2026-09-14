/**
 * Server-only Postgres access for news.
 *
 * Urdais opens one connection pool per process. It was introduced by the token
 * read path and is named for it; news shares it rather than opening a second
 * pool against the same database. The resolution rules are the ones already in
 * force: production never falls back to the local harness URL, and tests open
 * no database unless one is configured for them.
 */

import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import type { NewsSqlExecutor } from "@/lib/news/sql";
import type { ProcessEnvLike } from "@/lib/news/read/load";

export function newsDatabaseUrl(env: ProcessEnvLike = process.env): string | null {
  return resolveTokenDatabaseUrl(env, { allowLocalDefault: env.NODE_ENV === "development" });
}

export async function newsSqlExecutor(url: string): Promise<NewsSqlExecutor> {
  return tokenSqlExecutor(url);
}
