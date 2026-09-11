/**
 * Deterministic mock series generation shared by the homepage and market
 * detail datasets.
 *
 * Every series is built from a fixed seed and a fixed anchor, so values are
 * identical on every render, reload, and between server and client. Daily
 * closes are generated backwards from the anchored latest value; because the
 * random sequence is consumed in that order, two series with the same config
 * but different lengths agree exactly over their shared tail. That is what
 * keeps the homepage snapshot and the detail page in step.
 *
 * Nothing here is live data. Replace at the data boundary when the API lands.
 */

import type { TimeSeriesPoint } from "@/types/market";

export const DAY = 86_400;
const FIFTEEN_MINUTES = 900;
const STEPS_PER_DAY = DAY / FIFTEEN_MINUTES;

export type DailySeriesConfig = {
  seed: number;
  /** Unix timestamp (seconds, UTC) of the latest close; earlier points step back one day at a time. */
  asOf: number;
  /** Value of the latest close. */
  latestValue: number;
  /** Forced final daily return, so the headline change is a chosen clean number. */
  latestDailyReturn: number;
  /** Number of daily closes including the latest one. */
  points: number;
  /** Daily return standard deviation. */
  volatility: number;
  /** Mean daily return, read forwards in time. */
  drift: number;
  /**
   * Optional pull back towards a level, as a fraction of the gap closed per
   * day. Used for series that should oscillate rather than trend.
   */
  meanReversion?: { level: number; strength: number };
  /**
   * Optional annual cycle: values are scaled by 1 + amplitude · cos of the
   * distance from the peak day of year, normalised so the latest value
   * stays anchored. Used for seasonal markets such as wholesale power.
   */
  seasonality?: { amplitude: number; peakDayOfYear: number };
};

export type IntradaySeriesConfig = {
  seed: number;
  /** Number of trailing days to fill with 15-minute points. */
  days: number;
  /** Intraday return standard deviation over a full day. */
  volatility: number;
};

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
export function buildDailySeries(config: DailySeriesConfig): TimeSeriesPoint[] {
  const { seed, asOf, latestValue, latestDailyReturn, points, volatility, drift, meanReversion } = config;
  const gaussian = createGaussian(createRandom(seed));
  const values = new Array<number>(points);
  values[points - 1] = latestValue;
  for (let i = points - 1; i > 0; i--) {
    const current = values[i]!;
    let dailyReturn: number;
    if (i === points - 1) {
      dailyReturn = latestDailyReturn;
    } else {
      dailyReturn = drift + volatility * gaussian();
      if (meanReversion) {
        // Generation runs backwards, so the pull is applied with the sign
        // that keeps the reversed walk stable; a stationary reverting
        // process reads the same in either direction.
        dailyReturn -= meanReversion.strength * ((meanReversion.level - current) / meanReversion.level);
      }
    }
    // Returns are bounded so a multiplicative step can never cross zero.
    dailyReturn = Math.max(-0.5, Math.min(0.5, dailyReturn));
    values[i - 1] = current / (1 + dailyReturn);
  }
  const seasonal = seasonalFactor(config);
  return values.map((value, i) => {
    const time = asOf - (points - 1 - i) * DAY;
    return { time, value: round(value * seasonal(time)) };
  });
}

/** Multiplicative seasonal factor for a timestamp, equal to 1 at the anchor so the latest value is unchanged. */
function seasonalFactor(config: DailySeriesConfig): (time: number) => number {
  const { seasonality, asOf } = config;
  if (!seasonality) return () => 1;
  const cycle = (time: number) => {
    const date = new Date(time * 1000);
    const dayOfYear = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 1)) / (DAY * 1000);
    return 1 + seasonality.amplitude * Math.cos((2 * Math.PI * (dayOfYear - seasonality.peakDayOfYear)) / 365.25);
  };
  const anchor = cycle(asOf);
  return (time) => cycle(time) / anchor;
}

/**
 * 15-minute points for the trailing `days` days. Each day is a Brownian
 * bridge between consecutive daily closes, so the fine series agrees with
 * the daily series at every close and ends exactly on the latest value.
 * Each day's final point lands exactly on that day's close, so a window
 * that opens at a close time includes the close itself as its base.
 */
export function buildIntradaySeries(daily: TimeSeriesPoint[], config: IntradaySeriesConfig): TimeSeriesPoint[] {
  const { seed, days, volatility } = config;
  const gaussian = createGaussian(createRandom(seed));
  const points: TimeSeriesPoint[] = [];
  const stepVolatility = volatility / Math.sqrt(STEPS_PER_DAY);

  for (let d = daily.length - days; d < daily.length; d++) {
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

export { STEPS_PER_DAY };
