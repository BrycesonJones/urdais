/**
 * Map the canonical listed-GPU read model onto the market-detail instrument
 * shape the existing page already renders. Series points become daily closes;
 * candidates carry no history, so the chart empty-state copy applies until
 * two calculation dates exist.
 */

import { docHref } from "@/lib/docs/catalog";
import { availableRanges } from "@/lib/market-ranges";
import type { UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import type { ListedMarketView } from "@/lib/ucpi/read/listed-view";
import type { ComparisonOption, ListedInstrumentMeta, MarketInstrumentDetail, TimeSeriesPoint } from "@/types/market";

const STATUS_LABEL: Record<ListedMarketView["status"], string> = {
  candidate: "Candidate",
  published: "Published",
  delayed: "Delayed",
  unavailable: "Unavailable",
  no_calculation: "Pre-publication",
};

export function listedInstrumentId(symbol: string): string {
  return symbol.toLowerCase();
}

function asOfSeconds(date: string | null): number | null {
  if (!date) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) ? time / 1000 : null;
}

function dailyFromSeries(points: readonly UcpiSeriesPoint[]): TimeSeriesPoint[] {
  return points
    .filter((point) => point.priceLevel !== null)
    .map((point) => ({ time: Date.parse(`${point.calculationDate}T00:00:00Z`) / 1000, value: point.priceLevel! }));
}

export function listedMetaFromView(view: ListedMarketView): ListedInstrumentMeta {
  return {
    economicObject: "Listed On-Demand Price",
    status: view.status,
    statusLabel: STATUS_LABEL[view.status],
    breadth: view.breadth,
    participantCount: view.participantCount,
    minimumParticipants: view.minimumParticipants,
    technicalSourceCount: view.technicalSourceCount,
    largestSourceShare: view.largestSourceShare,
    attributions: view.attributions,
    familyMethodologyHref: docHref(view.familyMethodologySlug),
    childMethodologyHref: docHref(view.childMethodologySlug),
    caveat: view.caveat,
    unavailableReason: view.structuralCondition,
    isCandidate: view.isCandidate,
    isPublished: view.isPublished,
    asOfDate: view.asOfDate,
  };
}

export function toListedMarketInstrument(
  view: ListedMarketView,
  siblings: readonly ListedMarketView[],
  series: readonly UcpiSeriesPoint[] = [],
): MarketInstrumentDetail {
  const daily = view.isCandidate ? [] : dailyFromSeries(series);
  const asOf = asOfSeconds(view.asOfDate);
  const detailed = { daily, intraday: [] };
  const comparisons: ComparisonOption[] = siblings
    .filter((other) => other.symbol !== view.symbol)
    .map((other) => ({ instrumentId: listedInstrumentId(other.symbol), label: `${other.gpuLabel} Listed`, basis: "relative" as const }));
  return {
    id: listedInstrumentId(view.symbol),
    shortLabel: view.gpuLabel,
    displaySymbol: view.gpuLabel,
    symbol: `${view.gpuLabel} Listed`,
    name: "Listed On-Demand Price",
    unit: "$/hr",
    snapshot: {
      value: view.price,
      changePercent: view.oneDayPctChange,
      asOf,
    },
    series: detailed,
    availableRanges: asOf === null ? [] : availableRanges(detailed, asOf),
    comparisons,
    listed: listedMetaFromView(view),
  };
}
