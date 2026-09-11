"use client";

import { useState } from "react";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { MarketHeader } from "@/components/market-detail/market-header";
import { MarketSelectors } from "@/components/market-detail/market-selectors";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { MAX_COMPARISONS, useInstrumentChart } from "@/components/market-detail/use-instrument-chart";
import { defaultInstrument, findInstrument, findInstrumentById, findMarketOfInstrument } from "@/data/mock/market-detail";
import type { MarketDetail } from "@/types/market";

/**
 * Shared Information Markets detail experience for every routed market.
 * Owns the selected instrument; range and comparison state live in the
 * shared chart hook. Mount with a key of the market symbol so navigating
 * between markets resets the selection.
 */
export function MarketDetailPage({ market }: { market: MarketDetail }) {
  const [instrumentId, setInstrumentId] = useState(market.defaultInstrumentId);
  const instrument = findInstrument(market, instrumentId) ?? defaultInstrument(market);
  const chart = useInstrumentChart(instrument, findInstrumentById, { market, homeMarketOf: findMarketOfInstrument });

  function handleInstrumentChange(nextId: string) {
    setInstrumentId(nextId);
    // Comparisons are defined per instrument, so stale ones are dropped.
    chart.clearComparisons();
  }

  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <MarketHeader market={market} instrument={instrument} />
          <MarketSelectors
            market={market}
            instrument={instrument}
            comparisonIds={chart.comparisonIds}
            maxComparisons={MAX_COMPARISONS}
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
          // Substantial but not the whole fold: on desktop the height follows the
          // viewport between a usable floor and a cap, so the timeframe strip
          // beneath stays discoverable on a typical laptop window.
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
