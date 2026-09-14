"use client";

import { useState } from "react";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { MarketHeader } from "@/components/market-detail/market-header";
import { MarketSelectors } from "@/components/market-detail/market-selectors";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { MAX_COMPARISONS, useInstrumentChart } from "@/components/market-detail/use-instrument-chart";
import { findInstrument, findInstrumentById, findMarketOfInstrument } from "@/data/mock/market-detail";
import type { MarketDetail, MarketFamily, MarketInstrumentDetail } from "@/types/market";

function familyOf(market: MarketDetail, instrumentId: string): MarketFamily | undefined {
  return market.families.find((family) => family.instruments.some((instrument) => instrument.id === instrumentId) || family.defaultInstrumentId === instrumentId);
}

function instrumentInFamily(family: MarketFamily, instrumentId: string): MarketInstrumentDetail | null {
  return (
    family.instruments.find((instrument) => instrument.id === instrumentId) ??
    family.instruments.find((instrument) => instrument.id === family.defaultInstrumentId) ??
    family.instruments[0] ??
    null
  );
}

/**
 * Shared Information Markets detail experience for every routed market.
 * Owns the selected family and instrument; range and comparison state live in the
 * shared chart hook. Mount with a key of the market symbol so navigating
 * between markets resets the selection.
 */
export function MarketDetailPage({
  market,
  researchPreview = false,
}: {
  market: MarketDetail;
  researchPreview?: boolean;
}) {
  const initialFamily =
    familyOf(market, market.defaultInstrumentId) ??
    market.families.find((family) => family.instruments.some((instrument) => instrument.id === market.defaultInstrumentId)) ??
    market.families[0]!;
  const [familyId, setFamilyId] = useState(initialFamily.id);
  const [instrumentId, setInstrumentId] = useState(market.defaultInstrumentId);
  const family = market.families.find((candidate) => candidate.id === familyId) ?? market.families[0]!;
  const instrument = instrumentInFamily(family, instrumentId);

  function handleFamilyChange(nextId: string) {
    const next = market.families.find((candidate) => candidate.id === nextId);
    setFamilyId(nextId);
    setInstrumentId(next?.defaultInstrumentId ?? "");
  }

  function handleInstrumentChange(nextId: string) {
    setInstrumentId(nextId);
  }

  if (!instrument) {
    return (
      <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-screen-2xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <MarketHeader market={market} instrument={null} emptyFamilyLabel={family.label} researchPreview={false} />
            <MarketSelectors
              market={market}
              family={family}
              instrument={null}
              comparisonIds={[]}
              maxComparisons={MAX_COMPARISONS}
              onFamilyChange={handleFamilyChange}
              onInstrumentChange={handleInstrumentChange}
              onToggleComparison={() => undefined}
              onClearComparisons={() => undefined}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <LoadedMarketDetail
      key={family.id}
      market={market}
      family={family}
      instrument={instrument}
      researchPreview={researchPreview}
      onFamilyChange={handleFamilyChange}
      onInstrumentChange={handleInstrumentChange}
    />
  );
}

function LoadedMarketDetail({
  market,
  family,
  instrument,
  researchPreview,
  onFamilyChange,
  onInstrumentChange,
}: {
  market: MarketDetail;
  family: MarketFamily;
  instrument: MarketInstrumentDetail;
  researchPreview: boolean;
  onFamilyChange: (familyId: string) => void;
  onInstrumentChange: (instrumentId: string) => void;
}) {
  const resolve = (id: string) => findInstrument(market, id) ?? findInstrumentById(id);
  const homeMarketOf = (candidate: MarketInstrumentDetail) =>
    findInstrument(market, candidate.id) ? market : findMarketOfInstrument(candidate);
  const chart = useInstrumentChart(instrument, resolve, { market, homeMarketOf });

  function handleInstrumentChange(nextId: string) {
    onInstrumentChange(nextId);
    chart.clearComparisons();
  }

  function handleFamilyChange(nextId: string) {
    chart.clearComparisons();
    onFamilyChange(nextId);
  }

  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <MarketHeader
            market={market}
            instrument={instrument}
            researchPreview={researchPreview && Boolean(instrument.tokenIdentity)}
          />
          <MarketSelectors
            market={market}
            family={family}
            instrument={instrument}
            comparisonIds={chart.comparisonIds}
            maxComparisons={MAX_COMPARISONS}
            onFamilyChange={handleFamilyChange}
            onInstrumentChange={handleInstrumentChange}
            onToggleComparison={chart.toggleComparison}
            onClearComparisons={chart.clearComparisons}
          />
        </div>

        <DetailedMarketChart
          primary={chart.primarySeries}
          comparisons={chart.comparisonSeries}
          basis={chart.basis}
          intraday={chart.intraday}
          label={chart.label}
          className="mt-6 h-[320px] sm:h-[400px] lg:h-[clamp(340px,46vh,480px)]"
        />

        <PeriodPerformance
          performance={chart.performance}
          selected={chart.effectiveRange}
          onSelect={chart.setRange}
          className="mt-3 border-t border-white/10 pt-3"
        />
      </div>
    </main>
  );
}
