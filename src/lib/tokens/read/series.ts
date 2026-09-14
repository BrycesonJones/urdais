/**
 * Canonical token-pricing read model: group visible observations into
 * model/facet series without collapsing economically distinct quotes or
 * inventing history. Visibility is applied by the caller; this module does
 * not decide whether a row is production-publicable.
 */

import { CANONICAL_UNIT } from "@/lib/tokens/dimensions";
import type { CacheTtl, ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";
import type { Wave1ModelSeed } from "@/lib/tokens/catalog";
import { modelIdentityKey } from "@/lib/tokens/identity";
import { observationIsVisible, type TokenVisibilityMode } from "@/lib/tokens/read/publication";
import { providerDisplayName } from "@/lib/tokens/read/labels";
import type { PublicTokenSeries } from "@/lib/tokens/read/api-contract";
import type { TokenPriceObservationRow, TokenSourceInterface, TokenSourceRetrieval } from "@/lib/tokens/types";

export type TokenReadCatalog = {
  models: readonly Wave1ModelSeed[];
  observations: readonly TokenPriceObservationRow[];
  retrievals: readonly TokenSourceRetrieval[];
  sourceInterfaces: readonly TokenSourceInterface[];
};

const EMPTY_FACET = "_";

export function tokenSeriesId(parts: {
  providerSlug: string;
  providerModelId: string;
  pricingDimension: SourcePricingDimension;
  serviceTier: ServiceTier;
  contextTier: string | null;
  cacheTtl: CacheTtl | null;
  region: string | null;
}): string {
  return [
    "tokens",
    parts.providerSlug,
    parts.providerModelId,
    parts.pricingDimension,
    parts.serviceTier,
    parts.contextTier ?? EMPTY_FACET,
    parts.cacheTtl ?? EMPTY_FACET,
    parts.region ?? EMPTY_FACET,
  ].join(":");
}

function modelKey(providerSlug: string, providerModelId: string): string {
  return modelIdentityKey(providerSlug, providerModelId);
}

function percentageChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10_000) / 10_000;
}

function compareSeriesIdentity(a: PublicTokenSeries, b: PublicTokenSeries): number {
  return (
    a.providerSlug.localeCompare(b.providerSlug, "en") ||
    a.providerModelId.localeCompare(b.providerModelId, "en") ||
    a.pricingDimension.localeCompare(b.pricingDimension, "en") ||
    a.serviceTier.localeCompare(b.serviceTier, "en") ||
    (a.contextTier ?? "").localeCompare(b.contextTier ?? "", "en") ||
    (a.cacheTtl ?? "").localeCompare(b.cacheTtl ?? "", "en") ||
    (a.region ?? "").localeCompare(b.region ?? "", "en")
  );
}

export function listVisibleTokenSeries(catalog: TokenReadCatalog, mode: TokenVisibilityMode): PublicTokenSeries[] {
  const retrievals = new Map(catalog.retrievals.map((row) => [row.id, row]));
  const sources = new Map(catalog.sourceInterfaces.map((row) => [row.id, row]));
  const models = new Map(catalog.models.map((row) => [modelKey(row.providerSlug, row.providerModelId), row]));

  const grouped = new Map<string, TokenPriceObservationRow[]>();
  for (const observation of catalog.observations) {
    const retrieval = retrievals.get(observation.retrievalId);
    const source = sources.get(observation.sourceInterfaceId);
    if (!observationIsVisible(observation, retrieval, source, mode)) continue;
    const model = models.get(modelKey(observation.providerSlug, observation.providerModelId));
    if (!model) continue;
    const rows = grouped.get(observation.observationKey) ?? [];
    rows.push(observation);
    grouped.set(observation.observationKey, rows);
  }

  const series: PublicTokenSeries[] = [];
  for (const rows of grouped.values()) {
    const ordered = [...rows].sort(
      (a, b) => a.retrievedAt.localeCompare(b.retrievedAt) || a.id.localeCompare(b.id),
    );
    const latest = ordered[ordered.length - 1];
    if (!latest) continue;
    const model = models.get(modelKey(latest.providerSlug, latest.providerModelId));
    if (!model) continue;
    const previous = ordered.length >= 2 ? ordered[ordered.length - 2] : undefined;
    series.push({
      seriesId: tokenSeriesId(latest),
      providerSlug: latest.providerSlug,
      providerName: providerDisplayName(latest.providerSlug),
      providerModelId: latest.providerModelId,
      displayName: model.displayName,
      modelFamily: model.modelFamily,
      pricingDimension: latest.pricingDimension,
      serviceTier: latest.serviceTier,
      contextTier: latest.contextTier,
      cacheTtl: latest.cacheTtl,
      region: latest.region,
      priceUsdPer1m: latest.canonicalPriceUsdPer1m,
      currency: "USD",
      unit: CANONICAL_UNIT,
      retrievedAt: latest.retrievedAt,
      sourceEffectiveAt: latest.sourceEffectiveAt,
      percentageChange:
        previous === undefined ? null : percentageChange(previous.canonicalPriceUsdPer1m, latest.canonicalPriceUsdPer1m),
      history: ordered.map((row) => ({ time: row.retrievedAt, priceUsdPer1m: row.canonicalPriceUsdPer1m })),
    });
  }

  return series.sort(compareSeriesIdentity);
}

/** Production publication filter. Research observations are excluded. */
export function listPublicTokenSeries(catalog: TokenReadCatalog): PublicTokenSeries[] {
  return listVisibleTokenSeries(catalog, "production");
}
