/**
 * Server loader for routed markets. UCPI's Compute family is the listed GPU
 * read model; every other market stays on the mock detail dataset.
 */

import { findMarket } from "@/data/mock/market-detail";
import { toListedMarketInstrument } from "@/lib/markets/listed-instrument";
import type { UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import { getListedSeries, listListedMarketViews, type ListedMarketReadOptions } from "@/lib/ucpi/read/listed-markets";
import { showListedCandidates } from "@/lib/ucpi/read/show-candidates";
import type { MarketDetail, MarketInstrumentDetail } from "@/types/market";

export async function loadMarket(symbol: string, options: ListedMarketReadOptions = {}): Promise<MarketDetail | undefined> {
  const market = findMarket(symbol);
  if (!market) return undefined;
  if (market.symbol !== "UCPI") return market;
  return overlayListedCompute(market, options);
}

export async function overlayListedCompute(market: MarketDetail, options: ListedMarketReadOptions = {}): Promise<MarketDetail> {
  const views = await listListedMarketViews(options);
  const instruments: MarketInstrumentDetail[] = [];
  for (const view of views) {
    let series: UcpiSeriesPoint[] = [];
    if (!view.isCandidate) {
      if (options.loadSeries) series = await options.loadSeries(view.symbol);
      else if (options.persistence) series = (await getListedSeries(view.symbol, options.persistence)) ?? [];
    }
    instruments.push(toListedMarketInstrument(view, views, series));
  }
  const defaultInstrumentId = instruments[0]?.id ?? market.defaultInstrumentId;
  return {
    ...market,
    defaultInstrumentId,
    families: market.families.map((family) => (family.id === "compute" ? { ...family, instruments, defaultInstrumentId } : family)),
  };
}

export function listedReadOptions(): ListedMarketReadOptions {
  return { allowCandidates: showListedCandidates() };
}
