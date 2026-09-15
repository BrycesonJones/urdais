"use client";

import { useMemo, useState } from "react";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { movementClass } from "@/components/market/movement";
import { formatPercent } from "@/lib/format";
import {
  RANGE_LABELS,
  isLowFrequencyRangeAvailable,
  lowFrequencyPeriodReturn,
  lowFrequencyWindowPoints,
} from "@/lib/market-ranges";
import { UBWI_VALUE_FRACTION_DIGITS } from "@/lib/ubwi/read/surface";
import { DETAIL_RANGES, type DetailRange, type TimeSeriesPoint } from "@/types/market";

/**
 * The published UBWI history, with `ALL` for the whole of it.
 *
 * `ALL` is not a `DetailRange`: the trailing windows are a property of a continuously
 * quoted instrument, and widening the product-wide type to carry an index-specific
 * affordance would push a UBWI concern into the six mock markets. It is local here,
 * and it is the range that always means every real production point.
 */
type UbwiRange = DetailRange | "ALL";

const ALL_LABEL = "All";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300";

/**
 * The UBWI production chart.
 *
 * It draws frozen production publications and nothing else. There is no demo series, no
 * back-fill, no interpolation across a day the pipeline refused, and no manufactured
 * intraday tail: a gap in the line is a day on which Urdais published nothing, and that
 * is the correct reading of it.
 *
 * Visibility follows the history rather than the layout:
 *
 *   - no points: nothing renders, and the surface keeps its withheld state.
 *   - one point: nothing renders. A single observation is a value, not a history, and a
 *     flat line drawn through it would assert a stability nobody measured.
 *   - two or more: the chart appears, and keeps appearing as history grows.
 *
 * Ranges follow the same rule. A timeframe is offered only where real points reach back
 * to the start of its window, so `1W` becomes selectable after about a week of daily
 * publications and `1M` after about a month, with no range ever implying data that does
 * not exist. Precision is the shared UBWI constant, so the chart's readout cannot say
 * 0.27 % while the headline above it says 0.2672 %.
 */
export function UbwiChart({ points, className }: { points: TimeSeriesPoint[]; className?: string }) {
  const asOf = points.length > 0 ? points[points.length - 1]!.time : 0;

  const ranges = useMemo(
    () =>
      [
        ...DETAIL_RANGES.map((range) => ({
          range: range as UbwiRange,
          label: RANGE_LABELS[range],
          available: isLowFrequencyRangeAvailable(points, range, asOf),
          returnPercent: lowFrequencyPeriodReturn(points, range, asOf),
        })),
        {
          range: "ALL" as UbwiRange,
          label: ALL_LABEL,
          available: points.length >= 2,
          returnPercent:
            points.length >= 2 && points[0]!.value !== 0
              ? ((points[points.length - 1]!.value - points[0]!.value) / points[0]!.value) * 100
              : null,
        },
      ] as const,
    [points, asOf],
  );

  const [selected, setSelected] = useState<UbwiRange>("ALL");
  const active = ranges.find((entry) => entry.range === selected && entry.available)
    ? selected
    : "ALL";

  const windowed = useMemo(
    () => (active === "ALL" ? points : lowFrequencyWindowPoints(points, active, asOf)),
    [active, points, asOf],
  );

  // Two points are the minimum a line can be drawn through. Below that the surface shows
  // its value and says plainly that there is no history yet.
  if (points.length < 2 || windowed.length < 2) return null;

  const rangeLabel = active === "ALL" ? "all published history" : RANGE_LABELS[active].toLowerCase();

  return (
    <div className={className}>
      <DetailedMarketChart
        primary={{ id: "ubwi", label: "UBWI", unit: "%", points: windowed }}
        intraday={false}
        fractionDigits={UBWI_VALUE_FRACTION_DIGITS}
        label={`UBWI chart, ${rangeLabel}`}
        className="h-[280px] w-full sm:h-[340px]"
      />
      <div
        role="group"
        aria-label="Chart timeframe and period return"
        className="mt-3 grid grid-cols-4 gap-1 sm:grid-cols-7"
      >
        {ranges.map(({ range, label, available, returnPercent }) => {
          const isSelected = range === active;
          return (
            <button
              key={range}
              type="button"
              aria-pressed={isSelected}
              disabled={!available}
              title={available ? undefined : "Not enough production history"}
              onClick={() => setSelected(range)}
              className={`flex flex-col items-center gap-1 rounded-md px-2 py-3 transition-colors ${
                isSelected
                  ? "bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(82,111,224,0.65),0_0_24px_rgba(82,111,224,0.15)]"
                  : available
                    ? "hover:bg-white/[0.03]"
                    : "cursor-not-allowed"
              } ${focusRing}`}
            >
              <span
                className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
                  isSelected ? "text-neutral-50" : available ? "text-neutral-500" : "text-neutral-700"
                }`}
              >
                {label}
              </span>
              <span
                className={`text-sm font-medium tabular-nums ${
                  returnPercent !== null ? movementClass(returnPercent) : "text-neutral-700"
                }`}
              >
                {returnPercent !== null ? formatPercent(returnPercent) : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
