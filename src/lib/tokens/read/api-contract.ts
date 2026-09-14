/**
 * The shape of a public token-price series as the product API returns it.
 * Structural allowlist, same idea as the UCPI series contract: only these
 * fields may leave the read path. Rights-state labels, retrieval bodies,
 * parser internals, and source-interface machinery are forbidden at any depth.
 */

import type { CacheTtl, ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";

export type PublicTokenHistoryPoint = {
  time: string;
  priceUsdPer1m: number;
};

export type PublicTokenSeries = {
  seriesId: string;
  providerSlug: string;
  providerName: string;
  providerModelId: string;
  displayName: string;
  modelFamily: string;
  pricingDimension: SourcePricingDimension;
  serviceTier: ServiceTier;
  contextTier: string | null;
  cacheTtl: CacheTtl | null;
  region: string | null;
  priceUsdPer1m: number;
  currency: "USD";
  unit: "USD / 1M tokens";
  retrievedAt: string;
  sourceEffectiveAt: string | null;
  percentageChange: number | null;
  history: readonly PublicTokenHistoryPoint[];
};

/**
 * The Urdais Token Price benchmark as the product API returns it: a derived
 * provider-level value, minimal and allowlisted. It names the designated
 * model and the methodology version that produced it, because the number is
 * Urdais's and not a provider quote, and carries nothing about rights state,
 * retrievals, parsers or internal ids.
 */
export type PublicTokenBenchmarkSeries = {
  seriesId: string;
  providerSlug: string;
  providerName: string;
  benchmarkName: string;
  benchmarkModelId: string;
  benchmarkModelName: string;
  methodologyVersion: string;
  priceUsdPer1m: number;
  currency: "USD";
  unit: "USD / 1M tokens";
  updatedAt: string;
  percentageChange: number | null;
  history: readonly PublicTokenHistoryPoint[];
};

export const PUBLIC_TOKEN_BENCHMARK_KEYS: readonly (keyof PublicTokenBenchmarkSeries)[] = [
  "seriesId",
  "providerSlug",
  "providerName",
  "benchmarkName",
  "benchmarkModelId",
  "benchmarkModelName",
  "methodologyVersion",
  "priceUsdPer1m",
  "currency",
  "unit",
  "updatedAt",
  "percentageChange",
  "history",
];

/** Returns reason codes; empty means the benchmark shape may leave the read path. */
export function validatePublicTokenBenchmark(value: unknown): string[] {
  const reasons: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["BENCHMARK_NOT_OBJECT"];
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!(PUBLIC_TOKEN_BENCHMARK_KEYS as readonly string[]).includes(key)) reasons.push(`BENCHMARK_UNKNOWN_FIELD:${key}`);
  }
  for (const key of PUBLIC_TOKEN_BENCHMARK_KEYS) {
    if (!(key in row)) reasons.push(`BENCHMARK_MISSING_FIELD:${key}`);
  }
  const history = row.history;
  if (Array.isArray(history)) {
    for (const point of history) {
      if (typeof point !== "object" || point === null) continue;
      for (const key of Object.keys(point as Record<string, unknown>)) {
        if (key !== "time" && key !== "priceUsdPer1m") reasons.push(`BENCHMARK_UNKNOWN_FIELD:history.${key}`);
      }
    }
  }
  return [...new Set(reasons)];
}

export type PublicTokenPricesResponse = {
  series: readonly PublicTokenSeries[];
};

export const PUBLIC_TOKEN_SERIES_KEYS: readonly (keyof PublicTokenSeries)[] = [
  "seriesId",
  "providerSlug",
  "providerName",
  "providerModelId",
  "displayName",
  "modelFamily",
  "pricingDimension",
  "serviceTier",
  "contextTier",
  "cacheTtl",
  "region",
  "priceUsdPer1m",
  "currency",
  "unit",
  "retrievedAt",
  "sourceEffectiveAt",
  "percentageChange",
  "history",
];

export const PUBLIC_TOKEN_HISTORY_POINT_KEYS: readonly (keyof PublicTokenHistoryPoint)[] = ["time", "priceUsdPer1m"];

export const PUBLIC_TOKEN_PRICES_RESPONSE_KEYS: readonly (keyof PublicTokenPricesResponse)[] = ["series"];

/**
 * Fields that name internal rights state, retrieval artifacts, parser
 * internals, or source-interface machinery. Forbidden anywhere in a public
 * token-price response, at any depth.
 */
export const TOKEN_INTERNAL_FIELDS: readonly string[] = [
  "research_usable",
  "under_review",
  "candidate",
  "production_access_state",
  "productionAccessState",
  "terms_review_state",
  "termsReviewState",
  "data_use_terms_state",
  "dataUseTermsState",
  "writtenAgreementRequired",
  "responseBody",
  "response_body",
  "parserId",
  "parser_id",
  "diagnostics",
  "sourceInterfaceId",
  "source_interface_id",
  "sourceInterfaceSlug",
  "source_interface_slug",
  "retrievalId",
  "retrieval_id",
  "permissionGrantId",
  "permission_grant_id",
  "collectorIdentity",
  "collector_identity",
  "requestParameters",
  "request_parameters",
  "responseHash",
  "response_hash",
  "rawPayload",
  "enumerationEvidence",
  "enumeration_evidence",
  "enumerationAssessment",
  "enumeration_assessment",
  "idempotencyKey",
  "observationKey",
  "sourceNativePrice",
  "sourceNativeCurrency",
  "sourceNativeDenominatorTokens",
  "modelId",
];

export function publicTokenPricesResponse(series: readonly PublicTokenSeries[]): PublicTokenPricesResponse {
  return {
    series: series.map((row) => ({
      seriesId: row.seriesId,
      providerSlug: row.providerSlug,
      providerName: row.providerName,
      providerModelId: row.providerModelId,
      displayName: row.displayName,
      modelFamily: row.modelFamily,
      pricingDimension: row.pricingDimension,
      serviceTier: row.serviceTier,
      contextTier: row.contextTier,
      cacheTtl: row.cacheTtl,
      region: row.region,
      priceUsdPer1m: row.priceUsdPer1m,
      currency: "USD",
      unit: "USD / 1M tokens",
      retrievedAt: row.retrievedAt,
      sourceEffectiveAt: row.sourceEffectiveAt,
      percentageChange: row.percentageChange,
      history: row.history.map((point) => ({ time: point.time, priceUsdPer1m: point.priceUsdPer1m })),
    })),
  };
}

/** Returns reason codes; an empty array means the shape is publishable. */
export function validatePublicTokenPricesResponse(json: unknown): string[] {
  const reasons: string[] = [];
  if (typeof json !== "object" || json === null || Array.isArray(json)) return ["PUBLIC_RESPONSE_NOT_OBJECT"];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, v] of Object.entries(value)) {
      if (TOKEN_INTERNAL_FIELDS.includes(key)) reasons.push(`INTERNAL_FIELD_EXPOSED:${path ? `${path}.` : ""}${key}`);
      walk(v, path ? `${path}.${key}` : key);
    }
  };
  walk(json, "");
  const top = json as Record<string, unknown>;
  for (const key of Object.keys(top)) {
    if (!(PUBLIC_TOKEN_PRICES_RESPONSE_KEYS as readonly string[]).includes(key)) {
      reasons.push(`PUBLIC_RESPONSE_UNKNOWN_FIELD:${key}`);
    }
  }
  for (const key of PUBLIC_TOKEN_PRICES_RESPONSE_KEYS) {
    if (!(key in top)) reasons.push(`PUBLIC_RESPONSE_MISSING_FIELD:${key}`);
  }
  const series = top.series;
  if (!Array.isArray(series)) {
    if ("series" in top) reasons.push("PUBLIC_RESPONSE_SERIES_NOT_ARRAY");
    return [...new Set(reasons)];
  }
  series.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      reasons.push(`PUBLIC_RESPONSE_SERIES_NOT_OBJECT:${index}`);
      return;
    }
    const row = entry as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      if (!(PUBLIC_TOKEN_SERIES_KEYS as readonly string[]).includes(key)) {
        reasons.push(`PUBLIC_RESPONSE_UNKNOWN_FIELD:series[${index}].${key}`);
      }
    }
    for (const key of PUBLIC_TOKEN_SERIES_KEYS) {
      if (!(key in row)) reasons.push(`PUBLIC_RESPONSE_MISSING_FIELD:series[${index}].${key}`);
    }
    const history = row.history;
    if (Array.isArray(history)) {
      history.forEach((point, pointIndex) => {
        if (typeof point !== "object" || point === null || Array.isArray(point)) {
          reasons.push(`PUBLIC_RESPONSE_HISTORY_NOT_OBJECT:series[${index}].history[${pointIndex}]`);
          return;
        }
        for (const key of Object.keys(point)) {
          if (!(PUBLIC_TOKEN_HISTORY_POINT_KEYS as readonly string[]).includes(key)) {
            reasons.push(`PUBLIC_RESPONSE_UNKNOWN_FIELD:series[${index}].history[${pointIndex}].${key}`);
          }
        }
        for (const key of PUBLIC_TOKEN_HISTORY_POINT_KEYS) {
          if (!(key in point)) reasons.push(`PUBLIC_RESPONSE_MISSING_FIELD:series[${index}].history[${pointIndex}].${key}`);
        }
      });
    }
  });
  return [...new Set(reasons)];
}
