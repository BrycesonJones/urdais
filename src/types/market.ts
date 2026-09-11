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

/**
 * Latest value and its percentage change versus the previous daily close.
 * Movement is expressed only as a percentage: it is what makes markets with
 * different units and scales comparable, so no absolute delta is modelled.
 */
export type MarketSnapshot = {
  value: number;
  changePercent: number;
  /** Unix timestamp in seconds (UTC) of the observation. */
  asOf: number;
};

export type IndexSnapshot = MarketIndex & MarketSnapshot;

/*
 * Market detail page.
 *
 * These shapes are what the detail page consumes. They approximate what the
 * future API will return per instrument (identity, snapshot, history,
 * which ranges the history supports, and which series may be compared) and
 * are mapped from mock data today.
 */

/** Selectable windows on the detail chart, in display order. */
export const DETAIL_RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y"] as const;

export type DetailRange = (typeof DETAIL_RANGES)[number];

/** Full history for one instrument: daily closes plus a trailing intraday tail. */
export type DetailedSeries = {
  daily: TimeSeriesPoint[];
  /** 15-minute points covering at least the trailing five days. */
  intraday: TimeSeriesPoint[];
};

/**
 * How two series share one axis: "absolute" overlays raw values and needs a
 * common unit; "relative" rebases both to percentage change from the start
 * of the selected range, which is how instruments with different units or
 * scales, such as the Urdais indices, are compared.
 */
export type ComparisonBasis = "absolute" | "relative";

/** Another instrument this one may be compared with, and on what basis. */
export type ComparisonOption = {
  /** Globally unique instrument id; may belong to another market. */
  instrumentId: string;
  label: string;
  basis: ComparisonBasis;
};

export type MarketInstrumentDetail = MarketIndex & {
  /** Stable id used for selection and comparison lookups, e.g. "ucpi-h100". */
  id: string;
  /** Concise label for selectors within a family, e.g. "H100 SXM" for UCPI-H100 SXM. */
  shortLabel: string;
  /**
   * Nominal bandwidth for optical instruments, in Gbps. Stored so a
   * normalised $/Gbps (price ÷ bandwidth) can be derived from the record
   * later without parsing labels; not displayed yet.
   */
  bandwidthGbps?: number;
  snapshot: MarketSnapshot;
  series: DetailedSeries;
  /** Ranges the history is long enough to support; others are shown disabled. */
  availableRanges: DetailRange[];
  comparisons: ComparisonOption[];
};

/** A group of instruments that belong together, e.g. the Compute family of UCPI. */
export type MarketFamily = {
  id: string;
  label: string;
  /** Empty when the family exists in the taxonomy but has no instruments yet. */
  instruments: MarketInstrumentDetail[];
  /** Instrument selected when the family is switched to; the first instrument otherwise. */
  defaultInstrumentId?: string;
  /** A deeper analytical destination for this family, offered as a contextual link. */
  explore?: { label: string; href: string };
};

/** A routed top-level market: one of the Urdais indices and its instrument families. */
export type MarketDetail = MarketIndex & {
  families: MarketFamily[];
  defaultInstrumentId: string;
};

/** Return over one selectable range; null when the history is too short. */
export type PeriodPerformance = {
  range: DetailRange;
  returnPercent: number | null;
};
