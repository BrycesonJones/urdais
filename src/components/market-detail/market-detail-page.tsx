"use client";

import { useMemo, useState } from "react";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import type { ChartSeries } from "@/components/charts/detailed-market-chart";
import { MarketHeader } from "@/components/market-detail/market-header";
import { MarketSelectors } from "@/components/market-detail/market-selectors";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { defaultInstrument, findInstrument, findInstrumentById } from "@/data/mock/market-detail";
import { isIntradayRange, periodPerformance, RANGE_LABELS, windowPoints } from "@/lib/market-ranges";
import type { DetailRange, MarketDetail } from "@/types/market";

const DEFAULT_RANGE: DetailRange = "1M";
/** V1 shows at most four series at once: the primary plus three comparisons. */
const MAX_COMPARISONS = 3;

/**
 * Shared Information Markets detail experience for every routed market.
 * Owns the selected instrument, comparison, and range; everything else is
 * derived from the market's deterministic detail data. Mount with a key of
 * the market symbol so navigating between markets resets the selection.
 */
export function MarketDetailPage({ market }: { market: MarketDetail }) {
  const [instrumentId, setInstrumentId] = useState(market.defaultInstrumentId);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [range, setRange] = useState<DetailRange>(DEFAULT_RANGE);

  const instrument = findInstrument(market, instrumentId) ?? defaultInstrument(market);
  // Comparisons may live in another market. Every option an instrument offers
  // shares one basis, so all visible comparisons overlay on the same axis:
  // absolute within a family, rebased percentage change across indices.
  const comparisonOptions = useMemo(
    () =>
      comparisonIds
        .map((id) => instrument.comparisons.find((option) => option.instrumentId === id))
        .filter((option): option is NonNullable<typeof option> => option !== undefined),
    [comparisonIds, instrument],
  );
  const comparisons = useMemo(
    () =>
      comparisonOptions
        .map((option) => findInstrumentById(option.instrumentId))
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined),
    [comparisonOptions],
  );
  const basis = comparisonOptions.some((option) => option.basis === "relative") ? "relative" : "absolute";
  // A range the instrument's history cannot support falls back to the
  // longest one it can; the strip shows that range as the selected one.
  const effectiveRange = instrument.availableRanges.includes(range)
    ? range
    : (instrument.availableRanges[instrument.availableRanges.length - 1] ?? "1D");
  const asOf = instrument.snapshot.asOf;
  const intraday = isIntradayRange(effectiveRange);

  // Windows are memoised so the chart's hover state, which is keyed on the
  // points array, survives re-renders that do not change the window.
  const primarySeries = useMemo<ChartSeries>(
    () => ({
      id: instrument.id,
      label: instrument.symbol,
      unit: instrument.unit,
      points: windowPoints(instrument.series, effectiveRange, asOf),
    }),
    [instrument, effectiveRange, asOf],
  );
  const comparisonSeries = useMemo<ChartSeries[]>(
    () =>
      comparisons.map((candidate) => ({
        id: candidate.id,
        label: candidate.symbol,
        unit: candidate.unit,
        points: windowPoints(candidate.series, effectiveRange, asOf),
      })),
    [comparisons, effectiveRange, asOf],
  );

  function handleInstrumentChange(nextId: string) {
    setInstrumentId(nextId);
    // Comparisons are defined per instrument, so stale ones are dropped.
    setComparisonIds([]);
  }

  function toggleComparison(id: string) {
    setComparisonIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : current.length < MAX_COMPARISONS
          ? [...current, id]
          : current,
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <MarketHeader instrument={instrument} />
          <MarketSelectors
            market={market}
            instrument={instrument}
            comparisonIds={comparisonIds}
            maxComparisons={MAX_COMPARISONS}
            onInstrumentChange={handleInstrumentChange}
            onToggleComparison={toggleComparison}
            onClearComparisons={() => setComparisonIds([])}
          />
        </div>

        <DetailedMarketChart
          primary={primarySeries}
          comparisons={comparisonSeries}
          basis={basis}
          intraday={intraday}
          label={`${instrument.symbol} chart, ${RANGE_LABELS[effectiveRange].toLowerCase()} range${
            comparisons.length > 0 ? `, compared with ${comparisons.map((candidate) => candidate.symbol).join(", ")}` : ""
          }`}
          // Substantial but not the whole fold: on desktop the height follows the
          // viewport between a usable floor and a cap, so the timeframe strip
          // beneath stays discoverable on a typical laptop window.
          className="mt-6 h-[320px] sm:h-[400px] lg:h-[clamp(340px,46vh,480px)]"
        />

        <PeriodPerformance
          performance={periodPerformance(instrument.series, asOf)}
          selected={effectiveRange}
          onSelect={setRange}
          className="mt-3 border-t border-white/10 pt-3"
        />
      </div>
    </main>
  );
}
