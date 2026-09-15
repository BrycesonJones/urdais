/**
 * Shared types for news ingestion.
 *
 * A news record is article metadata and nothing more: a headline, the
 * publisher's own snippet where one is offered, the canonical destination, a
 * publication time, and the lineage that says which fetch of which approved
 * feed it came from. There is no field an article body could be written to,
 * here or in the database.
 */

import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";
import type { NewsCategory } from "@/types/news";

/** Every approved source Urdais ingests. Adding one here without a definition is a compile error. */
export const NEWS_SOURCE_SLUGS = [
  "google-cloud-infrastructure",
  "google-cloud-compute",
  "microsoft-azure-blog",
  "coreweave-blog",
  "lambda-blog",
  "together-ai-blog",
  "cloudflare-workers-blog",
  "digitalocean-blog",
  "doe-newsroom",
  "pjm-inside-lines",
  "power-magazine",
  "power-magazine-data-centers",
  "bitcoin-optech",
  "the-block",
  "chainalysis-blog",
] as const;

export type NewsSourceSlug = (typeof NEWS_SOURCE_SLUGS)[number];

export type FeedMechanism = "rss" | "atom";

export type NewsIngestMode = "research" | "production";

/**
 * What Urdais does with the feed's description element.
 *
 *   source_description       the feed offers a snippet; store it
 *   omit_feed_carries_body   the feed puts the whole article in description.
 *                            Urdais stores no description for that source
 *                            rather than publishing an excerpt of a body.
 */
export type DescriptionPolicy = "source_description" | "omit_feed_carries_body";

/**
 * Whether a thumbnail URL the feed supplied may be referenced. `none` is the
 * default and the answer wherever reuse is not plainly straightforward.
 */
export type ImagePolicy = "feed_media" | "none";

/**
 * One permitted origin for a source's images, as host plus a path prefix.
 *
 * The path matters as much as the host. Two of the approved publishers serve
 * their assets from one shared CDN, so a host-only rule would let either
 * publisher's artwork in under the other's decision, and would let in every
 * other site on that CDN besides.
 */
export type ImageHost = { host: string; pathPrefix: string };

/**
 * One approved source. Every source-specific fact lives here — endpoint,
 * mechanism, category, rights state, normalization policy — so that adding a
 * source is adding a definition, never editing the pipeline.
 */
export type NewsSourceDefinition = {
  slug: NewsSourceSlug;
  /** reference.source_interfaces.id, pinned to the migration. */
  sourceInterfaceId: string;
  sourceInterfaceSlug: string;
  /** reference.permission_grants.id, the basis a production retrieval is made under. */
  permissionGrantId: string;
  /** The publisher as a reader should see it, and where they can find it. */
  publisherName: string;
  publisherHomepage: string;
  category: NewsCategory;
  feedUrl: string;
  mechanism: FeedMechanism;
  descriptionPolicy: DescriptionPolicy;
  imagePolicy: ImagePolicy;
  /**
   * Where this source's images may come from. Enforced during ingestion, so a
   * URL outside it is never stored; next.config.ts mirrors the same list for
   * the renderer. Empty whenever imagePolicy is "none".
   */
  imageHosts: readonly ImageHost[];
  /**
   * Some publishers emit links on a publishing host that their own article
   * pages declare non-canonical. Where that has been verified, the rewrite is
   * recorded here rather than guessed at parse time.
   */
  canonicalHostRewrite?: { from: string; to: string };
  registry: SourceRegistryState;
  notes: string;
};

/** One entry as the feed expressed it, before any Urdais rule is applied. */
export type FeedEntry = {
  title: string | null;
  link: string | null;
  guid: string | null;
  description: string | null;
  published: string | null;
  imageUrl: string | null;
};

/** A validated record, ready to persist. Mirrors pipeline.news_articles. */
export type NewsArticleRow = {
  id: string;
  sourceInterfaceId: string;
  retrievalId: string;
  category: NewsCategory;
  canonicalUrl: string;
  urlKey: string;
  sourceGuid: string | null;
  articleKey: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: string;
  ingestedAt: string;
};

/** One fetch of one feed, retained as evidence. Mirrors pipeline.source_retrievals. */
export type NewsRetrieval = {
  id: string;
  sourceInterfaceId: string;
  sourceInterfaceSlug: string;
  idempotencyKey: string;
  requestedAt: string;
  completedAt: string;
  requestMethod: "GET";
  requestUrl: string;
  requestParameters: Record<string, string>;
  responseStatus: number;
  responseContentType: string;
  responseHash: string;
  responseByteLength: number;
  responseBody: { contentType: string; body: string };
  recordCount: number | null;
  enumerationAssessment: "complete" | "incomplete" | "unknown";
  enumerationEvidence: string;
  collectorIdentity: string;
  retrievalPurpose: NewsIngestMode;
  permissionGrantId: string | null;
};

/**
 * Why an entry was not stored. Every rejection is named; nothing is dropped
 * silently, because a feed that quietly stops producing articles and a feed
 * that is broken look identical from a row count alone.
 */
export type NewsDiagnosticCode =
  | "ENTRY_NO_TITLE"
  | "ENTRY_NO_LINK"
  | "ENTRY_LINK_NOT_HTTPS"
  | "ENTRY_LINK_UNPARSEABLE"
  | "ENTRY_NO_PUBLISHED_AT"
  | "ENTRY_PUBLISHED_AT_UNPARSEABLE"
  | "ENTRY_PUBLISHED_AT_IMPLAUSIBLE"
  | "ENTRY_DUPLICATE_IN_FEED"
  | "ENTRY_IMAGE_HOST_NOT_PERMITTED"
  | "FEED_EMPTY"
  | "HTTP_ERROR"
  | "RETRIEVAL_IDEMPOTENT";

export type NewsDiagnostic = { code: NewsDiagnosticCode; detail: string };

export type NewsIngestReport = {
  source: NewsSourceSlug;
  sourceInterfaceSlug: string;
  mode: NewsIngestMode;
  retrievalId: string;
  requestUrl: string;
  responseHash: string;
  retrievedAt: string;
  entriesParsed: number;
  articlesInserted: number;
  /** Already stored, by article key or by canonical URL from another feed. */
  articlesAlreadyStored: number;
  entriesRejected: number;
  alreadyPresentForRetrieval: boolean;
  diagnostics: NewsDiagnostic[];
};

/** One source's outcome: a report, or the failure that stopped it. */
export type NewsSourceOutcome =
  | { source: NewsSourceSlug; ok: true; report: NewsIngestReport }
  | { source: NewsSourceSlug; ok: false; error: { name: string; message: string } };

export type NewsIngestRun = {
  startedAt: string;
  outcomes: NewsSourceOutcome[];
  articlesInserted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
};

export class MalformedFeedError extends Error {
  constructor(detail: string) {
    super(`malformed feed: ${detail}`);
    this.name = "MalformedFeedError";
  }
}

export class NewsPermissionError extends Error {
  readonly code = "COLLECTION_NOT_PERMITTED" as const;
  constructor(detail: string) {
    super(`news ingestion refused: ${detail}`);
    this.name = "NewsPermissionError";
  }
}

export class UnknownNewsSourceError extends Error {
  constructor(slug: string) {
    super(`no approved news source is registered as "${slug}"`);
    this.name = "UnknownNewsSourceError";
  }
}
