"use client";

import { useState } from "react";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { movementClass } from "@/components/market/movement";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { MultiSelectMenu } from "@/components/market-detail/select-menu";
import { TokenSeriesSelectors } from "@/components/market-detail/token-series-selectors";
import { MAX_COMPARISONS, useInstrumentChart } from "@/components/market-detail/use-instrument-chart";
import { SectionHeading } from "@/components/analytics/section-heading";
import { pickDefaultTokenInstrument } from "@/lib/tokens/read/instruments";
import { formatNumber, formatPercent } from "@/lib/format";
import type { MarketInstrumentDetail } from "@/types/market";

/**
 * Token Price: canonical model-level token-price instruments, the same
 * series as the UCPI Tokens family. Provider / model / dimension selectors
 * reuse the market SelectMenu. Comparisons stay absolute because every
 * series shares USD / 1M tokens, and labels identify the economic object.
 */
export function TokenPriceSection({ instruments }: { instruments: readonly MarketInstrumentDetail[] }) {
  if (instruments.length === 0) {
    return (
      <section id="price" aria-labelledby="price-heading" className="scroll-mt-24">
        <SectionHeading id="price-heading" title="Token Price" subtitle="Current model-level token pricing" />
      </section>
    );
  }
  return <TokenPriceChart instruments={instruments} />;
}

function TokenPriceChart({ instruments }: { instruments: readonly MarketInstrumentDetail[] }) {
  const fallback = pickDefaultTokenInstrument(instruments) ?? instruments[0]!;
  const [instrumentId, setInstrumentId] = useState(fallback.id);
  const instrument = instruments.find((row) => row.id === instrumentId) ?? fallback;
  const chart = useInstrumentChart(instrument, (id) => instruments.find((row) => row.id === id));
  const comparisonLabels = chart.comparisonIds
    .map((id) => instrument.comparisons.find((option) => option.instrumentId === id)?.label)
    .filter((label): label is string => Boolean(label));
  const token = instrument.tokenIdentity;
  const unitCaption = token?.unitCaption ?? instrument.unit;

  function handleInstrumentChange(nextId: string) {
    setInstrumentId(nextId);
    chart.clearComparisons();
  }

  return (
    <section id="price" aria-labelledby="price-heading" className="scroll-mt-24">
      <SectionHeading
        id="price-heading"
        title="Token Price"
        subtitle="Current model-level token pricing"
        aside={
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <TokenSeriesSelectors instruments={instruments} instrument={instrument} onInstrumentChange={handleInstrumentChange} />
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
        <span className="text-3xl font-semibold tracking-tight text-neutral-50">
          {token ? `$${formatNumber(instrument.snapshot.value)}` : formatNumber(instrument.snapshot.value)}
        </span>{" "}
        <span className="text-sm text-neutral-400">{unitCaption}</span>{" "}
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
