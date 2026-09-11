/**
 * Power Analytics: whether the physical grid can deliver enough electricity,
 * fast enough, to power the Information Age. These shapes describe one demo
 * data graph (power markets → load, interconnection, infrastructure, and
 * flexibility observations) and the views derived from it. UEPI answers
 * what electricity costs; this answers whether it can be delivered.
 */

/** An organised wholesale power market, shared with UEPI's instruments. */
export type PowerMarket = {
  /** Same id as the UEPI instrument, e.g. "power-pjm". */
  id: string;
  name: string;
  regionLabel: string;
};

/**
 * One quarter of load and deliverability for a market. Deliverable
 * capacity is what transmission, substations, and interconnection can
 * physically serve; it is not generation capacity.
 */
export type LoadObservation = {
  /** Unix seconds (UTC) at the start of the quarter. */
  time: number;
  marketId: string;
  /** Observed peak load; null for quarters after today. */
  actualLoadGw: number | null;
  /** Projected peak demand; null for quarters before today. */
  forecastLoadGw: number | null;
  deliverableCapacityGw: number;
};

/** Yearly interconnection state. Large-load and generation queues are kept separate. */
export type InterconnectionObservation = {
  year: number;
  marketId: string;
  queuedLoadGw: number;
  queuedGenerationGw: number;
  medianLoadWaitMonths: number;
  medianGenerationWaitMonths: number;
};

/** Yearly grid buildout: what was added to the physical network. */
export type InfrastructureObservation = {
  year: number;
  marketId: string;
  transmissionCapacityAddedGw: number;
  transmissionMilesAdded: number;
  substationCapacityAddedGva: number;
  /** Modelled lead time for major grid transformers; lower is better. */
  transformerLeadTimeMonths: number;
};

/** Flexibility potential per market: load that could step aside during constrained hours. */
export type FlexibilityAssumption = {
  marketId: string;
  interruptibleLoadGw: number;
  batteryShiftableLoadGw: number;
};

export type QueueMode = "load" | "generation";

export type QueueRow = {
  market: PowerMarket;
  queuedGw: number;
  medianWaitMonths: number;
};

export type HeadroomState = "tight" | "moderate" | "available";

export type HeadroomRow = {
  market: PowerMarket;
  loadGw: number;
  deliverableCapacityGw: number;
  headroomGw: number;
  headroomPercent: number;
  state: HeadroomState;
};

export type BuildoutMetricId = "transfer-capacity" | "circuit-miles" | "substations" | "transformer-lead-time";

export type BuildoutMetric = {
  id: BuildoutMetricId;
  label: string;
  unit: string;
  description: string;
  /** True when a smaller value is the better outcome. */
  lowerIsBetter: boolean;
  /** Aggregate across the market universe, by year. */
  points: { year: number; value: number }[];
};

export type FlexibilityScenario = {
  flexibleHoursPerYear: number;
  interruptibleGw: number;
  batteryGw: number;
  /** Always interruptibleGw + batteryGw. */
  unlockedGw: number;
};
