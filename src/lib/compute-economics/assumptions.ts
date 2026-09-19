import type { ComputeEconomicsAssumptions, ComputeEconomicsInputs, EconomicAssumption } from "@/lib/compute-economics/domain";

function assumed<Unit extends string>(value: number, unit: Unit, description: string): EconomicAssumption<Unit> {
  return { value, unit, description, status: "assumption" };
}

function defaults(input: {
  acquisitionCostUsd: number;
  utilization: number;
  electricityCostPerKwh: number;
  powerDrawKw: number;
  hostingCostPerGpuHour: number;
  otherOperatingCostPerGpuHour: number;
}): ComputeEconomicsAssumptions {
  return {
    acquisitionCostUsd: assumed(input.acquisitionCostUsd, "USD/accelerator", "Scenario acquisition cost; not an observed hardware quote."),
    utilization: assumed(input.utilization, "fraction", "Share of annual hours billed to renters; not observed operator utilization."),
    electricityCostPerKwh: assumed(input.electricityCostPerKwh, "USD/kWh", "Scenario electricity rate; not an observed power contract."),
    powerDrawKw: assumed(input.powerDrawKw, "kW", "Scenario accelerator power draw while utilized."),
    hostingCostPerGpuHour: assumed(input.hostingCostPerGpuHour, "USD/GPU-hour available", "Scenario rack, cooling, network, and infrastructure cost for every available hour."),
    otherOperatingCostPerGpuHour: assumed(input.otherOperatingCostPerGpuHour, "USD/GPU-hour utilized", "Scenario variable operating cost for each utilized hour."),
  };
}

/**
 * Urdais scenario defaults. These values are assumptions, not market observations.
 * Keys are the canonical production UCPI listed-GPU symbols; no demo IDs enter
 * the Compute Economics path.
 */
export const COMPUTE_ECONOMICS_DEFAULTS: Readonly<Record<string, ComputeEconomicsAssumptions>> = {
  "UCPI-H100-SXM-LISTED": defaults({ acquisitionCostUsd: 30_000, utilization: 0.88, electricityCostPerKwh: 0.08, powerDrawKw: 0.7, hostingCostPerGpuHour: 0.35, otherOperatingCostPerGpuHour: 0.1 }),
  "UCPI-H200-SXM-LISTED": defaults({ acquisitionCostUsd: 36_000, utilization: 0.86, electricityCostPerKwh: 0.08, powerDrawKw: 0.7, hostingCostPerGpuHour: 0.35, otherOperatingCostPerGpuHour: 0.1 }),
  "UCPI-B200-LISTED": defaults({ acquisitionCostUsd: 48_000, utilization: 0.81, electricityCostPerKwh: 0.08, powerDrawKw: 1, hostingCostPerGpuHour: 0.45, otherOperatingCostPerGpuHour: 0.12 }),
  "UCPI-A100-SXM4-80GB-LISTED": defaults({ acquisitionCostUsd: 14_000, utilization: 0.73, electricityCostPerKwh: 0.08, powerDrawKw: 0.4, hostingCostPerGpuHour: 0.3, otherOperatingCostPerGpuHour: 0.08 }),
  "UCPI-RTX-5090-LISTED": defaults({ acquisitionCostUsd: 2_400, utilization: 0.72, electricityCostPerKwh: 0.08, powerDrawKw: 0.575, hostingCostPerGpuHour: 0.15, otherOperatingCostPerGpuHour: 0.05 }),
};

export function assumptionDefaultsFor(symbol: string): ComputeEconomicsAssumptions | null {
  return COMPUTE_ECONOMICS_DEFAULTS[symbol] ?? null;
}

export function assumptionValues(assumptions: ComputeEconomicsAssumptions): ComputeEconomicsInputs {
  return {
    acquisitionCostUsd: assumptions.acquisitionCostUsd.value,
    utilization: assumptions.utilization.value,
    electricityCostPerKwh: assumptions.electricityCostPerKwh.value,
    powerDrawKw: assumptions.powerDrawKw.value,
    hostingCostPerGpuHour: assumptions.hostingCostPerGpuHour.value,
    otherOperatingCostPerGpuHour: assumptions.otherOperatingCostPerGpuHour.value,
  };
}
