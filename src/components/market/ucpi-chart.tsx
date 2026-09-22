"use client";

import Link from "next/link";

import { SnapshotChart } from "@/components/charts/snapshot-chart";
import { marketIndexHref } from "@/lib/routes";
import { TIME_RANGES, type IndexSeries, type TimeRange } from "@/types/market";

type UcpiChartProps = {
  symbol: string;
  unit: string;
  series: IndexSeries;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
};

const INTRADAY_RANGES: ReadonlySet<TimeRange> = new Set(["1D", "1W"]);

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";

/**
 * Snapshot preview plus timeframe controls.
 *
 * The selected range is owned by the parent summary so the chart, headline
 * period label, and headline period return always move together.
 */
export function UcpiChart({ symbol, unit, series, range, onRangeChange }: UcpiChartProps) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={marketIndexHref(symbol)}
        className={`block rounded-md ${focusRing}`}
      >
        <SnapshotChart
          data={series[range]}
          intraday={INTRADAY_RANGES.has(range)}
          unit={unit}
          label={`${symbol} historical chart, ${range} range`}
          className="h-[300px] sm:h-[360px] lg:h-[420px]"
        />
      </Link>

      <div role="group" aria-label="Chart timeframe" className="flex flex-wrap gap-1">
        {TIME_RANGES.map((option) => {
          const selected = option === range;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onRangeChange(option)}
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
    </div>
  );
}
