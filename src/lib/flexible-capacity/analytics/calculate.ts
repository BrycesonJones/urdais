/**
 * Turning an eligible market-year into scenario records.
 *
 * The arithmetic is not repeated here. `runFlexibleCapacityScenario` is the FC-2 contract and
 * stays the single implementation of the model; this layer decides *whether* a market-year may be
 * calculated, runs the scenario for each alpha, and attaches the provenance a durable result needs
 * — the methodology digest, the parameters in force, and the two input digests.
 *
 * Eligibility is checked once per market-year rather than once per alpha. The three conditions are
 * properties of the evidence, not of the scenario: a year whose peak day has a hole in it is
 * equally unusable at every alpha, and re-deciding that three times would invite the three answers
 * to drift apart.
 */

import {
  BATTERY_ENABLED, MAXIMUM_CONTIGUOUS_GAP_HOURS, METHODOLOGY_DOCUMENT_SHA256, METHODOLOGY_SLUG,
  METHODOLOGY_VERSION, MINIMUM_ANNUAL_COVERAGE, MODELED_LOAD_SHAPE, PEAK_REFERENCE_RULE,
  PEAK_REGION_RULE, REBOUND_MODEL,
} from "@/lib/flexible-capacity/methodology";
import { assessMarketYearEligibility, type MarketYearEligibility }
  from "@/lib/flexible-capacity/analytics/eligibility";
import { inputDigest, observationsDigest } from "@/lib/flexible-capacity/analytics/digest";
import { runFlexibleCapacityScenario } from "@/lib/flexible-capacity/scenario";
import type { ScenarioRecord } from "@/lib/flexible-capacity/analytics/types";
import type {
  FlexibleCapacityMarket, HourlyLoadPoint, ModeledPeriod,
} from "@/lib/flexible-capacity/types";

/**
 * The approved parameters the calculation actually depends on, as they enter the input digest.
 *
 * Only the ones that can change a number. A parameter that documents scope -- `market_scope`, the
 * two inventory dispositions -- is registry governance and does not belong in a digest whose job
 * is to say "the same question was asked of the same evidence".
 */
export function calculationParameters(
  maximumContiguousGapHours: number | null = MAXIMUM_CONTIGUOUS_GAP_HOURS,
): Readonly<Record<string, string | number | boolean | null>> {
  return {
    battery_enabled: BATTERY_ENABLED,
    maximum_contiguous_gap_hours: maximumContiguousGapHours,
    minimum_annual_coverage: MINIMUM_ANNUAL_COVERAGE,
    modeled_load_shape: MODELED_LOAD_SHAPE,
    peak_reference_rule: PEAK_REFERENCE_RULE,
    peak_region_coverage_rule: PEAK_REGION_RULE,
    rebound_model: REBOUND_MODEL,
  };
}

export type MarketYearCalculation = {
  readonly market: FlexibleCapacityMarket;
  readonly modeledPeriod: ModeledPeriod;
  readonly eligibility: MarketYearEligibility;
  /** Empty when the market-year is ineligible. Nothing partial is ever produced. */
  readonly scenarios: readonly ScenarioRecord[];
};

export type CalculateOptions = {
  readonly allowUnresolvedGapThreshold?: boolean;
  readonly maximumContiguousGapHours?: number | null;
  readonly now?: () => Date;
};

export function calculateMarketYear(
  market: FlexibleCapacityMarket,
  modeledPeriod: ModeledPeriod,
  series: readonly HourlyLoadPoint[],
  alphaScenarios: readonly number[],
  options: CalculateOptions = {},
): MarketYearCalculation {
  const eligibility = assessMarketYearEligibility(series, modeledPeriod, {
    allowUnresolvedGapThreshold: options.allowUnresolvedGapThreshold,
    ...(options.maximumContiguousGapHours === undefined
      ? {} : { maximumContiguousGapHours: options.maximumContiguousGapHours }),
  });
  if (!eligibility.eligible) return { market, modeledPeriod, eligibility, scenarios: [] };

  const calculatedAt = (options.now ?? (() => new Date()))().toISOString();
  const evidence = observationsDigest(series);
  const appliedThreshold = eligibility.maxContiguousGapThreshold;
  const parameters = calculationParameters(appliedThreshold);

  const scenarios = alphaScenarios.map((alpha): ScenarioRecord => {
    const run = runFlexibleCapacityScenario({
      market, modeledPeriod, hourlyLoadSeries: series,
      annualCurtailmentEnergyFraction: alpha, peakReferenceRule: PEAK_REFERENCE_RULE,
    });
    return {
      market,
      modeledPeriod,
      methodology: {
        slug: METHODOLOGY_SLUG,
        version: METHODOLOGY_VERSION,
        documentSha256: METHODOLOGY_DOCUMENT_SHA256,
      },
      observationsDigest: evidence,
      inputDigest: inputDigest({
        market, modeledPeriod, observationsDigest: evidence,
        methodologySlug: METHODOLOGY_SLUG,
        methodologyVersion: METHODOLOGY_VERSION,
        methodologyDocumentSha256: METHODOLOGY_DOCUMENT_SHA256,
        parameters, alpha,
      }),
      observed: {
        peakReferenceMw: run.observed.peakReferenceMw,
        peakReferenceAtUtc: run.observed.peakReferenceAtUtc,
        peakRegionLocalDate: run.observed.peakRegion.localDate,
        peakRegionExpectedHours: run.observed.peakRegion.expectedHours,
        peakRegionPresentHours: run.observed.peakRegion.presentHours,
        meanLoadMw: run.observed.meanLoadMw,
        observationCount: run.observed.observationCount,
        expectedObservationCount: run.observed.expectedObservationCount,
        missingObservationCount: run.observed.missingObservationCount,
        coverageRatio: run.observed.coverageRatio,
        maxContiguousGapHours: eligibility.maxContiguousGapHours,
      },
      assumptions: {
        annualCurtailmentEnergyFraction: alpha,
        equivalentFullLoadHours: run.assumptions.equivalentFullLoadHours,
        nominalEquivalentFullLoadHours: run.assumptions.nominalEquivalentFullLoadHours,
        peakReferenceRule: run.assumptions.peakReferenceRule,
        peakRegionRule: PEAK_REGION_RULE,
        reboundModel: run.assumptions.reboundModel,
        modeledLoadShape: run.assumptions.modeledLoadShape,
        batteryEnabled: BATTERY_ENABLED,
        minimumAnnualCoverage: MINIMUM_ANNUAL_COVERAGE,
        maximumContiguousGapHours: appliedThreshold,
      },
      outcome: {
        curtailmentEnabledHeadroomMw: run.result.curtailmentEnabledHeadroomMw,
        curtailmentEnabledHeadroomGw: run.result.curtailmentEnabledHeadroomGw,
        curtailedEnergyMwh: run.result.curtailedEnergyMwh,
        curtailmentBudgetMwh: run.result.curtailmentBudgetMwh,
        curtailmentClockHours: run.result.curtailmentClockHours,
        curtailmentEventCount: run.result.curtailmentEventCount,
        meanCurtailmentEventHours: run.result.meanCurtailmentEventHours,
        maxCurtailmentEventHours: run.result.maxCurtailmentEventHours,
      },
      calculatedAt,
    };
  });

  return { market, modeledPeriod, eligibility, scenarios };
}
