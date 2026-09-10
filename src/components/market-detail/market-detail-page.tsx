"use client";

import { useMemo, useState } from "react";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import type { ChartSeries } from "@/components/charts/detailed-market-chart";
import { MarketHeader } from "@/components/market-detail/market-header";
import { MarketSelectors } from "@/components/market-detail/market-selectors";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { defaultInstrument, findInstrument } from "@/data/mock/market-detail";
import { isIntradayRange, periodPerformance, RANGE_LABELS, windowPoints } from "@/lib/market-ranges";
import type { DetailRange, MarketDetail } from "@/types/market";

const DEFAULT_RANGE: DetailRange = "1M";

/**
 * Shared Information Markets detail experience for every routed market.
 * Owns the selected instrument, comparison, and range; everything else is
 * derived from the market's deterministic detail data. Mount with a key of
 * the market symbol so navigating between markets resets the selection.
 */
export function MarketDetailPage({ market }: { market: MarketDetail }) {
  const [instrumentId, setInstrumentId] = useState(market.defaultInstrumentId);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [range, setRange] = useState<DetailRange>(DEFAULT_RANGE);

  const instrument = findInstrument(market, instrumentId) ?? defaultInstrument(market);
  const comparison = comparisonId ? (findInstrument(market, comparisonId) ?? null) : null;
  // A range the instrument's history cannot support falls back to its full history.
  const effectiveRange = instrument.availableRanges.includes(range) ? range : "ALL";
  const asOf = instrument.snapshot.asOf;
  const intraday = isIntradayRange(effectiveRange);

  // Windows are memoised so the chart's hover state, which is keyed on the
  // points array, survives re-renders that do not change the window.
  const primarySeries = useMemo<ChartSeries>(
    () => ({ id: instrument.id, label: instrument.symbol, points: windowPoints(instrument.series, effectiveRange, asOf) }),
    [instrument, effectiveRange, asOf],
  );
  const comparisonSeries = useMemo<ChartSeries | null>(
    () =>
      comparison
        ? { id: comparison.id, label: comparison.symbol, points: windowPoints(comparison.series, effectiveRange, asOf) }
        : null,
    [comparison, effectiveRange, asOf],
  );

  function handleInstrumentChange(nextId: string) {
    setInstrumentId(nextId);
    // Comparisons are defined per instrument, so a stale one is dropped.
    setComparisonId(null);
  }

  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-8 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <MarketHeader instrument={instrument} />
          <MarketSelectors
            market={market}
            instrument={instrument}
            comparisonId={comparisonId}
            onInstrumentChange={handleInstrumentChange}
            onComparisonChange={setComparisonId}
          />
        </div>

        <DetailedMarketChart
          primary={primarySeries}
          comparison={comparisonSeries}
          intraday={intraday}
          unit={instrument.unit}
          label={`${instrument.symbol} chart, ${RANGE_LABELS[effectiveRange].toLowerCase()} range${
            comparison ? `, compared with ${comparison.symbol}` : ""
          }`}
          className="mt-8 h-[380px] sm:h-[460px] lg:h-[580px]"
        />

        <PeriodPerformance
          performance={periodPerformance(instrument.series, asOf)}
          selected={effectiveRange}
          onSelect={setRange}
          className="mt-4 border-t border-white/10 pt-4"
        />
      </div>
    </main>
  );
}
