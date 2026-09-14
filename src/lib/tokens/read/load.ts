/**
 * Production token-price catalog loader.
 *
 * The Next app has no database client in this phase. The public read path
 * therefore fails closed: wave-1 models and source interfaces are known, and
 * observations are empty until production-publicable rows can be read from
 * pipeline.token_price_observations under permitted rights.
 */

import { WAVE1_MODELS, WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { tokenInstrumentsFromSeries, withTokenInstruments } from "@/lib/tokens/read/instruments";
import { listPublicTokenSeries, type TokenReadCatalog } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import type { MarketDetail, MarketInstrumentDetail } from "@/types/market";

export function emptyTokenReadCatalog(): TokenReadCatalog {
  return {
    models: WAVE1_MODELS,
    observations: [],
    retrievals: [],
    sourceInterfaces: Object.values(WAVE1_SOURCE_INTERFACES),
  };
}

export function tokenReadCatalogFromStore(store: InMemoryTokenPricingStore): TokenReadCatalog {
  return {
    models: store.allModels(),
    observations: store.allObservations(),
    retrievals: [...store.retrievals],
    sourceInterfaces: store.sourceInterfaces(),
  };
}

/** Live catalog for the product surface and public API. Empty until production-publicable observations exist. */
export function loadTokenReadCatalog(): TokenReadCatalog {
  return emptyTokenReadCatalog();
}

export function loadPublicTokenInstruments(): MarketInstrumentDetail[] {
  return tokenInstrumentsFromSeries(listPublicTokenSeries(loadTokenReadCatalog()));
}

export function hydrateMarketWithTokenPrices(market: MarketDetail): MarketDetail {
  if (!market.families.some((family) => family.id === "tokens")) return market;
  return withTokenInstruments(market, loadPublicTokenInstruments());
}
