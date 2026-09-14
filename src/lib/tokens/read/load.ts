/**
 * Token-price catalog loader.
 *
 * Reads canonical rows from the database when a server-side connection is
 * available. Visibility (production vs research preview) is applied after
 * load and never by inventing a second data model.
 */

import { WAVE1_MODELS, WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { persistedBenchmarks, type PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { productionFrozenRows } from "@/lib/tokens/read/lineage";
import type { PublicTokenBenchmarkSeries } from "@/lib/tokens/read/api-contract";
import { benchmarkInstrumentsFromSeries, withTokenInstruments } from "@/lib/tokens/read/instruments";
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

/**
 * Token markets for a product surface: one Urdais Token Price benchmark per
 * provider, derived under docs/methodology/token-price.md from the canonical
 * standard input and output rates of that provider's designated model.
 *
 * Visibility is applied to the canonical rows first, so production stays
 * fail-closed: a provider whose source rights do not permit production
 * collection contributes no legs, and therefore no benchmark. A provider
 * missing either leg is withheld rather than approximated.
 */
export async function loadVisibleTokenInstruments(env: ProcessEnvLike = process.env): Promise<MarketInstrumentDetail[]> {
  return benchmarkInstrumentsFromSeries(await loadVisibleTokenBenchmarks(env));
}

/**
 * The authoritative benchmark rows.
 *
 * Frozen rows win. Once a calculation has been written to
 * `pipeline.token_price_benchmarks` it is the record, and a later correction
 * to a raw leg cannot change it. The calculator is the fallback only where
 * nothing has been frozen yet, which is the case in a research preview
 * running without a database.
 */
export async function loadVisibleTokenBenchmarks(env: ProcessEnvLike = process.env): Promise<PublicTokenBenchmarkSeries[]> {
  const mode = tokenVisibilityMode(env);
  const frozen = await loadFrozenBenchmarks(env);

  if (mode === "production") {
    // Frozen rows are the authoritative record, and production serves only the
    // ones whose own two leg observations are production-publicable. A row
    // frozen from research legs is not promoted by later production
    // observations, and a raw leg corrected after the freeze does not move the
    // published value, which is the point of freezing it.
    if (frozen.length > 0) {
      const catalog = await loadTokenReadCatalog(env);
      const serveable = productionFrozenRows(catalog, frozen);
      if (serveable.length > 0) return persistedBenchmarks(serveable);
    }
    // Nothing eligible has been frozen yet: fall back to the calculator, which
    // is itself restricted to production-publicable observations.
    return visibleTokenBenchmarks(await loadTokenReadCatalog(env), env);
  }

  // Research preview may serve research-derived frozen rows as well.
  if (frozen.length > 0) return persistedBenchmarks(frozen);
  return visibleTokenBenchmarks(await loadTokenReadCatalog(env), env);
}

async function loadFrozenBenchmarks(env: ProcessEnvLike): Promise<PersistedBenchmarkRow[]> {
  try {
    const { loadFrozenBenchmarksFromDatabase } = await import("@/lib/tokens/read/database");
    return (await loadFrozenBenchmarksFromDatabase(env)) ?? [];
  } catch {
    return [];
  }
}

/** Calculated benchmarks from a catalog, used to freeze and as the pre-freeze fallback. */
export function visibleTokenBenchmarks(catalog: TokenReadCatalog, env: ProcessEnvLike = process.env) {
  return publishableBenchmarks(listVisibleTokenSeries(catalog, tokenVisibilityMode(env)));
}

export async function hydrateMarketWithTokenPrices(
  market: MarketDetail,
  env: ProcessEnvLike = process.env,
): Promise<MarketDetail> {
  if (!market.families.some((family) => family.id === "tokens")) return market;
  return withTokenInstruments(market, await loadVisibleTokenInstruments(env));
}

/**
 * True only while the visible token values are research-only. A manually
 * verified production observation is not a preview, so once one exists for a
 * provider its market carries no preview badge. In a production runtime this
 * is always false, because research observations are never visible there.
 */
export async function tokenResearchPreviewActive(env: ProcessEnvLike = process.env): Promise<boolean> {
  if (tokenVisibilityMode(env) === "production") return false;
  const visible = await loadVisibleTokenBenchmarks(env);
  if (visible.length === 0) return false;
  const productionProviders = await productionPublishableProviders(env);
  return visible.some((row) => !productionProviders.has(row.providerSlug));
}

/** Providers whose benchmark rests on production-publicable observations. */
async function productionPublishableProviders(env: ProcessEnvLike): Promise<Set<string>> {
  const catalog = await loadTokenReadCatalog(env);
  return new Set(publishableBenchmarks(listVisibleTokenSeries(catalog, "production")).map((row) => row.providerSlug));
}
