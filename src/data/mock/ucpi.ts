/**
 * Deterministic dummy UCPI data for frontend layout work.
 *
 * Everything here is generated from a fixed seed and a fixed "as of" time,
 * so values are identical on every render and reload. Nothing is live, and
 * the $/GPU-hour unit is provisional; the methodology phase defines the real
 * calculation. Replace this module with API-backed data when it exists.
 */

import type { IndexSeries, MarketIndex, MarketSnapshot, TimeSeriesPoint } from "@/types/market";

export const UCPI_INDEX: MarketIndex = {
  symbol: "UCPI",
  name: "Urdais Compute Price Index",
  unit: "$/GPU-hour",
};

/** Fixed observation time: 2026-09-04 16:00 UTC. */
export const MOCK_AS_OF = Date.UTC(2026, 8, 4, 16, 0, 0) / 1000;

const DAY = 86_400;
const FIFTEEN_MINUTES = 900;
const DAILY_POINTS = 730;
const INTRADAY_DAYS = 7;
const STEPS_PER_DAY = DAY / FIFTEEN_MINUTES;

const LATEST_VALUE = 2.41;
/** Forced final daily return so the headline change is a clean +2.55%. */
const LATEST_DAILY_RETURN = 0.0255;
const DAILY_VOLATILITY = 0.012;
/** Slight downward drift per day, read forwards: compute has been getting cheaper. */
const DAILY_DRIFT = -0.0003;
const INTRADAY_VOLATILITY = 0.006;

/** mulberry32: small, fast, deterministic PRNG. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller. */
function createGaussian(random: () => number): () => number {
  return () => {
    const u = 1 - random();
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** Daily closes built backwards from the anchored latest value. */
function buildDailySeries(): TimeSeriesPoint[] {
  const gaussian = createGaussian(createRandom(20260904));
  const values = new Array<number>(DAILY_POINTS);
  values[DAILY_POINTS - 1] = LATEST_VALUE;
  for (let i = DAILY_POINTS - 1; i > 0; i--) {
    const dailyReturn =
      i === DAILY_POINTS - 1 ? LATEST_DAILY_RETURN : DAILY_DRIFT + DAILY_VOLATILITY * gaussian();
    values[i - 1] = values[i]! / (1 + dailyReturn);
  }
  return values.map((value, i) => ({
    time: MOCK_AS_OF - (DAILY_POINTS - 1 - i) * DAY,
    value: round(value),
  }));
}

/**
 * 15-minute points for the last INTRADAY_DAYS days. Each day is a Brownian
 * bridge between consecutive daily closes, so the fine series agrees with
 * the daily series at every close and ends exactly on the latest value.
 */
function buildIntradaySeries(daily: TimeSeriesPoint[]): TimeSeriesPoint[] {
  const gaussian = createGaussian(createRandom(1_600_000));
  const points: TimeSeriesPoint[] = [];
  const stepVolatility = INTRADAY_VOLATILITY / Math.sqrt(STEPS_PER_DAY);

  for (let d = daily.length - INTRADAY_DAYS; d < daily.length; d++) {
    const open = daily[d - 1]!;
    const close = daily[d]!;
    const walk = [0];
    for (let k = 1; k <= STEPS_PER_DAY; k++) walk.push(walk[k - 1]! + gaussian() * stepVolatility);
    const endOfWalk = walk[STEPS_PER_DAY]!;

    for (let k = 1; k <= STEPS_PER_DAY; k++) {
      const fraction = k / STEPS_PER_DAY;
      const bridge = walk[k]! - fraction * endOfWalk;
      const trend = open.value + (close.value - open.value) * fraction;
      points.push({
        time: open.time + k * FIFTEEN_MINUTES,
        value: round(trend * (1 + bridge)),
      });
    }
  }
  return points;
}

const daily = buildDailySeries();
const intraday = buildIntradaySeries(daily);

export const UCPI_SERIES: IndexSeries = {
  "1D": intraday.slice(-STEPS_PER_DAY),
  "1W": intraday,
  "1M": daily.slice(-30),
  "3M": daily.slice(-90),
  "1Y": daily.slice(-365),
  ALL: daily,
};

const latest = daily[daily.length - 1]!;
const previous = daily[daily.length - 2]!;

export const UCPI_SNAPSHOT: MarketSnapshot = {
  value: latest.value,
  change: round(latest.value - previous.value),
  changePercent: round(((latest.value - previous.value) / previous.value) * 100),
  asOf: latest.time,
};
