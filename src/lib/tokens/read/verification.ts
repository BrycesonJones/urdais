/**
 * Wave-1 verification: representative canonical observations per provider,
 * for developers and tests. Not a product surface and not a benchmark.
 *
 * The product publishes no token price yet, so this is how Urdais checks
 * that ingestion actually produced the right canonical numbers: the model
 * identity the provider publishes, and its input, cached-input and output
 * prices with any tier or context distinction that applies.
 */

import type { PublicTokenSeries } from "@/lib/tokens/read/api-contract";
import { tokenFacetLabel } from "@/lib/tokens/read/labels";

export type TokenVerificationRow = {
  providerSlug: string;
  providerName: string;
  providerModelId: string;
  displayName: string;
  facet: string;
  pricingDimension: string;
  serviceTier: string;
  contextTier: string | null;
  cacheTtl: string | null;
  region: string | null;
  priceUsdPer1m: number;
  retrievedAt: string;
};

export type TokenVerificationReport = {
  providerSlug: string;
  providerName: string;
  models: number;
  observations: number;
  rows: TokenVerificationRow[];
};

function rowOf(series: PublicTokenSeries): TokenVerificationRow {
  return {
    providerSlug: series.providerSlug,
    providerName: series.providerName,
    providerModelId: series.providerModelId,
    displayName: series.displayName,
    facet: tokenFacetLabel(series),
    pricingDimension: series.pricingDimension,
    serviceTier: series.serviceTier,
    contextTier: series.contextTier,
    cacheTtl: series.cacheTtl,
    region: series.region,
    priceUsdPer1m: series.priceUsdPer1m,
    retrievedAt: series.retrievedAt,
  };
}

/** Every canonical series grouped by provider, ordered for a stable report. */
export function tokenVerificationReports(series: readonly PublicTokenSeries[]): TokenVerificationReport[] {
  const byProvider = new Map<string, PublicTokenSeries[]>();
  for (const row of series) {
    const rows = byProvider.get(row.providerSlug) ?? [];
    rows.push(row);
    byProvider.set(row.providerSlug, rows);
  }
  return [...byProvider.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([providerSlug, rows]) => ({
      providerSlug,
      providerName: rows[0]!.providerName,
      models: new Set(rows.map((row) => row.providerModelId)).size,
      observations: rows.length,
      rows: rows
        .map(rowOf)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "en") || a.facet.localeCompare(b.facet, "en")),
    }));
}

/** The canonical prices for one model, keyed by facet label, for a focused assertion. */
export function verificationPricesFor(
  series: readonly PublicTokenSeries[],
  providerSlug: string,
  providerModelId: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of series) {
    if (row.providerSlug !== providerSlug || row.providerModelId !== providerModelId) continue;
    out[tokenFacetLabel(row)] = row.priceUsdPer1m;
  }
  return out;
}
