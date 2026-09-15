/**
 * The UBWI calculation.
 *
 *   UBWI = (Bitcoin Market Capitalization / Total Global Wealth) x 100
 *   Total Global Wealth = Observed Rights-Cleared Wealth
 *                       + Modeled Residual Wealth
 *                       + Bitcoin Market Capitalization
 *
 * Bitcoin sits inside its own denominator. That is not a rounding convention: it is what
 * makes UBWI a share of everything rather than a ratio to everything else, and it is
 * what bounds the value in [0, 100].
 *
 * The residual model is the part that must be auditable rather than stored as one opaque
 * number, because it is roughly two fifths of the denominator. It is deliberately simple:
 * one world wealth-to-GDP ratio measured on the observed set, scaled by one calibration
 * factor measured against the World Bank's Changing Wealth of Nations. Phase 2A
 * backtested regional and income-group refinements and found they do not reliably beat a
 * single world ratio -- regional grouping is worse at six of eleven cut-points -- so the
 * model does not invite elaborations that add opacity without accuracy.
 */
import {
  CWON_2020_NON_HUMAN_WEALTH_USD,
  CWON_SOURCE,
  EXCLUDED_ECONOMIES,
  LATEST_COMPLETE_YEAR,
  OBSERVED_ECONOMIES,
  UNOBSERVED_MAJOR_ECONOMIES,
  VINTAGE_MAX_AGE_YEARS,
  WORLD_GDP_2024_USD,
  WORLD_GDP_SOURCE,
} from "./observations";
import { PRODUCTION_BTC_OBSERVATION } from "./numerator";
import type {
  BtcMarketObservation,
  ObservedEconomy,
  ResidualModel,
  ResidualScenario,
  UbwiCalculation,
} from "./types";

/**
 * Methodology 1.1.0 amends exactly one thing: the BTC price leg moves from the three-venue
 * exchange median to the Chainlink BTC/USD Data Feed on Ethereum mainnet. The denominator,
 * the residual model, the identity and every gate threshold are unchanged, which is why the
 * residual-model version does not move with it. See docs/methodology/ubwi.md.
 */
export const METHODOLOGY_VERSION = "1.1.0";
/** The superseded version, kept so a stored point can be read against what produced it. */
export const PRIOR_METHODOLOGY_VERSION = "1.0.0";
export const RESIDUAL_MODEL_VERSION = "1.0.0";
export const UBWI_METHODOLOGY_DOC = "docs/methodology/ubwi.md" as const;
export const UBWI_SYMBOL = "UBWI" as const;
export const UBWI_UNIT = "%" as const;

/**
 * The residual model's measured inputs, retained so a value computed under this version
 * stays explicable after the version changes.
 *
 * `tailCalibration` is the ratio of two wealth-to-GDP ratios in the CWON 2020 cross
 * section: the economies Urdais does not observe, over the economies it does. It is
 * below one because the unobserved world is poorer per unit of output, and applying the
 * observed set's own ratio to it -- the k = 1 scenario -- overstates world wealth.
 */
export const RESIDUAL_MODEL_INPUTS = {
  version: RESIDUAL_MODEL_VERSION,
  tailCalibrationSource: CWON_SOURCE,
  worldGdpSource: WORLD_GDP_SOURCE,
} as const;

/**
 * The sensitivity scenarios. These are not a confidence interval: no distribution is
 * assumed and none is available. They are four named, reproducible assumptions about one
 * parameter -- the wealth-to-GDP ratio of the world Urdais cannot observe -- and the
 * published range is their span.
 */
export const SENSITIVITY_SCENARIOS = [
  {
    key: "tail_equals_observed",
    label: "Unobserved world as wealthy per unit GDP as the observed set (k = 1)",
    ratioOfObserved: null as number | null,
  },
  {
    key: "central",
    label: "Central: CWON-2020 calibrated tail",
    ratioOfObserved: null as number | null,
  },
  { key: "low", label: "Low: 0.60 x the observed-set ratio", ratioOfObserved: 0.6 },
  { key: "high", label: "High: 1.15 x the observed-set ratio", ratioOfObserved: 1.15 },
] as const;

export const CENTRAL_SCENARIO_KEY = "central";

/**
 * Non-human wealth at 2020 for the economies in the CWON cross section, used only to
 * calibrate the tail ratio and to report wealth-weighted coverage. Populated from the
 * observed set's own CWON weights; the sum of the whole cross section is a constant.
 */
export type CwonWeights = {
  /** Non-human wealth at 2020 for each observed economy. */
  observedNonHumanWealthUsd: number;
  /** GDP at 2020 for each observed economy. */
  observedGdp2020Usd: number;
  /** GDP at 2020 for the CWON economies Urdais does not observe. */
  unobservedGdp2020Usd: number;
};

/**
 * The CWON 2020 weights behind the tail calibration for the Production V1 observed set.
 * These are sums over the CWON cross section, recorded rather than recomputed at read
 * time so the calibration factor is reproducible from the published record alone.
 */
export const PRODUCTION_CWON_WEIGHTS: CwonWeights = {
  observedNonHumanWealthUsd: 204_868_435_737_202.9,
  observedGdp2020Usd: 46_211_332_078_595.06,
  unobservedGdp2020Usd: 38_159_247_696_304.96,
};

/** The observed-set wealth-to-GDP ratio, measured on the components themselves. */
export function observedWealthToGdpRatio(economies: readonly ObservedEconomy[]): number {
  const wealth = economies.reduce((sum, e) => sum + e.valueUsd, 0);
  const gdp = economies.reduce((sum, e) => sum + e.gdpUsdReferenceYear, 0);
  return wealth / gdp;
}

/**
 * The CWON tail calibration: how much poorer per unit of GDP the unobserved world is
 * than the observed set, in the one cross section where both are measured on a
 * comparable basis.
 */
export function tailCalibration(weights: CwonWeights): number {
  const tailWealth = CWON_2020_NON_HUMAN_WEALTH_USD - weights.observedNonHumanWealthUsd;
  const tailRatio = tailWealth / weights.unobservedGdp2020Usd;
  const observedRatio = weights.observedNonHumanWealthUsd / weights.observedGdp2020Usd;
  return tailRatio / observedRatio;
}

export function buildResidualModel(
  economies: readonly ObservedEconomy[],
  weights: CwonWeights = PRODUCTION_CWON_WEIGHTS,
): ResidualModel {
  const observedRatio = observedWealthToGdpRatio(economies);
  const calibration = tailCalibration(weights);
  const observedGdp2024 = economies.reduce((sum, e) => sum + e.gdpUsd2024, 0);
  const unobservedGdpUsd = WORLD_GDP_2024_USD - observedGdp2024;
  const centralTailRatio = observedRatio * calibration;

  return {
    version: RESIDUAL_MODEL_VERSION,
    observedRatio,
    tailCalibration: calibration,
    tailCalibrationSource: CWON_SOURCE,
    unobservedGdpUsd,
    worldGdpUsd: WORLD_GDP_2024_USD,
    worldGdpSource: WORLD_GDP_SOURCE,
    centralTailRatio,
    imputedWealthUsd: centralTailRatio * unobservedGdpUsd,
  };
}

function scenarioFor(
  key: string,
  label: string,
  tailRatio: number,
  observedWealthUsd: number,
  residual: ResidualModel,
  marketCapUsd: number,
): ResidualScenario {
  const imputedWealthUsd = tailRatio * residual.unobservedGdpUsd;
  const wealth = observedWealthUsd + imputedWealthUsd;
  const totalGlobalWealthUsd = wealth + marketCapUsd;
  return {
    key,
    label,
    tailRatio,
    imputedWealthUsd,
    totalGlobalWealthUsd,
    ubwiPercent: (marketCapUsd / totalGlobalWealthUsd) * 100,
    imputedShareOfWealth: (imputedWealthUsd / wealth) * 100,
  };
}

/** Whether a component's reference year satisfies the vintage rule. */
export function satisfiesVintageRule(
  economy: ObservedEconomy,
  latestCompleteYear: number = LATEST_COMPLETE_YEAR,
): boolean {
  return latestCompleteYear - economy.referenceYear <= VINTAGE_MAX_AGE_YEARS;
}

export type CalculationInput = {
  calculatedAt: string;
  numerator?: BtcMarketObservation;
  economies?: readonly ObservedEconomy[];
  cwonWeights?: CwonWeights;
};

/**
 * Compute UBWI. Every intermediate the published record needs is returned, not just the
 * headline: the observed subtotal, the residual model and its parameters, the imputed
 * subtotal, Total Global Wealth, the coverage measures and the sensitivity scenarios.
 */
export function calculateUbwi(input: CalculationInput): UbwiCalculation {
  const numerator = input.numerator ?? PRODUCTION_BTC_OBSERVATION;
  const economies = input.economies ?? OBSERVED_ECONOMIES;
  const weights = input.cwonWeights ?? PRODUCTION_CWON_WEIGHTS;

  const observedWealthUsd = economies.reduce((sum, e) => sum + e.valueUsd, 0);
  const residual = buildResidualModel(economies, weights);
  const marketCapUsd = numerator.marketCapUsd;

  const scenarios: ResidualScenario[] = SENSITIVITY_SCENARIOS.map((spec) => {
    const tailRatio =
      spec.key === "central"
        ? residual.centralTailRatio
        : spec.ratioOfObserved === null
          ? residual.observedRatio
          : spec.ratioOfObserved * residual.observedRatio;
    return scenarioFor(spec.key, spec.label, tailRatio, observedWealthUsd, residual, marketCapUsd);
  });

  const central = scenarios.find((s) => s.key === CENTRAL_SCENARIO_KEY)!;
  const modeledWealthUsd = central.imputedWealthUsd;
  const totalGlobalWealthUsd = central.totalGlobalWealthUsd;

  const observedGdp2024 = economies.reduce((sum, e) => sum + e.gdpUsd2024, 0);
  const clearedGdp2024 = economies
    .filter((e) => e.rightsStatus === "cleared")
    .reduce((sum, e) => sum + e.gdpUsd2024, 0);

  const ubwiPercents = scenarios.map((s) => s.ubwiPercent);

  return {
    calculatedAt: input.calculatedAt,
    methodologyVersion: METHODOLOGY_VERSION,
    residualModelVersion: RESIDUAL_MODEL_VERSION,
    numerator,
    observed: economies,
    excluded: EXCLUDED_ECONOMIES,
    observedWealthUsd,
    residual,
    modeledWealthUsd,
    totalGlobalWealthUsd,
    ubwiPercent: central.ubwiPercent,
    observedShareOfTotal: (observedWealthUsd / totalGlobalWealthUsd) * 100,
    modeledShareOfTotal: (modeledWealthUsd / totalGlobalWealthUsd) * 100,
    imputedShareOfWealth: central.imputedShareOfWealth,
    coverage: {
      observedEconomyCount: economies.length,
      rightsClearedEconomyCount: economies.filter((e) => e.rightsStatus === "cleared").length,
      observedGdpCoverage: observedGdp2024 / WORLD_GDP_2024_USD,
      rightsClearedGdpCoverage: clearedGdp2024 / WORLD_GDP_2024_USD,
      observedWealthCoverage:
        weights.observedNonHumanWealthUsd / CWON_2020_NON_HUMAN_WEALTH_USD,
    },
    scenarios,
    sensitivity: {
      lowPercent: Math.min(...ubwiPercents),
      highPercent: Math.max(...ubwiPercents),
    },
    unobservedMajorEconomies: UNOBSERVED_MAJOR_ECONOMIES,
  };
}
