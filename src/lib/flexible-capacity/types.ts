/**
 * Flexible Capacity: the calculation contract.
 *
 * The product answers one counterfactual question about observed balancing-authority demand:
 *
 *   How much additional flat electrical load could this balancing authority have carried, without
 *   pushing demand above a stated peak reference, if that new load accepted a stated annual
 *   curtailment energy allowance?
 *
 * The answer is `curtailment_enabled_headroom_gw`, and it is a **generation-adequacy scenario**
 * figure. It is not firm capacity, not observed available capacity, not transmission or
 * distribution headroom, and not compute capacity of any kind. Methodology 1.0.0 §11 lists the
 * terminology this product may not use, and `FORBIDDEN_OUTPUT_TERMS` enforces it in code.
 *
 * The shape below exists to keep one boundary permanently visible: `observed` holds quantities
 * measured by a publisher, `assumptions` holds quantities Urdais chose. Nothing may sit in both,
 * and no consumer has to guess which is which.
 */

/** The seven organised wholesale markets, by the slug `reference.grid_areas` uses. */
export const FLEXIBLE_CAPACITY_MARKETS = [
  "ercot", "pjm", "miso", "spp", "caiso", "nyiso", "iso-ne",
] as const;

export type FlexibleCapacityMarket = (typeof FLEXIBLE_CAPACITY_MARKETS)[number];

/**
 * How the peak reference is chosen.
 *
 * `modeled_period_observed_peak` is the only rule methodology 1.0.0 adopts. The others are named
 * so that the alternatives considered are part of the record rather than lost, and so that
 * adopting one later is a methodology version bump rather than a code change.
 */
export const PEAK_REFERENCE_RULES = [
  "modeled_period_observed_peak",
  "prior_period_observed_peak",
  "seasonal_observed_peak",
  "percentile_of_observed_load",
] as const;

export type PeakReferenceRule = (typeof PEAK_REFERENCE_RULES)[number];

/** One canonical hourly observation of actual demand, already resolved through supersession. */
export type HourlyLoadPoint = {
  /** UTC instant at the start of the hour, ISO-8601 with a `Z`. Never a wall-clock label. */
  readonly periodStartUtc: string;
  readonly valueMw: number;
};

/**
 * The window a scenario is computed over: one market-local calendar year, expressed as a
 * half-open interval of UTC instants.
 *
 * Expressed in instants on purpose. A local year runs from local 1 January 00:00 to the next local
 * 1 January 00:00, both of which fall in standard time, so the interval contains exactly
 * 24 x days hours however many daylight-saving transitions lie inside it. Building the series from
 * wall-clock hour labels instead would lose an hour every spring and double one every autumn;
 * indexing by instant makes both transitions non-events. Methodology 1.0.0 §6.
 */
export type ModeledPeriod = {
  readonly market: FlexibleCapacityMarket;
  /** The market-local calendar year, e.g. 2025. */
  readonly localYear: number;
  /** IANA zone from `reference.grid_areas.timezone_name`. */
  readonly timezone: string;
  /** Inclusive lower bound, ISO-8601 UTC. */
  readonly startUtc: string;
  /** Exclusive upper bound, ISO-8601 UTC. */
  readonly endUtc: string;
  /** 24 x days in the local year: 8760, or 8784 when the local year is a leap year. */
  readonly expectedObservationCount: number;
};

export type FlexibleCapacityScenarioInput = {
  readonly market: FlexibleCapacityMarket;
  readonly modeledPeriod: ModeledPeriod;
  /** Validated canonical actual-demand observations inside the period, chronologically ordered. */
  readonly hourlyLoadSeries: readonly HourlyLoadPoint[];
  /** Alpha: the new load's annual curtailed energy as a fraction of its own annual energy. */
  readonly annualCurtailmentEnergyFraction: number;
  readonly peakReferenceRule: PeakReferenceRule;
};

/** Quantities a publisher measured. Nothing Urdais chose may appear here. */
export type ScenarioObserved = {
  readonly peakReferenceMw: number;
  /** UTC instant of the hour that set the peak reference. */
  readonly peakReferenceAtUtc: string;
  readonly meanLoadMw: number;
  /** T: valid hourly observations actually used. The budget is stated against this, not 8760. */
  readonly observationCount: number;
  readonly expectedObservationCount: number;
  readonly missingObservationCount: number;
  /** observationCount / expectedObservationCount, in [0, 1]. */
  readonly coverageRatio: number;
  /**
   * Whether the local calendar day holding the peak reference is completely present, and how many
   * of its hours were expected. Reported because a peak set from a day with holes in it is the one
   * coverage defect that moves the answer most, and the ratio alone would not show it.
   */
  readonly peakRegion: {
    readonly localDate: string;
    readonly expectedHours: number;
    readonly presentHours: number;
    readonly complete: boolean;
  };
};

/** Quantities Urdais chose. Nothing a publisher measured may appear here. */
export type ScenarioAssumptions = {
  readonly annualCurtailmentEnergyFraction: number;
  /**
   * alpha x T. The curtailment budget restated in hours: the energy allowance divided by the new
   * load's own size. It is an energy equivalence, not a count of clock hours with curtailment and
   * not a count of events; `result.curtailmentClockHours` is the clock-hour figure and the two
   * are different numbers. Methodology 1.0.0 §4.
   */
  readonly equivalentFullLoadHours: number;
  /** alpha x expectedObservationCount: the same allowance against a complete year. */
  readonly nominalEquivalentFullLoadHours: number;
  readonly peakReferenceRule: PeakReferenceRule;
  /** 1.0.0: `no_rebound` -- curtailed energy is forgone, never deferred into a later hour. */
  readonly reboundModel: string;
  /** 1.0.0: `flat` -- the hypothetical new load is the same in every hour of the period. */
  readonly modeledLoadShape: string;
  /** 1.0.0: always false. Storage is not additive with curtailable load. Methodology 1.0.0 §9. */
  readonly batteryEnabled: false;
};

export type CurtailmentEvent = {
  readonly startUtc: string;
  readonly endUtc: string;
  readonly hours: number;
};

export type ScenarioResult = {
  /** Delta-L*, megawatts of additional flat load. */
  readonly curtailmentEnabledHeadroomMw: number;
  readonly curtailmentEnabledHeadroomGw: number;
  /** Sum of R_t over the period, MWh. Never exceeds `curtailmentBudgetMwh`. */
  readonly curtailedEnergyMwh: number;
  /** alpha x Delta-L* x T, MWh. */
  readonly curtailmentBudgetMwh: number;
  /** Hours in which any curtailment occurs. Not the same as equivalentFullLoadHours. */
  readonly curtailmentClockHours: number;
  readonly curtailmentEventCount: number;
  readonly meanCurtailmentEventHours: number;
  readonly maxCurtailmentEventHours: number;
};

export type FlexibleCapacityScenarioResult = {
  readonly market: FlexibleCapacityMarket;
  readonly methodology: { readonly slug: string; readonly version: string };
  readonly modeledPeriod: ModeledPeriod;
  readonly observed: ScenarioObserved;
  readonly assumptions: ScenarioAssumptions;
  readonly result: ScenarioResult;
  /** Stated on every result, never only in documentation. */
  readonly limitations: readonly string[];
};

export class FlexibleCapacityDomainError extends Error {
  constructor(detail: string) {
    super(`flexible capacity scenario input is invalid: ${detail}`);
    this.name = "FlexibleCapacityDomainError";
  }
}
