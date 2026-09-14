/**
 * Shared types for wave-1 token-pricing ingestion. A parsed quote is one
 * canonical observation: one model, one dimension, one facet set, with native
 * and USD/1M prices and retrieval lineage. Parser-only metadata that does not
 * change economic identity stays in diagnostics.
 */

import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";
import type { CacheTtl, ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";
import type { ModelIdentity } from "@/lib/tokens/identity";
import type { TokenPriceQuote } from "@/lib/tokens/observation";

export const WAVE1_PROVIDERS = ["anthropic", "xai", "openai"] as const;
export type Wave1Provider = (typeof WAVE1_PROVIDERS)[number];

export type TokenIngestMode = "research" | "production";

export class MalformedPricingSourceError extends Error {
  constructor(detail: string) {
    super(`malformed pricing source: ${detail}`);
    this.name = "MalformedPricingSourceError";
  }
}

export class IncompatiblePricingUnitError extends Error {
  constructor(detail: string) {
    super(`incompatible pricing unit: ${detail}`);
    this.name = "IncompatiblePricingUnitError";
  }
}

export class TokenPermissionError extends Error {
  readonly code = "COLLECTION_NOT_PERMITTED" as const;
  constructor(detail: string) {
    super(`token ingestion refused: ${detail}`);
    this.name = "TokenPermissionError";
  }
}

export type TokenSourceInterface = {
  id: string;
  slug: string;
  canonicalUrl: string;
  parserId: string;
  registry: SourceRegistryState;
};

export type RetrievalArtifact = {
  contentType: string;
  body: string;
};

export type TokenSourceRetrieval = {
  id: string;
  sourceInterfaceId: string;
  sourceInterfaceSlug: string;
  idempotencyKey: string;
  requestedAt: string;
  completedAt: string;
  requestMethod: "GET" | "manual_read";
  requestUrl: string;
  requestParameters: Record<string, string>;
  responseStatus: number;
  responseContentType: string;
  responseHash: string;
  responseByteLength: number;
  responseBody: RetrievalArtifact;
  recordCount: number | null;
  enumerationAssessment: "unknown";
  enumerationEvidence: string;
  collectorIdentity: string;
  retrievalPurpose: TokenIngestMode;
  permissionGrantId: null;
  parserId: string;
};

export type ResolvedAlias = {
  providerSlug: string;
  alias: string;
  targetProviderModelId: string;
  aliasKind: "latest_pointer" | "family_alias" | "legacy_name";
};

export type PricingDiagnostic = {
  code: string;
  detail: string;
};

export type ProviderParseResult = {
  quotes: TokenPriceQuote[];
  identities: ModelIdentity[];
  aliases: ResolvedAlias[];
  diagnostics: PricingDiagnostic[];
};

export type ObservationChangeKind =
  | "unchanged"
  | "price_changed"
  | "model_added"
  | "facet_added"
  | "model_removed"
  | "facet_removed";

export type ObservationDecision = {
  kind: ObservationChangeKind;
  observationKey: string;
  quote?: TokenPriceQuote;
  previousCanonicalUsdPer1m?: number;
};

export type TokenPriceObservationRow = {
  id: string;
  retrievalId: string;
  modelId: string;
  providerSlug: string;
  providerModelId: string;
  pricingDimension: SourcePricingDimension;
  sourceNativePrice: number;
  sourceNativeCurrency: string;
  sourceNativeDenominatorTokens: number;
  canonicalPriceUsdPer1m: number;
  region: string | null;
  serviceTier: ServiceTier;
  contextTier: string | null;
  cacheTtl: CacheTtl | null;
  sourceInterfaceId: string;
  sourceEffectiveAt: string | null;
  retrievedAt: string;
  observationKey: string;
};

export type TokenIngestReport = {
  provider: Wave1Provider;
  mode: TokenIngestMode;
  parserId: string;
  sourceInterfaceSlug: string;
  retrievalId: string;
  responseHash: string;
  requestUrl: string;
  retrievedAt: string;
  quotesParsed: number;
  observationsInserted: number;
  observationsSkippedUnchanged: number;
  alreadyPresentForRetrieval: boolean;
  decisions: ObservationDecision[];
  diagnostics: PricingDiagnostic[];
  aliases: ResolvedAlias[];
};
