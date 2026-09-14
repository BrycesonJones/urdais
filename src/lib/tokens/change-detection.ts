/**
 * Decide whether a parsed quote should become a new append-only observation.
 *
 * The unique index is per retrieval, so inserting the same board under a new
 * retrieval would succeed. Application code must not do that: a new row is a
 * newly observed source state or an actual price change, not a daily copy.
 *
 * Price is not the only thing an observation records. A price first seen under
 * research provenance and then manually verified for production is a new fact:
 * the same number, now publishable. Treating it as unchanged would mean the
 * command that turns the product on silently does nothing whenever a research
 * preview happened to see the same price first. So provenance is part of the
 * decision, and the research row is left exactly as it is.
 */

import type { TokenPriceQuote } from "@/lib/tokens/observation";
import type { ObservationDecision, TokenAcquisitionMode, TokenIngestMode, TokenPriceObservationRow } from "@/lib/tokens/types";

function modelKey(observationKey: string): string {
  return observationKey.split("|")[0] ?? observationKey;
}

export type ChangeDetectionContext = {
  /** How the incoming artifact was acquired. */
  acquisition: TokenAcquisitionMode;
  /** Whether the incoming ingestion is a production one. */
  mode: TokenIngestMode;
  /** Whether an already recorded observation is production-publicable. */
  isProduction?: (row: TokenPriceObservationRow) => boolean;
};

export function detectObservationChanges(
  quotes: readonly TokenPriceQuote[],
  latestByKey: ReadonlyMap<string, TokenPriceObservationRow>,
  context: ChangeDetectionContext = { acquisition: "automated", mode: "research" },
): ObservationDecision[] {
  // A manually verified production acquisition promotes a price that exists
  // only under research provenance, even when the number has not moved.
  const promotes = context.mode === "production" && context.acquisition === "manual_verified";
  const incomingKeys = new Set(quotes.map((quote) => quote.observationKey));
  const decisions: ObservationDecision[] = quotes.map((quote) => {
    const previous = latestByKey.get(quote.observationKey);
    if (!previous) {
      const sameModel = [...latestByKey.keys()].some((key) => modelKey(key) === quote.identityKey);
      return {
        kind: sameModel ? "facet_added" : "model_added",
        observationKey: quote.observationKey,
        quote,
      };
    }
    if (previous.canonicalPriceUsdPer1m === quote.canonical.priceUsdPer1m && previous.sourceNativePrice === quote.canonical.native.price) {
      const alreadyProduction = context.isProduction?.(previous) ?? false;
      return {
        kind: promotes && !alreadyProduction ? "provenance_promoted" : "unchanged",
        observationKey: quote.observationKey,
        quote,
        previousCanonicalUsdPer1m: previous.canonicalPriceUsdPer1m,
      };
    }
    return {
      kind: "price_changed",
      observationKey: quote.observationKey,
      quote,
      previousCanonicalUsdPer1m: previous.canonicalPriceUsdPer1m,
    };
  });

  const incomingModels = new Set(quotes.map((quote) => quote.identityKey));
  for (const [key, previous] of latestByKey) {
    if (incomingKeys.has(key)) continue;
    const identity = modelKey(key);
    decisions.push({
      kind: incomingModels.has(identity) ? "facet_removed" : "model_removed",
      observationKey: key,
      previousCanonicalUsdPer1m: previous.canonicalPriceUsdPer1m,
    });
  }
  return decisions;
}

export function quotesToInsert(decisions: readonly ObservationDecision[]): TokenPriceQuote[] {
  return decisions.flatMap((decision) => {
    if (!decision.quote) return [];
    if (decision.kind === "unchanged" || decision.kind === "model_removed" || decision.kind === "facet_removed") return [];
    return [decision.quote];
  });
}
