/**
 * News ingestion.
 *
 *   approved source -> retrieve feed -> parse -> normalize -> validate
 *                   -> deduplicate -> persist -> report
 *
 * Two properties matter more than any other here. The run is idempotent: a
 * second pass over the same feed inserts nothing, whether it arrives as the
 * same retrieval or a later one, because identity is deterministic and the
 * database holds the unique indexes that say so. And one source cannot damage
 * another: each is retrieved, parsed and persisted on its own, and a failure
 * is recorded against that source rather than raised out of the run.
 */

import { parseFeed } from "@/lib/news/feed";
import {
  articleKey,
  normalizeArticleUrl,
  normalizeImageUrl,
  normalizePublishedAt,
  normalizeSummary,
  normalizeTitle,
} from "@/lib/news/normalize";
import { assertNewsIngestPermitted } from "@/lib/news/sources";
import type { NewsStore } from "@/lib/news/store";
import { sha256Hex } from "@/lib/tokens/hash";
import type {
  FeedEntry,
  NewsArticleRow,
  NewsDiagnostic,
  NewsIngestMode,
  NewsIngestReport,
  NewsIngestRun,
  NewsRetrieval,
  NewsSourceDefinition,
  NewsSourceOutcome,
} from "@/lib/news/types";

export const NEWS_PARSER_ID = "news.feed.v1";
export const NEWS_COLLECTOR_USER_AGENT = "UrdaisNewsBot/0.1 (+https://urdais.com)";

export type RetrievedFeed = {
  body: string;
  contentType: string;
  url: string;
  requestedAt: string;
  retrievedAt: string;
  status: number;
};

export type NewsIngestInput = {
  source: NewsSourceDefinition;
  mode: NewsIngestMode;
  artifact: RetrievedFeed;
  store: NewsStore;
  idFactory?: () => string;
};

function retrievalFor(input: NewsIngestInput, responseHash: string, id: string): NewsRetrieval {
  const { source, artifact } = input;
  return {
    id,
    sourceInterfaceId: source.sourceInterfaceId,
    sourceInterfaceSlug: source.sourceInterfaceSlug,
    // The body hash and the moment of the request. Two scheduled fetches of an
    // unchanged feed are two real events and both are evidence; re-running the
    // same fetch is not, and collapses onto the row already stored.
    idempotencyKey: `news:${source.slug}:${NEWS_PARSER_ID}:${responseHash}:${artifact.requestedAt}`,
    requestedAt: artifact.requestedAt,
    completedAt: artifact.retrievedAt,
    requestMethod: "GET",
    requestUrl: artifact.url,
    requestParameters: { parserId: NEWS_PARSER_ID, mechanism: source.mechanism },
    responseStatus: artifact.status,
    responseContentType: artifact.contentType,
    responseHash,
    responseByteLength: new TextEncoder().encode(artifact.body).length,
    responseBody: { contentType: artifact.contentType, body: artifact.body },
    recordCount: null,
    // A feed publishes a rolling window by design. Urdais has what the window
    // held at this moment, which is not the publisher's full history, and says
    // so rather than claiming completeness it cannot check.
    enumerationAssessment: "unknown",
    enumerationEvidence:
      "A syndication feed publishes a rolling window of recent items. This retrieval holds what the window contained; earlier items are not enumerated.",
    collectorIdentity: `news-ingest/${source.slug}@${NEWS_PARSER_ID}`,
    retrievalPurpose: input.mode,
    // Production collection is made under the recorded basis; a research pass
    // asserts no basis, and the database requires one only for production.
    permissionGrantId: input.mode === "production" ? source.permissionGrantId : null,
  };
}

function emptyReport(
  input: NewsIngestInput,
  retrieval: NewsRetrieval,
  responseHash: string,
  extra: Partial<NewsIngestReport>,
): NewsIngestReport {
  return {
    source: input.source.slug,
    sourceInterfaceSlug: input.source.sourceInterfaceSlug,
    mode: input.mode,
    retrievalId: retrieval.id,
    requestUrl: retrieval.requestUrl,
    responseHash,
    retrievedAt: retrieval.completedAt,
    entriesParsed: 0,
    articlesInserted: 0,
    articlesAlreadyStored: 0,
    entriesRejected: 0,
    alreadyPresentForRetrieval: false,
    diagnostics: [],
    ...extra,
  };
}

type Candidate = { row: Omit<NewsArticleRow, "id" | "retrievalId">; };

/** One entry to one record, or one named reason it is not storable. */
function normalizeEntry(
  entry: FeedEntry,
  source: NewsSourceDefinition,
  retrievedAt: string,
): Candidate | NewsDiagnostic {
  const title = normalizeTitle(entry.title);
  if (title === null) return { code: "ENTRY_NO_TITLE", detail: `entry with link ${entry.link ?? "(none)"} has no title` };
  if (entry.link === null) return { code: "ENTRY_NO_LINK", detail: `"${title}" has no link` };

  const url = normalizeArticleUrl(entry.link, source.canonicalHostRewrite);
  if (!url.ok) {
    return url.reason === "not_https"
      ? { code: "ENTRY_LINK_NOT_HTTPS", detail: `"${title}" links to ${entry.link}` }
      : { code: "ENTRY_LINK_UNPARSEABLE", detail: `"${title}" links to ${entry.link}` };
  }

  const published = normalizePublishedAt(entry.published, retrievedAt);
  if (!published.ok) {
    return published.reason === "unparseable"
      ? {
          code: entry.published === null ? "ENTRY_NO_PUBLISHED_AT" : "ENTRY_PUBLISHED_AT_UNPARSEABLE",
          detail: `"${title}" published "${entry.published ?? ""}"`,
        }
      : { code: "ENTRY_PUBLISHED_AT_IMPLAUSIBLE", detail: `"${title}" published "${entry.published ?? ""}"` };
  }

  return {
    row: {
      sourceInterfaceId: source.sourceInterfaceId,
      category: source.category,
      canonicalUrl: url.value.canonicalUrl,
      urlKey: url.value.urlKey,
      sourceGuid: entry.guid?.trim() || null,
      articleKey: articleKey(entry.guid, url.value.urlKey),
      title,
      summary: normalizeSummary(entry.description, source.descriptionPolicy),
      imageUrl: normalizeImageUrl(entry.imageUrl, source.imagePolicy),
      publishedAt: published.value,
      ingestedAt: retrievedAt,
    },
  };
}

/** Ingests one approved source from one retained artifact. */
export function ingestNewsSource(input: NewsIngestInput): NewsIngestReport {
  assertNewsIngestPermitted(input.mode, input.source);

  const ids = input.idFactory ?? crypto.randomUUID.bind(crypto);
  const responseHash = sha256Hex(input.artifact.body);
  const retrieval = input.store.insertRetrieval(retrievalFor(input, responseHash, ids()));

  // This exact retrieval has already been processed. Re-running is a no-op
  // rather than a second pass over the same rows.
  const existing = input.store.articlesForRetrieval(retrieval.id);
  if (existing.length > 0) {
    return emptyReport(input, retrieval, responseHash, {
      alreadyPresentForRetrieval: true,
      articlesAlreadyStored: existing.length,
      diagnostics: [{ code: "RETRIEVAL_IDEMPOTENT", detail: `articles already exist for retrieval ${retrieval.id}` }],
    });
  }

  if (input.artifact.status >= 400) {
    return emptyReport(input, retrieval, responseHash, {
      diagnostics: [
        { code: "HTTP_ERROR", detail: `${input.source.feedUrl} returned ${input.artifact.status}; no articles were written` },
      ],
    });
  }

  const parsed = parseFeed(input.artifact.body, input.source.mechanism);
  const diagnostics: NewsDiagnostic[] = [];
  if (parsed.entries.length === 0) {
    diagnostics.push({ code: "FEED_EMPTY", detail: `${input.source.feedUrl} parsed to zero entries` });
  }

  const candidates: NewsArticleRow[] = [];
  const seenInFeed = new Set<string>();
  let rejected = 0;
  for (const entry of parsed.entries) {
    const result = normalizeEntry(entry, input.source, input.artifact.retrievedAt);
    if ("code" in result) {
      diagnostics.push(result);
      rejected += 1;
      continue;
    }
    // A feed that repeats a story within one response is not two stories.
    if (seenInFeed.has(result.row.urlKey)) {
      diagnostics.push({ code: "ENTRY_DUPLICATE_IN_FEED", detail: `${result.row.urlKey} appears more than once` });
      continue;
    }
    seenInFeed.add(result.row.urlKey);
    candidates.push({ ...result.row, id: ids(), retrievalId: retrieval.id });
  }

  const written = input.store.insertArticles(candidates);
  return emptyReport(input, retrieval, responseHash, {
    entriesParsed: parsed.entries.length,
    articlesInserted: written.inserted.length,
    articlesAlreadyStored: written.alreadyStored.length,
    entriesRejected: rejected,
    diagnostics,
  });
}

export type NewsRunInput = {
  sources: readonly NewsSourceDefinition[];
  mode: NewsIngestMode;
  store: NewsStore;
  retrieve: (source: NewsSourceDefinition) => Promise<RetrievedFeed>;
  idFactory?: () => string;
  now?: () => Date;
};

/**
 * Runs every source. A source that throws — a refused permission, an
 * unreachable host, a body that is not a feed — is recorded as a failed
 * outcome, and the sources after it still run.
 */
export async function ingestNewsSources(input: NewsRunInput): Promise<NewsIngestRun> {
  const startedAt = (input.now?.() ?? new Date()).toISOString();
  const outcomes: NewsSourceOutcome[] = [];
  for (const source of input.sources) {
    try {
      const artifact = await input.retrieve(source);
      const report = ingestNewsSource({
        source,
        mode: input.mode,
        artifact,
        store: input.store,
        idFactory: input.idFactory,
      });
      outcomes.push({ source: source.slug, ok: true, report });
    } catch (error) {
      outcomes.push({
        source: source.slug,
        ok: false,
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return {
    startedAt,
    outcomes,
    articlesInserted: outcomes.reduce((total, o) => total + (o.ok ? o.report.articlesInserted : 0), 0),
    sourcesSucceeded: outcomes.filter((o) => o.ok).length,
    sourcesFailed: outcomes.filter((o) => !o.ok).length,
  };
}

/** A live GET of an approved feed. The permission gate has already run. */
export async function retrieveFeed(source: NewsSourceDefinition, now: Date): Promise<RetrievedFeed> {
  const requestedAt = now.toISOString();
  const response = await fetch(source.feedUrl, {
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9", "User-Agent": NEWS_COLLECTOR_USER_AGENT },
  });
  const body = await response.text();
  return {
    body,
    contentType: response.headers.get("content-type") ?? "application/xml",
    url: source.feedUrl,
    requestedAt,
    retrievedAt: new Date().toISOString(),
    status: response.status,
  };
}
