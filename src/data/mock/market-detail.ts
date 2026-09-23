/**
 * Deterministic market detail data: the eight routed Urdais markets, their
 * instrument families, and long mock histories for the detail chart.
 *
 * Everything is generated from fixed seeds anchored at MOCK_AS_OF, so values
 * are identical on every render and on both server and client. UCPI-H100 SXM
 * uses the same generator config as the homepage UCPI panel with a longer
 * history, so the two surfaces show the same series and headline numbers.
 * The other index snapshots on the homepage are derived from this module.
 *
 * Histories are demo shapes only: chronological, positive, and plausible,
 * not economic forecasts. Replace at the data boundary when the API lands.
 */

import { catalogEntry, PUBLIC_MARKET_CATALOG } from "@/data/market-catalog";
import { buildDailySeries, buildIntradaySeries } from "@/data/mock/series-generator";
import type { DailySeriesConfig, IntradaySeriesConfig } from "@/data/mock/series-generator";
import { MOCK_AS_OF, UCPI_DAILY_CONFIG, UCPI_INDEX, UCPI_INTRADAY_CONFIG } from "@/data/mock/ucpi";
import { availableRanges } from "@/lib/market-ranges";
import { COMPUTE_ANALYTICS_HREF, MODEL_ECONOMICS_HREF, POWER_ANALYTICS_HREF } from "@/lib/routes";
import type {
  ComparisonOption,
  MarketDetail,
  MarketFamily,
  MarketIndex,
  MarketInstrumentDetail,
  MarketSnapshot,
} from "@/types/market";

/** About twelve years of daily closes: far more than any selectable range needs. */
const LONG_HISTORY_DAYS = 4400;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

type InstrumentSpec = MarketIndex & {
  id: string;
  shortLabel: string;
  benchmarkCode?: string;
  bandwidthGbps?: number;
  regionLabel?: string;
  daily: DailySeriesConfig;
  intraday: IntradaySeriesConfig;
};

function buildInstrument(spec: InstrumentSpec, comparisons: ComparisonOption[]): MarketInstrumentDetail {
  const daily = buildDailySeries(spec.daily);
  const intraday = buildIntradaySeries(daily, spec.intraday);
  const latest = daily[daily.length - 1]!;
  const previous = daily[daily.length - 2]!;
  const snapshot: MarketSnapshot = {
    value: latest.value,
    changePercent: round(((latest.value - previous.value) / previous.value) * 100),
    asOf: latest.time,
  };
  const series = { daily, intraday };
  return {
    id: spec.id,
    shortLabel: spec.shortLabel,
    ...(spec.benchmarkCode !== undefined ? { benchmarkCode: spec.benchmarkCode } : {}),
    ...(spec.bandwidthGbps !== undefined ? { bandwidthGbps: spec.bandwidthGbps } : {}),
    ...(spec.regionLabel !== undefined ? { regionLabel: spec.regionLabel } : {}),
    symbol: spec.symbol,
    name: spec.name,
    unit: spec.unit,
    // Every instrument built here is a seeded walk. Stating it keeps the surfaces off the
    // old inference -- "no token identity, therefore demo" -- which was true only by
    // accident and had already mislabelled the live listed-GPU children once. Production
    // instruments arrive by hydration and overwrite this with "production".
    provenance: "demo",
    snapshot,
    series,
    availableRanges: availableRanges(series, snapshot.asOf),
    comparisons,
  };
}

/* ---------- UCPI: compute benchmarks ---------- */

const COMPUTE_UNIT = UCPI_INDEX.unit;

function computeSpec(
  gpu: string,
  slug: string,
  daily: Omit<DailySeriesConfig, "asOf">,
  intraday: IntradaySeriesConfig,
  benchmarkCode?: string,
): InstrumentSpec {
  return {
    id: `ucpi-${slug}`,
    shortLabel: gpu,
    // The instrument's own identity; the index prefix is added only for the headline at display time.
    symbol: gpu,
    ...(benchmarkCode ? { benchmarkCode } : {}),
    name: `${UCPI_INDEX.name} · ${gpu} benchmark`,
    unit: COMPUTE_UNIT,
    daily: { ...daily, asOf: MOCK_AS_OF },
    intraday,
  };
}

/** Selector order is intentional; it is not sorted. */
const COMPUTE_SPECS: InstrumentSpec[] = [
  // Headline benchmark: reads as UCPI-H100 on the UCPI page.
  computeSpec(
    "H100 SXM",
    "h100-sxm",
    { ...UCPI_DAILY_CONFIG, points: LONG_HISTORY_DAYS },
    UCPI_INTRADAY_CONFIG,
    "H100",
  ),
  // Roughly three years of history.
  computeSpec(
    "H200",
    "h200",
    { seed: 20240115, latestValue: 3.18, latestDailyReturn: 0.0121, points: 1100, volatility: 0.013, drift: -0.0005 },
    { seed: 2_200_000, days: 7, volatility: 0.007 },
  ),
  // About five years of history for an older, cheaper part.
  computeSpec(
    "A100 SXM4",
    "a100-sxm4",
    { seed: 20210520, latestValue: 1.34, latestDailyReturn: -0.0037, points: 1830, volatility: 0.011, drift: -0.0007 },
    { seed: 7_700_000, days: 7, volatility: 0.006 },
  ),
  // A consumer card with a short, choppy history.
  computeSpec(
    "RTX 5090",
    "rtx-5090",
    { seed: 20250130, latestValue: 0.71, latestDailyReturn: 0.0143, points: 580, volatility: 0.016, drift: -0.0004 },
    { seed: 8_800_000, days: 7, volatility: 0.009 },
  ),
  // About eighteen months of history.
  computeSpec(
    "B200",
    "b200",
    { seed: 20250301, latestValue: 4.62, latestDailyReturn: -0.0084, points: 540, volatility: 0.011, drift: -0.0006 },
    { seed: 3_300_000, days: 7, volatility: 0.008 },
  ),
];

/** Instruments in one family share a unit, so each may be compared with the others on absolute values. */
function buildFamilyInstruments(specs: InstrumentSpec[]): MarketInstrumentDetail[] {
  return specs.map((spec) =>
    buildInstrument(
      spec,
      specs
        .filter((other) => other.id !== spec.id)
        .map((other) => ({ instrumentId: other.id, label: other.shortLabel, basis: "absolute" as const })),
    ),
  );
}

/* ---------- UCPI: token pricing ---------- */

/**
 * The Tokens family is a taxonomy slot on UCPI. Instruments come from the
 * canonical token-price read model at the page boundary
 * (`hydrateMarketWithTokenPrices`). This module does not seed demo prices.
 */
const UCPI_MARKET: MarketDetail = {
  ...UCPI_INDEX,
  defaultInstrumentId: "ucpi-h100-sxm",
  families: [
    {
      id: "compute",
      label: "Compute",
      instruments: buildFamilyInstruments(COMPUTE_SPECS),
      defaultInstrumentId: "ucpi-h100-sxm",
      explore: { label: "Explore Compute Economics", href: COMPUTE_ANALYTICS_HREF },
    },
    {
      id: "tokens",
      label: "Tokens",
      instruments: [],
      defaultInstrumentId: "",
      explore: { label: "Explore Model Economics", href: MODEL_ECONOMICS_HREF },
    },
  ],
};

/* ---------- UMPI: memory families ---------- */

/**
 * UMPI carries **no demo series and no demo level**.
 *
 * It previously carried nine seeded random walks across two invented instrument families --
 * DRAM priced in `$/part` with a DDR5 16Gb flagship at 5.20, HBM priced in `$/GB` with HBM3E at
 * 8.42 -- each with years of daily history and a headline "today" change. Nothing behind any of
 * it was ever collected: no source was read, and no such instrument is priced by anything Urdais
 * holds rights to. The nine were removed rather than relabelled, for the reason UAVI's walk was:
 * a plausible chip price is indistinguishable from a real one, and a reader has no way to notice.
 *
 * What replaces them is not a redesign of the same idea. UMPI V1 is two *monthly* official-data
 * index series -- the Bank of Korea's DRAM producer price index and a Urdais export unit-value
 * index from Korea Customs -- in index points, with no composite level between them. None of the
 * six deferred spot chip instruments survives into it, and their identifiers are not reused. The
 * deferred spot specification is retained at /docs/methodology/umpi; it is not reachable from any
 * production surface.
 *
 * So the market carries an empty family and /markets/UMPI renders its own surface from published
 * observations. See src/components/umpi/umpi-section.tsx.
 */
const UMPI_MARKET: MarketDetail = {
  ...catalogEntry("UMPI"),
  // Index points, not a currency. The old `$/GB` here was the HBM walk's unit.
  unit: "pts",
  defaultInstrumentId: "umpi",
  families: [{ id: "index", label: "Index", instruments: [], defaultInstrumentId: "umpi" }],
};

/* ---------- UPPI: pluggable optics ---------- */

/**
 * UPPI, the Urdais Photonics Price Index, asks what moving information with
 * optical infrastructure costs. Its first family is pluggable optical
 * transceivers, one benchmark instrument per bandwidth generation, priced
 * in $/transceiver. Each instrument records its nominal bandwidth so a
 * normalised $/Gbps (price ÷ bandwidthGbps), the cost of moving a unit of
 * information and the meaningful cross-generation comparison, can be
 * derived later; only the raw price is shown for now.
 *
 * 800G is the current UPPI headline benchmark because it is a
 * representative high-bandwidth optical interconnect generation for modern
 * AI and data-centre networking. The benchmark is metadata (the market's
 * default instrument) and may later move to 1.6T or another generation.
 * Generations are not yet subdivided by reach or standard (DR8, FR4, …).
 *
 * A future family structure may become Pluggable Optics plus Optical
 * Engines / CPO, at which point the generic family switch appears; with one
 * family it stays hidden.
 */
const UPPI_IDENTITY = catalogEntry("UPPI");
const OPTICS_UNIT = "$/transceiver";

function opticsSpec(
  generation: string,
  slug: string,
  bandwidthGbps: number,
  daily: Omit<DailySeriesConfig, "asOf">,
  intraday: IntradaySeriesConfig,
): InstrumentSpec {
  return {
    id: `optics-${slug}`,
    shortLabel: `${generation} Optical Transceiver`,
    symbol: generation,
    name: `${UPPI_IDENTITY.name} · ${generation} optical transceiver benchmark`,
    unit: OPTICS_UNIT,
    bandwidthGbps,
    daily: { ...daily, asOf: MOCK_AS_OF },
    intraday,
  };
}

/** Product order: the flagship first, then by market relevance, not by nominal bandwidth. */
const OPTICS_SPECS: InstrumentSpec[] = [
  // Current flagship: active, moderately volatile, gradual cost compression.
  opticsSpec("800G", "800g", 800,
    { seed: 20230815, latestValue: 928.4, latestDailyReturn: -0.0112, points: 1100, volatility: 0.012, drift: -0.0005 },
    { seed: 8_010_000, days: 7, volatility: 0.005 }),
  // Mature: lower price, steady commoditisation.
  opticsSpec("400G", "400g", 400,
    { seed: 20200610, latestValue: 412.5, latestDailyReturn: -0.0034, points: 2200, volatility: 0.008, drift: -0.0006 },
    { seed: 8_020_000, days: 7, volatility: 0.003 }),
  // Newest and premium: highest price, shortest history, most volatile.
  opticsSpec("1.6T", "1-6t", 1600,
    { seed: 20251020, latestValue: 2140.0, latestDailyReturn: 0.0187, points: 300, volatility: 0.02, drift: -0.0009 },
    { seed: 8_030_000, days: 7, volatility: 0.008 }),
  // Legacy transition: lower price, calmer.
  opticsSpec("200G", "200g", 200,
    { seed: 20180305, latestValue: 236.8, latestDailyReturn: 0.0021, points: 2600, volatility: 0.007, drift: -0.0004 },
    { seed: 8_040_000, days: 7, volatility: 0.003 }),
  // Legacy: lowest price, structurally mature.
  opticsSpec("100G", "100g", 100,
    { seed: 20140922, latestValue: 98.6, latestDailyReturn: -0.0048, points: LONG_HISTORY_DAYS, volatility: 0.006, drift: -0.0003 },
    { seed: 8_050_000, days: 7, volatility: 0.002 }),
];

const UPPI_MARKET: MarketDetail = {
  ...UPPI_IDENTITY,
  unit: OPTICS_UNIT,
  defaultInstrumentId: "optics-800g",
  families: [
    {
      id: "pluggable-optics",
      label: "Pluggable Optics",
      instruments: buildFamilyInstruments(OPTICS_SPECS),
      defaultInstrumentId: "optics-800g",
    },
  ],
};

/* ---------- UEPI: wholesale power ---------- */

/**
 * UEPI, the Urdais Energy & Power Index, asks what powering Information
 * Age infrastructure costs. Its first family is Wholesale Power: a
 * generalised daily wholesale electricity-price benchmark for each
 * organised U.S. market, in $/MWh. The family is market-entity-first (ERCOT,
 * PJM, …), with geography kept as instrument metadata, because wholesale
 * power is priced by the market operator. A future Data Center Power
 * family will be geography-first instead (Northern Virginia, Georgia,
 * Texas, …): the price ultimately faced by compute operators, including
 * delivered-power economics, with utilities such as Georgia Power modelled
 * as provider/source metadata beneath a geography rather than as wholesale
 * peers. The two must not be conflated; a vertically integrated utility is
 * not an ISO/RTO peer, so it never appears in this family.
 *
 * ERCOT is the current UEPI headline benchmark because Urdais emphasises
 * the emerging Information Age power economy: large compute/data-centre
 * loads, grid constraints, storage, flexible demand, and rapid power-market
 * change converge particularly strongly in Texas. The benchmark is metadata
 * (the market's default instrument) and may change as the Information Age
 * power market evolves; the other markets are plain instruments in the family.
 *
 * The exact hub, zone, and product (day-ahead, real-time, congestion) each
 * benchmark represents is provisional and belongs to the data phase; the
 * labels deliberately name only the market. Real wholesale observations
 * can be negative, so series values are signed; these demo histories stay
 * positive. When a second family arrives the generic family switch appears.
 */
const UEPI_IDENTITY = catalogEntry("UEPI");
const POWER_UNIT = "$/MWh";

function powerSpec(
  market: string,
  slug: string,
  regionLabel: string,
  daily: Omit<DailySeriesConfig, "asOf">,
  intraday: IntradaySeriesConfig,
): InstrumentSpec {
  return {
    id: `power-${slug}`,
    shortLabel: market,
    symbol: market,
    name: `${UEPI_IDENTITY.name} · ${market} wholesale power benchmark`,
    unit: POWER_UNIT,
    regionLabel,
    daily: { ...daily, asOf: MOCK_AS_OF },
    intraday,
  };
}

/** Flagship first, then by market relevance. Seasonal peaks are day-of-year: mid-summer or mid-winter. */
const POWER_SPECS: InstrumentSpec[] = [
  // Flagship. Most volatile: abrupt weather- and constraint-driven moves with a hard summer peak.
  powerSpec("ERCOT", "ercot", "Texas",
    { seed: 20190102, latestValue: 36.4, latestDailyReturn: -0.0421, points: 2600, volatility: 0.075, drift: 0.0001, meanReversion: { level: 35, strength: 0.03 }, seasonality: { amplitude: 0.2, peakDayOfYear: 217 } },
    { seed: 8_120_000, days: 7, volatility: 0.025 }),
  // Seasonal with a summer peak, moderate/high volatility, reverting to a level.
  powerSpec("PJM", "pjm", "Mid-Atlantic / Midwest",
    { seed: 20190101, latestValue: 41.82, latestDailyReturn: 0.0314, points: 2600, volatility: 0.045, drift: 0.0001, meanReversion: { level: 40, strength: 0.03 }, seasonality: { amplitude: 0.12, peakDayOfYear: 201 } },
    { seed: 8_110_000, days: 7, volatility: 0.015 }),
  // Later summer cycle, moderate volatility, higher level.
  powerSpec("CAISO", "caiso", "California",
    { seed: 20190103, latestValue: 48.75, latestDailyReturn: 0.0088, points: 2600, volatility: 0.04, drift: 0.0002, meanReversion: { level: 47, strength: 0.025 }, seasonality: { amplitude: 0.14, peakDayOfYear: 237 } },
    { seed: 8_130_000, days: 7, volatility: 0.012 }),
  // Central: moderate volatility, milder summer cycle.
  powerSpec("MISO", "miso", "Midwest / South",
    { seed: 20190104, latestValue: 34.2, latestDailyReturn: 0.0157, points: 2600, volatility: 0.04, drift: 0.0001, meanReversion: { level: 33, strength: 0.03 }, seasonality: { amplitude: 0.1, peakDayOfYear: 196 } },
    { seed: 8_140_000, days: 7, volatility: 0.012 }),
  // Winter-sensitive: peak in January, moderate/high volatility.
  powerSpec("ISO-NE", "iso-ne", "New England",
    { seed: 20190105, latestValue: 52.3, latestDailyReturn: -0.0126, points: 2600, volatility: 0.05, drift: 0.0002, meanReversion: { level: 50, strength: 0.03 }, seasonality: { amplitude: 0.2, peakDayOfYear: 20 } },
    { seed: 8_150_000, days: 7, volatility: 0.015 }),
  powerSpec("NYISO", "nyiso", "New York",
    { seed: 20190106, latestValue: 47.9, latestDailyReturn: 0.0203, points: 2600, volatility: 0.048, drift: 0.0002, meanReversion: { level: 46, strength: 0.03 }, seasonality: { amplitude: 0.17, peakDayOfYear: 25 } },
    { seed: 8_160_000, days: 7, volatility: 0.015 }),
  // Central: lowest level, its own late-summer cycle.
  powerSpec("SPP", "spp", "Central U.S.",
    { seed: 20190107, latestValue: 30.15, latestDailyReturn: 0.0064, points: 2600, volatility: 0.042, drift: 0.0001, meanReversion: { level: 29, strength: 0.03 }, seasonality: { amplitude: 0.11, peakDayOfYear: 211 } },
    { seed: 8_170_000, days: 7, volatility: 0.013 }),
];

const UEPI_MARKET: MarketDetail = {
  ...UEPI_IDENTITY,
  unit: POWER_UNIT,
  defaultInstrumentId: "power-ercot",
  families: [
    {
      id: "wholesale-power",
      label: "Wholesale Power",
      instruments: buildFamilyInstruments(POWER_SPECS),
      defaultInstrumentId: "power-ercot",
      explore: { label: "Explore Power Analytics", href: POWER_ANALYTICS_HREF },
    },
  ],
};

/*
 * The compute hardware stack is modelled as two deliberately separate indices:
 *
 *   UACI  the capital asset: what advanced compute hardware costs
 *     ↓
 *   UCPI  the service: what using compute capacity costs per GPU-hour
 *
 * Each answers a different question, so they are never merged.
 */

/* ---------- Standalone indices ---------- */

/** Routed markets with instrument families; each names its own headline benchmark. */
const FAMILY_MARKETS: MarketDetail[] = [UCPI_MARKET, UMPI_MARKET, UPPI_MARKET, UEPI_MARKET];

/** The instrument that stands for a market used as a comparison: its headline benchmark, or the index itself. */
function headlineInstrumentId(symbol: string): string {
  return FAMILY_MARKETS.find((market) => market.symbol === symbol)?.defaultInstrumentId ?? symbol.toLowerCase();
}

/**
 * An index compares with every other routed market's headline instrument.
 * Their units and scales differ, so the comparison is relative: both series
 * are rebased to percentage change over the selected range.
 */
/**
 * Markets that publish no series, and so cannot be charted against another one. Offering
 * a comparison that resolves to no instrument would put a dead option in the menu.
 *
 * UGAI is here because it has never published an observation. Comparing a real series against
 * it would mean comparing against synthetic points, which is the reason its generated market was
 * removed rather than relabelled. It becomes comparable when it has observations to compare.
 *
 * UAVI joins them for the same reason, and would be the worst of the three to offer: a comparison
 * against a fabricated volatility series is a comparison a reader has no way to sanity-check.
 *
 * UMPI is here for a different reason: it publishes real series, but not through this model. It
 * has two of them and no composite, so there is no single UMPI instrument for a comparison to
 * resolve to -- and picking either series as the family's headline would manufacture exactly the
 * composite the methodology refuses. It is comparable when something is built that can compare
 * two monthly index series honestly.
 *
 * UTVI is here for UMPI's reason rather than UGAI's: it publishes a real daily series, and it
 * publishes it through the production read model the Model Economics Volume section renders,
 * not through this dataset. There is no `utvi` instrument for a comparison to resolve to, so
 * offering the option would put a dead entry in the menu -- the exact failure this set exists
 * to prevent.
 */
const MARKETS_WITHOUT_SERIES = new Set(["UBWI", "UGAI", "UAVI", "UMPI", "UTVI"]);

/**
 * The comparison menu is a public discovery surface -- an index named there is an index a reader
 * can find -- so it is built from the public catalog, not the whole one. A reader who found a
 * withheld index here could not then open it.
 */
function indexComparisons(symbol: string): ComparisonOption[] {
  return PUBLIC_MARKET_CATALOG.filter(
    (market) => market.symbol !== symbol && !MARKETS_WITHOUT_SERIES.has(market.symbol),
  ).map((market) => ({
    instrumentId: headlineInstrumentId(market.symbol),
    label: market.symbol,
    basis: "relative" as const,
  }));
}

/** An index market is a single-instrument family compared against the other indices. */
function buildIndexMarket(
  symbol: string,
  unit: string,
  daily: Omit<DailySeriesConfig, "asOf">,
  intraday: IntradaySeriesConfig,
): MarketDetail {
  const identity = catalogEntry(symbol);
  const spec: InstrumentSpec = {
    id: symbol.toLowerCase(),
    shortLabel: symbol,
    symbol,
    name: identity.name,
    unit,
    daily: { ...daily, asOf: MOCK_AS_OF },
    intraday,
  };
  const instrument = buildInstrument(spec, indexComparisons(symbol));
  const family: MarketFamily = { id: "index", label: "Index", instruments: [instrument], defaultInstrumentId: instrument.id };
  return {
    symbol: spec.symbol,
    name: spec.name,
    unit: spec.unit,
    ...(identity.description ? { description: identity.description } : {}),
    ...(identity.question ? { question: identity.question } : {}),
    defaultInstrumentId: instrument.id,
    families: [family],
  };
}

// UGAI has no mock market and must not acquire one. It has never published an observation, so
// every quantity a generated market carries -- a level, a daily return, a year of history -- would
// be an invention, and the one it carried was worse than arbitrary: 184.21 on a base of 1,000.
// /markets/UGAI renders its own surface from canonical published observations, or says plainly
// that none exist. See src/components/ugai/ugai-section.tsx.

/**
 * UAVI carries **no demo series and no demo level**.
 *
 * It previously carried a seeded mean-reverting walk around 30 points, presented as "27.84 pts"
 * with a year of history, honest about being a demo in a comment and dishonest about it on the
 * page. On a volatility index that placeholder is more misleading than most: a reader has no
 * external anchor for what AI-equity implied volatility should be, so a plausible figure is
 * indistinguishable from a real one, and a year of plausible history invites precisely the
 * question it cannot answer — is today's reading high?
 *
 * Nothing replaces it, because nothing real exists yet. Per /docs/methodology/uavi the index
 * requires a production parent weight vector and licensed US option quotes, and neither is in
 * place: the parent snapshot is blocked with zero weightable issuers, and Urdais holds no options
 * data agreement. UAVI's history begins at its first live observation, so the market carries an
 * empty family and /markets/UAVI renders its own surface — the level where one is published, and
 * plainly why there is none otherwise. See src/components/uavi/uavi-section.tsx.
 */
const UAVI_MARKET: MarketDetail = {
  symbol: "UAVI",
  name: catalogEntry("UAVI").name,
  unit: "pts",
  defaultInstrumentId: "uavi",
  families: [{ id: "index", label: "Index", instruments: [], defaultInstrumentId: "uavi" }],
};

/**
 * UACI, the Urdais Chip & Accelerator Index, is the single canonical index
 * for advanced AI accelerator hardware: normalized market pricing for
 * leading accelerators, weighted by representative compute capability and
 * market relevance. Representative constituents are accelerator-class parts
 * such as NVIDIA H100, H200, and B200 / GB200-class, and AMD MI300X; the
 * final basket and weights are not settled, and CPUs, DRAM, NAND,
 * networking, and photonics are not constituents (they have their own
 * markets). The aggregate is quoted in points. This is a placeholder demo
 * walk that methodology-backed data replaces; it is not a blend of the two
 * former chip and accelerator series.
 */
const UACI_MARKET = buildIndexMarket(
  "UACI",
  "pts",
  { seed: 20190619, latestValue: 203.75, latestDailyReturn: -0.0194, points: LONG_HISTORY_DAYS, volatility: 0.022, drift: 0.0006 },
  { seed: 7_400_000, days: 7, volatility: 0.011 },
);

/**
 * UBWI carries **no demo series and no demo level**.
 *
 * It is a percentage of Total Global Wealth, not an index level: per
 * /docs/methodology/ubwi it has no base date, no base value, and is bounded in
 * [0, 100] because Bitcoin sits inside its own denominator. It previously
 * carried a synthetic daily walk anchored at 0.85 %, which was honest about
 * being a demo in a comment and dishonest about it on the page.
 *
 * Nothing replaces it, because there is nothing real to put there yet: the
 * production methodology is approved, the calculation runs, and the publication
 * gate refuses the current denominator on its modelled-share ceiling. UBWI
 * history begins at the first verified production observation, so the market
 * carries an empty family and the page renders the withheld state with its
 * disclosure instead of a number. See src/lib/ubwi/read/surface.ts.
 */
const UBWI_MARKET: MarketDetail = {
  symbol: "UBWI",
  name: catalogEntry("UBWI").name,
  unit: "%",
  description: catalogEntry("UBWI").description,
  question: catalogEntry("UBWI").question,
  defaultInstrumentId: "ubwi",
  families: [{ id: "index", label: "Index", instruments: [], defaultInstrumentId: "ubwi" }],
};

/* ---------- Lookup ---------- */

/** Routed markets in display order; the first is the default for /markets. */
export const MARKETS: MarketDetail[] = [
  UCPI_MARKET,
  UAVI_MARKET,
  UMPI_MARKET,
  UPPI_MARKET,
  UEPI_MARKET,
  UACI_MARKET,
  UBWI_MARKET,
];

export const DEFAULT_MARKET_SYMBOL = UCPI_MARKET.symbol;

/** Case-insensitive lookup by route symbol, e.g. "ucpi". */
export function findMarket(symbol: string): MarketDetail | undefined {
  const wanted = symbol.toLowerCase();
  return MARKETS.find((market) => market.symbol.toLowerCase() === wanted);
}

export function findInstrument(market: MarketDetail, instrumentId: string): MarketInstrumentDetail | undefined {
  for (const family of market.families) {
    const match = family.instruments.find((instrument) => instrument.id === instrumentId);
    if (match) return match;
  }
  return undefined;
}

/** The market an instrument belongs to, by id. */
export function findMarketOfInstrument(instrument: MarketInstrumentDetail): MarketDetail | undefined {
  return MARKETS.find((market) => findInstrument(market, instrument.id) !== undefined);
}

/** Instrument ids are unique across markets, so comparisons can resolve across them. */
export function findInstrumentById(instrumentId: string): MarketInstrumentDetail | undefined {
  for (const market of MARKETS) {
    const match = findInstrument(market, instrumentId);
    if (match) return match;
  }
  return undefined;
}

/** The instrument shown when a market is first opened. */
export function defaultInstrument(market: MarketDetail): MarketInstrumentDetail {
  // Every market declares a headline that exists in one of its families.
  return findInstrument(market, market.defaultInstrumentId)!;
}
