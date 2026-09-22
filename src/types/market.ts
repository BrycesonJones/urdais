/**
 * Minimal frontend market types.
 *
 * These model only what the current UI renders. They are deliberately not a
 * mirror of the future backend schema; when the API lands, its responses
 * should be mapped into these shapes at the data boundary.
 */

export const TIME_RANGES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;

export type TimeRange = (typeof TIME_RANGES)[number];

/**
 * One observation in a historical series. `time` is a Unix timestamp in
 * seconds (UTC). `value` is signed: demo histories stay positive, but real
 * observations such as wholesale power prices can be negative.
 */
export type TimeSeriesPoint = {
  time: number;
  value: number;
  /**
   * Which lineage this point belongs to, where the product has one.
   *
   * A percentage change is only meaningful between two points that measure the
   * same economic object. Most series have exactly one lineage forever, and
   * leave this undefined; a benchmark whose constituent can be redesignated
   * does not. Urdais Token Price is the case: when a provider's designated
   * model changes, the points either side of the boundary are computed from
   * different models, and a change between them is not a change in anything.
   *
   * Undefined on both sides means "no lineage information", which is treated
   * as comparable -- that is what every existing series relies on, and it
   * keeps this additive.
   */
  lineage?: string;
};

/** Historical data for each selectable time range. */
export type IndexSeries = Record<TimeRange, TimeSeriesPoint[]>;

export type MarketIndex = {
  /** For a market, its index ticker; for an instrument, its own standalone identity, e.g. "H200". */
  symbol: string;
  name: string;
  /** Display unit, e.g. "$/GPU-hour" or "pts". */
  unit: string;
  /** One-sentence definition, present once the product has settled one for an index. */
  description?: string;
  /** The question the index answers, shown as its subtitle. */
  question?: string;
};

/**
 * Latest value and its percentage change versus the previous comparable
 * observation. Movement is expressed only as a percentage: it is what makes
 * markets with different units and scales comparable, so no absolute delta
 * is modelled. Null when the series has no prior observation — never a
 * fabricated 0%.
 */
export type MarketSnapshot = {
  value: number;
  changePercent: number | null;
  /** Unix timestamp in seconds (UTC) of the observation. */
  asOf: number;
};

/**
 * The Urdais Token Price benchmark behind a product market. The designated
 * model is named for transparency; it is methodology, not a control, and no
 * surface offers a way to change it.
 */
export type BenchmarkInstrumentIdentity = {
  providerSlug: string;
  providerName: string;
  benchmarkName: string;
  benchmarkModelId: string;
  benchmarkModelName: string;
  methodologyVersion: string;
  unitCaption: string;
};

/**
 * Canonical token-price identity for one model-level facet series: a single
 * published rate such as an input or output price. Internal to calculation
 * and developer verification; the product does not navigate by these.
 */
export type TokenInstrumentIdentity = {
  providerSlug: string;
  providerName: string;
  providerModelId: string;
  displayName: string;
  modelFamily: string;
  pricingDimension: string;
  dimensionLabel: string;
  facetLabel: string;
  serviceTier: string;
  contextTier: string | null;
  cacheTtl: string | null;
  region: string | null;
  unitCaption: string;
};

/**
 * Where a displayed value came from. One vocabulary for the whole product: the news
 * rails, the UCPI panel, the detail header and the watchlist rows all say "production"
 * or "demo" and nothing else.
 *
 * "unpublished" is the third and narrowest case: an index Urdais intends to publish that has
 * never published an observation, and for which no illustrative series exists either. UGAI is
 * the current example. It is deliberately distinct from "demo" -- a demo row promises a
 * synthetic series on the detail page, and UGAI's detail page shows an empty state instead --
 * and from "production", which promises a real value.
 */
export type DataProvenance = "production" | "demo" | "unpublished";

/**
 * A watchlist row.
 *
 * `valueFractionDigits` overrides the row's display precision for an index whose
 * meaningful range sits far below one unit. UBWI moves between roughly 0.22 % and
 * 0.29 %, so the default two decimals would collapse every plausible value to the
 * same 0.27 % and the row would look static while the index moved.
 *
 * `provenance` is **required**, unlike the optional field on `MarketInstrumentDetail`.
 * A watchlist row sits in a rail beside rows built from other sources, and an omitted
 * provenance is exactly how six synthetic index levels came to render indistinguishably
 * from UBWI's published value. Requiring it means a new row cannot reach the rail
 * without its author deciding what it is.
 */
export type IndexSnapshot = MarketIndex &
  MarketSnapshot & {
    valueFractionDigits?: number;
    provenance: DataProvenance;
  };

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
  /** Concise label for selectors within a family, e.g. "H100 SXM". */
  shortLabel: string;
  /**
   * Short code used when this instrument is the market's headline
   * benchmark, e.g. "H100" so the headline reads "UCPI-H100". Defaults to
   * the symbol. Non-headline instruments never carry the index prefix.
   */
  benchmarkCode?: string;
  /**
   * Nominal bandwidth for optical instruments, in Gbps. Stored so a
   * normalised $/Gbps (price ÷ bandwidth) can be derived from the record
   * later without parsing labels; not displayed yet.
   */
  bandwidthGbps?: number;
  /**
   * Geography for instruments that are geographically constrained, such as
   * an organised wholesale power market. Metadata only: the instrument is
   * keyed by the market entity, never by its region.
   */
  regionLabel?: string;
  /**
   * Present on canonical token facet instruments, which are internal. The
   * product market carries `benchmarkIdentity` instead.
   */
  tokenIdentity?: TokenInstrumentIdentity;
  /** Present on the Urdais Token Price benchmark market. */
  benchmarkIdentity?: BenchmarkInstrumentIdentity;
  /**
   * Where this instrument's values came from. Stated, never inferred: the surface
   * used to decide by asking whether the instrument carried a token identity, which
   * silently stamped "Demo data" on the live listed-GPU children the moment UCPI
   * began publishing. An instrument loaded from a production read declares
   * "production"; anything omitting this is mock data and is labelled as such.
   */
  provenance?: DataProvenance;
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
  /** Instrument selected when the family is switched to, e.g. HBM3E for HBM. Empty when the family has no instruments. */
  defaultInstrumentId: string;
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
