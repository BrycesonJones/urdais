import { describe, expect, it } from "vitest";

import { calculateComputeEconomics, paybackSensitivity } from "@/lib/compute-economics/calculate";
import type { ComputeEconomicsInputs } from "@/lib/compute-economics/domain";

const INPUTS: ComputeEconomicsInputs = { acquisitionCostUsd: 30_000, utilization: 0.8, electricityCostPerKwh: 0.1, powerDrawKw: 0.7, hostingCostPerGpuHour: 0.25, otherOperatingCostPerGpuHour: 0.05 };

describe("calculateComputeEconomics", () => {
  it("produces an auditable payback from the displayed observed price and assumptions", () => {
    const result = calculateComputeEconomics(4, INPUTS);
    expect(result.grossAnnualRevenueUsd).toBe(4 * 0.8 * 8_760);
    expect(result.electricityAnnualCostUsd).toBeCloseTo(0.7 * 0.1 * 0.8 * 8_760, 10);
    expect(result.hostingAnnualCostUsd).toBe(0.25 * 8_760);
    expect(result.otherAnnualCostUsd).toBeCloseTo(0.05 * 0.8 * 8_760, 10);
    expect(result.annualOperatingCostUsd).toBe(result.electricityAnnualCostUsd + result.hostingAnnualCostUsd + result.otherAnnualCostUsd);
    expect(result.netAnnualCashFlowUsd).toBe(result.grossAnnualRevenueUsd - result.annualOperatingCostUsd);
    expect(result.paybackYears).toBe(30_000 / result.netAnnualCashFlowUsd);
  });

  it("returns no finite payback for zero or negative annual cash flow", () => {
    expect(calculateComputeEconomics(0, INPUTS).paybackYears).toBeNull();
    expect(calculateComputeEconomics(4, { ...INPUTS, utilization: 0 }).paybackYears).toBeNull();
    expect(calculateComputeEconomics(0.1, { ...INPUTS, hostingCostPerGpuHour: 10 }).paybackYears).toBeNull();
  });

  it("recalculates when an independently adjustable assumption changes", () => {
    const baseline = calculateComputeEconomics(4, INPUTS);
    const higherPowerPrice = calculateComputeEconomics(4, { ...INPUTS, electricityCostPerKwh: 0.2 });
    expect(higherPowerPrice.electricityAnnualCostUsd).toBeGreaterThan(baseline.electricityAnnualCostUsd);
    expect(higherPowerPrice.netAnnualCashFlowUsd).toBeLessThan(baseline.netAnnualCashFlowUsd);
    expect(higherPowerPrice.paybackYears!).toBeGreaterThan(baseline.paybackYears!);
  });

  it("rejects invalid assumptions rather than displaying a misleading result", () => {
    expect(() => calculateComputeEconomics(4, { ...INPUTS, utilization: 1.01 })).toThrow(/utilization/);
    expect(() => calculateComputeEconomics(4, { ...INPUTS, acquisitionCostUsd: -1 })).toThrow(/acquisition/);
  });

  it("uses the same formula for the documented 40–100% utilization sensitivity", () => {
    const points = paybackSensitivity(4, INPUTS);
    expect(points.map((point) => point.utilizationPercent)).toEqual([40, 50, 60, 70, 80, 90, 100]);
    expect(points[0]!.paybackYears).toBe(calculateComputeEconomics(4, { ...INPUTS, utilization: 0.4 }).paybackYears);
    expect(points.at(-1)!.paybackYears).toBe(calculateComputeEconomics(4, { ...INPUTS, utilization: 1 }).paybackYears);
  });
});
