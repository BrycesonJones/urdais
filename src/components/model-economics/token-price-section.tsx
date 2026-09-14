"use client";

import { useState } from "react";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { movementClass } from "@/components/market/movement";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { MultiSelectMenu, SelectMenu } from "@/components/market-detail/select-menu";
import { ResearchPreviewBadge } from "@/components/market-detail/research-preview-badge";
import { MAX_COMPARISONS, useInstrumentChart } from "@/components/market-detail/use-instrument-chart";
import { SectionHeading } from "@/components/analytics/section-heading";
import { TOKEN_BENCHMARK_PENDING_NOTE } from "@/lib/tokens/read/benchmark";
import { formatNumber, formatPercent } from "@/lib/format";
import type { MarketInstrumentDetail } from "@/types/market";

/**
 * Token Price: the lab-level token-price instruments of the UCPI Tokens
 * family, driven by the same chart hook, so the two surfaces show identical
 * numbers. One selector chooses the lab, as it always has; the canonical
 * input, output and cache dimensions behind each lab are backend facets and
 * are not product navigation.
 *
 * While the lab-level benchmark is undefined the family publishes nothing.
 * The section keeps its structure and says so in one line rather than
 * showing a number Urdais has not defined.
 */
export function TokenPriceSection({
  instruments,
  researchPreview = false,
}: {
  instruments: readonly MarketInstrumentDetail[];
  researchPreview?: boolean;
}) {
  if (instruments.length === 0) {
    return (
      <section id="price" aria-labelledby="price-heading" className="scroll-mt-24">
        <SectionHeading id="price-heading" title="Token Price" subtitle="Cost of a standardized 1M-token workload" />
        <p className="mt-5 max-w-2xl text-sm text-neutral-400">{TOKEN_BENCHMARK_PENDING_NOTE}</p>
      </section>
    );
  }
  return <TokenPriceChart instruments={instruments} researchPreview={researchPreview} />;
}

function TokenPriceChart({
  instruments,
  researchPreview,
}: {
  instruments: readonly MarketInstrumentDetail[];
  researchPreview: boolean;
}) {
  const fallback = instruments[0]!;
  const [instrumentId, setInstrumentId] = useState(fallback.id);
  const instrument = instruments.find((row) => row.id === instrumentId) ?? fallback;
  const chart = useInstrumentChart(instrument, (id) => instruments.find((row) => row.id === id));
  const comparisonLabels = chart.comparisonIds
    .map((id) => instrument.comparisons.find((option) => option.instrumentId === id)?.label)
    .filter((label): label is string => Boolean(label));

  function handleInstrumentChange(nextId: string) {
    setInstrumentId(nextId);
    chart.clearComparisons();
  }

  return (
    <section id="price" aria-labelledby="price-heading" className="scroll-mt-24">
      <SectionHeading
        id="price-heading"
        title="Token Price"
        subtitle="Cost of a standardized 1M-token workload"
        badge={researchPreview ? <ResearchPreviewBadge /> : undefined}
        aside={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <SelectMenu
              label="Provider"
              options={instruments.map((option) => ({ id: option.id, label: option.shortLabel }))}
              value={instrument.id}
              onChange={handleInstrumentChange}
              className="sm:min-w-40"
            >
              {instrument.shortLabel}
            </SelectMenu>
            {instrument.comparisons.length > 0 && (
              <MultiSelectMenu
                label="Compare with"
                options={instrument.comparisons.map((option) => ({ id: option.instrumentId, label: option.label }))}
                selected={chart.comparisonIds}
                max={MAX_COMPARISONS}
                onToggle={chart.toggleComparison}
                onClear={chart.clearComparisons}
                limitNote={`Maximum ${MAX_COMPARISONS + 1} series`}
              >
                <span>Compare with</span>
                {comparisonLabels.length === 1 && <span className="font-medium text-neutral-100">{comparisonLabels[0]}</span>}
                {comparisonLabels.length > 1 && (
                  <span className="rounded-[2px] bg-white/[0.09] px-1.5 text-xs font-medium tabular-nums text-neutral-100">
                    {comparisonLabels.length}
                  </span>
                )}
              </MultiSelectMenu>
            )}
          </div>
        }
      />

      <p className="mt-5 flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className="text-3xl font-semibold tracking-tight text-neutral-50">${formatNumber(instrument.snapshot.value)}</span>{" "}
        <span className="text-sm text-neutral-400">{instrument.unit}</span>{" "}
        {instrument.snapshot.changePercent !== null && (
          <>
            <span className={`text-sm font-medium ${movementClass(instrument.snapshot.changePercent)}`}>
              {formatPercent(instrument.snapshot.changePercent)}
            </span>{" "}
            <span className="text-xs text-neutral-500">today · {instrument.shortLabel}</span>
          </>
        )}
      </p>

      <DetailedMarketChart
        primary={chart.primarySeries}
        comparisons={chart.comparisonSeries}
        basis={chart.basis}
        intraday={chart.intraday}
        label={chart.label}
        className="mt-4 h-[300px] sm:h-[360px] lg:h-[400px]"
      />
      <PeriodPerformance
        performance={chart.performance}
        selected={chart.effectiveRange}
        onSelect={chart.setRange}
        className="mt-3 border-t border-white/10 pt-3"
      />
    </section>
  );
}
