/**
 * The write surface ingestion uses, and an in-memory implementation of it.
 *
 * The interface is deliberately the shape the database enforces: a retrieval is
 * idempotent on its key, and an article insert is rejected when its identity
 * within a source, or its canonical URL across every source, is already
 * present. Tests that run against this store therefore exercise the same
 * invariants as production, and the SQL implementation adds no rule of its own.
 */

import type { NewsArticleRow, NewsRetrieval } from "@/lib/news/types";
import type { NewsCategory } from "@/types/news";

export type ArticleInsertResult = {
  inserted: NewsArticleRow[];
  /** Rejected because the article was already stored, by article key or canonical URL. */
  alreadyStored: NewsArticleRow[];
};

export type NewsStore = {
  /** Returns the stored row: the existing one when the key has been seen. */
  insertRetrieval(retrieval: NewsRetrieval): NewsRetrieval;
  articlesForRetrieval(retrievalId: string): NewsArticleRow[];
  insertArticles(rows: readonly NewsArticleRow[]): ArticleInsertResult;
};

export class InMemoryNewsStore implements NewsStore {
  private readonly retrievalsByKey = new Map<string, NewsRetrieval>();
  private readonly articles: NewsArticleRow[] = [];
  private readonly byArticleKey = new Set<string>();
  private readonly byUrlKey = new Set<string>();

  constructor(
    seed: {
      retrievals?: readonly NewsRetrieval[];
      articles?: readonly NewsArticleRow[];
      /**
       * Identity of articles already persisted elsewhere. Seeding it lets a
       * run against a live database report what it actually wrote rather than
       * what it offered, without loading every stored row.
       */
      identity?: readonly { sourceInterfaceId: string; articleKey: string; urlKey: string }[];
    } = {},
  ) {
    for (const retrieval of seed.retrievals ?? []) this.retrievalsByKey.set(retrieval.idempotencyKey, retrieval);
    for (const known of seed.identity ?? []) {
      this.byArticleKey.add(`${known.sourceInterfaceId}::${known.articleKey}`);
      this.byUrlKey.add(known.urlKey);
    }
    if (seed.articles?.length) this.insertArticles(seed.articles);
  }

  insertRetrieval(retrieval: NewsRetrieval): NewsRetrieval {
    const existing = this.retrievalsByKey.get(retrieval.idempotencyKey);
    if (existing) return existing;
    this.retrievalsByKey.set(retrieval.idempotencyKey, retrieval);
    return retrieval;
  }

  articlesForRetrieval(retrievalId: string): NewsArticleRow[] {
    return this.articles.filter((row) => row.retrievalId === retrievalId);
  }

  insertArticles(rows: readonly NewsArticleRow[]): ArticleInsertResult {
    const inserted: NewsArticleRow[] = [];
    const alreadyStored: NewsArticleRow[] = [];
    for (const row of rows) {
      const identity = `${row.sourceInterfaceId}::${row.articleKey}`;
      if (this.byArticleKey.has(identity) || this.byUrlKey.has(row.urlKey)) {
        alreadyStored.push(row);
        continue;
      }
      this.byArticleKey.add(identity);
      this.byUrlKey.add(row.urlKey);
      this.articles.push(row);
      inserted.push(row);
    }
    return { inserted, alreadyStored };
  }

  get all(): readonly NewsArticleRow[] {
    return this.articles;
  }

  get retrievals(): readonly NewsRetrieval[] {
    return [...this.retrievalsByKey.values()];
  }

  /** Newest first, as the homepage reads it. Withdrawal does not exist in memory. */
  publishable(category: NewsCategory, limit: number): NewsArticleRow[] {
    return this.articles
      .filter((row) => row.category === category)
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : a.id < b.id ? 1 : -1))
      .slice(0, limit);
  }
}
