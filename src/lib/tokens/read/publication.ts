/**
 * Publication gate for the public token-price read path.
 *
 * Production-publicable observations require a production retrieval and a
 * source interface that the UCPI permission predicate already permits.
 * Research ingest, under_review / research_usable registry rows, and
 * unknown providers fail closed. This module does not write registry state.
 */

import { tokenProductionCollectionPermitted } from "@/lib/tokens/permission";
import { WAVE1_PROVIDERS, type TokenSourceInterface, type TokenSourceRetrieval, type TokenPriceObservationRow, type Wave1Provider } from "@/lib/tokens/types";

export function isWave1Provider(value: string): value is Wave1Provider {
  return (WAVE1_PROVIDERS as readonly string[]).includes(value);
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
