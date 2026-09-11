"use client";

import { useState } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { SELECTOR_FOCUS, SELECTOR_SURFACE } from "@/components/market-detail/select-menu";
import { QUEUE_LATEST_YEAR, queueRanking } from "@/data/mock/power-analytics";
import { formatNumber } from "@/lib/format";
import type { QueueMode } from "@/types/power-analytics";

const MODES: { id: QueueMode; label: string; note: string }[] = [
  { id: "load", label: "Large load", note: "Data centres and other major consumers waiting for service" },
  { id: "generation", label: "Generation", note: "New generation projects waiting to inject power" },
];

/**
 * Interconnection Queue: markets ranked by queued GW for either the
 * large-load queue or the generation queue, with the median wait beside
 * each. The two queues are never merged: one is demand waiting to connect,
 * the other is supply.
 */
export function InterconnectionQueue() {
  const [mode, setMode] = useState<QueueMode>("load");
  const rows = queueRanking(mode);
  const max = Math.max(...rows.map((row) => row.queuedGw));
  const current = MODES.find((candidate) => candidate.id === mode)!;

  return (
    <section id="queues" aria-labelledby="queues-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="queues-heading"
        title="Interconnection Queue"
        subtitle="Power waiting to connect and how long it waits"
        aside={
          <div role="group" aria-label="Queue" className={`inline-flex items-center self-start p-0.5 ${SELECTOR_SURFACE} hover:bg-[#111111]`}>
            {MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === mode}
                onClick={() => setMode(option.id)}
                className={`flex h-full items-center justify-center rounded-[2px] px-3.5 text-sm font-medium uppercase tracking-wide transition-colors ${
                  option.id === mode ? "bg-white/[0.09] text-neutral-50" : "text-neutral-500 hover:text-neutral-200"
                } ${SELECTOR_FOCUS}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />
      <p className="mt-2 text-xs text-neutral-500">
        {current.note} · latest observation {QUEUE_LATEST_YEAR}
      </p>

      <ol className="mt-6 divide-y divide-white/[0.06]" aria-label={`${current.label} interconnection queue by market`}>
        <li aria-hidden="true" className="grid grid-cols-[1.5rem_minmax(6rem,10rem)_minmax(0,1fr)_5.5rem_6rem] items-center gap-x-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          <span />
          <span>Market</span>
          <span>Queued</span>
          <span className="text-right">GW</span>
          <span className="text-right">Median wait</span>
        </li>
        {rows.map((row, index) => (
          <li key={row.market.id} className="grid grid-cols-[1.5rem_minmax(6rem,10rem)_minmax(0,1fr)_5.5rem_6rem] items-center gap-x-3 py-2.5 text-sm">
            <span className="font-mono text-xs text-neutral-600">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-neutral-100">{row.market.name}</span>
              <span className="block truncate text-xs text-neutral-500">{row.market.regionLabel}</span>
            </span>
            <span className="relative h-2.5 overflow-hidden rounded-[1px] bg-white/[0.04]" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 rounded-[1px] bg-[#526fe0]" style={{ width: `${(row.queuedGw / max) * 100}%` }} />
            </span>
            <span className="text-right font-medium tabular-nums text-neutral-50">{formatNumber(row.queuedGw, 0)}</span>
            <span className="text-right tabular-nums text-neutral-300">
              {row.medianWaitMonths} <span className="text-xs text-neutral-500">mo</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
