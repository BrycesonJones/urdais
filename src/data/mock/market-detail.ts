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

/** About twelve years of daily closes: enough to exercise 10Y and ALL. */
const LONG_HISTORY_DAYS = 4400;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

type InstrumentSpec = MarketIndex & {
  id: string;
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
    change: round(latest.value - previous.value),
    changePercent: round(((latest.value - previous.value) / previous.value) * 100),
    asOf: latest.time,
  };
  const series = { daily, intraday };
  return {
    id: spec.id,
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

const COMPUTE_SPECS: InstrumentSpec[] = [
  {
    id: "ucpi-h100-sxm",
    symbol: "UCPI-H100 SXM",
    name: "Urdais Compute Price Index · H100 SXM benchmark",
    unit: UCPI_INDEX.unit,
    daily: { ...UCPI_DAILY_CONFIG, points: LONG_HISTORY_DAYS },
    intraday: UCPI_INTRADAY_CONFIG,
  },
  {
    id: "ucpi-h200",
    symbol: "UCPI-H200",
    name: "Urdais Compute Price Index · H200 benchmark",
    unit: UCPI_INDEX.unit,
    // Roughly three years of history: 5Y and 10Y are not available.
    daily: {
      seed: 20240115,
      asOf: MOCK_AS_OF,
      latestValue: 3.18,
      latestDailyReturn: 0.0121,
      points: 1100,
      volatility: 0.013,
      drift: -0.0005,
    },
    intraday: { seed: 2_200_000, days: 7, volatility: 0.007 },
  },
  {
    id: "ucpi-b200",
    symbol: "UCPI-B200",
    name: "Urdais Compute Price Index · B200 benchmark",
    unit: UCPI_INDEX.unit,
    // About eighteen months of history: only 1D through 1Y and ALL apply.
    daily: {
      seed: 20250301,
      asOf: MOCK_AS_OF,
      latestValue: 4.62,
      latestDailyReturn: -0.0084,
      points: 540,
      volatility: 0.011,
      drift: -0.0006,
    },
    intraday: { seed: 3_300_000, days: 7, volatility: 0.008 },
  },
];

/** Every compute benchmark shares $/GPU-hour, so each may be compared with the others. */
const COMPUTE_INSTRUMENTS = COMPUTE_SPECS.map((spec) =>
  buildInstrument(
    spec,
    COMPUTE_SPECS.filter((other) => other.id !== spec.id).map((other) => ({
      instrumentId: other.id,
      label: other.symbol,
    })),
  ),
);

const UCPI_MARKET: MarketDetail = {
  ...UCPI_INDEX,
  defaultInstrumentId: "ucpi-h100-sxm",
  families: [
    { id: "compute", label: "Compute", instruments: COMPUTE_INSTRUMENTS },
    // Present in the taxonomy; token-pricing instruments are a later slice.
    { id: "models", label: "Models", instruments: [] },
  ],
};

/* ---------- Standalone indices ---------- */

/** An index market is a single-instrument family with no comparable series yet. */
function buildIndexMarket(spec: InstrumentSpec, familyLabel: string): MarketDetail {
  const instrument = buildInstrument(spec, []);
  const family: MarketFamily = { id: "index", label: familyLabel, instruments: [instrument] };
  return {
    symbol: spec.symbol,
    name: spec.name,
    unit: spec.unit,
    defaultInstrumentId: instrument.id,
    families: [family],
  };
}

const UGAI_MARKET = buildIndexMarket(
  {
    id: "ugai",
    symbol: "UGAI",
    name: "Urdais Global AI Index",
    unit: "pts",
    // Long upward trend, read forwards.
    daily: {
      seed: 20140601,
      asOf: MOCK_AS_OF,
      latestValue: 184.21,
      latestDailyReturn: 0.0114,
      points: LONG_HISTORY_DAYS,
      volatility: 0.011,
      drift: 0.0004,
    },
    intraday: { seed: 4_400_000, days: 7, volatility: 0.006 },
  },
  "Index",
);

const UAVI_MARKET = buildIndexMarket(
  {
    id: "uavi",
    symbol: "UAVI",
    name: "Urdais AI Volatility Index",
    unit: "pts",
    // Volatility oscillates around a level instead of trending.
    daily: {
      seed: 20150915,
      asOf: MOCK_AS_OF,
      latestValue: 27.84,
      latestDailyReturn: -0.0312,
      points: LONG_HISTORY_DAYS,
      volatility: 0.03,
      drift: 0,
      meanReversion: { level: 30, strength: 0.03 },
    },
    intraday: { seed: 5_500_000, days: 7, volatility: 0.015 },
  },
  "Index",
);

const UBWI_MARKET = buildIndexMarket(
  {
    id: "ubwi",
    symbol: "UBWI",
    name: "Bitcoin Wealth Index",
    unit: "pts",
    // Strong long-run growth with crypto-scale daily moves.
    daily: {
      seed: 20130101,
      asOf: MOCK_AS_OF,
      latestValue: 1342.57,
      latestDailyReturn: 0.0042,
      points: LONG_HISTORY_DAYS,
      volatility: 0.028,
      drift: 0.0011,
    },
    intraday: { seed: 6_600_000, days: 7, volatility: 0.012 },
  },
  "Index",
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

/** The instrument shown when a market is first opened. */
export function defaultInstrument(market: MarketDetail): MarketInstrumentDetail {
  return findInstrument(market, market.defaultInstrumentId) ?? market.families[0]!.instruments[0]!;
}
