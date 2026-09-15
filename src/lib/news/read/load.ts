/**
 * The homepage's production news accessor.
 *
 * A server component calls this and gets presentation-ready articles or an
 * explicit unavailability. There is no API route, because nothing outside the
 * homepage reads news yet and a public endpoint nobody calls is a surface to
 * maintain rather than a feature. There is no `/news` page.
 *
 * `available: false` and an empty list are different states and are kept
 * different: a database Urdais cannot reach is not the same as a category with
 * no stories, and neither is ever filled in with mock content.
 */

import { loadPublishedNews, type NewsSqlExecutor } from "@/lib/news/sql";
import { diversifyBySource } from "@/lib/news/read/diversity";
import { newsArticlesFromRows } from "@/lib/news/read/read-model";
import type { NewsArticle, NewsCategory } from "@/types/news";

/** Enough to fill the rail and scroll a little; not a feed. */
export const NEWS_RAIL_LIMIT = 12;

/**
 * How deep the read goes before the rail is assembled.
 *
 * The diversity rule can only defer a story to a publisher that has one
 * waiting, so the candidate set has to contain something from every publisher
 * that has anything. The per-source cap is what guarantees that: without it a
 * feed that stamps a hundred items with one publication minute fills any flat
 * window by itself, and there is nothing left to alternate with.
 */
const CANDIDATE_PER_SOURCE = NEWS_RAIL_LIMIT;
const CANDIDATE_LIMIT = NEWS_RAIL_LIMIT * 8;

export type NewsRailData = {
  articles: NewsArticle[];
  /** False when the production store could not be read at all. */
  available: boolean;
};

export type ProcessEnvLike = Record<string, string | undefined>;

export async function loadNewsRail(
  category: NewsCategory,
  env: ProcessEnvLike = process.env,
  limit: number = NEWS_RAIL_LIMIT,
): Promise<NewsRailData> {
  const { newsDatabaseUrl, newsSqlExecutor } = await import("@/lib/news/read/database");
  const url = newsDatabaseUrl(env);
  if (!url) return { articles: [], available: false };
  try {
    const sql: NewsSqlExecutor = await newsSqlExecutor(url);
    const candidates = newsArticlesFromRows(
      await loadPublishedNews(sql, category, { limit: CANDIDATE_LIMIT, perSource: CANDIDATE_PER_SOURCE }),
    );
    return { articles: diversifyBySource(candidates, { limit }), available: true };
  } catch (error) {
    const { describeDatabaseError } = await import("@/lib/db/connection");
    console.warn(`news: production store unavailable (${describeDatabaseError(error)}); the ${category} rail will render empty`);
    return { articles: [], available: false };
  }
}

/** Compute is the production-backed rail; the other five are still mock. */
export function loadComputeNews(env: ProcessEnvLike = process.env): Promise<NewsRailData> {
  return loadNewsRail("compute", env);
}
