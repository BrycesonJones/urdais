/**
 * Server-side SQL mapping for the token-price catalog.
 *
 * Load retrieves canonical rows. Persist writes retrievals and observations
 * produced by ingest. Neither function writes registry rights columns.
 */

import { WAVE1_MODELS, WAVE1_SOURCE_INTERFACES, type Wave1ModelSeed } from "@/lib/tokens/catalog";
import { CACHE_TTLS, SERVICE_TIERS, isSourcePricingDimension, type CacheTtl, type ServiceTier } from "@/lib/tokens/dimensions";
import { modelIdentityKey } from "@/lib/tokens/identity";
import { observationKey } from "@/lib/tokens/observation";
import { isWave1Provider } from "@/lib/tokens/read/publication";
import type { TokenReadCatalog } from "@/lib/tokens/read/series";
import type {
  TokenPriceObservationRow,
  TokenSourceInterface,
  TokenSourceRetrieval,
  TokenIngestMode,
  Wave1Provider,
} from "@/lib/tokens/types";
import type { ProductionAccessState, SourceRegistryState, TermsState } from "@/lib/ucpi/permission-gate";

export type TokenSqlExecutor = {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

const WAVE1_SLUGS = ["anthropic", "xai", "openai"] as const;
const TERMS: readonly TermsState[] = ["not_reviewed", "under_review", "permitted", "not_permitted"];
const ACCESS: readonly ProductionAccessState[] = [
  "research_usable",
  "production_review_pending",
  "production_approved",
  "production_blocked",
];

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`expected string, got ${typeof value}`);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`expected finite number, got ${String(value)}`);
}

function asIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  throw new Error(`expected timestamptz, got ${String(value)}`);
}

function asNullString(value: unknown): string | null {
  if (value == null) return null;
  const text = typeof value === "string" ? value.trim() : String(value).trim();
  return text === "" ? null : text;
}

function asInt(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  return Math.trunc(asNumber(value));
}

function asTerms(value: unknown): TermsState {
  if (typeof value === "string" && (TERMS as readonly string[]).includes(value)) return value as TermsState;
  throw new Error(`invalid terms state ${String(value)}`);
}

function asAccess(value: unknown): ProductionAccessState {
  if (typeof value === "string" && (ACCESS as readonly string[]).includes(value)) return value as ProductionAccessState;
  throw new Error(`invalid production access state ${String(value)}`);
}

function asServiceTier(value: unknown): ServiceTier {
  if (typeof value === "string" && (SERVICE_TIERS as readonly string[]).includes(value)) return value as ServiceTier;
  throw new Error(`invalid service_tier ${String(value)}`);
}

function asCacheTtl(value: unknown): CacheTtl | null {
  const text = asNullString(value);
  if (text == null) return null;
  if ((CACHE_TTLS as readonly string[]).includes(text)) return text as CacheTtl;
  throw new Error(`invalid cache_ttl ${text}`);
}

function asPurpose(value: unknown): TokenIngestMode | null {
  if (value === "research" || value === "production") return value;
  return null;
}

function asMethod(value: unknown): TokenSourceRetrieval["requestMethod"] {
  if (value === "GET" || value === "manual_read") return value;
  throw new Error(`unsupported request_method ${String(value)}`);
}

function requestParameters(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (typeof value === "string") {
    try {
      return requestParameters(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function parserIdFor(providerSlug: string, slug: string, parameters: Record<string, string>): string {
  if (parameters.parserId) return parameters.parserId;
  if (isWave1Provider(providerSlug)) return WAVE1_SOURCE_INTERFACES[providerSlug].parserId;
  return slug;
}

function mapModel(row: Record<string, unknown>): Wave1ModelSeed | null {
  try {
    const providerSlug = asString(row.provider_slug);
    if (!isWave1Provider(providerSlug)) return null;
    const lifecycle = asString(row.lifecycle_status);
    return {
      id: asString(row.id),
      providerSlug,
      providerModelId: asString(row.provider_model_id),
      displayName: asString(row.display_name),
      modelFamily: asString(row.model_family),
      version: asNullString(row.version),
      lifecycleStatus: lifecycle === "deprecated" || lifecycle === "legacy" || lifecycle === "retired" ? lifecycle : "current",
      identityKind: "stable",
    };
  } catch {
    return null;
  }
}

function mapInterface(row: Record<string, unknown>): TokenSourceInterface | null {
  try {
    const slug = asString(row.slug);
    const providerSlug = asString(row.provider_slug);
    const registry: SourceRegistryState = {
      slug,
      termsReviewState: asTerms(row.terms_review_state),
      dataUseTermsState: asTerms(row.data_use_terms_state),
      productionAccessState: asAccess(row.production_access_state),
      writtenAgreementRequired: row.written_agreement_required == null ? null : Boolean(row.written_agreement_required),
    };
    return {
      id: asString(row.id),
      slug,
      canonicalUrl: asString(row.canonical_url),
      parserId: parserIdFor(providerSlug, slug, {}),
      registry,
    };
  } catch {
    return null;
  }
}

function mapRetrieval(row: Record<string, unknown>, providerByInterface: ReadonlyMap<string, string>): TokenSourceRetrieval | null {
  try {
    const sourceInterfaceId = asString(row.source_interface_id);
    const sourceInterfaceSlug = asString(row.source_interface_slug);
    const parameters = requestParameters(row.request_parameters);
    const purpose = asPurpose(row.retrieval_purpose);
    if (!purpose) return null;
    const requestedAt = asIso(row.requested_at);
    const providerSlug = providerByInterface.get(sourceInterfaceId) ?? "";
    return {
      id: asString(row.id),
      sourceInterfaceId,
      sourceInterfaceSlug,
      idempotencyKey: asString(row.idempotency_key),
      requestedAt,
      completedAt: row.completed_at == null ? requestedAt : asIso(row.completed_at),
      requestMethod: asMethod(row.request_method),
      requestUrl: asString(row.request_url),
      requestParameters: parameters,
      responseStatus: asInt(row.response_status, 0),
      responseContentType: asNullString(row.response_content_type) ?? "text/html",
      responseHash: asNullString(row.response_hash) ?? "",
      responseByteLength: asInt(row.response_byte_length, 0),
      // The reviewed artifact, read back so a parser run is reproducible from the database alone.
      responseBody: {
        contentType: asNullString(row.response_content_type) ?? "text/html",
        body: retrievalArtifactBody(row.response_body),
      },
      recordCount: row.record_count == null ? null : asInt(row.record_count, 0),
      enumerationAssessment: "unknown",
      enumerationEvidence: asNullString(row.enumeration_evidence) ?? "",
      collectorIdentity: asNullString(row.collector_identity) ?? "",
      acquisitionMode: asNullString(row.acquisition_mode) === "manual_verified" ? "manual_verified" : "automated",
      verificationEvidence: asNullString(row.verification_evidence),
      retrievalPurpose: purpose,
      permissionGrantId: null,
      parserId: parserIdFor(providerSlug, sourceInterfaceSlug, parameters),
    };
  } catch {
    return null;
  }
}

function mapObservation(row: Record<string, unknown>): TokenPriceObservationRow | null {
  try {
    const dimension = asString(row.pricing_dimension);
    if (!isSourcePricingDimension(dimension)) return null;
    const retrievalId = asNullString(row.source_retrieval_id);
    if (!retrievalId) return null;
    const providerSlug = asString(row.provider_slug);
    const providerModelId = asString(row.provider_model_id);
    const region = asNullString(row.region);
    const serviceTier = asServiceTier(row.service_tier);
    const contextTier = asNullString(row.context_tier);
    const cacheTtl = asCacheTtl(row.cache_ttl);
    const canonical = asNumber(row.canonical_price_usd_per_1m);
    return {
      id: asString(row.id),
      retrievalId,
      modelId: asString(row.model_id),
      providerSlug,
      providerModelId,
      pricingDimension: dimension,
      sourceNativePrice: asNumber(row.source_native_price),
      sourceNativeCurrency: asString(row.source_native_currency),
      sourceNativeDenominatorTokens: asInt(row.source_native_denominator_tokens, 1_000_000),
      canonicalPriceUsdPer1m: canonical,
      region,
      serviceTier,
      contextTier,
      cacheTtl,
      sourceInterfaceId: asString(row.source_interface_id),
      sourceEffectiveAt: row.source_effective_at == null ? null : asIso(row.source_effective_at),
      retrievedAt: asIso(row.retrieved_at),
      observationKey: observationKey({
        identityKey: modelIdentityKey(providerSlug, providerModelId),
        dimension,
        region,
        serviceTier,
        contextTier,
        cacheTtl,
      }),
    };
  } catch {
    return null;
  }
}

const MODELS_SQL = `
SELECT m.id, m.provider_model_id, m.display_name, m.model_family, m.version, m.lifecycle_status, p.slug AS provider_slug
  FROM reference.models m
  JOIN reference.providers p ON p.id = m.provider_id
 WHERE p.slug = ANY($1::text[])
    OR m.id IN (SELECT DISTINCT model_id FROM pipeline.token_price_observations)
 ORDER BY p.slug, m.provider_model_id
`;

const INTERFACES_SQL = `
SELECT si.id, si.slug, si.canonical_url, si.production_access_state, si.terms_review_state,
       si.data_use_terms_state, si.written_agreement_required, p.slug AS provider_slug
  FROM reference.source_interfaces si
  JOIN reference.providers p ON p.id = si.provider_id
 WHERE si.slug IN ('anthropic-api-pricing-docs', 'xai-models-docs', 'openai-api-pricing-docs')
    OR si.id IN (SELECT DISTINCT source_interface_id FROM pipeline.token_price_observations)
`;

const OBSERVATIONS_SQL = `
SELECT o.id, o.model_id, o.pricing_dimension, o.source_native_price, o.source_native_currency,
       o.source_native_denominator_tokens, o.canonical_price_usd_per_1m, o.region, o.service_tier,
       o.context_tier, o.cache_ttl, o.source_interface_id, o.source_retrieval_id, o.source_effective_at,
       o.retrieved_at, m.provider_model_id, p.slug AS provider_slug
  FROM pipeline.token_price_observations o
  JOIN reference.models m ON m.id = o.model_id
  JOIN reference.providers p ON p.id = m.provider_id
 WHERE o.canonical_price_usd_per_1m IS NOT NULL
 ORDER BY o.retrieved_at, o.id
`;

/** The retained source artifact from a persisted `response_body`, or empty when a row predates retention. */
function retrievalArtifactBody(value: unknown): string {
  const parsed = typeof value === "string" ? safeJson(value) : value;
  if (typeof parsed !== "object" || parsed === null) return "";
  const body = (parsed as Record<string, unknown>).body;
  return typeof body === "string" ? body : "";
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const RETRIEVALS_SQL = `
SELECT r.id, r.source_interface_id, r.idempotency_key, r.requested_at, r.completed_at, r.request_method,
       r.request_url, r.request_parameters, r.response_status, r.response_content_type, r.response_hash,
       r.response_byte_length, r.response_body, r.record_count, r.enumeration_assessment, r.enumeration_evidence,
       r.collector_identity, r.retrieval_purpose, r.acquisition_mode, r.verification_evidence,
       r.permission_grant_id, si.slug AS source_interface_slug
  FROM pipeline.source_retrievals r
  JOIN reference.source_interfaces si ON si.id = r.source_interface_id
 WHERE r.id = ANY($1::uuid[])
`;

const INSERT_RETRIEVAL_SQL = `
INSERT INTO pipeline.source_retrievals (
  id, source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
  request_parameters, response_status, response_content_type, response_hash, response_byte_length,
  response_body, record_count, enumeration_assessment, enumeration_evidence, collector_identity,
  retrieval_purpose, acquisition_mode, verification_evidence, permission_grant_id
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17, $18, $19, $20, $21
)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id
`;

const INSERT_OBSERVATION_SQL = `
INSERT INTO pipeline.token_price_observations (
  id, model_id, pricing_dimension, source_native_price, source_native_currency,
  source_native_denominator_tokens, canonical_price_usd_per_1m, region, service_tier,
  context_tier, cache_ttl, source_interface_id, source_retrieval_id, source_effective_at, retrieved_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
)
ON CONFLICT DO NOTHING
RETURNING id
`;

export async function loadTokenReadCatalogFromSql(sql: TokenSqlExecutor): Promise<TokenReadCatalog> {
  const modelResult = await sql.query(MODELS_SQL, [WAVE1_SLUGS]);
  const interfaceResult = await sql.query(INTERFACES_SQL, []);
  const observationResult = await sql.query(OBSERVATIONS_SQL, []);

  const models = modelResult.rows.flatMap((row) => {
    const mapped = mapModel(row);
    return mapped ? [mapped] : [];
  });
  const sourceInterfaces = interfaceResult.rows.flatMap((row) => {
    const mapped = mapInterface(row);
    return mapped ? [mapped] : [];
  });
  const observations = observationResult.rows.flatMap((row) => {
    const mapped = mapObservation(row);
    return mapped ? [mapped] : [];
  });

  const providerByInterface = new Map(sourceInterfaces.map((row) => [row.id, providerSlugForInterface(row.id)]));
  const retrievalIds = [...new Set(observations.map((row) => row.retrievalId))];
  const retrievalResult = retrievalIds.length > 0 ? await sql.query(RETRIEVALS_SQL, [retrievalIds]) : { rows: [] };
  const retrievals = retrievalResult.rows.flatMap((row) => {
    const mapped = mapRetrieval(row, providerByInterface);
    return mapped ? [mapped] : [];
  });

  return {
    models: models.length > 0 ? models : WAVE1_MODELS,
    observations,
    retrievals,
    sourceInterfaces: sourceInterfaces.length > 0 ? sourceInterfaces : Object.values(WAVE1_SOURCE_INTERFACES),
  };
}

function providerSlugForInterface(interfaceId: string): Wave1Provider | "" {
  for (const provider of WAVE1_SLUGS) {
    if (WAVE1_SOURCE_INTERFACES[provider].id === interfaceId) return provider;
  }
  return "";
}

export async function persistTokenReadCatalog(
  sql: TokenSqlExecutor,
  catalog: TokenReadCatalog,
): Promise<{ retrievalsInserted: number; observationsInserted: number }> {
  await sql.query("begin", []);
  try {
    let retrievalsInserted = 0;
    for (const retrieval of catalog.retrievals) {
      const result = await sql.query(INSERT_RETRIEVAL_SQL, [
        retrieval.id,
        retrieval.sourceInterfaceId,
        retrieval.idempotencyKey,
        retrieval.requestedAt,
        retrieval.completedAt,
        retrieval.requestMethod,
        retrieval.requestUrl,
        JSON.stringify(retrieval.requestParameters),
        retrieval.responseStatus,
        retrieval.responseContentType,
        retrieval.responseHash,
        retrieval.responseByteLength,
        // The reviewed artifact itself, so a parser run is reproducible from the database
        // alone. Wave-1 sources are public pricing pages and carry no credential.
        JSON.stringify({ contentType: retrieval.responseBody.contentType, sha256: retrieval.responseHash, body: retrieval.responseBody.body }),
        retrieval.recordCount,
        retrieval.enumerationAssessment,
        retrieval.enumerationEvidence,
        retrieval.collectorIdentity,
        retrieval.retrievalPurpose,
        retrieval.acquisitionMode,
        retrieval.verificationEvidence,
        retrieval.permissionGrantId,
      ]);
      if (result.rows.length > 0) retrievalsInserted += 1;
    }

    let observationsInserted = 0;
    for (const observation of catalog.observations) {
      const result = await sql.query(INSERT_OBSERVATION_SQL, [
        observation.id,
        observation.modelId,
        observation.pricingDimension,
        observation.sourceNativePrice,
        observation.sourceNativeCurrency,
        observation.sourceNativeDenominatorTokens,
        observation.canonicalPriceUsdPer1m,
        observation.region,
        observation.serviceTier,
        observation.contextTier,
        observation.cacheTtl,
        observation.sourceInterfaceId,
        observation.retrievalId,
        observation.sourceEffectiveAt,
        observation.retrievedAt,
      ]);
      if (result.rows.length > 0) observationsInserted += 1;
    }

    await sql.query("commit", []);
    return { retrievalsInserted, observationsInserted };
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}
