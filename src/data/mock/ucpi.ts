/**
 * Deterministic dummy UCPI data for frontend layout work.
 *
 * Everything here is generated from a fixed seed and a fixed "as of" time,
 * so values are identical on every render and reload. Nothing is live, and
 * the $/GPU-hour unit is provisional; the methodology phase defines the real
 * calculation. Replace this module with API-backed data when it exists.
 *
 * The same generator config, with a longer history, drives the UCPI-H100 SXM
 * instrument on the market detail page, so both surfaces show one series.
 */

import { buildDailySeries, buildIntradaySeries, STEPS_PER_DAY } from "@/data/mock/series-generator";
import type { DailySeriesConfig, IntradaySeriesConfig } from "@/data/mock/series-generator";
import type { IndexSeries, MarketIndex, MarketSnapshot } from "@/types/market";

export const UCPI_INDEX: MarketIndex = {
  symbol: "UCPI",
  name: "Urdais Compute Price Index",
  unit: "$/GPU-hour",
};

/** Fixed observation time: 2026-09-04 16:00 UTC. */
export const MOCK_AS_OF = Date.UTC(2026, 8, 4, 16, 0, 0) / 1000;

const DAILY_POINTS = 730;
const INTRADAY_DAYS = 7;

/**
 * UCPI-H100 SXM generator parameters. The latest value is anchored and the
 * final daily return forced so the headline change is a clean +2.55%; the
 * slight downward drift, read forwards, says compute has been getting cheaper.
 */
export const UCPI_DAILY_CONFIG: Omit<DailySeriesConfig, "points"> = {
  seed: 20260904,
  asOf: MOCK_AS_OF,
  latestValue: 2.41,
  latestDailyReturn: 0.0255,
  volatility: 0.012,
  drift: -0.0003,
};

export const UCPI_INTRADAY_CONFIG: IntradaySeriesConfig = {
  seed: 1_600_000,
  days: INTRADAY_DAYS,
  volatility: 0.006,
};

const daily = buildDailySeries({ ...UCPI_DAILY_CONFIG, points: DAILY_POINTS });
const intraday = buildIntradaySeries(daily, UCPI_INTRADAY_CONFIG);

export const UCPI_SERIES: IndexSeries = {
  "1D": intraday.slice(-STEPS_PER_DAY),
  "1W": intraday,
  "1M": daily.slice(-30),
  "3M": daily.slice(-90),
  "1Y": daily.slice(-365),
  ALL: daily,
};

const round = (value: number) => Math.round(value * 10_000) / 10_000;
const latest = daily[daily.length - 1]!;
const previous = daily[daily.length - 2]!;

export const UCPI_SNAPSHOT: MarketSnapshot = {
  value: latest.value,
  change: round(latest.value - previous.value),
  changePercent: round(((latest.value - previous.value) / previous.value) * 100),
  asOf: latest.time,
};
