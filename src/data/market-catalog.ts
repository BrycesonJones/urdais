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

/**
 * Indices whose research is complete but whose production is deferred, so they exist in the
 * registry without being presented to readers as a current Urdais product.
 *
 * UPPI is here because the Photonics close-out (`docs/research/photonics/ph-3-closeout.md`)
 * concluded DEFERRED_PENDING_DATA_RIGHTS: the research located pricing sources at usable grain
 * and settled a methodology, but every source that carries the data prohibits, or has not
 * granted, the right to publish something derived from it. Until one of that document's
 * reopening triggers fires there is no Urdais photonics price, and a demo product standing
 * beside the indices that do publish lends them its uncertainty rather than borrowing theirs.
 *
 * The entry itself is deliberately left in `MARKET_CATALOG` below. Deleting it would take the
 * canonical identifier, name and route with it, and the distinction this set exists to draw is
 * that an index can exist without being publicly presented. Anything user-facing reads
 * `PUBLIC_MARKET_CATALOG` or asks `isPubliclyListed`; anything resolving an identity — the demo
 * dataset, internal tooling — keeps reading `MARKET_CATALOG` and `catalogEntry` unchanged.
 */
export const DEFERRED_MARKET_SYMBOLS: ReadonlySet<string> = new Set(["UPPI"]);

/** Whether an index is presented to readers as a current Urdais product. */
export function isPubliclyListed(symbol: string): boolean {
  return !DEFERRED_MARKET_SYMBOLS.has(symbol);
}

/** Every routed market in display order, deferred ones included; the first is the default for /markets. */
export const MARKET_CATALOG: MarketCatalogEntry[] = [
  entry("UCPI", "Urdais Compute Price Index"),
  entry("UGAI", "Urdais Global AI Index"),
  entry("UAVI", "Urdais AI Volatility Index"),
  entry("UMPI", "Urdais Memory Price Index", {
    // Taken from the approved methodology, /docs/methodology/umpi-kr-dram. UMPI V1 is two
    // monthly series and has no composite level, so the description says "indicators" rather
    // than naming a single number the product does not publish.
    description: "Two monthly DRAM pricing indicators built from Korean official statistics: the Bank of Korea's producer price index for DRAM, and a Urdais export unit-value index from Korea Customs trade data.",
    question: "What is happening to DRAM prices?",
  }),
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

/** The markets a reader is shown, in display order. Deferred indices are absent. */
export const PUBLIC_MARKET_CATALOG: MarketCatalogEntry[] = MARKET_CATALOG.filter((market) =>
  isPubliclyListed(market.symbol),
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
    name: "Compute Economics",
    description: "Current observed rental pricing and modeled hardware payback",
    href: COMPUTE_ANALYTICS_HREF,
    keywords: [
      "compute analytics",
      "compute economics",
      "compute",
      "gpu",
      "gpus",
      "gpu economics",
      "utilization",
      "scenario utilization",
      "payback",
      "payback period",
      "hardware economics",
      "hardware",
      "gpu rental",
      "rental economics",
      "accelerator economics",
      "capex",
      "roi",
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
  // Search is a reader-facing surface, so it searches what a reader can open. A deferred index
  // is not findable by symbol or by name; `catalogEntry` still resolves it for internal callers.
  if (!needle) return PUBLIC_MARKET_CATALOG;
  return PUBLIC_MARKET_CATALOG.filter(
    (market) =>
      market.symbol.toLowerCase().includes(needle) || ` ${market.name.toLowerCase()}`.includes(` ${needle}`),
  );
}
