import type { ComputeEconomicsInputs, ComputeEconomicsResult, PaybackSensitivityPoint } from "@/lib/compute-economics/domain";

export const HOURS_PER_YEAR = 8_760;
export const SENSITIVITY_UTILIZATION_PERCENTS = [40, 50, 60, 70, 80, 90, 100] as const;

function assertFiniteNonNegative(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a finite non-negative number`);
}

/** The single canonical implementation used by headline outputs and sensitivity. */
export function calculateComputeEconomics(priceUsdPerGpuHour: number, inputs: ComputeEconomicsInputs): ComputeEconomicsResult {
  assertFiniteNonNegative("priceUsdPerGpuHour", priceUsdPerGpuHour);
  assertFiniteNonNegative("acquisitionCostUsd", inputs.acquisitionCostUsd);
  assertFiniteNonNegative("utilization", inputs.utilization);
  assertFiniteNonNegative("electricityCostPerKwh", inputs.electricityCostPerKwh);
  assertFiniteNonNegative("powerDrawKw", inputs.powerDrawKw);
  assertFiniteNonNegative("hostingCostPerGpuHour", inputs.hostingCostPerGpuHour);
  assertFiniteNonNegative("otherOperatingCostPerGpuHour", inputs.otherOperatingCostPerGpuHour);
  if (inputs.utilization > 1) throw new RangeError("utilization must be at most 1");

  const grossAnnualRevenueUsd = priceUsdPerGpuHour * inputs.utilization * HOURS_PER_YEAR;
  const electricityAnnualCostUsd = inputs.powerDrawKw * HOURS_PER_YEAR * inputs.utilization * inputs.electricityCostPerKwh;
  const hostingAnnualCostUsd = inputs.hostingCostPerGpuHour * HOURS_PER_YEAR;
  const otherAnnualCostUsd = inputs.otherOperatingCostPerGpuHour * HOURS_PER_YEAR * inputs.utilization;
  const annualOperatingCostUsd = electricityAnnualCostUsd + hostingAnnualCostUsd + otherAnnualCostUsd;
  const netAnnualCashFlowUsd = grossAnnualRevenueUsd - annualOperatingCostUsd;
  const paybackYears = netAnnualCashFlowUsd > 0 ? inputs.acquisitionCostUsd / netAnnualCashFlowUsd : null;

  return {
    grossAnnualRevenueUsd,
    electricityAnnualCostUsd,
    hostingAnnualCostUsd,
    otherAnnualCostUsd,
    annualOperatingCostUsd,
    netAnnualCashFlowUsd,
    paybackYears,
  };
}

export function paybackSensitivity(priceUsdPerGpuHour: number, inputs: ComputeEconomicsInputs): PaybackSensitivityPoint[] {
  return SENSITIVITY_UTILIZATION_PERCENTS.map((utilizationPercent) => {
    const result = calculateComputeEconomics(priceUsdPerGpuHour, { ...inputs, utilization: utilizationPercent / 100 });
    return { utilizationPercent, paybackYears: result.paybackYears, netAnnualCashFlowUsd: result.netAnnualCashFlowUsd };
  });
}
