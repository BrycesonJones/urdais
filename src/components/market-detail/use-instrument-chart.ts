"use client";

import { useMemo, useState } from "react";

import type { ChartSeries } from "@/components/charts/detailed-market-chart";
import { chartSeriesLabel } from "@/lib/market-display";
import { isIntradayRange, periodPerformance, RANGE_LABELS, windowPoints } from "@/lib/market-ranges";
import type { ComparisonBasis, DetailRange, MarketDetail, MarketInstrumentDetail, PeriodPerformance } from "@/types/market";

const DEFAULT_RANGE: DetailRange = "1M";
/** At most four series show at once: the primary plus three comparisons. */
export const MAX_COMPARISONS = 3;

export type InstrumentChartOptions = {
  /**
   * The market whose page hosts the chart. Series from this market are
   * named as instruments; series from another market carry that market's
   * index/benchmark identity. Without it, instrument symbols are used.
   */
  market?: MarketDetail;
  /** Resolves an instrument's home market, for cross-market naming. */
  homeMarketOf?: (instrument: MarketInstrumentDetail) => MarketDetail | undefined;
};

export type InstrumentChart = {
  setRange: (range: DetailRange) => void;
  /** The range actually shown: the selected one, or the longest the history supports. */
  effectiveRange: DetailRange;
  intraday: boolean;
  comparisonIds: string[];
  toggleComparison: (instrumentId: string) => void;
  clearComparisons: () => void;
  basis: ComparisonBasis;
  primarySeries: ChartSeries;
  comparisonSeries: ChartSeries[];
  performance: PeriodPerformance[];
  /** Accessible chart name, e.g. "H100 SXM chart for the Urdais Compute Price Index, 1 month range, compared with H200". */
  label: string;
};

/**
 * Range and comparison state for one instrument's detailed chart, plus the
 * windows derived from them. Shared by every surface that shows the
 * detailed chart so they all behave identically. Comparisons resolve
 * through `resolve`, which may reach into other markets; every option an
 * instrument offers shares one basis, so all visible comparisons overlay
 * on the same axis. Callers reset comparisons when the instrument changes.
 */
export function useInstrumentChart(
  instrument: MarketInstrumentDetail,
  resolve: (instrumentId: string) => MarketInstrumentDetail | undefined,
  options: InstrumentChartOptions = {},
): InstrumentChart {
  const { market, homeMarketOf } = options;
  const seriesLabel = (candidate: MarketInstrumentDetail) =>
    market && homeMarketOf ? chartSeriesLabel(market, candidate, homeMarketOf) : candidate.symbol;
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [range, setRange] = useState<DetailRange>(DEFAULT_RANGE);

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
        .map((option) => resolve(option.instrumentId))
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined),
    [comparisonOptions, resolve],
  );
  const basis: ComparisonBasis = comparisonOptions.some((option) => option.basis === "relative")
    ? "relative"
    : "absolute";
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
      label: seriesLabel(instrument),
      unit: instrument.unit,
      points: windowPoints(instrument.series, effectiveRange, asOf),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seriesLabel is a pure function of the stable options
    [instrument, effectiveRange, asOf, market],
  );
  const comparisonSeries = useMemo<ChartSeries[]>(
    () =>
      comparisons.map((candidate) => ({
        id: candidate.id,
        label: seriesLabel(candidate),
        unit: candidate.unit,
        points: windowPoints(candidate.series, effectiveRange, asOf),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seriesLabel is a pure function of the stable options
    [comparisons, effectiveRange, asOf, market],
  );
  const performance = useMemo(() => periodPerformance(instrument.series, asOf), [instrument, asOf]);

  function toggleComparison(id: string) {
    setComparisonIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : current.length < MAX_COMPARISONS
          ? [...current, id]
          : current,
    );
  }

  // Accessible name: the instrument as itself, with the market named for context.
  const label = `${instrument.shortLabel} chart${market ? ` for the ${market.name}` : ""}, ${RANGE_LABELS[effectiveRange].toLowerCase()} range${
    comparisons.length > 0 ? `, compared with ${comparisons.map((candidate) => seriesLabel(candidate)).join(", ")}` : ""
  }`;

  return {
    setRange,
    effectiveRange,
    intraday,
    comparisonIds,
    toggleComparison,
    clearComparisons: () => setComparisonIds([]),
    basis,
    primarySeries,
    comparisonSeries,
    performance,
    label,
  };
}
