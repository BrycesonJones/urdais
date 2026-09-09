/**
 * Minimal frontend market types.
 *
 * These model only what the current UI renders. They are deliberately not a
 * mirror of the future backend schema; when the API lands, its responses
 * should be mapped into these shapes at the data boundary.
 */

export const TIME_RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;

export type TimeRange = (typeof TIME_RANGES)[number];

/** One observation in a historical series. `time` is a Unix timestamp in seconds (UTC). */
export type TimeSeriesPoint = {
  time: number;
  value: number;
};

/** Historical data for each selectable time range. */
export type IndexSeries = Record<TimeRange, TimeSeriesPoint[]>;

export type MarketIndex = {
  symbol: string;
  name: string;
  /** Display unit, e.g. "$/GPU-hour" or "pts". */
  unit: string;
};

/** Latest value and its change versus the previous daily close. */
export type MarketSnapshot = {
  value: number;
  change: number;
  changePercent: number;
  /** Unix timestamp in seconds (UTC) of the observation. */
  asOf: number;
};

export type IndexSnapshot = MarketIndex & MarketSnapshot;
