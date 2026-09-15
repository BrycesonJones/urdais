/**
 * Wave-1 token-pricing ingestion.
 *
 * first-party source → retrieval snapshot → provider parser → canonical quote
 * → USD/1M normalization → model identity → append-only observations.
 *
 * Production mode uses the UCPI permission gate and fails closed while the
 * wave-1 interfaces remain research_usable / under_review. Research mode may
 * parse fixtures, files, and explicit live GETs. Identical boards under a new
 * retrieval do not insert new observations.
 */

import { detectObservationChanges, quotesToInsert } from "@/lib/tokens/change-detection";
import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { sha256Hex } from "@/lib/tokens/hash";
import { assertTokenIngestPermitted } from "@/lib/tokens/permission";
import { observationIsPublicable } from "@/lib/tokens/read/publication";
import { providerParser } from "@/lib/tokens/providers";
import type { TokenPricingStore } from "@/lib/tokens/store";
import type { TokenPriceQuote } from "@/lib/tokens/observation";
import type {
  ManualVerification,
  ProviderParseResult,
  TokenAcquisitionMode,
  TokenIngestMode,
  TokenIngestReport,
  TokenPriceObservationRow,
  TokenSourceRetrieval,
  Wave1Provider,
} from "@/lib/tokens/types";

export type RetrievedArtifact = {
  body: string;
  contentType: string;
  url: string;
  retrievedAt: string;
  requestedAt?: string;
  method?: "GET" | "manual_read";
  status?: number;
};

export type IngestInput = {
  provider: Wave1Provider;
  mode: TokenIngestMode;
  artifact: RetrievedArtifact;
  store: TokenPricingStore;
  idFactory?: () => string;
  /**
   * Present only for a manually verified acquisition, and only when the caller
   * states that intent explicitly. Ordinary research ingestion never becomes
   * production-publicable by accident.
   */
  verification?: ManualVerification;
};

function parseProvider(provider: Wave1Provider, body: string, retrievedAt: string): ProviderParseResult {
  // Registry lookup, not a chain with a default arm. The previous form returned
  // the OpenAI parser for any provider it did not name, which is a wrong answer
  // wearing the shape of a right one.
  return providerParser(provider)(body, retrievedAt);
}

function observationRow(
  quote: TokenPriceQuote,
  input: { id: string; retrieval: TokenSourceRetrieval; modelId: string; provider: Wave1Provider },
): TokenPriceObservationRow {
  if (quote.canonical.priceUsdPer1m === undefined) {
    throw new Error("USD quotes must have a canonical price");
  }
  const parts = quote.identityKey.split("::");
  const providerModelId = parts[1];
  if (!providerModelId) throw new Error(`malformed identity key ${quote.identityKey}`);
  return {
    id: input.id,
    retrievalId: input.retrieval.id,
    modelId: input.modelId,
    providerSlug: input.provider,
    providerModelId,
    pricingDimension: quote.dimension,
    sourceNativePrice: quote.canonical.native.price,
    sourceNativeCurrency: quote.canonical.native.currency,
    sourceNativeDenominatorTokens: quote.canonical.native.denominatorTokens,
    canonicalPriceUsdPer1m: quote.canonical.priceUsdPer1m,
    region: quote.region,
    serviceTier: quote.serviceTier,
    contextTier: quote.contextTier,
    cacheTtl: quote.cacheTtl,
    sourceInterfaceId: input.retrieval.sourceInterfaceId,
    sourceEffectiveAt: quote.sourceEffectiveAt,
    retrievedAt: quote.retrievedAt,
    observationKey: quote.observationKey,
  };
}

export function ingestTokenPricing(input: IngestInput): TokenIngestReport {
  const source = WAVE1_SOURCE_INTERFACES[input.provider];
  const acquisition: TokenAcquisitionMode = input.verification ? "manual_verified" : "automated";
  if (acquisition === "manual_verified") {
    if (input.mode !== "production") throw new Error("a manual verification is a production acquisition; pass mode production");
    if (input.artifact.method !== undefined && input.artifact.method !== "manual_read") {
      throw new Error("a manual verification is read by a person, not fetched; method must be manual_read");
    }
    if (input.verification!.evidence.trim().length === 0) throw new Error("a manual verification must record what was verified");
    if (input.verification!.sourceUrl.trim().length === 0) throw new Error("a manual verification must record the first-party source URL");
  }
  assertTokenIngestPermitted(input.mode, source.registry, acquisition);

  const requestedAt = input.artifact.requestedAt ?? input.artifact.retrievedAt;
  const completedAt = input.artifact.retrievedAt;
  const status = input.artifact.status ?? 200;
  const method = input.artifact.method ?? "manual_read";
  const ids = input.idFactory ?? crypto.randomUUID.bind(crypto);
  const responseHash = sha256Hex(input.artifact.body);
  const retrievalId = ids();
  const retrieval: TokenSourceRetrieval = {
    id: retrievalId,
    sourceInterfaceId: source.id,
    sourceInterfaceSlug: source.slug,
    // A manual verification identifies the artifact a person read, not the moment
    // they ran the command. Keying it by requestedAt records a fresh retrieval on
    // every re-verification of a byte-identical page, which defeats the
    // already-present guard below: that guard expects insertRetrieval to hand back
    // the existing row, and it cannot when the key moves with the clock. An
    // automated retrieval keeps its timestamp, because two scheduled fetches of an
    // unchanged page are two real events; a person re-reading the same page is not.
    idempotencyKey:
      acquisition === "manual_verified"
        ? `token-pricing:${source.slug}:${source.parserId}:${responseHash}:manual_verified`
        : `token-pricing:${source.slug}:${source.parserId}:${responseHash}:${requestedAt}`,
    requestedAt,
    completedAt,
    requestMethod: method,
    requestUrl: input.artifact.url,
    requestParameters: { parserId: source.parserId },
    responseStatus: status,
    responseContentType: input.artifact.contentType,
    responseHash,
    responseByteLength: new TextEncoder().encode(input.artifact.body).length,
    responseBody: { contentType: input.artifact.contentType, body: input.artifact.body },
    acquisitionMode: acquisition,
    verificationEvidence: input.verification
      ? `${input.verification.evidence} (verified by ${input.verification.verifiedBy} at ${input.verification.verifiedAt}, source ${input.verification.sourceUrl})`
      : null,
    recordCount: null,
    enumerationAssessment: "unknown",
    enumerationEvidence: "Wave-1 parser reads the retained retrieval body; completeness of the public docs page is not claimed.",
    collectorIdentity: `tokens-ingest/${input.provider}@${source.parserId}`,
    retrievalPurpose: input.mode,
    permissionGrantId: null,
    parserId: source.parserId,
  };

  const storedRetrieval = input.store.insertRetrieval(retrieval);
  const existing = input.store.observationsForRetrieval(storedRetrieval.id);
  if (existing.length > 0) {
    return {
      provider: input.provider,
      mode: input.mode,
      parserId: source.parserId,
      sourceInterfaceSlug: source.slug,
      retrievalId: storedRetrieval.id,
      responseHash,
      requestUrl: storedRetrieval.requestUrl,
      retrievedAt: storedRetrieval.completedAt,
      quotesParsed: existing.length,
      observationsInserted: 0,
      observationsSkippedUnchanged: existing.length,
      alreadyPresentForRetrieval: true,
      decisions: existing.map((row) => ({ kind: "unchanged" as const, observationKey: row.observationKey })),
      diagnostics: [{ code: "RETRIEVAL_IDEMPOTENT", detail: `observations already exist for retrieval ${storedRetrieval.id}` }],
      aliases: [],
    };
  }

  if (status >= 400) {
    return {
      provider: input.provider,
      mode: input.mode,
      parserId: source.parserId,
      sourceInterfaceSlug: source.slug,
      retrievalId: storedRetrieval.id,
      responseHash,
      requestUrl: storedRetrieval.requestUrl,
      retrievedAt: storedRetrieval.completedAt,
      quotesParsed: 0,
      observationsInserted: 0,
      observationsSkippedUnchanged: 0,
      alreadyPresentForRetrieval: false,
      decisions: [],
      diagnostics: [{ code: "HTTP_ERROR", detail: `retrieval status ${status}; canonical observations were not written` }],
      aliases: [],
    };
  }

  const parsed = parseProvider(input.provider, input.artifact.body, completedAt);

  const latest = input.store.latestByObservationKey(input.provider);
  const decisions = detectObservationChanges(parsed.quotes, latest, {
    acquisition,
    mode: input.mode,
    // Whether an already recorded observation is itself production-publicable,
    // resolved through its own retrieval and source, not assumed from the provider.
    isProduction: (row) => observationIsPublicable(row, input.store.findRetrieval(row.retrievalId), source),
  });
  const toInsert = quotesToInsert(decisions);
  const rows = toInsert.map((quote) => {
    const nativeId = quote.identityKey.split("::")[1];
    if (!nativeId) throw new Error(`malformed identity key ${quote.identityKey}`);
    const model = input.store.model(input.provider, nativeId);
    if (!model) throw new Error(`no seeded model for ${input.provider}::${nativeId}`);
    return observationRow(quote, { id: ids(), retrieval: storedRetrieval, modelId: model.id, provider: input.provider });
  });
  input.store.insertObservations(rows);

  return {
    provider: input.provider,
    mode: input.mode,
    parserId: source.parserId,
    sourceInterfaceSlug: source.slug,
    retrievalId: storedRetrieval.id,
    responseHash,
    requestUrl: storedRetrieval.requestUrl,
    retrievedAt: storedRetrieval.completedAt,
    quotesParsed: parsed.quotes.length,
    observationsInserted: rows.length,
    observationsSkippedUnchanged: decisions.filter((d) => d.kind === "unchanged").length,
    alreadyPresentForRetrieval: false,
    decisions,
    diagnostics: parsed.diagnostics,
    aliases: parsed.aliases,
  };
}

export async function retrieveLivePricing(url: string, now: Date): Promise<RetrievedArtifact> {
  const requestedAt = now.toISOString();
  const response = await fetch(url, { headers: { Accept: "text/html,application/xhtml+xml" } });
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "text/html";
  return {
    body,
    contentType,
    url,
    requestedAt,
    retrievedAt: new Date().toISOString(),
    method: "GET",
    status: response.status,
  };
}

export { PROVIDER_PARSERS, providerParser, UnknownProviderParserError } from "@/lib/tokens/providers";
