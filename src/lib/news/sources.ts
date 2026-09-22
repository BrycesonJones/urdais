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
import type { NewsCategory } from "@/types/news";
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
  "doe-newsroom": {
    slug: "doe-newsroom",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000014",
    sourceInterfaceSlug: "doe-newsroom-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-00000000000b",
    publisherName: "U.S. Department of Energy",
    publisherHomepage: "https://www.energy.gov",
    category: "energy-power",
    feedUrl: "https://www.energy.gov/newsroom/rss.xml",
    mechanism: "rss",
    // Short plain-text summaries, not bodies.
    descriptionPolicy: "source_description",
    // No media element, and DOE's own reuse notice warns that some images on
    // its sites are licensed from third parties rather than public domain.
    imagePolicy: "none",
    imageHosts: [],
    registry: registry("doe-newsroom-feed"),
    notes:
      "A federal agency publication in the public domain. The site-wide energy.gov/rss.xml is a different, abandoned feed; this newsroom one is live.",
  },
  "pjm-inside-lines": {
    slug: "pjm-inside-lines",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000015",
    sourceInterfaceSlug: "pjm-inside-lines-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-00000000000c",
    publisherName: "PJM Interconnection",
    publisherHomepage: "https://www.pjm.com",
    category: "energy-power",
    feedUrl: "https://insidelines.pjm.com/feed/",
    mechanism: "rss",
    // The description carries the post body with an inline image.
    descriptionPolicy: "omit_feed_carries_body",
    imagePolicy: "none",
    imageHosts: [],
    registry: registry("pjm-inside-lines-feed"),
    notes:
      "The grid operator for the largest wholesale electricity market in North America, and the source closest to compute: large-load interconnection is data-center interconnection.",
  },
  "power-magazine": {
    slug: "power-magazine",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000016",
    sourceInterfaceSlug: "power-magazine-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-00000000000d",
    publisherName: "POWER Magazine",
    publisherHomepage: "https://www.powermag.com",
    category: "energy-power",
    feedUrl: "https://www.powermag.com/feed/",
    mechanism: "rss",
    descriptionPolicy: "omit_feed_carries_body",
    imagePolicy: "none",
    imageHosts: [],
    registry: registry("power-magazine-feed"),
    notes: "Power generation, transmission and grid trade reporting.",
  },
  "power-magazine-data-centers": {
    slug: "power-magazine-data-centers",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-000000000017",
    sourceInterfaceSlug: "power-magazine-data-centers-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-00000000000e",
    publisherName: "POWER Magazine",
    publisherHomepage: "https://www.powermag.com",
    category: "energy-power",
    // The publisher's own category endpoint. Urdais selects a publisher-scoped
    // feed rather than classifying stories itself.
    feedUrl: "https://www.powermag.com/category/data-centers/feed/",
    mechanism: "rss",
    descriptionPolicy: "omit_feed_carries_body",
    imagePolicy: "none",
    imageHosts: [],
    registry: registry("power-magazine-data-centers-feed"),
    notes: "Overlaps the main POWER feed; a story in both is stored once under its canonical URL.",
  },
  "bitcoin-optech": {
    slug: "bitcoin-optech",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-00000000001d",
    sourceInterfaceSlug: "bitcoin-optech-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-00000000000f",
    publisherName: "Bitcoin Optech",
    publisherHomepage: "https://bitcoinops.org",
    category: "crypto",
    feedUrl: "https://bitcoinops.org/feed.xml",
    mechanism: "atom",
    // The summary element is a genuine abstract; the content element is the
    // whole newsletter and is not read.
    descriptionPolicy: "source_description",
    // The one media element is the Optech logo, identical on every entry. A
    // logo repeated down the rail is not article artwork.
    imagePolicy: "none",
    imageHosts: [],
    registry: registry("bitcoin-optech-feed"),
    notes: "Everything Optech produces is released under the MIT licence, which is the clearest grant in the category.",
  },
  "the-block": {
    slug: "the-block",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-00000000001e",
    sourceInterfaceSlug: "the-block-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000010",
    publisherName: "The Block",
    publisherHomepage: "https://www.theblock.co",
    category: "crypto",
    feedUrl: "https://www.theblock.co/rss.xml",
    mechanism: "rss",
    descriptionPolicy: "source_description",
    imagePolicy: "feed_media",
    imageHosts: [
      { host: "www.tbstat.com", pathPrefix: "/wp/uploads/", allowsCloudflareImageTransform: true },
    ],
    registry: registry("the-block-feed"),
    notes:
      "The only crypto news publisher in the field that published a machine-readable grant rather than a prohibition. Its terms pages return 403 and the review rests on that signal, which the registry evidence records.",
  },
  "chainalysis-blog": {
    slug: "chainalysis-blog",
    sourceInterfaceId: "6f6f6f6f-0000-4000-8000-00000000001f",
    sourceInterfaceSlug: "chainalysis-blog-feed",
    permissionGrantId: "6e6e6e6e-0000-4000-8000-000000000011",
    publisherName: "Chainalysis",
    publisherHomepage: "https://www.chainalysis.com",
    category: "crypto",
    feedUrl: "https://www.chainalysis.com/feed/",
    mechanism: "rss",
    descriptionPolicy: "source_description",
    imagePolicy: "none",
    imageHosts: [],
    registry: registry("chainalysis-blog-feed"),
    notes:
      "Approved on the blog while the company's Acceptable Use Policy prohibits robots against its licensed compliance products; that policy is addressed to licensees and does not govern this feed.",
  },
};

/**
 * Why a researched feed is not ingested. The kinds age differently, which is
 * the reason for distinguishing them: a `relevance` refusal is reversed by the
 * publisher shipping a narrower feed, an `abandoned` one by the publisher
 * posting again, an `unusable` one by the publisher emitting a field it
 * currently omits, and a `terms` one only by the terms changing or by written
 * permission.
 */
export type NewsRefusalKind = "terms" | "abandoned" | "unusable" | "relevance";

/**
 * Feeds that were researched and are not ingested, with the reason. Kept in
 * code as well as in the registry so the refusal travels with the pipeline and
 * is not re-litigated by the next person who notices the feed works.
 */
export const NEWS_SOURCES_REVIEWED_NOT_APPROVED: readonly {
  sourceInterfaceSlug: string;
  publisherName: string;
  feedUrl: string;
  /** The rail the source was considered for. */
  category: NewsCategory;
  refusalKind: NewsRefusalKind;
  reason: string;
}[] = [
  {
    sourceInterfaceSlug: "nvidia-newsroom-feed",
    publisherName: "NVIDIA",
    feedUrl: "https://nvidianews.nvidia.com/releases.xml",
    category: "compute",
    refusalKind: "terms",
    reason:
      "The NVIDIA Terms of Service linked from the newsroom footer prohibit any robot, spider, scraper or crawler from accessing any portion of the Site, with no carve-out for the RSS feed the newsroom publishes. Publishing a feed and prohibiting automated access are in tension and neither settles the other, so the collection axis stays under review.",
  },
  {
    sourceInterfaceSlug: "aws-news-blog-feed",
    publisherName: "Amazon Web Services",
    feedUrl: "https://aws.amazon.com/blogs/aws/feed/",
    category: "compute",
    refusalKind: "terms",
    reason:
      "The AWS Site Terms exclude data mining, robots and similar data gathering tools from the licence granted over the AWS Site, and the blog feed is on the AWS Site rather than on a separately documented programmatic interface. robots.txt is not the obstacle: its blanket Disallow: /blogs/ belongs to the AdsBot-Google group only.",
  },

  // Memory, from the Phase 2A qualification pass. Every candidate whose feed
  // actually works is here; the ones that have no feed at all, or that answer a
  // non-browser agent with 403, are recorded only in the architecture document
  // because there is no interface to point at.
  {
    sourceInterfaceSlug: "skhynix-newsroom-feed",
    publisherName: "SK hynix",
    feedUrl: "https://news.skhynix.com/feed/",
    category: "memory",
    refusalKind: "terms",
    reason:
      "The only Memory candidate that was live, on topic and technically sound, and the only one refused on rights. The Newsroom Terms of Use prohibit using any robot, spider or other automatic device to access the site for any purpose including monitoring, permit the site for non-commercial use only, and forbid storing or publicly displaying its material without prior written consent. There is no press, media, editorial or fair-use exception in the document. The /tag/hbm/, /tag/dram/ and /tag/nand/ feeds are the same site under the same terms and are refused with it.",
  },
  {
    sourceInterfaceSlug: "samsung-newsroom-memory-tag-feed",
    publisherName: "Samsung",
    feedUrl: "https://news.samsung.com/global/tag/memory/feed",
    category: "memory",
    refusalKind: "abandoned",
    reason:
      "Exactly the right shape — a memory-tagged slice of a manufacturer newsroom — and abandoned. The newest of its five items is from July 2017. The current all-Samsung feed is live but covers phones, televisions and appliances, and no memory-scoped Samsung Semiconductor feed exists.",
  },
  {
    sourceInterfaceSlug: "jedec-standards-feed",
    publisherName: "JEDEC",
    feedUrl: "https://www.jedec.org/rss.xml",
    category: "memory",
    refusalKind: "abandoned",
    reason:
      "The memory standards body, and the most authoritative possible source for DDR and HBM specification news. The feed parses and is on topic, but its newest item is the DDR5 publication announcement from July 2020.",
  },
  {
    sourceInterfaceSlug: "dramexchange-weekly-research-feed",
    publisherName: "DRAMeXchange",
    feedUrl: "https://www.dramexchange.com/rss.xml",
    category: "memory",
    refusalKind: "unusable",
    reason:
      "The most on-topic feed found anywhere — DRAM and NAND contract and spot pricing — and unusable as published. No item carries a publication time of any kind and the channel time elements are empty, so a rail ordered by publication date cannot be built from it without inventing dates. Item links are also site-relative. Both are the publisher's to fix.",
  },
  {
    sourceInterfaceSlug: "blocks-and-files-feed",
    publisherName: "Blocks & Files",
    feedUrl: "https://blocksandfiles.com/feed/",
    category: "memory",
    refusalKind: "relevance",
    reason:
      "The closest near miss. A live trade publication with a real NAND, DRAM and HBM beat, but only 12 of the 69 items in the retrieved window were memory stories and the rest were storage arrays, disk and filesystems. Unfiltered it would make the Memory rail a storage rail; filtered it would need story classification the pipeline deliberately does not have.",
  },
  {
    sourceInterfaceSlug: "trendforce-news-feed",
    publisherName: "TrendForce",
    feedUrl: "https://www.trendforce.com/news/feed/",
    category: "memory",
    refusalKind: "relevance",
    reason:
      "Carries genuine memory reporting, including a recurring DRAM and NAND spot price update, inside a general semiconductor feed covering packaging, foundry and passive components. Every memory-scoped category and tag feed path returns 404, and the retrieved window was two and a half months behind the retrieval date.",
  },
  {
    sourceInterfaceSlug: "rambus-feed",
    publisherName: "Rambus",
    feedUrl: "https://www.rambus.com/feed/",
    category: "memory",
    refusalKind: "relevance",
    reason:
      "The company licenses memory interface IP, so it is on topic; the feed is not. Every item in the retrieved window was security IP, and several link to gated marketing pages rather than to articles.",
  },
  {
    sourceInterfaceSlug: "snia-feed",
    publisherName: "SNIA",
    feedUrl: "https://www.snia.org/rss.xml",
    category: "memory",
    refusalKind: "relevance",
    reason:
      "A live standards-body feed whose beat is storage management and networking rather than memory. Its Compute, Memory and Storage Initiative would be the relevant slice, but that blog publishes no parseable feed.",
  },
  {
    sourceInterfaceSlug: "cxl-consortium-feed",
    publisherName: "CXL Consortium",
    feedUrl: "https://www.computeexpresslink.org/feed",
    category: "memory",
    refusalKind: "relevance",
    reason:
      "Memory expansion and pooling is adjacent to the rail, but the feed is consortium activity — conference appearances, member spotlights, event invitations — rather than reporting on memory technology or markets.",
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
 * Every source the scheduled run ingests, across every category. A later phase
 * adds a category by adding definitions, not by adding a schedule.
 */
export function enabledNewsSources(): NewsSourceDefinition[] {
  return NEWS_SOURCE_SLUGS.map((slug) => NEWS_SOURCES[slug]);
}

/**
 * The categories that have production sources, derived from the registry
 * rather than listed. The homepage asks this rather than naming categories, so
 * migrating one is adding its definitions and nothing else.
 */
export function productionNewsCategories(): NewsCategory[] {
  return [...new Set(enabledNewsSources().map((source) => source.category))];
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
