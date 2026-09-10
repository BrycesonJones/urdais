/**
 * Minimal frontend news types.
 *
 * These model only what the homepage rails render. The future ingestion
 * backend will map its own records into this shape at the data boundary.
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
  summary: string;
  source: string;
  /** ISO 8601 timestamp of publication. */
  publishedAt: string;
  /** Canonical publisher URL, or null while no real destination exists (mock content). */
  url: string | null;
  /** Provider thumbnail URL, or null when the story has no usable image. */
  imageUrl: string | null;
};
