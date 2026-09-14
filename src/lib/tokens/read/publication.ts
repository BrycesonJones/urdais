/**
 * Publication gate for the token-price read path.
 *
 * Production-publicable observations require a production retrieval and a
 * source interface that the UCPI permission predicate already permits.
 * Research ingest, under_review / research_usable registry rows, and
 * unknown providers fail closed. This module does not write registry state.
 *
 * Development research-preview visibility is a separate filter. It never
 * changes registry columns and cannot activate in a production runtime.
 */

import { tokenProductionCollectionPermitted } from "@/lib/tokens/permission";
import { WAVE1_PROVIDERS, type TokenSourceInterface, type TokenSourceRetrieval, type TokenPriceObservationRow, type Wave1Provider } from "@/lib/tokens/types";

export type TokenVisibilityMode = "production" | "research_preview";

export function isWave1Provider(value: string): value is Wave1Provider {
  return (WAVE1_PROVIDERS as readonly string[]).includes(value);
}

export type ProcessEnvLike = Record<string, string | undefined>;

export function isProductionRuntime(env: ProcessEnvLike = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/**
 * Production runtimes are always fail-closed. Any other runtime may use the
 * Wave-1 research-preview filter. Extra preview flags are ignored in production.
 */
export function tokenVisibilityMode(env: ProcessEnvLike = process.env): TokenVisibilityMode {
  if (isProductionRuntime(env)) return "production";
  return "research_preview";
}

export function observationIsPublicable(
  observation: TokenPriceObservationRow,
  retrieval: TokenSourceRetrieval | undefined,
  source: TokenSourceInterface | undefined,
): boolean {
  if (!retrieval || !source) return false;
  if (retrieval.id !== observation.retrievalId) return false;
  if (source.id !== observation.sourceInterfaceId) return false;
  if (retrieval.retrievalPurpose !== "production") return false;
  if (!isWave1Provider(observation.providerSlug)) return false;
  if (!tokenProductionCollectionPermitted(source.registry)) return false;
  return Number.isFinite(observation.canonicalPriceUsdPer1m);
}

export function observationIsResearchPreviewable(
  observation: TokenPriceObservationRow,
  retrieval: TokenSourceRetrieval | undefined,
  source: TokenSourceInterface | undefined,
): boolean {
  if (!retrieval || !source) return false;
  if (retrieval.id !== observation.retrievalId) return false;
  if (source.id !== observation.sourceInterfaceId) return false;
  if (retrieval.retrievalPurpose !== "research") return false;
  if (!isWave1Provider(observation.providerSlug)) return false;
  if (source.registry.productionAccessState === "production_blocked") return false;
  return Number.isFinite(observation.canonicalPriceUsdPer1m);
}

export function observationIsVisible(
  observation: TokenPriceObservationRow,
  retrieval: TokenSourceRetrieval | undefined,
  source: TokenSourceInterface | undefined,
  mode: TokenVisibilityMode,
): boolean {
  if (observationIsPublicable(observation, retrieval, source)) return true;
  return mode === "research_preview" && observationIsResearchPreviewable(observation, retrieval, source);
}
