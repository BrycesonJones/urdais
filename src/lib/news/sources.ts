/**
 * The approved-source registry: the one place a news source is defined.
 *
 * Every source-specific fact lives in a definition here — endpoint, mechanism,
 * category, rights state, and the two normalization policies that differ by
 * publisher. The pipeline reads definitions and never names a publisher, so
 * adding a source in a later phase is adding a row here plus a migration, not
 * editing ingestion code.
 *
 * These rows mirror `20260914070000_news_ingestion_foundation.sql`. The
 * database is the source of truth for rights; this module exists so the
 * collector can refuse before it reaches the network, exactly as the token and
 * UCPI collectors do.
 */

import { productionCollectionPermitted, type SourceRegistryState } from "@/lib/ucpi/permission-gate";
import {
  NEWS_SOURCE_SLUGS,
  NewsPermissionError,
  UnknownNewsSourceError,
  type NewsIngestMode,
  type NewsSourceDefinition,
  type NewsSourceSlug,
} from "@/lib/news/types";

/** Approved on both axes and production-approved, as recorded in the migration. */
const APPROVED: SourceRegistryState = {
  slug: "",
  termsReviewState: "permitted",
  dataUseTermsState: "permitted",
  productionAccessState: "production_approved",
  writtenAgreementRequired: false,
};

const registry = (slug: string): SourceRegistryState => ({ ...APPROVED, slug });

/**
 * A Record over the slug union, not an array: a slug added to
 * NEWS_SOURCE_SLUGS without a definition does not compile.
 */
export const NEWS_SOURCES: Record<NewsSourceSlug, NewsSourceDefinition> = {
  "google-cloud-infrastructure": {
    slug: "google-cloud-infrastructure",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000001",
    sourceInterfaceSlug: "google-cloud-blog-infrastructure-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000001",
    publisherName: "Google Cloud",
    publisherHomepage: "https://cloud.google.com",
    category: "compute",
    feedUrl: "https://cloudblog.withgoogle.com/products/infrastructure/rss/",
    mechanism: "rss",
    // The description element carries the article's full HTML body, not a
    // snippet. Urdais publishes no description here rather than an excerpt.
    descriptionPolicy: "omit_feed_carries_body",
    imagePolicy: "none",
    registry: registry("google-cloud-blog-infrastructure-feed"),
    notes: "Hyperscaler infrastructure announcements; items link to cloud.google.com.",
  },
  "google-cloud-compute": {
    slug: "google-cloud-compute",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000002",
    sourceInterfaceSlug: "google-cloud-blog-compute-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000002",
    publisherName: "Google Cloud",
    publisherHomepage: "https://cloud.google.com",
    category: "compute",
    feedUrl: "https://cloudblog.withgoogle.com/products/compute/rss/",
    mechanism: "rss",
    descriptionPolicy: "omit_feed_carries_body",
    imagePolicy: "none",
    registry: registry("google-cloud-blog-compute-feed"),
    notes: "Overlaps the Infrastructure feed; a shared story is stored once under its canonical URL.",
  },
  "microsoft-azure-blog": {
    slug: "microsoft-azure-blog",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000003",
    sourceInterfaceSlug: "microsoft-azure-blog-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000003",
    publisherName: "Microsoft Azure",
    publisherHomepage: "https://azure.microsoft.com",
    category: "compute",
    feedUrl: "https://azure.microsoft.com/en-us/blog/feed/",
    mechanism: "rss",
    descriptionPolicy: "source_description",
    imagePolicy: "none",
    registry: registry("microsoft-azure-blog-feed"),
    notes: "Whole-blog feed; Phase 1A assigns category by source and classifies no items.",
  },
  "coreweave-blog": {
    slug: "coreweave-blog",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000004",
    sourceInterfaceSlug: "coreweave-blog-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000004",
    publisherName: "CoreWeave",
    publisherHomepage: "https://www.coreweave.com",
    category: "compute",
    feedUrl: "https://www.coreweave.com/blog/rss.xml",
    mechanism: "rss",
    descriptionPolicy: "source_description",
    // The feed supplies media:content thumbnails. Referencing a publisher CDN
    // is a separate decision from ingesting metadata and is left to Phase 1B,
    // so nothing is republished on the strength of a convenient URL.
    imagePolicy: "none",
    canonicalHostRewrite: { from: "wf.coreweave.com", to: "www.coreweave.com" },
    registry: registry("coreweave-blog-feed"),
    notes:
      "Feed links use the Webflow publishing host; each article page declares rel=canonical on www.coreweave.com with the path unchanged, verified on four articles 2026-09-14.",
  },
};

/**
 * Feeds that were researched and are not ingested, with the reason. Kept in
 * code as well as in the registry so the refusal travels with the pipeline and
 * is not re-litigated by the next person who notices the feed works.
 */
export const NEWS_SOURCES_REVIEWED_NOT_APPROVED: readonly {
  sourceInterfaceSlug: string;
  publisherName: string;
  feedUrl: string;
  reason: string;
}[] = [
  {
    sourceInterfaceSlug: "nvidia-newsroom-feed",
    publisherName: "NVIDIA",
    feedUrl: "https://nvidianews.nvidia.com/releases.xml",
    reason:
      "The NVIDIA Terms of Service linked from the newsroom footer prohibit any robot, spider, scraper or crawler from accessing any portion of the Site, with no carve-out for the RSS feed the newsroom publishes. Publishing a feed and prohibiting automated access are in tension and neither settles the other, so the collection axis stays under review.",
  },
  {
    sourceInterfaceSlug: "aws-news-blog-feed",
    publisherName: "Amazon Web Services",
    feedUrl: "https://aws.amazon.com/blogs/aws/feed/",
    reason:
      "The AWS Site Terms exclude data mining, robots and similar data gathering tools from the licence granted over the AWS Site, and the blog feed is on the AWS Site rather than on a separately documented programmatic interface. robots.txt is not the obstacle: its blanket Disallow: /blogs/ belongs to the AdsBot-Google group only.",
  },
];

export function newsSource(slug: string): NewsSourceDefinition {
  const source = (NEWS_SOURCES as Record<string, NewsSourceDefinition | undefined>)[slug];
  if (!source) throw new UnknownNewsSourceError(slug);
  return source;
}

/** Enabled sources for one category, in the order they are defined. */
export function newsSourcesForCategory(category: NewsSourceDefinition["category"]): NewsSourceDefinition[] {
  return NEWS_SOURCE_SLUGS.map((slug) => NEWS_SOURCES[slug]).filter((source) => source.category === category);
}

/**
 * Refuses before the network. Research retrieval of a blocked source is
 * refused too; production retrieval requires both terms axes permitted and
 * production approval, which is the same predicate UCPI and token pricing use.
 */
export function assertNewsIngestPermitted(mode: NewsIngestMode, source: NewsSourceDefinition): void {
  if (mode === "research") {
    if (source.registry.productionAccessState === "production_blocked") {
      throw new NewsPermissionError(`${source.registry.slug}: production_blocked; research retrieval refused`);
    }
    return;
  }
  const gate = productionCollectionPermitted(source.registry);
  if (!gate.permitted) throw new NewsPermissionError(gate.detail);
}
