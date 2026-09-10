"use client";

import { useState } from "react";

import { MarketChart } from "@/components/charts/market-chart";
import { TIME_RANGES, type IndexSeries, type TimeRange } from "@/types/market";

type UcpiChartProps = {
  symbol: string;
  unit: string;
  series: IndexSeries;
};

const DEFAULT_RANGE: TimeRange = "1M";
const INTRADAY_RANGES: ReadonlySet<TimeRange> = new Set(["1D", "1W"]);

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";

/** Chart plus timeframe controls; owns the selected range. */
export function UcpiChart({ symbol, unit, series }: UcpiChartProps) {
  const [range, setRange] = useState<TimeRange>(DEFAULT_RANGE);

  return (
    <div className="flex flex-col gap-3">
      <MarketChart
        data={series[range]}
        intraday={INTRADAY_RANGES.has(range)}
        unit={unit}
        label={`${symbol} historical chart, ${range} range`}
        className="h-[300px] sm:h-[360px] lg:h-[420px]"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Chart timeframe" className="flex flex-wrap gap-1">
          {TIME_RANGES.map((option) => {
            const selected = option === range;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => setRange(option)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                  selected
                    ? "bg-white/10 text-neutral-50"
                    : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
                } ${focusRing}`}
              >
                {option}
              </button>
            );
          })}
        </div>

        {/* Required by the Lightweight Charts licence in place of the on-chart logo. */}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={`ml-auto rounded-sm text-[11px] text-neutral-500 transition-colors hover:text-neutral-300 ${focusRing}`}
        >
          Charting by TradingView
        </a>
      </div>
    </div>
  );
}
