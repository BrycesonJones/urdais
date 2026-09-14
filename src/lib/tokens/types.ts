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

/**
 * How an artifact was acquired, which is a different question from whether
 * Urdais may publish what it says.
 *
 *   automated        a machine fetched it; the source's production collection
 *                    gate applies unchanged
 *   manual_verified  a person read the provider's own published page, retained
 *                    the artifact and recorded what they checked. A verified
 *                    fact may be published; it is never a claim that automated
 *                    retrieval is permitted.
 */
export type TokenAcquisitionMode = "automated" | "manual_verified";

/** What a person checked, where, and when. Required to publish a manually verified price. */
export type ManualVerification = {
  verifiedBy: string;
  /** The first-party surface read, as a URL. */
  sourceUrl: string;
  verifiedAt: string;
  /** What the verifier checked, in their own words. */
  evidence: string;
};

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
  acquisitionMode: TokenAcquisitionMode;
  /** Required when acquisitionMode is manual_verified; null otherwise. */
  verificationEvidence: string | null;
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
  /**
   * The same numeric price, first recorded under research provenance and now
   * manually verified for production. A new append-only observation, because
   * publication state is part of what an observation records; the research row
   * is never rewritten.
   */
  | "provenance_promoted"
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
