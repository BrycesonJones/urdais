"use client";

import { useState } from "react";

import { PaybackPeriodChart } from "@/components/compute-analytics/payback-period-chart";
import { SelectMenu } from "@/components/market-detail/select-menu";
import { COMPUTE_INSTRUMENTS, DEFAULT_COMPUTE_INSTRUMENT_ID, findComputeInstrument } from "@/data/mock/compute-analytics";

/**
 * Compute Analytics V1 exposes only hardware payback. The selector remains at
 * this boundary because it controls the Payback analysis below.
 */
export function ComputeAnalyticsPage() {
  const [instrumentId, setInstrumentId] = useState(DEFAULT_COMPUTE_INSTRUMENT_ID);
  const instrument = findComputeInstrument(instrumentId);

  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">Compute Analytics</h1>
          <p className="mt-2 text-base text-neutral-300 md:text-lg">Compute investment economics and payback.</p>
          <p className="mt-1 text-sm text-neutral-500">Estimate hardware cost recovery for the selected AI accelerator.</p>
        </header>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-neutral-500">Payback analysis follows the selected accelerator.</p>
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
          <PaybackPeriodChart instrumentId={instrument.id} />
        </div>
      </div>
    </main>
  );
}
