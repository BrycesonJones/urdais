"use client";

import { useMemo, useState } from "react";

import type { ChartSeries } from "@/components/charts/detailed-market-chart";
import { isIntradayRange, periodPerformance, RANGE_LABELS, windowPoints } from "@/lib/market-ranges";
import type { ComparisonBasis, DetailRange, MarketInstrumentDetail, PeriodPerformance } from "@/types/market";

const DEFAULT_RANGE: DetailRange = "1M";
/** V1 shows at most four series at once: the primary plus three comparisons. */
export const MAX_COMPARISONS = 3;

export type InstrumentChart = {
  range: DetailRange;
  setRange: (range: DetailRange) => void;
  /** The range actually shown: the selected one, or the longest the history supports. */
  effectiveRange: DetailRange;
  intraday: boolean;
  comparisonIds: string[];
  toggleComparison: (instrumentId: string) => void;
  clearComparisons: () => void;
  comparisons: MarketInstrumentDetail[];
  basis: ComparisonBasis;
  primarySeries: ChartSeries;
  comparisonSeries: ChartSeries[];
  performance: PeriodPerformance[];
  /** Accessible chart name, e.g. "UCPI-H100 SXM chart, 1 month range, compared with UCPI-H200". */
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
): InstrumentChart {
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

  const label = `${instrument.symbol} chart, ${RANGE_LABELS[effectiveRange].toLowerCase()} range${
    comparisons.length > 0 ? `, compared with ${comparisons.map((candidate) => candidate.symbol).join(", ")}` : ""
  }`;

  return {
    range,
    setRange,
    effectiveRange,
    intraday,
    comparisonIds,
    toggleComparison,
    clearComparisons: () => setComparisonIds([]),
    comparisons,
    basis,
    primarySeries,
    comparisonSeries,
    performance,
    label,
  };
}
