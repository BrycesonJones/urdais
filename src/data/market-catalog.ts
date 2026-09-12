/**
 * Lightweight registry of the first-class Urdais markets: symbol, name, and
 * canonical route. This is the only market data the header search needs, so
 * navigation UI can import it without pulling in the generated histories.
 * The detail dataset takes its market identities from here as well, so names
 * and routes are defined once.
 */

import { COMPUTE_ANALYTICS_HREF, marketIndexHref, MODEL_ECONOMICS_HREF, POWER_ANALYTICS_HREF } from "@/lib/routes";

export type MarketCatalogEntry = {
  symbol: string;
  name: string;
  href: string;
  /** One-sentence definition shown on the detail page, where the product has settled one. */
  description?: string;
  /** The question the index answers, shown as its subtitle. */
  question?: string;
};

function entry(symbol: string, name: string, detail?: Pick<MarketCatalogEntry, "description" | "question">): MarketCatalogEntry {
  return { symbol, name, href: marketIndexHref(symbol), ...detail };
}

/** The single canonical index for advanced AI accelerator hardware: the capital-asset layer, distinct from UCPI's usage pricing. */
export const CHIP_ACCELERATOR_INDEX = {
  symbol: "UACI",
  name: "Urdais Chip & Accelerator Index",
  description: "Tracks normalized market pricing for leading AI accelerators, weighted by representative compute capability and market relevance.",
  question: "What does advanced compute hardware cost?",
} as const;

/** Routed markets in display order; the first is the default for /markets. */
export const MARKET_CATALOG: MarketCatalogEntry[] = [
  entry("UCPI", "Urdais Compute Price Index"),
  entry("UGAI", "Urdais Global AI Index"),
  entry("UAVI", "Urdais AI Volatility Index"),
  entry("UMPI", "Urdais Memory Price Index"),
  entry("UPPI", "Urdais Photonics Price Index"),
  entry("UEPI", "Urdais Energy & Power Index"),
  entry(CHIP_ACCELERATOR_INDEX.symbol, CHIP_ACCELERATOR_INDEX.name, { description: CHIP_ACCELERATOR_INDEX.description, question: CHIP_ACCELERATOR_INDEX.question }),
  entry("UBWI", "Bitcoin Wealth Index"),
];

/** An analytical market page that is not an index: discoverable in search under "Markets". */
export type MarketPageEntry = {
  id: string;
  name: string;
  description: string;
  href: string;
  /** Extra search terms beyond the name and description. */
  keywords: string[];
};

export const MARKET_PAGES: MarketPageEntry[] = [
  {
    id: "model-economics",
    name: "Model Economics",
    description: "Token price, volume, market share, and capability",
    href: MODEL_ECONOMICS_HREF,
    keywords: [
      "model",
      "models",
      "model economics",
      "model pricing",
      "model frontier",
      "token",
      "tokens",
      "token economics",
      "token price",
      "token volume",
      "market share",
      "open weight",
      "open-weight",
      "proprietary",
      "capability",
      "frontier",
      "utvi",
      "labs",
      "xai",
      "x.ai",
      "grok",
    ],
  },
  {
    id: "compute-analytics",
    name: "Compute Analytics",
    description: "Forward pricing, utilization, and hardware economics",
    href: COMPUTE_ANALYTICS_HREF,
    keywords: [
      "compute analytics",
      "compute economics",
      "compute",
      "gpu",
      "gpus",
      "gpu economics",
      "forward",
      "forward curve",
      "forwards",
      "compute forward",
      "term structure",
      "tenor",
      "utilization",
      "gpu utilization",
      "fleet utilization",
      "fleet",
      "payback",
      "payback period",
      "hardware economics",
      "hardware",
      "gpu rental",
      "rental economics",
      "accelerator economics",
      "capex",
    ],
  },
  {
    id: "power-analytics",
    name: "Power Analytics",
    description: "Grid capacity, interconnection, transmission, and flexibility",
    href: POWER_ANALYTICS_HREF,
    keywords: [
      "power",
      "power analytics",
      "energy",
      "electricity",
      "grid",
      "grid capacity",
      "grid buildout",
      "transmission",
      "transmission capacity",
      "load",
      "load forecast",
      "forecast",
      "data center power",
      "interconnection",
      "interconnection queue",
      "queue",
      "poles",
      "wires",
      "substation",
      "substations",
      "transformer",
      "transformers",
      "headroom",
      "flexibility",
      "flexible capacity",
      "interruptible load",
      "delivery gap",
    ],
  },
];

/** Case-insensitive match on the name and description at word boundaries, or on any keyword prefix. */
export function searchMarketPages(query: string): MarketPageEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return MARKET_PAGES;
  return MARKET_PAGES.filter(
    (page) =>
      ` ${page.name.toLowerCase()}`.includes(` ${needle}`) ||
      ` ${page.description.toLowerCase()}`.includes(` ${needle}`) ||
      page.keywords.some((keyword) => keyword.startsWith(needle) || needle.startsWith(keyword)),
  );
}

export function catalogEntry(symbol: string): MarketCatalogEntry {
  const match = MARKET_CATALOG.find((candidate) => candidate.symbol === symbol);
  if (!match) throw new Error(`Unknown market symbol: ${symbol}`);
  return match;
}

/**
 * Case-insensitive match: anywhere in the symbol, or at a word boundary in
 * the name so "ai" finds the AI indices without matching "Urdais". An empty
 * query returns everything.
 */
export function searchMarketCatalog(query: string): MarketCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return MARKET_CATALOG;
  return MARKET_CATALOG.filter(
    (market) =>
      market.symbol.toLowerCase().includes(needle) || ` ${market.name.toLowerCase()}`.includes(` ${needle}`),
  );
}
