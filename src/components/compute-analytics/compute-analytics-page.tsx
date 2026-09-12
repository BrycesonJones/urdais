"use client";

import { useState } from "react";

import { ComputeForwardCurve } from "@/components/compute-analytics/compute-forward-curve";
import { FleetUtilizationChart } from "@/components/compute-analytics/fleet-utilization-chart";
import { PaybackPeriodChart } from "@/components/compute-analytics/payback-period-chart";
import { SelectMenu } from "@/components/market-detail/select-menu";
import { COMPUTE_INSTRUMENTS, DEFAULT_COMPUTE_INSTRUMENT_ID, findComputeInstrument } from "@/data/mock/compute-analytics";

const SECTIONS = [
  { id: "forwards", label: "Forwards" },
  { id: "utilization", label: "Utilization" },
  { id: "payback", label: "Payback" },
] as const;

/**
 * Compute Analytics: the economics of computational infrastructure. Three
 * views of one deterministic compute-economics data graph over UCPI's
 * compute instruments. The instrument selector drives the forward curve
 * and payback; fleet utilization shows every accelerator together. UCPI
 * remains the price of usable compute; this is its economics counterpart,
 * and it is not an index.
 */
export function ComputeAnalyticsPage() {
  const [instrumentId, setInstrumentId] = useState(DEFAULT_COMPUTE_INSTRUMENT_ID);
  const instrument = findComputeInstrument(instrumentId);

  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <header>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">Compute Analytics</h1>
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              Demo data
            </span>
          </div>
          <p className="mt-2 text-base text-neutral-300 md:text-lg">The economics of computational infrastructure.</p>
          <p className="mt-1 text-sm text-neutral-500">Forward pricing, fleet utilization, and hardware payback across the compute market.</p>
        </header>

        <nav aria-label="Sections" className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex items-center gap-x-6 whitespace-nowrap border-b border-white/10 font-mono text-[11px] uppercase tracking-[0.2em]">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-block border-b border-transparent pb-3 text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-neutral-500">Forward curve and payback follow the selected accelerator; fleet utilization shows every accelerator.</p>
          <SelectMenu
            label="Accelerator"
            options={COMPUTE_INSTRUMENTS.map((option) => ({ id: option.id, label: option.shortLabel }))}
            value={instrument.id}
            onChange={setInstrumentId}
            className="sm:min-w-44"
          >
            {instrument.shortLabel}
          </SelectMenu>
        </div>

        <div className="mt-8 flex flex-col gap-14">
          <ComputeForwardCurve instrumentId={instrument.id} />
          <FleetUtilizationChart />
          <PaybackPeriodChart instrumentId={instrument.id} />
        </div>
      </div>
    </main>
  );
}
