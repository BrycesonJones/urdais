"use client";

import { useState } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { SELECTOR_FOCUS, SELECTOR_SURFACE } from "@/components/market-detail/select-menu";
import { PUBLIC_CLASS_LABEL } from "@/lib/open-weight/classification";
import { formatNumber } from "@/lib/format";
import type { OpenWeightView } from "@/lib/open-weight/surface";
import type { PublicAccessClass } from "@/lib/open-weight/types";

const FILL: Record<PublicAccessClass, string> = {
  open_weight: "#8ca4ff",
  proprietary: "#2e3a63",
  unclassified: "#3a3a3a",
};

const models = (n: number) => `${n} ${n === 1 ? "model" : "models"}`;

/** Tokens are exact decimal strings, and a window's count exceeds what a double holds. */
function trillions(tokens: string): string {
  return `${formatNumber(Number(BigInt(tokens) / 1_000_000_000n) / 1000, 1)}T`;
}

/**
 * Open-weight vs Proprietary: three views of one classification.
 *
 * Four properties of this section are load bearing rather than decorative.
 *
 * **Unclassified is drawn, not dropped.** It is a third bar with its own colour and its own
 * breakdown, because the alternative — renormalising the two known classes to 100 % — converts
 * ignorance into confidence, and does it invisibly. Roughly a fifth of observed volume is
 * currently unclassified and the reader can see exactly why.
 *
 * **One benchmark selector drives both comparisons.** A capability gap measured on one
 * benchmark beside a price gap measured on another would invite a comparison neither number
 * supports, so there is one selection and both panels move together.
 *
 * **The price threshold is shown.** It is derived — the lower of the two class bests — and
 * printing it is what lets a reader check that the comparison is capability-matched rather
 * than a median over two differently-shaped tails.
 *
 * **A missing side is stated, never zeroed.** Where a benchmark has no classified model in one
 * class, the gap is absent and says so. Zero would read as a measurement.
 */
export function OpenWeightAnalysis({ view = null }: { view?: OpenWeightView | null }) {
  const [selected, setSelected] = useState(0);
  const benchmark = view?.benchmarks[selected] ?? null;

  if (view === null) {
    return (
      <section id="open-weight" aria-labelledby="open-weight-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
        <SectionHeading
          id="open-weight-heading"
          title="Open-weight vs Proprietary"
          subtitle="Volume share, capability gap, and price gap"
        />
        <p className="mt-5 max-w-2xl text-sm text-neutral-400">
          No comparison is published. This section derives from evidenced access classifications
          joined to observed token volume, benchmark results and Urdais Token Price, and no
          substitute is shown.
        </p>
      </section>
    );
  }

  const { volume } = view;
  const unclassified = volume.unclassifiedBreakdown;

  const capability = benchmark?.capabilityGap ?? null;
  const price = benchmark?.priceGap ?? null;
  const openLeads = capability?.gap !== null && capability?.gap !== undefined && capability.gap < 0;

  return (
    <section id="open-weight" aria-labelledby="open-weight-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="open-weight-heading"
        title="Open-weight vs Proprietary"
        subtitle={view.claim}
        aside={
          view.benchmarks.length > 0 ? (
            <div
              role="group"
              aria-label="Benchmark"
              className={`inline-flex items-center self-start p-0.5 ${SELECTOR_SURFACE} hover:bg-[#111111]`}
            >
              {view.benchmarks.map((entry, index) => (
                <button
                  key={entry.slug}
                  type="button"
                  aria-pressed={index === selected}
                  onClick={() => setSelected(index)}
                  className={`flex h-full items-center justify-center rounded-[2px] px-3 text-sm font-medium transition-colors ${
                    index === selected ? "bg-white/[0.09] text-neutral-50" : "text-neutral-500 hover:text-neutral-200"
                  } ${SELECTOR_FOCUS}`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />

      <div className="mt-6 grid gap-8 divide-y divide-white/[0.08] lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-y-0">
        {/* ---- volume share */}
        <div className="pt-8 first:pt-0 lg:pr-8 lg:pt-0">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">Volume share</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Observed token volume, {volume.windowDays} days to {volume.lastDate}
          </p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-[1px]" aria-hidden="true">
            {volume.slices.map((slice) => (
              <span
                key={slice.publicClass}
                style={{ width: `${slice.sharePercent}%`, backgroundColor: FILL[slice.publicClass] }}
              />
            ))}
          </div>
          <dl className="mt-4 space-y-2 text-sm tabular-nums">
            {volume.slices.map((slice) => (
              <div key={slice.publicClass} className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-neutral-300">
                  <span
                    aria-hidden="true"
                    className="inline-block size-2.5 rounded-[1px]"
                    style={{ backgroundColor: FILL[slice.publicClass] }}
                  />
                  {PUBLIC_CLASS_LABEL[slice.publicClass]}
                  {slice.publicClass !== "unclassified" && (
                    <span className="text-xs text-neutral-500">({models(volume.modelCounts[slice.publicClass])})</span>
                  )}
                </dt>
                <dd className="font-medium text-neutral-50">{formatNumber(slice.sharePercent, 1)}%</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            Unclassified is {trillions(unclassified.sourceAggregated)} the source aggregates without
            naming a model, {trillions(unclassified.unlinked)} under identifiers Urdais has not linked
            to a model, and {trillions(unclassified.undetermined)} whose access Urdais has not
            established. It is reported rather than redistributed.
          </p>
        </div>

        {/* ---- capability gap */}
        <div className="pt-8 lg:px-8 lg:pt-0">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">Capability gap</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Best-scoring configuration in each class{benchmark ? `, ${benchmark.label}` : ""}
          </p>
          {capability === null || capability.openWeight === null || capability.proprietary === null ? (
            <p className="mt-5 text-sm text-neutral-400">
              No comparison on this benchmark: {capability?.openWeight === null ? "no open-weight" : "no proprietary"}{" "}
              model carries both a classification and a score here.
            </p>
          ) : (
            <dl className="mt-5 space-y-2 text-sm tabular-nums">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-neutral-300">
                  Proprietary{" "}
                  <span className="text-xs text-neutral-500">{capability.proprietary.label}</span>
                </dt>
                <dd className="text-2xl font-semibold text-neutral-50">
                  {formatNumber(capability.proprietary.score * 100, 1)}%
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-neutral-300">
                  Open-weight <span className="text-xs text-neutral-500">{capability.openWeight.label}</span>
                </dt>
                <dd className="text-2xl font-semibold text-neutral-50">
                  {formatNumber(capability.openWeight.score * 100, 1)}%
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.08] pt-2">
                <dt className="text-neutral-400">Gap</dt>
                <dd className="font-medium text-neutral-100">
                  {formatNumber(Math.abs((capability.gap ?? 0) * 100), 1)}%
                  <span className="ml-1.5 text-xs font-normal text-neutral-500">
                    {openLeads ? "open-weight leads" : "proprietary leads"}
                  </span>
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* ---- price gap */}
        <div className="pt-8 lg:pl-8 lg:pt-0">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">Price gap</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Median blended list price, models scoring ≥{" "}
            {price === null ? "—" : `${formatNumber(price.capabilityThreshold * 100, 1)}%`}
          </p>
          {price === null || price.openWeight === null || price.proprietary === null ? (
            <p className="mt-5 text-sm text-neutral-400">
              No comparison on this benchmark: a capability-matched band needs a classified model with a
              comparable list price on both sides.
            </p>
          ) : (
            <dl className="mt-5 space-y-2 text-sm tabular-nums">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-neutral-300">
                  Proprietary{" "}
                  <span className="text-xs text-neutral-500">({models(price.proprietary.modelCount)})</span>
                </dt>
                <dd className="text-2xl font-semibold text-neutral-50">
                  ${formatNumber(price.proprietary.medianBlendedUsdPer1m)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-neutral-300">
                  Open-weight{" "}
                  <span className="text-xs text-neutral-500">({models(price.openWeight.modelCount)})</span>
                </dt>
                <dd className="text-2xl font-semibold text-neutral-50">
                  ${formatNumber(price.openWeight.medianBlendedUsdPer1m)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.08] pt-2">
                <dt className="text-neutral-400">Gap</dt>
                <dd className="font-medium text-neutral-100">
                  {price.ratio === null ? "—" : `${formatNumber(price.ratio, 1)}×`}
                  <span className="ml-1.5 text-xs font-normal text-neutral-500">
                    proprietary median per 1M tokens
                  </span>
                </dd>
              </div>
            </dl>
          )}
          {benchmark?.priceAsOf && (
            <p className="mt-3 text-xs text-neutral-500 tabular-nums">Prices as of {benchmark.priceAsOf}</p>
          )}
        </div>
      </div>

      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-neutral-400">{view.boundary}</p>
    </section>
  );
}
