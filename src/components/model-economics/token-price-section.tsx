"use client";

import { useState } from "react";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { movementClass } from "@/components/market/movement";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { MultiSelectMenu, SelectMenu } from "@/components/market-detail/select-menu";
import { MAX_COMPARISONS, useInstrumentChart } from "@/components/market-detail/use-instrument-chart";
import { SectionHeading } from "@/components/analytics/section-heading";
import { TOKEN_INSTRUMENTS } from "@/data/mock/market-detail";
import { DEFAULT_TOKEN_LAB_ID, tokenInstrumentId } from "@/data/mock/token-providers";
import { formatNumber, formatPercent } from "@/lib/format";
import type { MarketInstrumentDetail } from "@/types/market";

function findTokenInstrument(id: string): MarketInstrumentDetail | undefined {
  return TOKEN_INSTRUMENTS.find((instrument) => instrument.id === id);
}

/**
 * Token Price: the same provider-level token-price instruments as the UCPI
 * Tokens family, driven by the same chart hook, so the two surfaces show
 * identical numbers. Provider comparisons are absolute because every
 * provider shares the provisional $/1M tokens unit.
 */
export function TokenPriceSection() {
  const [instrumentId, setInstrumentId] = useState(tokenInstrumentId(DEFAULT_TOKEN_LAB_ID));
  const instrument = findTokenInstrument(instrumentId) ?? findTokenInstrument(tokenInstrumentId(DEFAULT_TOKEN_LAB_ID))!;
  const chart = useInstrumentChart(instrument, findTokenInstrument);
  const comparisonLabels = chart.comparisonIds
    .map((id) => instrument.comparisons.find((option) => option.instrumentId === id)?.label)
    .filter((label): label is string => Boolean(label));

  function handleProviderChange(nextId: string) {
    setInstrumentId(nextId);
    chart.clearComparisons();
  }

  return (
    <section id="price" aria-labelledby="price-heading" className="scroll-mt-24">
      <SectionHeading
        id="price-heading"
        title="Token Price"
        subtitle="Current provider-level token pricing"
        aside={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <SelectMenu
              label="Provider"
              options={TOKEN_INSTRUMENTS.map((option) => ({ id: option.id, label: option.shortLabel }))}
              value={instrument.id}
              onChange={handleProviderChange}
              className="sm:min-w-40"
            >
              {instrument.shortLabel}
            </SelectMenu>
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
          </div>
        }
      />

      <p className="mt-5 flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className="text-3xl font-semibold tracking-tight text-neutral-50">{formatNumber(instrument.snapshot.value)}</span>{" "}
        <span className="text-sm text-neutral-400">{instrument.unit}</span>{" "}
        <span className={`text-sm font-medium ${movementClass(instrument.snapshot.changePercent)}`}>
          {formatPercent(instrument.snapshot.changePercent)}
        </span>{" "}
        <span className="text-xs text-neutral-500">today · {instrument.shortLabel}</span>
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
