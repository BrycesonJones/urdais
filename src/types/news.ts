/**
 * Minimal frontend news types.
 *
 * These model only what the homepage rails render. The news ingestion backend
 * maps its own records into this shape at the data boundary
 * (src/lib/news/read/read-model.ts); nothing here knows about feeds, GUIDs,
 * source terms or ingestion state.
 * Urdais stores an external/provider thumbnail URL, never the underlying
 * publisher image bytes, which is why `imageUrl` is a plain string.
 */

export const NEWS_CATEGORIES = [
  { id: "compute", label: "Compute" },
  { id: "memory", label: "Memory" },
  { id: "photonics", label: "Photonics" },
  { id: "energy-power", label: "Energy / Power" },
  { id: "ai-chips", label: "AI Chips" },
  { id: "crypto", label: "Crypto" },
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number]["id"];

/**
 * The categories the homepage shows today.
 *
 * This is a presentation decision and nothing more. `NEWS_CATEGORIES` above
 * remains the product taxonomy: the database category constraint, the source
 * registry, the ingestion runner and the read path all continue to know about
 * all six, and a hidden category is one `id` away from returning.
 *
 * Three are shown because three is what Urdais can stand behind. Compute is
 * production-backed. Energy / Power and Crypto are next to migrate and are
 * labelled demo until they do. Memory is deferred because its qualification
 * pass approved no source at all (docs/architecture/news-ingestion.md §12),
 * and Photonics and AI Chips are deferred because a rail of invented stories
 * is a worse thing to ship than no rail.
 */
export const HOMEPAGE_NEWS_CATEGORY_IDS = [
  "compute",
  "energy-power",
  "crypto",
] as const satisfies readonly NewsCategory[];

/**
 * The visible categories, in taxonomy order. Derived rather than restated, so
 * the homepage cannot drift out of the order `NEWS_CATEGORIES` defines and a
 * category cannot be shown under a label the taxonomy does not give it.
 */
export const HOMEPAGE_NEWS_CATEGORIES = NEWS_CATEGORIES.filter((category) =>
  (HOMEPAGE_NEWS_CATEGORY_IDS as readonly string[]).includes(category.id),
);

export type NewsArticle = {
  id: string;
  category: NewsCategory;
  title: string;
  /**
   * The publisher's own short description, or null where the feed offers none
   * and where its description field carries the article body rather than a
   * snippet. Urdais never generates one, so the card omits the dek instead.
   */
  summary: string | null;
  source: string;
  /** ISO 8601 timestamp of publication. */
  publishedAt: string;
  /** Canonical publisher URL, or null while no real destination exists (mock content). */
  url: string | null;
  /** Provider thumbnail URL, or null when the story has no usable image. */
  imageUrl: string | null;
};
