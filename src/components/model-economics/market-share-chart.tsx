"use client";

import Link from "next/link";
import { useState } from "react";

import { SELECTOR_FOCUS, SELECTOR_SURFACE } from "@/components/market-detail/select-menu";
import { SectionHeading } from "@/components/analytics/section-heading";
import { formatCompact, formatNumber } from "@/lib/format";
import type { MarketShareRow } from "@/lib/market-share/types";
import type { MarketShareView } from "@/lib/market-share/view";

type View = "labs" | "models";

/**
 * Bar colour by what the row is, because the difference between a share and a residual is the
 * one thing this table must not blur. Attributed rows carry the accent; the three kinds of
 * "not a lab" are progressively greyer, and none of them can be mistaken for a participant.
 */
const BAR_CLASS: Record<MarketShareRow["kind"], string> = {
  model: "bg-[#526fe0]",
  lab: "bg-[#526fe0]",
  display_remainder: "bg-[#3b4a86]",
  unattributed: "bg-neutral-500",
  source_residual: "bg-neutral-700",
};

/**
 * Market Share: share of observed OpenRouter token volume represented in UTVI, by lab or by
 * model, for the latest published UTC date.
 *
 * Four properties of this table are load-bearing rather than stylistic.
 *
 * **One denominator, stated on the surface.** Both views divide by the same total observed token
 * volume UTVI published for the date. The reader is told the figure, so the percentages can be
 * checked rather than trusted.
 *
 * **Both residuals are rows.** OpenRouter's `other` — volume outside the models the dataset
 * names — and Urdais's own unattributed named models are separate rows with separate labels,
 * because they are different holes and folding either into the table would make the remaining
 * shares read as larger than the evidence supports.
 *
 * **A model's name is the source's identifier.** Urdais holds no canonical registry for the
 * four hundred-odd permaslugs this dataset names, so the permaslug is shown verbatim with the
 * canonical lab beneath it. An invented display name would be an Urdais assertion about a model
 * Urdais has not researched.
 *
 * **The platform is never a lab.** OpenRouter is the observer. Its own models appear in the
 * unattributed volume, never as a participant in a table of labs.
 */
export function MarketShareChart({ view = null }: { view?: MarketShareView | null }) {
  const [selected, setSelected] = useState<View>("labs");

  if (view === null) {
    return (
      <section id="share" aria-labelledby="share-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
        <SectionHeading id="share-heading" title="Market Share" subtitle="Share of observed token volume" />
        <p className="mt-5 max-w-2xl text-sm text-neutral-400">
          No shares are published. Market Share is derived from published UTVI observations, and no
          substitute is shown.
        </p>
      </section>
    );
  }

  const rows = selected === "labs" ? view.labs : view.models;
  const maxShare = Math.max(...rows.map((row) => row.sharePercent));

  return (
    <section id="share" aria-labelledby="share-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="share-heading"
        title="Market Share"
        subtitle={view.claim}
        aside={
          <div
            role="group"
            aria-label="Share by"
            className={`inline-flex items-center self-start p-0.5 ${SELECTOR_SURFACE} hover:bg-[#111111]`}
          >
            {(["labs", "models"] as const).map((option) => {
              const active = option === selected;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(option)}
                  className={`flex h-full items-center justify-center rounded-[2px] px-3.5 text-sm font-medium uppercase tracking-wide transition-colors ${
                    active ? "bg-white/[0.09] text-neutral-50" : "text-neutral-500 hover:text-neutral-200"
                  } ${SELECTOR_FOCUS}`}
                >
                  {option === "labs" ? "Labs" : "Models"}
                </button>
              );
            })}
          </div>
        }
      />

      {/* The denominator, beside the shares that use it. Both views divide by this one figure. */}
      <p className="mt-4 text-xs text-neutral-500 tabular-nums">
        {view.asOfDate} · denominator {formatCompact(Number(view.totalObservedTokens))} observed tokens
        {view.settlementState === "provisional" && (
          <>
            {" · "}
            <span title="The most recent completed UTC day is still accruing at the source and may be revised.">
              Provisional
            </span>
          </>
        )}
      </p>

      <ol
        className="mt-5 divide-y divide-white/[0.06]"
        aria-label={`Share of observed token volume by ${selected === "labs" ? "lab" : "model"}`}
      >
        {rows.map((row, index) => {
          const ranked = row.kind === "model" || row.kind === "lab";
          return (
            <li
              key={row.id}
              className="grid grid-cols-[1.5rem_minmax(7rem,12rem)_minmax(0,1fr)_4.5rem] items-center gap-x-3 py-2.5 text-sm sm:grid-cols-[1.5rem_minmax(11rem,18rem)_minmax(0,1fr)_5rem]"
            >
              <span className="font-mono text-xs text-neutral-600">
                {ranked ? String(index + 1).padStart(2, "0") : "—"}
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate ${ranked ? "font-medium text-neutral-100" : "text-neutral-300"} ${
                    row.kind === "model" ? "font-mono text-xs" : ""
                  }`}
                  title={row.label}
                >
                  {row.label}
                </span>
                {row.detail !== null && (
                  <span className="block truncate text-xs text-neutral-500" title={row.detail}>
                    {row.detail}
                  </span>
                )}
              </span>
              <span className="relative h-2.5 overflow-hidden rounded-[1px] bg-white/[0.04]" aria-hidden="true">
                <span
                  className={`absolute inset-y-0 left-0 rounded-[1px] ${BAR_CLASS[row.kind]}`}
                  style={{ width: `${(row.sharePercent / maxShare) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">
                <span className="block font-medium text-neutral-50">{formatNumber(row.sharePercent, 2)}%</span>
                <span className="block text-xs text-neutral-500">{formatCompact(Number(row.tokens))}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* The universe, with the shares. A reader who sees only this table still sees what was
          and was not observed. */}
      <p className="mt-5 max-w-3xl text-xs leading-relaxed text-neutral-500">{view.universe}</p>

      <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-neutral-500">
        Source:{" "}
        <a
          href={view.attribution.sourceUrl}
          className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
          rel="noreferrer noopener"
          target="_blank"
        >
          {view.attribution.sourceName}
        </a>{" "}
        <span className="font-mono">rankings-daily</span>, as of {view.attribution.sourceAsOf}. Licensed
        under{" "}
        <a
          href={view.attribution.licenseUrl}
          className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
          rel="noreferrer noopener"
          target="_blank"
        >
          CC BY 4.0
        </a>
        . Methodology{" "}
        <Link
          href="/docs/methodology/market-share"
          className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
        >
          Market Share, under UTVI {view.methodologyVersion}
        </Link>
        . Shares are observational: the denominator is the traffic this one dataset exposes, not
        global model usage. Named models whose lab Urdais cannot evidence are reported as
        unattributed rather than assigned, and OpenRouter&rsquo;s own residual row is never
        credited to a lab.
      </p>
    </section>
  );
}
