"use client";

import { useState } from "react";

import { SELECTOR_FOCUS, SELECTOR_SURFACE } from "@/components/market-detail/select-menu";
import { SectionHeading } from "@/components/analytics/section-heading";
import { LAB_SHARES, MODEL_SHARES, SHARE_WINDOW_DAYS } from "@/data/mock/model-economics";
import { formatCompact, formatNumber } from "@/lib/format";
import type { ShareRow } from "@/types/model-economics";

type View = "labs" | "models";

const VIEWS: { id: View; label: string; rows: ShareRow[] }[] = [
  { id: "labs", label: "Labs", rows: LAB_SHARES },
  { id: "models", label: "Models", rows: MODEL_SHARES },
];

/**
 * Market Share: trailing-window observed token-volume share, ranked, by lab
 * or by model. Bars are drawn to the largest share; labels and percentages
 * carry the identity, so the single restrained bar colour is decoration.
 */
export function MarketShareChart() {
  const [view, setView] = useState<View>("labs");
  const current = VIEWS.find((candidate) => candidate.id === view)!;
  const maxShare = Math.max(...current.rows.map((row) => row.share));

  return (
    <section id="share" aria-labelledby="share-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="share-heading"
        title="Market Share"
        subtitle={`Observed token-volume share · trailing ${SHARE_WINDOW_DAYS} days`}
        aside={
          <div role="group" aria-label="Share by" className={`inline-flex items-center self-start p-0.5 ${SELECTOR_SURFACE} hover:bg-[#111111]`}>
            {VIEWS.map((option) => {
              const selected = option.id === view;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setView(option.id)}
                  className={`flex h-full items-center justify-center rounded-[2px] px-3.5 text-sm font-medium uppercase tracking-wide transition-colors ${
                    selected ? "bg-white/[0.09] text-neutral-50" : "text-neutral-500 hover:text-neutral-200"
                  } ${SELECTOR_FOCUS}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        }
      />

      <ol className="mt-6 divide-y divide-white/[0.06]" aria-label={`Token-volume share by ${current.label.toLowerCase()}`}>
        {current.rows.map((row, index) => (
          <li
            key={row.id}
            className="grid grid-cols-[1.5rem_minmax(7rem,12rem)_minmax(0,1fr)_4.5rem] items-center gap-x-3 py-2.5 text-sm sm:grid-cols-[1.5rem_minmax(9rem,14rem)_minmax(0,1fr)_5rem]"
          >
            <span className="font-mono text-xs text-neutral-600">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-neutral-100">{row.label}</span>
              {row.detail && <span className="block truncate text-xs text-neutral-500">{row.detail}</span>}
            </span>
            <span className="relative h-2.5 overflow-hidden rounded-[1px] bg-white/[0.04]" aria-hidden="true">
              <span
                className={`absolute inset-y-0 left-0 rounded-[1px] ${row.id === "other" ? "bg-neutral-600" : "bg-[#526fe0]"}`}
                style={{ width: `${(row.share / maxShare) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums">
              <span className="block font-medium text-neutral-50">{formatNumber(row.share, 1)}%</span>
              <span className="block text-xs text-neutral-500">{formatCompact(row.volume)}/day</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
