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
