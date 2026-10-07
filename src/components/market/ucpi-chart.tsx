"use client";

import Link from "next/link";

import { SnapshotChart } from "@/components/charts/snapshot-chart";
import { marketIndexHref } from "@/lib/routes";
import { TIME_RANGES, type IndexSeries, type TimeRange, type TimeSeriesPoint } from "@/types/market";

type UcpiChartProps = {
  symbol: string;
  unit: string;
  series: IndexSeries;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";

const TWELVE_HOURS = 12 * 60 * 60;

/**
 * Whether the points are genuinely sub-daily.
 *
 * Range length is not cadence: production UCPI currently publishes one point
 * per day even for the 1D and 1W views. Using the selected range to decide the
 * axis format made every daily observation render as the same publication
 * time (for example, 01:01). Median spacing keeps the display honest if a
 * single interval is irregular and automatically switches to clock labels if
 * UCPI later begins publishing intraday observations.
 */
export function hasIntradayCadence(points: readonly TimeSeriesPoint[]): boolean {
  if (points.length < 2) return false;

  const intervals: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const interval = points[i]!.time - points[i - 1]!.time;
    if (interval > 0) intervals.push(interval);
  }
  if (intervals.length === 0) return false;

  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2 === 0
      ? (intervals[middle - 1]! + intervals[middle]!) / 2
      : intervals[middle]!;

  return median < TWELVE_HOURS;
}

/**
 * Snapshot preview plus timeframe controls.
 *
 * The selected range is owned by the parent summary so the chart, headline
 * period label, and headline period return always move together. Axis
 * granularity follows the actual observation cadence, not the selected range.
 */
export function availableUcpiRanges(series: IndexSeries): TimeRange[] {
  return TIME_RANGES.filter((option) => series[option].length >= 2);
}

export function UcpiChart({ symbol, unit, series, range, onRangeChange }: UcpiChartProps) {
  const data = series[range];
  const intraday = hasIntradayCadence(data);
  const availableRanges = availableUcpiRanges(series);

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={marketIndexHref(symbol)}
        className={`block rounded-md ${focusRing}`}
      >
        <SnapshotChart
          data={data}
          intraday={intraday}
          unit={unit}
          label={`${symbol} historical chart, ${range} range`}
          className="h-[300px] sm:h-[360px] lg:h-[420px]"
        />
      </Link>

      <div role="group" aria-label="Chart timeframe" className="flex flex-wrap gap-1">
        {availableRanges.map((option) => {
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
