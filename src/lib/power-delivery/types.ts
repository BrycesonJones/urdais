import type { EiaBalancingAuthorityCode } from "@/lib/power-delivery/universe";

export const POWER_METRIC_CODES = ["actual_load", "operational_demand_forecast"] as const;
export type PowerMetricCode = (typeof POWER_METRIC_CODES)[number];
export type EiaPowerType = "D" | "DF";

export type NormalizedPowerRecord = {
  respondent: EiaBalancingAuthorityCode;
  type: EiaPowerType;
  metric: PowerMetricCode;
  periodStart: string;
  periodEnd: string;
  nativePeriod: string;
  nativeValue: string | null;
  nativeUnit: "megawatthours";
  valueMw: number | null;
  normalizationStatus: "available" | "source_unavailable";
  recordHash: string;
  rawPayload: Record<string, unknown>;
};

export type EiaPage = {
  requestUrl: string;
  requestParameters: Record<string, unknown>;
  offset: number;
  length: number;
  total: number;
  retrievedAt: string;
  responseHash: string;
  responseByteLength: number;
  responseBody: Record<string, unknown>;
  records: NormalizedPowerRecord[];
};

export type PowerObservation = {
  id: string;
  areaId: string;
  areaName: string;
  eiaBaCode: string;
  metric: PowerMetricCode;
  periodStart: string;
  periodEnd: string;
  valueMw: number;
  valueStatus: "observed" | "forecast";
  qualityStatus: "accepted" | "provisional" | "suspect";
  retrievedAt: string;
  source: PowerSourceMetadata;
};

export type PowerSourceMetadata = {
  provider: "U.S. Energy Information Administration";
  source: "EIA Form 930";
  interfaceSlug: "eia-930-region-data";
  attribution: string;
};

export type AggregateCoverage = {
  universe: "seven_organized_us_wholesale_markets";
  universeVersion: number;
  expectedMemberCount: number;
  presentMemberCount: number;
  missingAreaIds: string[];
  status: "complete" | "incomplete";
};

export type CoincidentAggregatePoint = {
  periodStart: string;
  periodEnd: string;
  aggregateMw: number | null;
  coverage: AggregateCoverage;
};
