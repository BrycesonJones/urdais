/**
 * Map public token-price series onto the market-detail instrument shape.
 * History is the recorded observations only; no synthetic daily or intraday
 * points. Percentage change is already withheld by the read model when a
 * series has a single observation.
 */

import { availableRanges } from "@/lib/market-ranges";
import type { CacheTtl, ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";
import { pickDefaultTokenSeries } from "@/lib/tokens/read/default-selection";
import { TOKEN_CHART_UNIT, pricingDimensionLabel, tokenFacetLabel, tokenSeriesLabel, tokenUnitCaption } from "@/lib/tokens/read/labels";
import type { PublicTokenSeries } from "@/lib/tokens/read/api-contract";
import type { MarketDetail, MarketInstrumentDetail, TokenInstrumentIdentity } from "@/types/market";

function toUnix(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export function tokenIdentityFromSeries(series: PublicTokenSeries): TokenInstrumentIdentity {
  const facetLabel = tokenFacetLabel(series);
  return {
    providerSlug: series.providerSlug,
    providerName: series.providerName,
    providerModelId: series.providerModelId,
    displayName: series.displayName,
    modelFamily: series.modelFamily,
    pricingDimension: series.pricingDimension,
    dimensionLabel: pricingDimensionLabel(series.pricingDimension),
    facetLabel,
    serviceTier: series.serviceTier,
    contextTier: series.contextTier,
    cacheTtl: series.cacheTtl,
    region: series.region,
    unitCaption: tokenUnitCaption(series.pricingDimension),
  };
}

function toInstrument(series: PublicTokenSeries, comparisons: MarketInstrumentDetail["comparisons"]): MarketInstrumentDetail {
  const identity = tokenIdentityFromSeries(series);
  const label = tokenSeriesLabel(series.displayName, identity.facetLabel);
  const daily = series.history.map((point) => ({
    time: toUnix(point.time),
    value: point.priceUsdPer1m,
  }));
  const latest = daily[daily.length - 1]!;
  const detailed = { daily, intraday: [] };
  return {
    id: series.seriesId,
    shortLabel: series.displayName,
    symbol: label,
    name: series.providerName,
    unit: TOKEN_CHART_UNIT,
    tokenIdentity: identity,
    snapshot: {
      value: series.priceUsdPer1m,
      changePercent: series.percentageChange,
      asOf: latest.time,
    },
    series: detailed,
    availableRanges: availableRanges(detailed, latest.time),
    comparisons,
  };
}

export function tokenInstrumentsFromSeries(series: readonly PublicTokenSeries[]): MarketInstrumentDetail[] {
  const comparisonLabel = (row: PublicTokenSeries) => tokenSeriesLabel(row.displayName, tokenFacetLabel(row));
  return series.map((row) =>
    toInstrument(
      row,
      series
        .filter((other) => other.seriesId !== row.seriesId)
        .map((other) => ({
          instrumentId: other.seriesId,
          label: comparisonLabel(other),
          basis: "absolute" as const,
        })),
    ),
  );
}

function asPublicSeries(instrument: MarketInstrumentDetail): PublicTokenSeries | undefined {
  const identity = instrument.tokenIdentity;
  if (!identity) return undefined;
  return {
    seriesId: instrument.id,
    providerSlug: identity.providerSlug,
    providerName: identity.providerName,
    providerModelId: identity.providerModelId,
    displayName: identity.displayName,
    modelFamily: identity.modelFamily,
    pricingDimension: identity.pricingDimension as SourcePricingDimension,
    serviceTier: identity.serviceTier as ServiceTier,
    contextTier: identity.contextTier,
    cacheTtl: identity.cacheTtl as CacheTtl | null,
    region: identity.region,
    priceUsdPer1m: instrument.snapshot.value,
    currency: "USD",
    unit: "USD / 1M tokens",
    retrievedAt: new Date(instrument.snapshot.asOf * 1000).toISOString(),
    sourceEffectiveAt: null,
    percentageChange: instrument.snapshot.changePercent,
    history: instrument.series.daily.map((point) => ({
      time: new Date(point.time * 1000).toISOString(),
      priceUsdPer1m: point.value,
    })),
  };
}

export function pickDefaultTokenInstrument(instruments: readonly MarketInstrumentDetail[]): MarketInstrumentDetail | undefined {
  const series = instruments.flatMap((instrument) => {
    const row = asPublicSeries(instrument);
    return row ? [row] : [];
  });
  const picked = pickDefaultTokenSeries(series);
  if (!picked) return instruments[0];
  return instruments.find((instrument) => instrument.id === picked.seriesId) ?? instruments[0];
}

export function selectTokenInstrument(
  instruments: readonly MarketInstrumentDetail[],
  selected: MarketInstrumentDetail,
  change: { providerSlug?: string; providerModelId?: string; seriesId?: string },
): MarketInstrumentDetail {
  if (change.seriesId) {
    return instruments.find((instrument) => instrument.id === change.seriesId) ?? selected;
  }
  const identity = selected.tokenIdentity;
  if (!identity) return selected;
  const providerSlug = change.providerSlug ?? identity.providerSlug;
  const byProvider = instruments.filter((instrument) => instrument.tokenIdentity?.providerSlug === providerSlug);
  if (change.providerModelId !== undefined) {
    const byModel = byProvider.filter((instrument) => instrument.tokenIdentity?.providerModelId === change.providerModelId);
    return pickDefaultTokenInstrument(byModel) ?? selected;
  }
  return pickDefaultTokenInstrument(byProvider) ?? selected;
}

export function withTokenInstruments(market: MarketDetail, instruments: readonly MarketInstrumentDetail[]): MarketDetail {
  const defaultInstrument = pickDefaultTokenInstrument(instruments);
  return {
    ...market,
    families: market.families.map((family) =>
      family.id === "tokens"
        ? {
            ...family,
            instruments: [...instruments],
            defaultInstrumentId: defaultInstrument?.id ?? "",
          }
        : family,
    ),
  };
}
