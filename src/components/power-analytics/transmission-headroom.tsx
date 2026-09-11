import { SectionHeading } from "@/components/analytics/section-heading";
import { HEADROOM_MODERATE_PERCENT, HEADROOM_ROWS, HEADROOM_TIGHT_PERCENT, TODAY_POINT } from "@/data/mock/power-analytics";
import { formatNumber } from "@/lib/format";
import type { HeadroomState } from "@/types/power-analytics";

const STATE_LABEL: Record<HeadroomState, string> = { tight: "Tight", moderate: "Moderate", available: "Available" };
const STATE_CLASS: Record<HeadroomState, string> = {
  tight: "border-[#c96b6b]/50 text-[#e0a0a0]",
  moderate: "border-[#d4a56a]/50 text-[#e2c08d]",
  available: "border-white/15 text-neutral-300",
};

const quarterLabel = (time: number) => {
  const date = new Date(time * 1000);
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
};

/**
 * Transmission Headroom: for each market, peak load drawn against the
 * deliverable-capacity track, with the remaining headroom in GW and as a
 * share of capacity. Ranked tightest first. The state label is text, so
 * it never depends on colour alone.
 */
export function TransmissionHeadroom() {
  return (
    <section id="headroom" aria-labelledby="headroom-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="headroom-heading"
        title="Transmission Headroom"
        subtitle="Remaining physical capacity across major power markets"
        aside={
          <p className="text-xs text-neutral-500">
            Headroom = deliverable capacity − peak load, {quarterLabel(TODAY_POINT.time)} · Tight &lt; {HEADROOM_TIGHT_PERCENT}%, Moderate &lt; {HEADROOM_MODERATE_PERCENT}%
          </p>
        }
      />

      <ol className="mt-6 divide-y divide-white/[0.06]" aria-label="Transmission headroom by market, tightest first">
        {HEADROOM_ROWS.map((row) => (
          <li key={row.market.id} className="grid gap-x-4 gap-y-2 py-3 text-sm sm:grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_minmax(9rem,12rem)] sm:items-center">
            <span className="min-w-0">
              <span className="block truncate font-medium text-neutral-100">{row.market.name}</span>
              <span className="block truncate text-xs text-neutral-500">{row.market.regionLabel}</span>
            </span>
            <span className="block">
              <span className="relative block h-3 overflow-hidden rounded-[1px] bg-white/[0.06]" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 bg-[#526fe0]" style={{ width: `${(row.loadGw / row.deliverableCapacityGw) * 100}%` }} />
              </span>
              <span className="mt-1 flex justify-between text-[11px] tabular-nums text-neutral-500">
                <span>load {formatNumber(row.loadGw, 0)} GW</span>
                <span>deliverable {formatNumber(row.deliverableCapacityGw, 0)} GW</span>
              </span>
            </span>
            <span className="flex items-center justify-between gap-3 tabular-nums sm:justify-end">
              <span className="text-right">
                <span className="block font-medium text-neutral-50">{formatNumber(row.headroomGw, 1)} GW</span>
                <span className="block text-xs text-neutral-400">{formatNumber(row.headroomPercent, 1)}% headroom</span>
              </span>
              <span className={`rounded-[2px] border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATE_CLASS[row.state]}`}>{STATE_LABEL[row.state]}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-neutral-500">Headroom is room on the wires before the modelled deliverability limit, not unused generation.</p>
    </section>
  );
}
