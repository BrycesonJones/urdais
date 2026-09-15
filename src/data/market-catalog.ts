/**
 * Lightweight registry of the first-class Urdais markets: symbol, name, and
 * canonical route. This is the only market data the header search needs, so
 * navigation UI can import it without pulling in the generated histories.
 * The detail dataset takes its market identities from here as well, so names
 * and routes are defined once.
 *
 * A market may be registered without being published. ALL_MARKETS is the full
 * registry, which identity lookups read; MARKET_CATALOG is the published subset,
 * which every public surface reads. Withholding an index is therefore one entry
 * in UNPUBLISHED_SYMBOLS rather than a condition spread across components.
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

/**
 * Every registered routed market in display order, published or not. Identity
 * lookups read this; public surfaces read MARKET_CATALOG.
 */
const ALL_MARKETS: MarketCatalogEntry[] = [
  entry("UCPI", "Urdais Compute Price Index"),
  entry("UGAI", "Urdais Global AI Index"),
  entry("UAVI", "Urdais AI Volatility Index"),
  entry("UMPI", "Urdais Memory Price Index"),
  entry("UPPI", "Urdais Photonics Price Index"),
  entry("UEPI", "Urdais Energy & Power Index"),
  entry(CHIP_ACCELERATOR_INDEX.symbol, CHIP_ACCELERATOR_INDEX.name, { description: CHIP_ACCELERATOR_INDEX.description, question: CHIP_ACCELERATOR_INDEX.question }),
  entry("UBWI", "Urdais Bitcoin Wealth Index", {
    // Unit and definition are taken verbatim from the approved methodology draft,
    // /docs/methodology/ubwi. UBWI is a percentage, not an index level: it has no
    // base date, no base value, and is never expressed in points.
    description: "Bitcoin market capitalization as a percentage of Total Global Wealth, measured as consolidated world net worth on the national-accounts identity and excluding human capital.",
    question: "What share of all presently existing global wealth is represented by Bitcoin?",
  }),
];

/**
 * Indices registered but withheld from the public product.
 *
 * A withheld index keeps everything behind it — catalog identity, detail data,
 * calculations, methodology, and research — so publishing it later is a matter of
 * removing its symbol here, not of rebuilding it. It is simply absent from the
 * catalog that listings, search, and comparison menus read.
 *
 * UACI is withheld because the current data-source research does not support a
 * defensible published basket. It is deferred, not retired.
 */
const UNPUBLISHED_SYMBOLS: ReadonlySet<string> = new Set([CHIP_ACCELERATOR_INDEX.symbol]);

/** Whether a market may appear on public surfaces: listings, search, and comparison menus. */
export function isPublishedMarket(symbol: string): boolean {
  return !UNPUBLISHED_SYMBOLS.has(symbol);
}

/** Published routed markets in display order; the first is the default for /markets. */
export const MARKET_CATALOG: MarketCatalogEntry[] = ALL_MARKETS.filter((market) =>
  isPublishedMarket(market.symbol),
);

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

/**
 * Identity lookup across the whole registry, published or not: a withheld index
 * still has a name, a route, and a detail model built from them.
 */
export function catalogEntry(symbol: string): MarketCatalogEntry {
  const match = ALL_MARKETS.find((candidate) => candidate.symbol === symbol);
  if (!match) throw new Error(`Unknown market symbol: ${symbol}`);
  return match;
}

/**
 * Case-insensitive match over the published catalog: anywhere in the symbol, or
 * at a word boundary in the name so "ai" finds the AI indices without matching
 * "Urdais". An empty query returns every published index.
 */
export function searchMarketCatalog(query: string): MarketCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return MARKET_CATALOG;
  return MARKET_CATALOG.filter(
    (market) =>
      market.symbol.toLowerCase().includes(needle) || ` ${market.name.toLowerCase()}`.includes(` ${needle}`),
  );
}
