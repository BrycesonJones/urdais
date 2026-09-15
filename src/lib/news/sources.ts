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
    imagePolicy: "feed_media",
    imageHosts: [{ host: "storage.googleapis.com", pathPrefix: "/gweb-cloudblog-publish/" }],
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
    imagePolicy: "feed_media",
    imageHosts: [{ host: "storage.googleapis.com", pathPrefix: "/gweb-cloudblog-publish/" }],
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
    // The feed attaches no image element of any kind.
    imagePolicy: "none",
    imageHosts: [],
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
    // Every item carries media:content on CoreWeave's own Webflow asset path.
    // The path segment is the publisher's site id, which is what keeps this
    // off Together AI's assets on the very same CDN.
    imagePolicy: "feed_media",
    imageHosts: [{ host: "cdn.prod.website-files.com", pathPrefix: "/62bc66d283fd9c34ffec780a/" }],
    canonicalHostRewrite: { from: "wf.coreweave.com", to: "www.coreweave.com" },
    registry: registry("coreweave-blog-feed"),
    notes:
      "Feed links use the Webflow publishing host; each article page declares rel=canonical on www.coreweave.com with the path unchanged, verified on four articles 2026-09-14.",
  },
  "lambda-blog": {
    slug: "lambda-blog",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000007",
    sourceInterfaceSlug: "lambda-blog-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000007",
    publisherName: "Lambda",
    publisherHomepage: "https://lambda.ai",
    category: "compute",
    feedUrl: "https://lambda.ai/blog/rss.xml",
    mechanism: "rss",
    // HubSpot puts the whole post, featured image and all, in description.
    descriptionPolicy: "omit_feed_carries_body",
    // The only image is an <img> inside that body. Body content is not a
    // syndicated enclosure, and Urdais does not take images out of article HTML.
    imagePolicy: "none",
    imageHosts: [],
    registry: registry("lambda-blog-feed"),
    notes:
      "A GPU cloud operator. Approved separately from lambda-instance-types, which stays blocked: that is the customer API under the Cloud Terms of Service, this is a public feed under the Website Terms of Use.",
  },
  "together-ai-blog": {
    slug: "together-ai-blog",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000008",
    sourceInterfaceSlug: "together-ai-blog-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000008",
    publisherName: "Together AI",
    publisherHomepage: "https://www.together.ai",
    category: "compute",
    feedUrl: "https://www.together.ai/blog/rss.xml",
    mechanism: "rss",
    descriptionPolicy: "source_description",
    imagePolicy: "feed_media",
    imageHosts: [{ host: "cdn.prod.website-files.com", pathPrefix: "/69654e88dce9154b5f12070c/" }],
    registry: registry("together-ai-blog-feed"),
    notes: "GPU cloud and inference provider. Shares a CDN host with CoreWeave under a different site id.",
  },
  "cloudflare-workers-blog": {
    slug: "cloudflare-workers-blog",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000009",
    sourceInterfaceSlug: "cloudflare-workers-blog-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000009",
    publisherName: "Cloudflare",
    publisherHomepage: "https://www.cloudflare.com",
    category: "compute",
    // Tag-scoped, so the rail gets the serverless compute platform rather than
    // the whole Cloudflare blog, most of which is network and security news.
    feedUrl: "https://blog.cloudflare.com/tag/workers/rss/",
    mechanism: "rss",
    descriptionPolicy: "source_description",
    imagePolicy: "feed_media",
    imageHosts: [{ host: "blog.cloudflare.com", pathPrefix: "/_emdash/api/media/file/" }],
    registry: registry("cloudflare-workers-blog-feed"),
    notes:
      "The only source whose robots file carries an express content signal granting the search use, which it defines as returning hyperlinks and short excerpts. Images are served from the publisher's own host.",
  },
  "digitalocean-blog": {
    slug: "digitalocean-blog",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-00000000000a",
    sourceInterfaceSlug: "digitalocean-blog-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-00000000000a",
    publisherName: "DigitalOcean",
    publisherHomepage: "https://www.digitalocean.com",
    category: "compute",
    feedUrl: "https://www.digitalocean.com/rss/blog.atom",
    mechanism: "atom",
    // Atom content elements carry the article body; there is no summary.
    descriptionPolicy: "omit_feed_carries_body",
    imagePolicy: "none",
    imageHosts: [],
    registry: registry("digitalocean-blog-feed"),
    notes:
      "The roster's one Atom feed. Approved separately from digitalocean-sizes, which remains under review: that is an authenticated API, this is a feed the blog advertises by link rel=alternate.",
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
  return enabledNewsSources().filter((source) => source.category === category);
}

/**
 * Every source the scheduled run ingests, across every category. Compute is
 * the whole list today; a later phase adds a category by adding definitions,
 * not by adding a schedule.
 */
export function enabledNewsSources(): NewsSourceDefinition[] {
  return NEWS_SOURCE_SLUGS.map((slug) => NEWS_SOURCES[slug]);
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
