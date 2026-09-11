/**
 * Compute Analytics: the economics of owning, renting, and deploying
 * computational infrastructure. These shapes describe one demo data graph
 * (UCPI compute instruments → spot history, forward marks, fleet
 * observations, hardware economics) and the views derived from it. UCPI
 * answers what usable compute costs today; this answers where it is
 * priced forward, how tight the fleet is, and how fast hardware pays back.
 */

import type { TimeSeriesPoint } from "@/types/market";

/** Term structure tenors, in display order. "spot" is the current UCPI mark. */
export const TENORS = ["spot", "1M", "3M", "6M", "1Y"] as const;
export type Tenor = (typeof TENORS)[number];
/** Display label per tenor. */
export const TENOR_LABEL: Record<Tenor, string> = { spot: "Spot", "1M": "1M", "3M": "3M", "6M": "6M", "1Y": "1Y" };

/** Explicit hardware and operating assumptions per accelerator. Demo values, not quotes. */
export type HardwareEconomics = {
  instrumentId: string;
  /** Acquisition cost per accelerator, USD. */
  acquisitionCostUsd: number;
  /** Power drawn while rented, kW. */
  powerDrawKw: number;
  /** Hosting (rack, cooling, network) per available GPU-hour, USD, paid whether or not rented. */
  hostingCostPerGpuHour: number;
  /** Other operating cost per rented GPU-hour, USD. */
  otherOperatingCostPerGpuHour: number;
};

/** One mark on the forward curve. Demo term pricing, not an exchange-traded future. */
export type ForwardMark = {
  instrumentId: string;
  tenor: Tenor;
  tenorMonths: number;
  forwardPricePerGpuHour: number;
  /** Difference versus the spot mark, percent. */
  changeVsSpotPercent: number;
};

export type CurveShape = "downward" | "flat" | "upward";

export type ForwardCurve = {
  instrumentId: string;
  label: string;
  unit: string;
  spotPricePerGpuHour: number;
  marks: ForwardMark[];
  shape: CurveShape;
};

/** A fleet observation: rented GPUs out of those available to rent. */
export type FleetObservation = {
  time: number;
  instrumentId: string;
  availableGpuCount: number;
  rentedGpuCount: number;
};

export type UtilizationSeries = {
  instrumentId: string;
  label: string;
  /** utilization = rented ÷ available, percent, one point per observation. */
  points: TimeSeriesPoint[];
  currentPercent: number;
};

export type PaybackPoint = {
  tenor: Tenor;
  forwardPricePerGpuHour: number;
  grossAnnualRevenueUsd: number;
  electricityAnnualCostUsd: number;
  hostingAnnualCostUsd: number;
  otherAnnualCostUsd: number;
  netAnnualRevenueUsd: number;
  /** null when net annual revenue is not positive: the hardware never pays back. */
  paybackYears: number | null;
};

export type PaybackAnalysis = {
  instrumentId: string;
  label: string;
  /** Utilization used for every tenor: the latest fleet observation. */
  utilizationPercent: number;
  economics: HardwareEconomics;
  electricityCostPerKwh: number;
  points: PaybackPoint[];
};
