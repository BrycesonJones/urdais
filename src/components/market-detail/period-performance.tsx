"use client";

import { movementClass } from "@/components/market/movement";
import { formatPercent } from "@/lib/format";
import { RANGE_LABELS } from "@/lib/market-ranges";
import type { DetailRange, PeriodPerformance as PeriodPerformanceValue } from "@/types/market";

type PeriodPerformanceProps = {
  performance: PeriodPerformanceValue[];
  selected: DetailRange;
  onSelect: (range: DetailRange) => void;
  className?: string;
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300";

/**
 * Timeframe controls beneath the chart, each carrying the instrument's
 * return over that period. Selecting one changes the chart window; the
 * returns under every button stay put, and the headline move above the
 * chart is unaffected. Ranges the history cannot support are disabled and
 * show no return. Only the selected period gets a contained surface.
 */
export function PeriodPerformance({ performance, selected, onSelect, className }: PeriodPerformanceProps) {
  return (
    <div
      role="group"
      aria-label="Chart timeframe and period return"
      className={["grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-8", className].filter(Boolean).join(" ")}
    >
      {performance.map(({ range, returnPercent }) => {
        const isSelected = range === selected;
        const available = returnPercent !== null;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={isSelected}
            disabled={!available}
            title={available ? undefined : "Not enough history"}
            onClick={() => onSelect(range)}
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
              {RANGE_LABELS[range]}
            </span>
            <span
              className={`text-sm font-medium tabular-nums ${available ? movementClass(returnPercent) : "text-neutral-700"}`}
            >
              {available ? formatPercent(returnPercent) : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
