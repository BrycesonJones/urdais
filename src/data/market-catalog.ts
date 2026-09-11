/**
 * Lightweight registry of the first-class Urdais markets: symbol, name, and
 * canonical route. This is the only market data the header search needs, so
 * navigation UI can import it without pulling in the generated histories.
 * The detail dataset takes its market identities from here as well, so names
 * and routes are defined once.
 */

import { marketIndexHref } from "@/lib/routes";

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
  entry("UBWI", "Bitcoin Wealth Index"),
];

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
