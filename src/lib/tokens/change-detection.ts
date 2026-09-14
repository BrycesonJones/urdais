/**
 * Decide whether a parsed quote should become a new append-only observation.
 *
 * The unique index is per retrieval, so inserting the same board under a new
 * retrieval would succeed. Application code must not do that: a new row is a
 * newly observed source state or an actual price change, not a daily copy.
 */

import type { TokenPriceQuote } from "@/lib/tokens/observation";
import type { ObservationDecision, TokenPriceObservationRow } from "@/lib/tokens/types";

function modelKey(observationKey: string): string {
  return observationKey.split("|")[0] ?? observationKey;
}

export function detectObservationChanges(
  quotes: readonly TokenPriceQuote[],
  latestByKey: ReadonlyMap<string, TokenPriceObservationRow>,
): ObservationDecision[] {
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
      return {
        kind: "unchanged",
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
