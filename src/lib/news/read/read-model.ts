/**
 * The boundary between a stored news record and what the homepage renders.
 *
 * Above this line nothing knows about RSS, GUIDs, url keys, retrievals, source
 * terms or ingestion state. The rails receive presentation-ready objects in the
 * shape they already used for mock content, which is why swapping the source of
 * one rail changes no component's contract.
 */

import type { PublishedNewsRow } from "@/lib/news/sql";
import type { NewsArticle } from "@/types/news";

export function newsArticleFromRow(row: PublishedNewsRow): NewsArticle {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    // A publisher that offers no snippet gets no snippet. Nothing is generated.
    summary: row.summary,
    source: row.publisherName,
    publishedAt: row.publishedAt,
    url: row.canonicalUrl,
    imageUrl: row.imageUrl,
  };
}

export function newsArticlesFromRows(rows: readonly PublishedNewsRow[]): NewsArticle[] {
  return rows.map(newsArticleFromRow);
}
