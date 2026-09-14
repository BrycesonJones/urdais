/**
 * Token-price catalog loader.
 *
 * Reads canonical rows from the database when a server-side connection is
 * available. Visibility (production vs research preview) is applied after
 * load and never by inventing a second data model.
 */

import { WAVE1_MODELS, WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { tokenInstrumentsFromSeries, withTokenInstruments } from "@/lib/tokens/read/instruments";
import { publicTokenPricesResponse, type PublicTokenPricesResponse } from "@/lib/tokens/read/api-contract";
import { tokenVisibilityMode, type ProcessEnvLike } from "@/lib/tokens/read/publication";
import { listVisibleTokenSeries, type TokenReadCatalog } from "@/lib/tokens/read/series";
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

/** Live catalog of canonical rows. Empty when no database is reachable. */
export async function loadTokenReadCatalog(env: ProcessEnvLike = process.env): Promise<TokenReadCatalog> {
  const { loadTokenReadCatalogFromDatabase } = await import("@/lib/tokens/read/database");
  try {
    const catalog = await loadTokenReadCatalogFromDatabase(env);
    return catalog ?? emptyTokenReadCatalog();
  } catch {
    return emptyTokenReadCatalog();
  }
}

export function visibleTokenPricesResponse(
  catalog: TokenReadCatalog,
  env: ProcessEnvLike = process.env,
): PublicTokenPricesResponse {
  return publicTokenPricesResponse(listVisibleTokenSeries(catalog, tokenVisibilityMode(env)));
}

export async function loadVisibleTokenInstruments(env: ProcessEnvLike = process.env): Promise<MarketInstrumentDetail[]> {
  const catalog = await loadTokenReadCatalog(env);
  return tokenInstrumentsFromSeries(listVisibleTokenSeries(catalog, tokenVisibilityMode(env)));
}

export async function hydrateMarketWithTokenPrices(
  market: MarketDetail,
  env: ProcessEnvLike = process.env,
): Promise<MarketDetail> {
  if (!market.families.some((family) => family.id === "tokens")) return market;
  return withTokenInstruments(market, await loadVisibleTokenInstruments(env));
}

export function tokenResearchPreviewActive(env: ProcessEnvLike = process.env): boolean {
  return tokenVisibilityMode(env) === "research_preview";
}
