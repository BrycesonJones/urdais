"use client";

import { movementClass } from "@/components/market/movement";
import { formatPercent, formatSignedWithUnit, formatTimestamp } from "@/lib/format";
import { RANGE_LABELS } from "@/lib/market-ranges";
import type { DetailRange, PeriodPerformance as PeriodPerformanceValue } from "@/types/market";

type PeriodPerformanceProps = {
  performance: PeriodPerformanceValue[];
  selected: DetailRange;
  onSelect: (range: DetailRange) => void;
  /**
   * The instrument's unit, for horizons whose movement must be shown as a signed amount rather
   * than a percentage. Required for any series that can go non-positive: §D.2 forbids a bare
   * signed number that a reader could take for either quantity.
   */
  unit?: string;
  className?: string;
};

/**
 * What one horizon shows, and whether it can be selected.
 *
 * `changeBasis` is the availability signal wherever the instrument provides one. Without it, a
 * null `returnPercent` is the only evidence there is and means the horizon has no comparison --
 * which is correct for every strictly positive series and is unchanged. With it, a horizon whose
 * endpoints forbid a percentage is still a horizon with a real, measurable move, and disabling
 * it would hide that move behind "not enough history".
 */
function readout(entry: PeriodPerformanceValue, unit: string | undefined): {
  available: boolean;
  text: string;
  movement: string;
} {
  if (entry.changeBasis === undefined) {
    const available = entry.returnPercent !== null;
    return {
      available,
      text: available ? formatPercent(entry.returnPercent!) : "—",
      movement: available ? movementClass(entry.returnPercent) : "text-neutral-700",
    };
  }
  if (entry.changeBasis === "percent" && entry.returnPercent !== null) {
    return { available: true, text: formatPercent(entry.returnPercent), movement: movementClass(entry.returnPercent) };
  }
  const amount = entry.absoluteChange ?? null;
  if (amount === null) return { available: false, text: "—", movement: "text-neutral-700" };
  // §D.2 rule 3: direction comes from the sign of the amount, never from the absent percentage.
  return { available: true, text: formatSignedWithUnit(amount, unit ?? ""), movement: movementClass(amount) };
}

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300";

/**
 * Timeframe controls beneath the chart, each carrying the instrument's
 * return over that period. Selecting one changes the chart window; the
 * returns under every button stay put, and the headline move above the
 * chart is unaffected. Ranges the history cannot support are disabled and
 * show no return. Only the selected period gets a contained surface.
 */
export function PeriodPerformance({ performance, selected, onSelect, unit, className }: PeriodPerformanceProps) {
  return (
    <div
      role="group"
      aria-label="Chart timeframe and period return"
      className={["grid grid-cols-3 gap-1 sm:grid-cols-6", className].filter(Boolean).join(" ")}
    >
      {performance.map((entry) => {
        const { range } = entry;
        const isSelected = range === selected;
        const { available, text, movement } = readout(entry, unit);
        // §E.3: within the bound a base may still sit a day or two off the exact boundary, so
        // the surface states the date it measured from rather than letting the label imply it.
        const since =
          available && entry.baseTime !== undefined
            ? `Since ${formatTimestamp(entry.baseTime, false)}`
            : undefined;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={isSelected}
            disabled={!available}
            title={available ? since : "Not enough history"}
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
            <span className={`text-sm font-medium tabular-nums ${movement}`}>{text}</span>
          </button>
        );
      })}
    </div>
  );
}
