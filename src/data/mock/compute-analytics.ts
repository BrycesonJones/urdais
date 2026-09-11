/**
 * Compute Analytics demo data: one deterministic compute-economics data
 * graph and the views derived from it.
 *
 *   UCPI compute instruments (same ids, labels, spot histories)
 *     ↓
 *   Spot price (latest UCPI value)   ─┐
 *   Forward marks by tenor            ├→ Compute Forward Curve
 *   Fleet observations (rented/avail) ─┼→ Fleet Utilization
 *   Hardware economics + assumptions  ─┴→ Payback Period
 *
 * Every number the page shows is computed here; nothing is typed into the
 * UI. Spot marks are read from the UCPI instruments, so the two surfaces
 * cannot drift. Forward marks are demo term pricing, not exchange-traded
 * futures. All values are deterministic demo data anchored at MOCK_AS_OF.
 */

import { MARKETS } from "@/data/mock/market-detail";
import { MOCK_AS_OF } from "@/data/mock/ucpi";
import type { MarketInstrumentDetail, TimeSeriesPoint } from "@/types/market";
import { TENORS } from "@/types/compute-analytics";
import type {
  CurveShape,
  FleetObservation,
  ForwardCurve,
  ForwardMark,
  HardwareEconomics,
  PaybackAnalysis,
  PaybackPoint,
  Tenor,
  UtilizationSeries,
} from "@/types/compute-analytics";

export const COMPUTE_ANALYTICS_AS_OF = MOCK_AS_OF;

/* ---------- Instruments, shared with UCPI ---------- */

const UCPI = MARKETS.find((market) => market.symbol === "UCPI");
if (!UCPI) throw new Error("UCPI market is required for Compute Analytics");
const COMPUTE_FAMILY = UCPI.families.find((family) => family.id === "compute");
if (!COMPUTE_FAMILY) throw new Error("UCPI compute family is required for Compute Analytics");

/** UCPI's compute instruments, in UCPI's order, with their live spot histories. */
export const COMPUTE_INSTRUMENTS: MarketInstrumentDetail[] = COMPUTE_FAMILY.instruments;

/** The page opens on UCPI's headline instrument, so the two defaults cannot drift. */
export const DEFAULT_COMPUTE_INSTRUMENT_ID = UCPI.defaultInstrumentId;

export function findComputeInstrument(instrumentId: string): MarketInstrumentDetail {
  const instrument = COMPUTE_INSTRUMENTS.find((candidate) => candidate.id === instrumentId);
  if (!instrument) throw new Error(`Unknown compute instrument: ${instrumentId}`);
  return instrument;
}

/* ---------- Assumptions ---------- */

/** One explicit demo electricity assumption for every accelerator; a future backend may make it region-aware via UEPI. */
export const ELECTRICITY_COST_PER_KWH = 0.08;
export const HOURS_PER_YEAR = 8760;

/** Demo hardware and operating assumptions per accelerator. Not live prices. */
export const HARDWARE_ECONOMICS: HardwareEconomics[] = [
  { instrumentId: "ucpi-h100-sxm", acquisitionCostUsd: 30_000, powerDrawKw: 0.7, hostingCostPerGpuHour: 0.35, otherOperatingCostPerGpuHour: 0.1 },
  { instrumentId: "ucpi-h200", acquisitionCostUsd: 36_000, powerDrawKw: 0.7, hostingCostPerGpuHour: 0.35, otherOperatingCostPerGpuHour: 0.1 },
  { instrumentId: "ucpi-a100-sxm4", acquisitionCostUsd: 14_000, powerDrawKw: 0.4, hostingCostPerGpuHour: 0.3, otherOperatingCostPerGpuHour: 0.08 },
  { instrumentId: "ucpi-rtx-5090", acquisitionCostUsd: 2_400, powerDrawKw: 0.575, hostingCostPerGpuHour: 0.15, otherOperatingCostPerGpuHour: 0.05 },
  { instrumentId: "ucpi-b200", acquisitionCostUsd: 48_000, powerDrawKw: 1.0, hostingCostPerGpuHour: 0.45, otherOperatingCostPerGpuHour: 0.12 },
];

export function findHardwareEconomics(instrumentId: string): HardwareEconomics {
  const economics = HARDWARE_ECONOMICS.find((candidate) => candidate.instrumentId === instrumentId);
  if (!economics) throw new Error(`No hardware economics for ${instrumentId}`);
  return economics;
}

/* ---------- Forward curve ---------- */

const TENOR_MONTHS: Record<Tenor, number> = { spot: 0, "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };

/**
 * Forward marks as multiples of spot by tenor. Different assets carry
 * different expected compression: mature parts compress hardest, the
 * newest premium part holds nearest to spot. Demo shapes, not forecasts.
 */
const FORWARD_FACTORS: Record<string, Record<Tenor, number>> = {
  "ucpi-h100-sxm": { spot: 1, "1M": 0.985, "3M": 0.95, "6M": 0.88, "1Y": 0.76 },
  "ucpi-h200": { spot: 1, "1M": 1.005, "3M": 0.99, "6M": 0.95, "1Y": 0.86 },
  "ucpi-a100-sxm4": { spot: 1, "1M": 0.97, "3M": 0.9, "6M": 0.8, "1Y": 0.64 },
  "ucpi-rtx-5090": { spot: 1, "1M": 0.99, "3M": 0.96, "6M": 0.93, "1Y": 0.85 },
  "ucpi-b200": { spot: 1, "1M": 1.01, "3M": 1.0, "6M": 0.97, "1Y": 0.92 },
};

/** A curve is flat when the 1Y mark sits within this band of spot. */
const FLAT_BAND_PERCENT = 3;

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function curveShape(oneYearChangePercent: number): CurveShape {
  if (oneYearChangePercent < -FLAT_BAND_PERCENT) return "downward";
  if (oneYearChangePercent > FLAT_BAND_PERCENT) return "upward";
  return "flat";
}

export const FORWARD_CURVES: ForwardCurve[] = COMPUTE_INSTRUMENTS.map((instrument) => {
  const factors = FORWARD_FACTORS[instrument.id];
  if (!factors) throw new Error(`No forward factors for ${instrument.id}`);
  const spot = instrument.snapshot.value;
  const marks: ForwardMark[] = TENORS.map((tenor) => {
    const price = round4(spot * factors[tenor]);
    return { instrumentId: instrument.id, tenor, tenorMonths: TENOR_MONTHS[tenor], forwardPricePerGpuHour: price, changeVsSpotPercent: (price / spot - 1) * 100 };
  });
  return {
    instrumentId: instrument.id,
    label: instrument.shortLabel,
    unit: instrument.unit,
    spotPricePerGpuHour: spot,
    marks,
    shape: curveShape(marks[marks.length - 1]!.changeVsSpotPercent),
  };
});

export function findForwardCurve(instrumentId: string): ForwardCurve {
  const curve = FORWARD_CURVES.find((candidate) => candidate.instrumentId === instrumentId);
  if (!curve) throw new Error(`No forward curve for ${instrumentId}`);
  return curve;
}

/* ---------- Fleet utilization ---------- */

const WEEK = 7 * 86_400;
/** Weekly fleet observations over the trailing year. */
const FLEET_WEEKS = 53;

type FleetProfile = { available2025: number; fleetGrowth: number; targetUtilization: number; trend: number; wave: number; seed: number };

/** Fleet size at the start of the window, its growth over the year, and the utilization shape it settles into. */
const FLEET_PROFILES: Record<string, FleetProfile> = {
  "ucpi-h100-sxm": { available2025: 380_000, fleetGrowth: 0.18, targetUtilization: 0.86, trend: 0.05, wave: 0.02, seed: 1 },
  "ucpi-h200": { available2025: 120_000, fleetGrowth: 0.6, targetUtilization: 0.85, trend: 0.03, wave: 0.025, seed: 2 },
  "ucpi-a100-sxm4": { available2025: 260_000, fleetGrowth: -0.06, targetUtilization: 0.76, trend: -0.07, wave: 0.02, seed: 3 },
  "ucpi-rtx-5090": { available2025: 45_000, fleetGrowth: 1.2, targetUtilization: 0.7, trend: 0.06, wave: 0.04, seed: 4 },
  "ucpi-b200": { available2025: 30_000, fleetGrowth: 2.4, targetUtilization: 0.78, trend: 0.06, wave: 0.03, seed: 5 },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Rented and available GPU counts per week. Utilization is never stored:
 * it is always rented ÷ available, and the modelled share is clamped so it
 * stays inside 0–100%.
 */
export const FLEET_OBSERVATIONS: FleetObservation[] = COMPUTE_INSTRUMENTS.flatMap((instrument) => {
  const p = FLEET_PROFILES[instrument.id];
  if (!p) throw new Error(`No fleet profile for ${instrument.id}`);
  return Array.from({ length: FLEET_WEEKS }, (_, index) => {
    const progress = index / (FLEET_WEEKS - 1);
    const time = COMPUTE_ANALYTICS_AS_OF - (FLEET_WEEKS - 1 - index) * WEEK;
    const available = Math.round(p.available2025 * (1 + p.fleetGrowth * progress));
    const share = clamp(
      p.targetUtilization + p.trend * (progress - 0.5) + p.wave * Math.sin(p.seed * 1.3 + index * 0.55) + 0.01 * Math.cos(p.seed + index * 1.9),
      0.05,
      0.99,
    );
    return { time, instrumentId: instrument.id, availableGpuCount: available, rentedGpuCount: Math.round(available * share) };
  });
});

export function utilizationPercent(observation: FleetObservation): number {
  return (observation.rentedGpuCount / observation.availableGpuCount) * 100;
}

export const UTILIZATION_SERIES: UtilizationSeries[] = COMPUTE_INSTRUMENTS.map((instrument) => {
  const points: TimeSeriesPoint[] = FLEET_OBSERVATIONS.filter((row) => row.instrumentId === instrument.id).map((row) => ({
    time: row.time,
    value: utilizationPercent(row),
  }));
  return { instrumentId: instrument.id, label: instrument.shortLabel, points, currentPercent: points[points.length - 1]!.value };
});

/** Current utilization, highest first. */
export const UTILIZATION_RANKING: UtilizationSeries[] = [...UTILIZATION_SERIES].sort((a, b) => b.currentPercent - a.currentPercent);

export function findUtilization(instrumentId: string): UtilizationSeries {
  const series = UTILIZATION_SERIES.find((candidate) => candidate.instrumentId === instrumentId);
  if (!series) throw new Error(`No utilization series for ${instrumentId}`);
  return series;
}

/* ---------- Payback ---------- */

/**
 * Payback along the forward curve, using the latest fleet utilization:
 *   gross      = forward price × utilization × 8,760
 *   electricity = kW × 8,760 × utilization × $/kWh   (power is drawn while rented)
 *   hosting    = hosting $/GPU-hour × 8,760             (paid on availability)
 *   other      = other $/GPU-hour × 8,760 × utilization
 *   net        = gross − electricity − hosting − other
 *   payback    = acquisition cost ÷ net, or null when net ≤ 0 (not economic)
 */
export function paybackAnalysis(instrumentId: string): PaybackAnalysis {
  const instrument = findComputeInstrument(instrumentId);
  const economics = findHardwareEconomics(instrumentId);
  const utilization = findUtilization(instrumentId).currentPercent / 100;
  const curve = findForwardCurve(instrumentId);
  const points: PaybackPoint[] = curve.marks.map((mark) => {
    const gross = mark.forwardPricePerGpuHour * utilization * HOURS_PER_YEAR;
    const electricity = economics.powerDrawKw * HOURS_PER_YEAR * utilization * ELECTRICITY_COST_PER_KWH;
    const hosting = economics.hostingCostPerGpuHour * HOURS_PER_YEAR;
    const other = economics.otherOperatingCostPerGpuHour * HOURS_PER_YEAR * utilization;
    const net = gross - electricity - hosting - other;
    return {
      tenor: mark.tenor,
      forwardPricePerGpuHour: mark.forwardPricePerGpuHour,
      grossAnnualRevenueUsd: gross,
      electricityAnnualCostUsd: electricity,
      hostingAnnualCostUsd: hosting,
      otherAnnualCostUsd: other,
      netAnnualRevenueUsd: net,
      paybackYears: net > 0 ? economics.acquisitionCostUsd / net : null,
    };
  });
  return { instrumentId, label: instrument.shortLabel, utilizationPercent: utilization * 100, economics, electricityCostPerKwh: ELECTRICITY_COST_PER_KWH, points };
}

export const PAYBACK_ANALYSES: ReadonlyMap<string, PaybackAnalysis> = new Map(
  COMPUTE_INSTRUMENTS.map((instrument) => [instrument.id, paybackAnalysis(instrument.id)]),
);

export function findPayback(instrumentId: string): PaybackAnalysis {
  const analysis = PAYBACK_ANALYSES.get(instrumentId);
  if (!analysis) throw new Error(`No payback analysis for ${instrumentId}`);
  return analysis;
}
