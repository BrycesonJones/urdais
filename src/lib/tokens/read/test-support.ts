/**
 * Test helpers for the public token-price read model. Not used by production routes.
 */

import { WAVE1_MODELS, WAVE1_SOURCE_INTERFACES, type Wave1ModelSeed } from "@/lib/tokens/catalog";
import type { CacheTtl, ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";
import { observationKey } from "@/lib/tokens/observation";
import { modelIdentityKey } from "@/lib/tokens/identity";
import type { TokenReadCatalog } from "@/lib/tokens/read/series";
import type {
  TokenIngestMode,
  TokenPriceObservationRow,
  TokenSourceInterface,
  TokenSourceRetrieval,
  Wave1Provider,
} from "@/lib/tokens/types";

export function productionApprovedInterface(provider: Wave1Provider): TokenSourceInterface {
  const base = WAVE1_SOURCE_INTERFACES[provider];
  return {
    ...base,
    registry: {
      slug: base.registry.slug,
      termsReviewState: "permitted",
      dataUseTermsState: "permitted",
      productionAccessState: "production_approved",
      writtenAgreementRequired: false,
    },
  };
}

export type SeedQuote = {
  provider: Wave1Provider;
  providerModelId: string;
  dimension: SourcePricingDimension;
  price: number;
  retrievedAt: string;
  serviceTier?: ServiceTier;
  contextTier?: string | null;
  cacheTtl?: CacheTtl | null;
  region?: string | null;
  purpose?: TokenIngestMode;
  approved?: boolean;
  sourceEffectiveAt?: string | null;
};

function modelOf(provider: string, providerModelId: string): Wave1ModelSeed {
  const model = WAVE1_MODELS.find((row) => row.providerSlug === provider && row.providerModelId === providerModelId);
  if (!model) throw new Error(`no seeded model ${provider} ${providerModelId}`);
  return model;
}

export function seedTokenReadCatalog(quotes: readonly SeedQuote[]): TokenReadCatalog {
  const retrievals: TokenSourceRetrieval[] = [];
  const observations: TokenPriceObservationRow[] = [];
  const interfaces = new Map<string, TokenSourceInterface>();

  quotes.forEach((quote, index) => {
    const purpose = quote.purpose ?? "production";
    const approved = quote.approved ?? purpose === "production";
    const source = approved ? productionApprovedInterface(quote.provider) : WAVE1_SOURCE_INTERFACES[quote.provider];
    interfaces.set(source.id, source);
    const retrievalKey = `${source.id}|${quote.retrievedAt}|${purpose}`;
    let retrieval = retrievals.find((row) => `${row.sourceInterfaceId}|${row.completedAt}|${row.retrievalPurpose}` === retrievalKey);
    if (!retrieval) {
      retrieval = {
        id: `ret-${retrievals.length + 1}`,
        sourceInterfaceId: source.id,
        sourceInterfaceSlug: source.slug,
        idempotencyKey: retrievalKey,
        requestedAt: quote.retrievedAt,
        completedAt: quote.retrievedAt,
        requestMethod: "manual_read",
        requestUrl: source.canonicalUrl,
        requestParameters: { parserId: source.parserId },
        responseStatus: 200,
        responseContentType: "text/html",
        responseHash: "test-hash",
        responseByteLength: 12,
        responseBody: { contentType: "text/html", body: "SECRET_RETRIEVAL_BODY" },
        recordCount: null,
        enumerationAssessment: "unknown",
        enumerationEvidence: "test",
        collectorIdentity: "tokens-read-test",
        retrievalPurpose: purpose,
        permissionGrantId: null,
        parserId: source.parserId,
      };
      retrievals.push(retrieval);
    }
    const model = modelOf(quote.provider, quote.providerModelId);
    const serviceTier = quote.serviceTier ?? "standard";
    const contextTier = quote.contextTier ?? null;
    const cacheTtl = quote.cacheTtl ?? null;
    const region = quote.region ?? null;
    observations.push({
      id: `obs-${index + 1}`,
      retrievalId: retrieval.id,
      modelId: model.id,
      providerSlug: quote.provider,
      providerModelId: quote.providerModelId,
      pricingDimension: quote.dimension,
      sourceNativePrice: quote.price,
      sourceNativeCurrency: "USD",
      sourceNativeDenominatorTokens: 1_000_000,
      canonicalPriceUsdPer1m: quote.price,
      region,
      serviceTier,
      contextTier,
      cacheTtl,
      sourceInterfaceId: source.id,
      sourceEffectiveAt: quote.sourceEffectiveAt ?? null,
      retrievedAt: quote.retrievedAt,
      observationKey: observationKey({
        identityKey: modelIdentityKey(quote.provider, quote.providerModelId),
        dimension: quote.dimension,
        region,
        serviceTier,
        contextTier,
        cacheTtl,
      }),
    });
  });

  return {
    models: WAVE1_MODELS,
    observations,
    retrievals,
    sourceInterfaces: [...interfaces.values()],
  };
}
