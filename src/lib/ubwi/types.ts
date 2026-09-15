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

import type { ChainlinkPriceObservation } from "./chainlink";

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

/**
 * A *source interface's* rights state, which has one state a denominator constituent may
 * never have.
 *
 * `inferred_permitted` is the state Phase 2E needed and the three-valued model could not
 * express without lying in one direction or the other. Chainlink's BTC/USD Data Feed is
 * exposed through a documented public interface and Urdais found no prohibition on using
 * an observed reference price as an input to its own derived index -- but Chainlink has
 * granted nothing in writing, its terms page could not be read at all, and the upstream
 * data providers' terms are undisclosed. Calling that `cleared` would assert a permission
 * nobody gave; calling it `under_review` would assert an open review that is in fact
 * closed by an explicit product decision to proceed on the inference.
 *
 * It is deliberately not available to the denominator: `ObservedEconomy.rightsStatus`
 * stays three-valued, and the gate requires observed constituents to be `cleared`.
 */
export type SourceRightsStatus = RightsStatus | "inferred_permitted";

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

/**
 * One spot venue reading behind the retired three-venue median.
 *
 * Methodology 1.0.0 built the price leg this way. Methodology 1.1.0 does not, and the
 * type is kept rather than deleted because the retired observation is preserved in
 * ./numerator.ts and a methodology history that cannot be typed is not a history.
 */
export type VenueQuote = {
  venue: string;
  endpoint: string;
  /**
   * The registered source interface the reading came through. Named so the gate can check
   * the venue's rights the same way it checks a denominator constituent's: a numerator
   * source that is not cleared for the use actually performed must refuse publication,
   * and it cannot do that if the observation only records a venue's informal name.
   */
  sourceInterface: string;
  priceUsd: number;
  /** True for the reading the median selected. */
  selected: boolean;
};

/**
 * The retired price rule and the approved one. Both are named so that a stored
 * observation says which methodology produced it rather than leaving it to be inferred
 * from which fields happen to be populated.
 */
export type BtcPriceRule = "median_of_venues" | "chainlink_reference_feed";

/**
 * One instantaneous Bitcoin market capitalization observation.
 *
 *   Bitcoin Market Capitalization = Issued BTC Supply x BTC/USD reference price
 *
 * The supply leg is unchanged by the 1.1.0 amendment. The price leg is the amendment.
 */
export type BtcMarketObservation = {
  observedAt: string;
  /** Chain height, confirmed independently. A supply without its height is not reproducible. */
  blockHeight: number;
  heightSources: readonly string[];
  supplyBtc: number;
  supplySourceInterface: string;
  supplyConstruction: "claimed_issuance";
  priceRule: BtcPriceRule;
  /** The price the market cap was computed at, whatever rule produced it. */
  priceUsd: number;
  /** The Chainlink round, frozen whole. Present under `chainlink_reference_feed`. */
  chainlink?: ChainlinkPriceObservation;
  /** The venue rows behind a `median_of_venues` observation. Retired; never both. */
  venues?: readonly VenueQuote[];
  /** The source interface slug the price came through, held to the numerator rights gate. */
  priceSourceInterface: string;
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
