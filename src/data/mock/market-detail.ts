/**
 * Deterministic market detail data: the four routed Urdais markets, their
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

import { catalogEntry, MARKET_CATALOG } from "@/data/market-catalog";
import { buildDailySeries, buildIntradaySeries } from "@/data/mock/series-generator";
import type { DailySeriesConfig, IntradaySeriesConfig } from "@/data/mock/series-generator";
import { MOCK_AS_OF, UCPI_DAILY_CONFIG, UCPI_INDEX, UCPI_INTRADAY_CONFIG } from "@/data/mock/ucpi";
import { availableRanges } from "@/lib/market-ranges";
import type {
  ComparisonOption,
  MarketDetail,
  MarketFamily,
  MarketIndex,
  MarketInstrumentDetail,
  MarketSnapshot,
} from "@/types/market";

/** About twelve years of daily closes, so All time is a long, believable history. */
const LONG_HISTORY_DAYS = 4400;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

type InstrumentSpec = MarketIndex & {
  id: string;
  shortLabel: string;
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
    symbol: spec.symbol,
    name: spec.name,
    unit: spec.unit,
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
): InstrumentSpec {
  return {
    id: `ucpi-${slug}`,
    shortLabel: gpu,
    symbol: `UCPI-${gpu}`,
    name: `${UCPI_INDEX.name} · ${gpu} benchmark`,
    unit: COMPUTE_UNIT,
    daily: { ...daily, asOf: MOCK_AS_OF },
    intraday,
  };
}

/** Selector order is intentional; it is not sorted. */
const COMPUTE_SPECS: InstrumentSpec[] = [
  computeSpec(
    "H100 SXM",
    "h100-sxm",
    { ...UCPI_DAILY_CONFIG, points: LONG_HISTORY_DAYS },
    UCPI_INTRADAY_CONFIG,
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

/* ---------- UCPI: token pricing ---------- */

/**
 * Provider-level token pricing semantics are provisional. These are generic
 * per-provider demo series in $/1M tokens that exist to exercise the family
 * selector and data contract; real backend work may later distinguish input,
 * output, cached, or other token pricing series per model. The values are
 * not actual provider prices.
 */
const TOKEN_UNIT = "$/1M tokens";

function tokenSpec(
  provider: string,
  slug: string,
  daily: Omit<DailySeriesConfig, "asOf">,
  intraday: IntradaySeriesConfig,
): InstrumentSpec {
  return {
    id: `tokens-${slug}`,
    shortLabel: provider,
    symbol: provider,
    name: "Token price benchmark · demo provider series",
    unit: TOKEN_UNIT,
    daily: { ...daily, asOf: MOCK_AS_OF },
    intraday,
  };
}

/** Selector order is intentional; it is not sorted. */
const TOKEN_SPECS: InstrumentSpec[] = [
  tokenSpec(
    "Anthropic",
    "anthropic",
    { seed: 20230301, latestValue: 9.0, latestDailyReturn: 0.0022, points: 900, volatility: 0.004, drift: -0.0009 },
    { seed: 9_100_000, days: 7, volatility: 0.002 },
  ),
  tokenSpec(
    "OpenAI",
    "openai",
    { seed: 20230302, latestValue: 7.5, latestDailyReturn: -0.0066, points: 900, volatility: 0.005, drift: -0.001 },
    { seed: 9_200_000, days: 7, volatility: 0.002 },
  ),
  tokenSpec(
    "Google",
    "google",
    { seed: 20230303, latestValue: 4.2, latestDailyReturn: 0.0024, points: 900, volatility: 0.005, drift: -0.0012 },
    { seed: 9_300_000, days: 7, volatility: 0.002 },
  ),
  tokenSpec(
    "DeepSeek",
    "deepseek",
    { seed: 20230304, latestValue: 1.1, latestDailyReturn: -0.0089, points: 700, volatility: 0.007, drift: -0.0015 },
    { seed: 9_400_000, days: 7, volatility: 0.003 },
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

const UCPI_MARKET: MarketDetail = {
  ...UCPI_INDEX,
  defaultInstrumentId: "ucpi-h100-sxm",
  families: [
    { id: "compute", label: "Compute", instruments: buildFamilyInstruments(COMPUTE_SPECS) },
    { id: "tokens", label: "Tokens", instruments: buildFamilyInstruments(TOKEN_SPECS) },
  ],
};

/* ---------- Standalone indices ---------- */

/** The instrument that stands for each routed market when it is used as a comparison. */
const HEADLINE_INSTRUMENT_ID: Record<string, string> = { UCPI: "ucpi-h100-sxm" };

function headlineInstrumentId(symbol: string): string {
  return HEADLINE_INSTRUMENT_ID[symbol] ?? symbol.toLowerCase();
}

/**
 * An index compares with every other routed market's headline instrument.
 * Their units and scales differ, so the comparison is relative: both series
 * are rebased to percentage change over the selected range.
 */
function indexComparisons(symbol: string): ComparisonOption[] {
  return MARKET_CATALOG.filter((market) => market.symbol !== symbol).map((market) => ({
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
  const family: MarketFamily = { id: "index", label: "Index", instruments: [instrument] };
  return {
    symbol: spec.symbol,
    name: spec.name,
    unit: spec.unit,
    defaultInstrumentId: instrument.id,
    families: [family],
  };
}

// Long upward trend, read forwards.
const UGAI_MARKET = buildIndexMarket(
  "UGAI",
  "pts",
  { seed: 20140601, latestValue: 184.21, latestDailyReturn: 0.0114, points: LONG_HISTORY_DAYS, volatility: 0.011, drift: 0.0004 },
  { seed: 4_400_000, days: 7, volatility: 0.006 },
);

// Volatility oscillates around a level instead of trending.
const UAVI_MARKET = buildIndexMarket(
  "UAVI",
  "pts",
  {
    seed: 20150915,
    latestValue: 27.84,
    latestDailyReturn: -0.0312,
    points: LONG_HISTORY_DAYS,
    volatility: 0.03,
    drift: 0,
    meanReversion: { level: 30, strength: 0.03 },
  },
  { seed: 5_500_000, days: 7, volatility: 0.015 },
);

// Strong long-run growth with crypto-scale daily moves.
const UBWI_MARKET = buildIndexMarket(
  "UBWI",
  "pts",
  { seed: 20130101, latestValue: 1342.57, latestDailyReturn: 0.0042, points: LONG_HISTORY_DAYS, volatility: 0.028, drift: 0.0011 },
  { seed: 6_600_000, days: 7, volatility: 0.012 },
);

/* ---------- Lookup ---------- */

/** Routed markets in display order; the first is the default for /markets. */
export const MARKETS: MarketDetail[] = [UCPI_MARKET, UGAI_MARKET, UAVI_MARKET, UBWI_MARKET];

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
  return findInstrument(market, market.defaultInstrumentId) ?? market.families[0]!.instruments[0]!;
}
