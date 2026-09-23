/**
 * The analytical layer's shapes.
 *
 * One analytics run covers a set of market-years and alpha scenarios; each combination produces
 * one scenario result. The result is the durable object, and it carries everything needed to
 * answer "which observations and which rules produced this number" without reading application
 * code: the methodology version and its digest, the parameters in force, a digest of the exact
 * observations consumed, and the eligibility evidence the market-year passed on.
 *
 * `observed` and `assumptions` stay structurally apart here exactly as they do in the FC-2
 * contract, because the boundary is the product's main claim about itself.
 */

import type {
  FlexibleCapacityMarket, ModeledPeriod, PeakReferenceRule,
} from "@/lib/flexible-capacity/types";

export type RunKind = "production" | "research";

export type RunStatus = "running" | "validated" | "failed";

export type FailedPhase = "eligibility" | "methodology_guard" | "calculation" | "validation" | "persistence";

/** Everything a scenario result records about the evidence it rests on. */
export type ScenarioObservedRecord = {
  readonly peakReferenceMw: number;
  readonly peakReferenceAtUtc: string;
  readonly peakRegionLocalDate: string;
  readonly peakRegionExpectedHours: number;
  readonly peakRegionPresentHours: number;
  readonly meanLoadMw: number;
  readonly observationCount: number;
  readonly expectedObservationCount: number;
  readonly missingObservationCount: number;
  readonly coverageRatio: number;
  readonly maxContiguousGapHours: number;
};

/** Everything a scenario result records about the rules it applied. */
export type ScenarioAssumptionsRecord = {
  readonly annualCurtailmentEnergyFraction: number;
  readonly equivalentFullLoadHours: number;
  readonly nominalEquivalentFullLoadHours: number;
  readonly peakReferenceRule: PeakReferenceRule;
  readonly peakRegionRule: string;
  readonly reboundModel: string;
  readonly modeledLoadShape: string;
  readonly batteryEnabled: false;
  readonly minimumAnnualCoverage: number;
  /** null while the methodology has not resolved one; a research run may still calculate. */
  readonly maximumContiguousGapHours: number | null;
};

export type ScenarioOutcome = {
  readonly curtailmentEnabledHeadroomMw: number;
  readonly curtailmentEnabledHeadroomGw: number;
  readonly curtailedEnergyMwh: number;
  readonly curtailmentBudgetMwh: number;
  readonly curtailmentClockHours: number;
  readonly curtailmentEventCount: number;
  readonly meanCurtailmentEventHours: number;
  readonly maxCurtailmentEventHours: number;
};

export type ScenarioRecord = {
  readonly market: FlexibleCapacityMarket;
  readonly modeledPeriod: ModeledPeriod;
  readonly methodology: {
    readonly slug: string;
    readonly version: string;
    readonly documentSha256: string;
  };
  /** Identifies the exact observations consumed, independent of the rules applied to them. */
  readonly observationsDigest: string;
  /** Identifies observations + rules + alpha together. Equal digests mean an identical question. */
  readonly inputDigest: string;
  readonly observed: ScenarioObservedRecord;
  readonly assumptions: ScenarioAssumptionsRecord;
  readonly outcome: ScenarioOutcome;
  readonly calculatedAt: string;
};

export type AnalyticsRunRequest = {
  readonly markets: readonly FlexibleCapacityMarket[];
  readonly localYears: readonly number[];
  readonly alphaScenarios: readonly number[];
  readonly runKind: RunKind;
  /** Research runs may proceed while `maximum_contiguous_gap_hours` is unresolved. */
  readonly allowUnresolvedGapThreshold?: boolean;
  readonly now?: () => Date;
};

export type SkippedMarketYear = {
  readonly market: FlexibleCapacityMarket;
  readonly localYear: number;
  readonly reason: string;
  readonly failureCodes: readonly string[];
};

export type AnalyticsRunOutcome = {
  readonly runId: string | null;
  readonly status: RunStatus;
  readonly runKind: RunKind;
  readonly methodologyVersion: string;
  readonly methodologyContentHash: string;
  readonly scenariosCalculated: number;
  readonly scenariosStored: number;
  readonly scenariosReused: number;
  readonly marketYearsEligible: number;
  readonly marketYearsSkipped: readonly SkippedMarketYear[];
  readonly failedPhase?: FailedPhase;
  readonly errorClass?: string;
  readonly errorDetail?: string;
  readonly elapsedMs: number;
};

export class FlexibleCapacityAnalyticsError extends Error {
  readonly phase: FailedPhase;
  constructor(phase: FailedPhase, detail: string) {
    super(`flexible capacity analytics failed in ${phase}: ${detail}`);
    this.name = "FlexibleCapacityAnalyticsError";
    this.phase = phase;
  }
}
