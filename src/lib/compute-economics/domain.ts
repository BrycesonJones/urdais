/** Public, serializable shapes for the Compute Economics surface. */

export type AssumptionStatus = "assumption";

export type EconomicAssumption<Unit extends string> = {
  value: number;
  unit: Unit;
  description: string;
  status: AssumptionStatus;
};

export type ComputeEconomicsAssumptions = {
  acquisitionCostUsd: EconomicAssumption<"USD/accelerator">;
  utilization: EconomicAssumption<"fraction">;
  electricityCostPerKwh: EconomicAssumption<"USD/kWh">;
  powerDrawKw: EconomicAssumption<"kW">;
  hostingCostPerGpuHour: EconomicAssumption<"USD/GPU-hour available">;
  otherOperatingCostPerGpuHour: EconomicAssumption<"USD/GPU-hour utilized">;
};

export type ComputeEconomicsInputs = {
  acquisitionCostUsd: number;
  utilization: number;
  electricityCostPerKwh: number;
  powerDrawKw: number;
  hostingCostPerGpuHour: number;
  otherOperatingCostPerGpuHour: number;
};

export type ComputeEconomicsResult = {
  grossAnnualRevenueUsd: number;
  electricityAnnualCostUsd: number;
  hostingAnnualCostUsd: number;
  otherAnnualCostUsd: number;
  annualOperatingCostUsd: number;
  netAnnualCashFlowUsd: number;
  /** Null means annual cash flow is not positive, so no finite payback exists. */
  paybackYears: number | null;
};

export type PaybackSensitivityPoint = {
  utilizationPercent: number;
  paybackYears: number | null;
  netAnnualCashFlowUsd: number;
};

export type ComputePriceFreshness = {
  state: "fresh" | "stale";
  usableForPayback: boolean;
  staleAfter: string;
};

export type ObservedComputePrice = {
  priceUsdPerGpuHour: number;
  currency: "USD";
  unit: "accelerator_hour";
  calculationDate: string;
  observationWindowStart: string;
  observationWindowEnd: string;
  publishedAt: string;
  publicationStatus: "published" | "delayed";
  participantCount: number;
  contributingSourceCount: number;
  marketBreadth: "minimum" | "normal" | null;
  attributions: readonly string[];
  methodologyVersion: string;
  instrumentSpecVersion: string;
  freshness: ComputePriceFreshness;
};

export type ComputeEconomicsInstrument = {
  symbol: string;
  label: string;
  gpu: {
    vendor: string;
    model: string;
    formFactor: string;
    memoryGb: number | null;
  };
  observedPrice: ObservedComputePrice;
  defaultAssumptions: ComputeEconomicsAssumptions;
};

export type ComputeEconomicsUnavailableReason = "database_unavailable" | "no_supported_price";

export type ComputeEconomicsReadModel = {
  generatedAt: string;
  instruments: readonly ComputeEconomicsInstrument[];
  unavailableReason: ComputeEconomicsUnavailableReason | null;
};
