"use client";

import { useState } from "react";

import { ComputeEconomicsAnalysis } from "@/components/compute-analytics/compute-economics-analysis";
import { SelectMenu } from "@/components/market-detail/select-menu";
import type { ComputeEconomicsReadModel } from "@/lib/compute-economics/domain";

/**
 * The production read model crosses the Server/Client boundary once. Scenario
 * edits then recalculate locally without another database request.
 */
export function ComputeAnalyticsPage({ model }: { model: ComputeEconomicsReadModel }) {
  const [instrumentSymbol, setInstrumentSymbol] = useState(model.instruments[0]?.symbol ?? "");
  const instrument = model.instruments.find((candidate) => candidate.symbol === instrumentSymbol) ?? model.instruments[0] ?? null;

  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">Compute Economics</h1>
          <p className="mt-2 text-base text-neutral-300 md:text-lg">Investment economics for AI accelerators using observed compute prices and explicit operating assumptions.</p>
          <p className="mt-1 text-sm text-neutral-500">A modeled scenario, not an observed operator return or a forecast of future compute prices.</p>
        </header>

        {instrument === null ? (
          <section aria-labelledby="compute-economics-unavailable" className="mt-8 rounded border border-white/10 bg-white/[0.02] p-5">
            <h2 id="compute-economics-unavailable" className="text-lg font-medium text-neutral-100">Compute Economics unavailable</h2>
            <p className="mt-2 max-w-3xl text-sm text-neutral-400">
              {model.unavailableReason === "database_unavailable"
                ? "Production compute pricing is unavailable right now. No Payback result is calculated and no demo price is substituted."
                : "No accelerator currently has both a released production compute-price observation and complete scenario defaults. No demo price is substituted."}
            </p>
          </section>
        ) : (
          <>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-neutral-500">Observed price and scenario defaults follow the selected accelerator.</p>
              <SelectMenu
                label="Accelerator"
                options={model.instruments.map((option) => ({ id: option.symbol, label: option.label }))}
                value={instrument.symbol}
                onChange={setInstrumentSymbol}
                className="sm:min-w-44"
              >
                {instrument.label}
              </SelectMenu>
            </div>

            <div className="mt-8">
              <ComputeEconomicsAnalysis key={instrument.symbol} instrument={instrument} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
