/**
 * Lightweight registry of the first-class Urdais markets: symbol, name, and
 * canonical route. This is the only market data the header search needs, so
 * navigation UI can import it without pulling in the generated histories.
 * The detail dataset takes its market identities from here as well, so names
 * and routes are defined once.
 */

import {
  COMPUTE_ANALYTICS_HREF,
  marketIndexHref,
  MODEL_ECONOMICS_HREF,
  POWER_ANALYTICS_HREF,
  UTVI_HREF,
} from "@/lib/routes";

export type MarketCatalogEntry = {
  symbol: string;
  name: string;
  /**
   * Where this index lives. Defaults to its own `/markets/{symbol}` page, which is where most
   * of them live, and an entry may name somewhere else instead.
   *
   * Being publicly presented as an index and having a standalone market page are two different
   * facts. UTVI is the case: it is a first-class Urdais index, and its canonical presentation --
   * chart, universe, settlement state, methodology -- is the Volume section of Model Economics.
   * A `/markets/utvi` page could only duplicate that. So the catalog carries the destination and
   * every discovery surface follows it, rather than each one rebuilding `/markets/{symbol}` from
   * the symbol and then needing an exception for the index that does not live there.
   */
  href: string;
  /** One-sentence definition shown on the detail page, where the product has settled one. */
  description?: string;
  /** The question the index answers, shown as its subtitle. */
  question?: string;
  /**
   * Whether the index is presented as a product on the public frontend.
   *
   * Existing in Urdais and being presented as a product are two different facts, and this
   * field is the only place the second one is recorded. An index that is not publicly
   * presented keeps everything else it has -- its identity here, its backend, its datasets,
   * its methodology documents, its API routes -- and simply does not appear in the public
   * catalog: no rail row, no search result, no comparison option, and no detail page.
   *
   * Set this to `false` rather than deleting the entry. Deleting it would take the index's
   * name and route with it, which is how hiding a product turns into losing it.
   */
  publiclyPresented: boolean;
};

function entry(
  symbol: string,
  name: string,
  detail?: Partial<Pick<MarketCatalogEntry, "description" | "question" | "publiclyPresented" | "href">>,
): MarketCatalogEntry {
  return { symbol, name, href: marketIndexHref(symbol), publiclyPresented: true, ...detail };
}

/** The single canonical index for advanced AI accelerator hardware: the capital-asset layer, distinct from UCPI's usage pricing. */
export const CHIP_ACCELERATOR_INDEX = {
  symbol: "UACI",
  name: "Urdais Chip & Accelerator Index",
  description: "Tracks normalized market pricing for leading AI accelerators, weighted by representative compute capability and market relevance.",
  question: "What does advanced compute hardware cost?",
} as const;

/** Every routed market in display order, withheld ones included; the first is the default for /markets. */
export const MARKET_CATALOG: MarketCatalogEntry[] = [
  entry("UCPI", "Urdais Compute Price Index"),
  // UTVI has no market route of its own: its canonical presentation is the Volume section of
  // Model Economics, and `UTVI_HREF` deep-links to it. The entry exists so the index is
  // discoverable -- rail, search -- without a second implementation of the chart, the universe
  // statement and the methodology that page already carries. Listed here, directly after UCPI,
  // because catalog order is the product's order and UCPI owns the panel above the rail.
  entry("UTVI", "Observed Token Volume Index", {
    description:
      "Observed model token consumption per day, as the approved source's dataset exposes it.",
    question: "How much model consumption is actually happening?",
    href: UTVI_HREF,
  }),
  // UGAI and UAVI are not productized: neither has ever published an observation, and each is
  // blocked on data rights Urdais does not hold. They stay in the catalog so their identity and
  // route survive, and are withheld from every public surface.
  entry("UGAI", "Urdais Global AI Index", { publiclyPresented: false }),
  entry("UAVI", "Urdais AI Volatility Index", { publiclyPresented: false }),
  entry("UMPI", "Urdais Memory Price Index", {
    // Taken from the approved methodology, /docs/methodology/umpi-kr-dram. UMPI V1 is two
    // monthly series and has no composite level, so the description says "indicators" rather
    // than naming a single number the product does not publish.
    description: "Two monthly DRAM pricing indicators built from Korean official statistics: the Bank of Korea's producer price index for DRAM, and a Urdais export unit-value index from Korea Customs trade data.",
    question: "What is happening to DRAM prices?",
  }),
  // UPPI's production is deferred, not cancelled: the Photonics close-out
  // (`docs/research/photonics/ph-3-closeout.md`) concluded DEFERRED_PENDING_DATA_RIGHTS. The
  // research located pricing sources at usable grain and settled a methodology, but every source
  // that carries the data prohibits, or has not granted, the right to publish anything derived
  // from it. Until one of that document's reopening triggers fires there is no Urdais photonics
  // price, and a demo product standing beside the indices that do publish lends them its
  // uncertainty rather than borrowing theirs. The entry, market definition, families, instruments
  // and illustrative series are all untouched.
  entry("UPPI", "Urdais Photonics Price Index", { publiclyPresented: false }),
  entry("UEPI", "Urdais Energy & Power Index"),
  // UACI is not productized either: everything it has ever shown is a demo walk, and no
  // methodology-backed accelerator pricing exists behind it yet.
  entry(CHIP_ACCELERATOR_INDEX.symbol, CHIP_ACCELERATOR_INDEX.name, {
    description: CHIP_ACCELERATOR_INDEX.description,
    question: CHIP_ACCELERATOR_INDEX.question,
    publiclyPresented: false,
  }),
  entry("UBWI", "Urdais Bitcoin Wealth Index", {
    // Unit and definition are taken verbatim from the approved methodology draft,
    // /docs/methodology/ubwi. UBWI is a percentage, not an index level: it has no
    // base date, no base value, and is never expressed in points.
    description: "Bitcoin market capitalization as a percentage of Total Global Wealth, measured as consolidated world net worth on the national-accounts identity and excluding human capital.",
    question: "What share of all presently existing global wealth is represented by Bitcoin?",
  }),
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
      // "utvi" is deliberately not a keyword here. The ticker now resolves to UTVI's own catalog
      // entry, which deep-links to the Volume section; leaving it on the page entry too would
      // put the page -- which sorts above indices, and is what Enter selects -- ahead of the
      // index for its own ticker, landing a reader at the top of the page instead. The page
      // still answers every subject term it covers, "token volume" among them.
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

/**
 * The subset of the catalog that is presented as a product on the public frontend.
 *
 * Every public surface -- the homepage index rail, the header search, the cross-index
 * comparison menus, the `/markets/[symbol]` detail routes -- reads this list, never
 * `MARKET_CATALOG`. Code that needs an index's identity regardless of whether it is on sale
 * (the detail dataset, read models, anything server-side) keeps using `catalogEntry`.
 */
export const PUBLIC_MARKET_CATALOG: MarketCatalogEntry[] = MARKET_CATALOG.filter(
  (market) => market.publiclyPresented,
);

/**
 * Whether an index is presented to readers as a current Urdais product.
 *
 * The answer comes from the entry's own `publiclyPresented`, so this helper and
 * `PUBLIC_MARKET_CATALOG` cannot disagree: there is one publication state per market and no
 * second list of withheld symbols to keep in step with it.
 *
 * Case-insensitive, like the routes, so a raw `/markets/:symbol` param can be asked directly.
 */
export function isPubliclyListed(symbol: string): boolean {
  const wanted = symbol.trim().toLowerCase();
  return PUBLIC_MARKET_CATALOG.some((market) => market.symbol.toLowerCase() === wanted);
}

/**
 * Where a symbol's index lives, for callers that hold a symbol rather than an entry.
 *
 * Falls back to `/markets/{symbol}` for a symbol the catalog does not know, which keeps a row
 * built outside the catalog linking exactly where it used to.
 */
export function marketHref(symbol: string): string {
  const wanted = symbol.trim().toLowerCase();
  return (
    MARKET_CATALOG.find((market) => market.symbol.toLowerCase() === wanted)?.href ??
    marketIndexHref(symbol)
  );
}

/** Identity lookup across the whole catalog, presented publicly or not. */
export function catalogEntry(symbol: string): MarketCatalogEntry {
  const match = MARKET_CATALOG.find((candidate) => candidate.symbol === symbol);
  if (!match) throw new Error(`Unknown market symbol: ${symbol}`);
  return match;
}

/**
 * Case-insensitive match: anywhere in the symbol, or at a word boundary in
 * the name so "ai" finds the AI indices without matching "Urdais". An empty
 * query returns everything.
 *
 * Search is a reader-facing surface, so it searches what a reader can open: an index Urdais
 * does not present as a product is not findable by typing its symbol.
 */
export function searchMarketCatalog(query: string): MarketCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  // A withheld index is not findable by symbol or by name; `catalogEntry` still resolves it
  // for internal callers.
  if (!needle) return PUBLIC_MARKET_CATALOG;
  return PUBLIC_MARKET_CATALOG.filter(
    (market) =>
      market.symbol.toLowerCase().includes(needle) || ` ${market.name.toLowerCase()}`.includes(` ${needle}`),
  );
}
