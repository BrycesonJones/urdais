/**
 * UBWI domain types.
 *
 * UBWI = (Bitcoin Market Capitalization / Total Global Wealth) x 100, where
 *
 *   Bitcoin Market Capitalization = Issued BTC Supply x BTC Spot Price
 *   Total Global Wealth           = Observed Rights-Cleared Wealth
 *                                 + Modeled Residual Wealth
 *                                 + Bitcoin Market Capitalization
 *
 * Bitcoin sits inside its own denominator, which is what bounds UBWI in [0, 100].
 * Human capital is excluded, no lost-coin adjustment is applied, and asset-class
 * market values are never summed: the denominator is national-balance-sheet net
 * worth for the economies Urdais observes, plus a disclosed model for the rest.
 */

/** How a component's currency was converted to USD. */
export type FxBasis = "end_period" | "period_average";

export type FxLineage = {
  basis: FxBasis;
  /** Units of the component's national currency per one USD. */
  rateLcuPerUsd: number;
  /**
   * The fixing actually used: the last quoted rate at or before the component's
   * reference date. Null only where the component is already denominated in USD.
   */
  fixingDate: string | null;
  sourceInterface: string;
};

/** Whether the compiler's published total includes land, and how much of it. */
export type LandTreatment = "included" | "partially_included" | "excluded" | "unknown";

/**
 * Consumer durables are outside the 2025 SNA 4.120 asset boundary. A compiler that
 * includes them must have them stripped; a component that includes them un-stripped
 * may never enter a published denominator.
 */
export type ConsumerDurablesTreatment =
  | "excluded"
  | "included_and_stripped"
  | "included_not_stripped";

export type ObservationStatus = "observed" | "imputed";

/**
 * A component's rights state. Derived from a retained, hashed terms artifact -- never
 * from whether the terms URL happens to answer on a given run.
 */
export type RightsStatus = "cleared" | "under_review" | "blocked";

/** Whether the compiler is the national authority or a harmonisation layer over it. */
export type SourceType = "primary" | "harmonized";

/**
 * How the artifact behind a component was acquired. `manual_verified` means a person
 * read the first-party published surface and retained it; it is never a claim that
 * automated retrieval is permitted or available.
 */
export type AcquisitionMode = "automated" | "manual_verified";

/** One directly observed national balance sheet entering the denominator. */
export type ObservedEconomy = {
  /** ISO 3166-1 alpha-3. */
  economy: string;
  /** The date the stock describes. A date, not a year: Australia's is 30 June. */
  referenceDate: string;
  referenceYear: number;
  valueNationalCurrency: number;
  currency: string;
  fx: FxLineage;
  valueUsd: number;
  sourceInterface: string;
  sourceType: SourceType;
  /** The compiler's own series identifier, not the concept name. */
  sourceSeries: string;
  acquisitionMode: AcquisitionMode;
  observationStatus: ObservationStatus;
  rightsStatus: RightsStatus;
  landTreatment: LandTreatment;
  consumerDurablesTreatment: ConsumerDurablesTreatment;
  /**
   * Required where durables were stripped. The amount and the compiler's own series for
   * the stripped line are both recorded: a denominator that strips durables for one
   * compiler and not another is summing different objects.
   */
  consumerDurablesStrippedUsd?: number;
  consumerDurablesSourceSeries?: string;
  /** GDP at market exchange rates, used for coverage weighting. */
  gdpUsd2024: number;
  /** GDP in the component's own reference year, used for the observed-set ratio. */
  gdpUsdReferenceYear: number;
  note: string;
};

/** An economy dropped from the observed set, and the rule that dropped it. */
export type ExcludedEconomy = {
  economy: string;
  referenceDate: string;
  gdpUsd2024: number;
  reason: string;
  rule: string;
};

/** One spot venue reading behind the numerator median. */
export type VenueQuote = {
  venue: string;
  endpoint: string;
  priceUsd: number;
  /** True for the reading the median selected. */
  selected: boolean;
};

/** One instantaneous Bitcoin market capitalization observation. */
export type BtcMarketObservation = {
  observedAt: string;
  /** Chain height, confirmed independently. A supply without its height is not reproducible. */
  blockHeight: number;
  heightSources: readonly string[];
  supplyBtc: number;
  supplySourceInterface: string;
  supplyConstruction: "claimed_issuance";
  venues: readonly VenueQuote[];
  priceRule: "median_of_venues";
  medianPriceUsd: number;
  marketCapUsd: number;
};

/** One residual-model scenario: a tail wealth-to-GDP ratio and what it implies. */
export type ResidualScenario = {
  key: string;
  label: string;
  /** The wealth-to-GDP ratio applied to unobserved world GDP. */
  tailRatio: number;
  imputedWealthUsd: number;
  totalGlobalWealthUsd: number;
  ubwiPercent: number;
  imputedShareOfWealth: number;
};

/** The versioned residual model. Auditable, never one opaque number. */
export type ResidualModel = {
  version: string;
  /** Observed-set wealth-to-GDP ratio, computed from the observed components themselves. */
  observedRatio: number;
  /** CWON 2020 tail calibration: how much poorer per unit GDP the unobserved world is. */
  tailCalibration: number;
  tailCalibrationSource: string;
  /** Unobserved world GDP at market exchange rates. */
  unobservedGdpUsd: number;
  worldGdpUsd: number;
  worldGdpSource: string;
  centralTailRatio: number;
  imputedWealthUsd: number;
};

export type CoverageMeasures = {
  observedEconomyCount: number;
  rightsClearedEconomyCount: number;
  observedGdpCoverage: number;
  rightsClearedGdpCoverage: number;
  observedWealthCoverage: number;
};

/** The full calculation, carrying everything needed to reproduce it. */
export type UbwiCalculation = {
  calculatedAt: string;
  methodologyVersion: string;
  residualModelVersion: string;
  numerator: BtcMarketObservation;
  observed: readonly ObservedEconomy[];
  excluded: readonly ExcludedEconomy[];
  observedWealthUsd: number;
  residual: ResidualModel;
  modeledWealthUsd: number;
  /** Observed + modeled + Bitcoin. */
  totalGlobalWealthUsd: number;
  ubwiPercent: number;
  observedShareOfTotal: number;
  modeledShareOfTotal: number;
  imputedShareOfWealth: number;
  coverage: CoverageMeasures;
  scenarios: readonly ResidualScenario[];
  sensitivity: { lowPercent: number; highPercent: number };
  unobservedMajorEconomies: readonly UnobservedMajorEconomy[];
};

/**
 * An economy above the disclosure threshold that Urdais does not observe. The gate is
 * on the disclosure, not on the observation: China does not compile a national balance
 * sheet and no schema changes that.
 */
export type UnobservedMajorEconomy = {
  economy: string;
  name: string;
  gdpShareOfWorld: number;
  reason: string;
};
