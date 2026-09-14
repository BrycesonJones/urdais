/**
 * A source-native token-price quote after validation, before persistence.
 * Facets keep economically distinct published rates apart: dimension, service
 * tier, context tier, region, and cache TTL are part of the observation key.
 */

import {
  assertSourcePricingDimension,
  defaultServiceTier,
  type CacheTtl,
  type ServiceTier,
  type SourcePricingDimension,
} from "@/lib/tokens/dimensions";
import { assertStableModelIdentity, modelIdentityKey, type ModelIdentity } from "@/lib/tokens/identity";
import { normalizeToUsdPer1m, type CanonicalTokenPrice, type FxConversion, type NativeTokenPrice } from "@/lib/tokens/normalize";

export type TokenPriceQuoteInput = {
  identity: ModelIdentity;
  dimension: string;
  native: NativeTokenPrice;
  fx?: FxConversion | null;
  region?: string | null;
  serviceTier?: ServiceTier | null;
  contextTier?: string | null;
  cacheTtl?: CacheTtl | null;
  sourceInterfaceSlug: string;
  sourceEffectiveAt?: string | null;
  retrievedAt: string;
};

export type TokenPriceQuote = {
  identityKey: string;
  dimension: SourcePricingDimension;
  canonical: CanonicalTokenPrice;
  region: string | null;
  serviceTier: ServiceTier;
  contextTier: string | null;
  cacheTtl: CacheTtl | null;
  sourceInterfaceSlug: string;
  sourceEffectiveAt: string | null;
  retrievedAt: string;
  observationKey: string;
};

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

export function observationKey(parts: {
  identityKey: string;
  dimension: SourcePricingDimension;
  region: string | null;
  serviceTier: ServiceTier;
  contextTier: string | null;
  cacheTtl: CacheTtl | null;
}): string {
  return [
    parts.identityKey,
    parts.dimension,
    parts.region ?? "",
    parts.serviceTier,
    parts.contextTier ?? "",
    parts.cacheTtl ?? "",
  ].join("|");
}

export function createSourceQuote(input: TokenPriceQuoteInput): TokenPriceQuote {
  assertStableModelIdentity(input.identity);
  const dimension = assertSourcePricingDimension(input.dimension);
  if (dimension === "cache_write" && !input.cacheTtl) {
    // Allowed: some sources publish a single write rate with no TTL split.
  }
  const identityKey = modelIdentityKey(input.identity.providerSlug, input.identity.providerModelId);
  const region = emptyToNull(input.region);
  const contextTier = emptyToNull(input.contextTier);
  const serviceTier = defaultServiceTier(input.serviceTier);
  const cacheTtl = input.cacheTtl ?? null;
  const canonical = normalizeToUsdPer1m(input.native, input.fx ?? null);
  return {
    identityKey,
    dimension,
    canonical,
    region,
    serviceTier,
    contextTier,
    cacheTtl,
    sourceInterfaceSlug: input.sourceInterfaceSlug,
    sourceEffectiveAt: input.sourceEffectiveAt ?? null,
    retrievedAt: input.retrievedAt,
    observationKey: observationKey({ identityKey, dimension, region, serviceTier, contextTier, cacheTtl }),
  };
}

export function assertDistinctObservationKeys(quotes: readonly TokenPriceQuote[]): void {
  const keys = quotes.map((quote) => quote.observationKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error("duplicate observation keys: economically distinct facets must not share a row");
  }
}
