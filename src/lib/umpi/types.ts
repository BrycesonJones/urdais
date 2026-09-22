/**
 * Canonical UMPI identities and record shapes.
 *
 * UMPI V1 publishes two monthly official-data series that are deliberately not the same kind of
 * thing. Series A republishes the Bank of Korea's own DRAM producer price index; Series B is a
 * unit-value index Urdais computes from Korea Customs export value and weight. The methodology
 * forbids averaging, blending or mutual imputation, and these types keep the two apart at the
 * type level rather than trusting a caller to remember.
 *
 * See `docs/methodology/umpi-kr-dram.md`.
 */

export const UMPI_SERIES_CODES = ["UMPI-KR-DRAM-PPI", "UMPI-KR-DRAM-EXPORT-UV"] as const;
export type UmpiSeriesCode = (typeof UMPI_SERIES_CODES)[number];

/**
 * A price index is produced by a statistical agency under its own quality-adjusted method. A
 * unit-value index is value over quantity and moves on export composition as well as on price.
 * Both are index points; they are not interchangeable and are never combined.
 */
export type UmpiSeriesKind = "official_price_index" | "derived_unit_value_index";

/** Every UMPI series is monthly, in index points, and changes month over month. There is no 1D. */
export const UMPI_PUBLISHED_UNIT = "index_points" as const;
export const UMPI_CHANGE_LABEL = "MoM" as const;
export const UMPI_CADENCE = "monthly" as const;

export type UmpiSeriesDefinition = {
  seriesCode: UmpiSeriesCode;
  displayName: string;
  seriesKind: UmpiSeriesKind;
  /** The agency's base for Series A; the base Urdais froze for Series B. */
  baseLabel: string;
  baseOwner: "source_agency" | "urdais";
  /** True only where Urdais computes the published level rather than republishing the agency's. */
  levelIsUrdaisDerived: boolean;
  /** A unit-value index always carries its composition warning. A price index never does. */
  mixWarningRequired: boolean;
  attributionText: string;
};

/**
 * A reference month, as `YYYY-MM`. The month a value describes, never the date it was retrieved.
 */
export type ReferenceMonth = string;

/**
 * The source-side identity of a BOK series.
 *
 * All three parts are required, and this is the reason the type exists: item code `30911201AA`
 * is the DRAM item in BOTH `404Y016` (producer prices) and `402Y016` (export prices), and the
 * two return different numbers for the same month. `402Y016` additionally carries a
 * currency-basis dimension with three values. Keying on the item code alone silently publishes
 * the wrong statistic.
 */
export type BokSeriesIdentity = {
  kind: "bok_ecos_series";
  statCode: string;
  itemCode: string;
  cycle: "A" | "Q" | "M" | "D";
  /** Group dimensions the table carries. Empty for `404Y016`; never defaulted for a table that has them. */
  groupDimensions: Readonly<Record<string, string>>;
};

/** The source-side identity of a Korea Customs commodity series. */
export type CustomsSeriesIdentity = {
  kind: "kcs_trade_commodity";
  /** Ten-digit HSK. `8542321010` is 디램 (DRAM chips). */
  hsCode: string;
  /** The data.go.kr dataset the figures were read from. */
  datasetId: string;
};

export type UmpiSourceIdentity = BokSeriesIdentity | CustomsSeriesIdentity;

/** Raw evidence as retrieved, before any Urdais arithmetic. Two shapes, never merged. */
export type BokIndexObservation = {
  kind: "bok_index_level";
  referenceMonth: ReferenceMonth;
  /** The agency's published level, unchanged. */
  indexLevel: number;
  baseLabel: string;
};

export type CustomsTradeObservation = {
  kind: "kcs_trade_month";
  referenceMonth: ReferenceMonth;
  /** `expDlr`: declared export value in USD, FOB. */
  exportValueUsd: number;
  /** `expWgt`: declared export weight in kilograms. */
  exportWeightKg: number;
};

export type UmpiRawObservation = BokIndexObservation | CustomsTradeObservation;

/** Why a month-over-month change was not computed. Never rendered as a zero. */
export type MomWithheldReason =
  | "no_prior_month"
  | "prior_month_missing"
  | "methodology_boundary"
  | "source_boundary"
  | "base_boundary";

export type MomResult =
  | { state: "computed"; change: number }
  | { state: "withheld"; reason: MomWithheldReason };

/** The lineage a published point is computed against. A change never spans a boundary. */
export type SeriesLineage = {
  seriesCode: UmpiSeriesCode;
  methodologyVersion: string;
  sourceSeriesId: string;
  /** The base regime the level sits in. A rebase ends one lineage and begins another. */
  baseLabel: string;
};

/** A point with its lineage, as the MoM primitive consumes it. */
export type LineagedLevel = {
  referenceMonth: ReferenceMonth;
  level: number;
  lineage: SeriesLineage;
};

/** The two V1 series, frozen. These mirror `reference.umpi_series`. */
export const UMPI_SERIES: Readonly<Record<UmpiSeriesCode, UmpiSeriesDefinition>> = {
  "UMPI-KR-DRAM-PPI": {
    seriesCode: "UMPI-KR-DRAM-PPI",
    displayName: "UMPI-KR DRAM PPI",
    seriesKind: "official_price_index",
    baseLabel: "2020=100",
    baseOwner: "source_agency",
    levelIsUrdaisDerived: false,
    mixWarningRequired: false,
    attributionText: "Source: Bank of Korea",
  },
  "UMPI-KR-DRAM-EXPORT-UV": {
    seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
    displayName: "UMPI-KR DRAM Export UV",
    seriesKind: "derived_unit_value_index",
    baseLabel: "2020 calendar-year aggregate = 100",
    baseOwner: "urdais",
    levelIsUrdaisDerived: true,
    mixWarningRequired: true,
    attributionText: "Source: Korea Customs Service, HSK 8542321010",
  },
} as const;

/**
 * The warning that travels with every Export UV point. It is a property of the series, not
 * presentation that a surface may drop.
 */
export const UMPI_EXPORT_UV_MIX_WARNING =
  "A trade unit-value index, not a price index: it moves on export composition — generation, density, vendor and product mix — as well as on price.";
