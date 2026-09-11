/**
 * Lightweight registry of the first-class Urdais markets: symbol, name, and
 * canonical route. This is the only market data the header search needs, so
 * navigation UI can import it without pulling in the generated histories.
 * The detail dataset takes its market identities from here as well, so names
 * and routes are defined once.
 */

import { marketIndexHref, MODEL_ECONOMICS_HREF, POWER_ANALYTICS_HREF } from "@/lib/routes";

export type MarketCatalogEntry = {
  symbol: string;
  name: string;
  href: string;
};

function entry(symbol: string, name: string): MarketCatalogEntry {
  return { symbol, name, href: marketIndexHref(symbol) };
}

/** Routed markets in display order; the first is the default for /markets. */
export const MARKET_CATALOG: MarketCatalogEntry[] = [
  entry("UCPI", "Urdais Compute Price Index"),
  entry("UGAI", "Urdais Global AI Index"),
  entry("UAVI", "Urdais AI Volatility Index"),
  entry("UMPI", "Urdais Memory Price Index"),
  entry("UPPI", "Urdais Photonics Price Index"),
  entry("UEPI", "Urdais Energy & Power Index"),
  entry("UACI", "Urdais AI Chip Index"),
  entry("UAXI", "Urdais Accelerator Index"),
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
