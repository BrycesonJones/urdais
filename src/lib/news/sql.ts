/**
 * Server-side SQL for news: the identity already stored, the write, and the
 * homepage read.
 *
 * The write asks the database to enforce identity rather than trusting the
 * process that assembled the rows: both unique indexes are left to reject a
 * repeat, and the count returned is what was actually written, not what was
 * offered. The read is fail-closed in the same way the token read is — it
 * joins the live registry, so an article whose source stops being approved
 * stops being published without anything having to delete it.
 */

import type { NewsArticleRow, NewsRetrieval } from "@/lib/news/types";
import type { NewsCategory } from "@/types/news";

export type NewsSqlExecutor = {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

/** A published article as the read path sees it, before it becomes a UI object. */
export type PublishedNewsRow = {
  id: string;
  category: NewsCategory;
  title: string;
  summary: string | null;
  publisherName: string;
  canonicalUrl: string;
  imageUrl: string | null;
  publishedAt: string;
};

const IDENTITY_SQL = `
SELECT source_interface_id, article_key, url_key
  FROM pipeline.news_articles
 WHERE source_interface_id = ANY($1::uuid[])
`;

const INSERT_RETRIEVAL_SQL = `
INSERT INTO pipeline.source_retrievals (
  id, source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
  request_parameters, response_status, response_content_type, response_hash, response_byte_length,
  response_body, record_count, enumeration_assessment, enumeration_evidence, collector_identity,
  retrieval_purpose, acquisition_mode, permission_grant_id
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17, $18, 'automated', $19
)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id
`;

const FIND_RETRIEVAL_SQL = `SELECT id FROM pipeline.source_retrievals WHERE idempotency_key = $1`;

const INSERT_ARTICLE_SQL = `
INSERT INTO pipeline.news_articles (
  id, source_interface_id, retrieval_id, category, canonical_url, url_key, source_guid, article_key,
  title, summary, image_url, published_at, ingested_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
)
ON CONFLICT DO NOTHING
RETURNING id
`;

const PUBLISHED_SQL = `
SELECT a.id, a.category, a.title, a.summary, a.canonical_url, a.image_url, a.published_at,
       p.name AS publisher_name
  FROM pipeline.news_articles a
  JOIN reference.source_interfaces si ON si.id = a.source_interface_id
  JOIN reference.providers p ON p.id = si.provider_id
  JOIN reference.news_sources ns ON ns.source_interface_id = si.id
 WHERE a.category = $1
   AND a.withdrawn_at IS NULL
   AND ns.is_enabled
   AND si.production_access_state = 'production_approved'
 ORDER BY a.published_at DESC, a.id
 LIMIT $2
`;

export async function loadStoredNewsIdentity(
  sql: NewsSqlExecutor,
  sourceInterfaceIds: readonly string[],
): Promise<{ sourceInterfaceId: string; articleKey: string; urlKey: string }[]> {
  if (sourceInterfaceIds.length === 0) return [];
  const result = await sql.query(IDENTITY_SQL, [sourceInterfaceIds]);
  return result.rows.map((row) => ({
    sourceInterfaceId: String(row.source_interface_id),
    articleKey: String(row.article_key),
    urlKey: String(row.url_key),
  }));
}

export type NewsWriteResult = { retrievalsInserted: number; articlesInserted: number };

/**
 * Writes one run. Retrievals first, because an article's lineage points at one;
 * a retrieval whose key is already present hands back the row that exists, so a
 * repeated run reuses it rather than orphaning its articles.
 */
export async function persistNewsRun(
  sql: NewsSqlExecutor,
  run: { retrievals: readonly NewsRetrieval[]; articles: readonly NewsArticleRow[] },
): Promise<NewsWriteResult> {
  await sql.query("begin", []);
  try {
    let retrievalsInserted = 0;
    const retrievalIdByGivenId = new Map<string, string>();
    for (const retrieval of run.retrievals) {
      const inserted = await sql.query(INSERT_RETRIEVAL_SQL, [
        retrieval.id,
        retrieval.sourceInterfaceId,
        retrieval.idempotencyKey,
        retrieval.requestedAt,
        retrieval.completedAt,
        retrieval.requestMethod,
        retrieval.requestUrl,
        JSON.stringify(retrieval.requestParameters),
        retrieval.responseStatus,
        retrieval.responseContentType,
        retrieval.responseHash,
        retrieval.responseByteLength,
        // The retained feed body, so a parse is reproducible from the database
        // alone. An approved feed is public and carries no credential.
        JSON.stringify({
          contentType: retrieval.responseBody.contentType,
          sha256: retrieval.responseHash,
          body: retrieval.responseBody.body,
        }),
        retrieval.recordCount,
        retrieval.enumerationAssessment,
        retrieval.enumerationEvidence,
        retrieval.collectorIdentity,
        retrieval.retrievalPurpose,
        retrieval.permissionGrantId,
      ]);
      if (inserted.rows.length > 0) {
        retrievalsInserted += 1;
        retrievalIdByGivenId.set(retrieval.id, retrieval.id);
      } else {
        const found = await sql.query(FIND_RETRIEVAL_SQL, [retrieval.idempotencyKey]);
        const existingId = found.rows[0]?.id;
        if (existingId === undefined) throw new Error(`retrieval ${retrieval.idempotencyKey} neither inserted nor found`);
        retrievalIdByGivenId.set(retrieval.id, String(existingId));
      }
    }

    let articlesInserted = 0;
    for (const article of run.articles) {
      const retrievalId = retrievalIdByGivenId.get(article.retrievalId) ?? article.retrievalId;
      const result = await sql.query(INSERT_ARTICLE_SQL, [
        article.id,
        article.sourceInterfaceId,
        retrievalId,
        article.category,
        article.canonicalUrl,
        article.urlKey,
        article.sourceGuid,
        article.articleKey,
        article.title,
        article.summary,
        article.imageUrl,
        article.publishedAt,
        article.ingestedAt,
      ]);
      if (result.rows.length > 0) articlesInserted += 1;
    }

    await sql.query("commit", []);
    return { retrievalsInserted, articlesInserted };
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}

function asIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`expected timestamptz, got ${String(value)}`);
  return parsed.toISOString();
}

function asNullText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export async function loadPublishedNews(
  sql: NewsSqlExecutor,
  category: NewsCategory,
  limit: number,
): Promise<PublishedNewsRow[]> {
  const result = await sql.query(PUBLISHED_SQL, [category, limit]);
  return result.rows.flatMap((row) => {
    try {
      return [
        {
          id: String(row.id),
          category: String(row.category) as NewsCategory,
          title: String(row.title),
          summary: asNullText(row.summary),
          publisherName: String(row.publisher_name),
          canonicalUrl: String(row.canonical_url),
          imageUrl: asNullText(row.image_url),
          publishedAt: asIso(row.published_at),
        },
      ];
    } catch {
      // A row that cannot be read is not shown. One bad row does not empty a rail.
      return [];
    }
  });
}
