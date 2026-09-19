import Link from "next/link";

import { SectionHeading } from "@/components/analytics/section-heading";
import { formatNumber, formatUpdatedAt } from "@/lib/format";
import type { CapacityReadModel, CapacitySourceCoverage } from "@/lib/capacity/read/read-model";

/**
 * Available Compute Capacity: observed market supply.
 *
 * Two experiences, decided by one thing: whether a permitted source has stated
 * an available quantity.
 *
 * Where one has, the surface shows the total, what it is made of, and how much
 * of the market it covers. Where none has — the current state — it shows what
 * the dataset measures, which interfaces were assessed, what each one exposes,
 * and why each contributes nothing. That last table is the product right now,
 * and it is a real answer rather than a placeholder: "no permitted source
 * publishes availability" is a true and checkable statement about the compute
 * market's interfaces.
 *
 * What this component must never do is fill the gap. A zero is the most
 * tempting version of that and the most misleading, because "0 GPUs available"
 * reads as a market that has sold out rather than as a market Urdais cannot
 * see into. So there is no zero fallback anywhere in this file, no placeholder
 * series, and no number that is not a sum of stated quantities — the absence
 * is rendered as an absence.
 *
 * Categorical observations are rendered beside the total and never inside it.
 * Three providers saying "available" are three providers, and this component
 * has no code path that turns them into three GPUs.
 */
export function AvailableCapacitySection({ model }: { model: CapacityReadModel }) {
  const snapshot = model.snapshot;
  const total = snapshot?.aggregate.total ?? null;
  const categorical = snapshot?.aggregate.categorical ?? null;

  return (
    <section
      id="capacity"
      aria-labelledby="capacity-heading"
      className="scroll-mt-24 border-t border-white/10 pt-8"
    >
      <SectionHeading
        id="capacity-heading"
        title="Available Compute Capacity"
        subtitle="Rentable AI compute observed as available, from sources that state it"
        badge={
          total === null ? (
            <span className="rounded border border-neutral-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              No coverage yet
            </span>
          ) : null
        }
        aside={
          <p className="text-xs text-neutral-500">
            Observed supply · not installed fleet · not utilization
          </p>
        }
      />

      {total === null ? (
        <InsufficientCoverage model={model} />
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <p className="text-4xl font-semibold tabular-nums text-neutral-50">
            {total.exact
              ? formatNumber(total.lower, 0)
              : `${formatNumber(total.lower, 0)}–${formatNumber(total.upper, 0)}`}
            <span className="ml-2 text-base font-normal text-neutral-400">
              {total.unit === "accelerator" ? "GPUs" : total.unit}
            </span>
          </p>
          <p className="text-sm text-neutral-400">
            Across {total.quantitativeSources} quantitative source
            {total.quantitativeSources === 1 ? "" : "s"}
            {snapshot!.observedAt
              ? ` · observed ${formatUpdatedAt(Date.parse(snapshot!.observedAt) / 1000)}`
              : ""}
          </p>
          {/* Counted, never summed. The sentence is deliberately separate from the number above it. */}
          {categorical && categorical.observations > 0 ? (
            <p className="text-sm text-neutral-400">
              {categorical.sources} additional provider{categorical.sources === 1 ? "" : "s"} report
              availability without stating a quantity. Not included in the total.
            </p>
          ) : null}
        </div>
      )}

      {/* Categorical-only coverage, where that is all there is. A real observation, and not a number. */}
      {total === null && categorical && categorical.observations > 0 ? (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/60 p-5">
          <p className="text-sm font-medium text-neutral-200">
            {categorical.sources} provider{categorical.sources === 1 ? "" : "s"} reporting availability
            without a quantity
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
            These are availability-state observations. They record that compute was reported
            available, not how much, and they are never converted into a GPU count.
          </p>
        </div>
      ) : null}

      <SourceCoverageTable sources={model.coverage.sources} />

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-neutral-200">Methodology</h3>
          <p className="text-sm text-neutral-400">
            <Link className="underline hover:text-neutral-200" href={model.methodology.documentPath}>
              {model.methodology.name}
            </Link>{" "}
            <span className="tabular-nums">{model.methodology.version}</span>
            {model.methodology.status === "draft" ? (
              <span className="ml-2 rounded border border-amber-700/60 px-1.5 py-0.5 text-xs text-amber-500">
                Draft
              </span>
            ) : null}
          </p>
          <p className="text-sm text-neutral-500">
            Observations are recorded at one of four levels of precision: an exact quantity, a
            quantity range, an availability state with no quantity, or no usable signal. Only the
            first two are ever added together.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-neutral-200">What this measures</h3>
          {model.disclaimers.map((line) => (
            <p key={line} className="text-sm text-neutral-500">
              {line}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The honest empty state.
 *
 * It says what is missing and why, rather than showing a chart frame waiting
 * for data. The distinction it has to carry is that Urdais is not failing to
 * read a source — it is reading every source it is allowed to read, and none
 * of them publishes availability.
 */
function InsufficientCoverage({ model }: { model: CapacityReadModel }) {
  const { coverage } = model;
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-5">
      <p className="text-sm font-medium text-neutral-200">Insufficient coverage to publish a figure</p>
      <p className="max-w-3xl text-sm leading-relaxed text-neutral-400">{model.publicReason}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <Stat label="Interfaces assessed" value={coverage.assessedSources} />
        <Stat label="Eligible" value={coverage.eligibleSources} />
        <Stat label="Contributing" value={coverage.contributingSources} />
        <Stat label="Observed GPUs" value={null} />
      </dl>
    </div>
  );
}

/** A count, or an explicit dash where there is no number to show. Never a zero standing in for one. */
function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-medium tabular-nums text-neutral-100">
        {value === null ? <span className="text-neutral-600">—</span> : formatNumber(value, 0)}
      </dd>
    </div>
  );
}

const TIER_LABEL: Record<number, string> = {
  1: "Exact quantity",
  2: "Quantity range",
  3: "Availability only",
  4: "None",
};

/**
 * What each assessed interface exposes, and why it does or does not contribute.
 *
 * Capability and permission are shown as separate columns because they are
 * separate facts, and collapsing them would hide the actual finding: the
 * interfaces that can report availability are not the ones Urdais may use.
 */
function SourceCoverageTable({ sources }: { sources: readonly CapacitySourceCoverage[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="text-sm font-medium text-neutral-200">Source coverage</h3>
      <p className="mt-1 text-xs text-neutral-500">
        Every compute interface Urdais has assessed for a capacity signal, what it exposes, and
        whether Urdais may use it. A price feed is not an availability feed.
      </p>
      <div className="mt-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-500">
              <th scope="col" className="py-2 pr-4 font-normal">Source</th>
              <th scope="col" className="py-2 pr-4 font-normal">Capacity signal</th>
              <th scope="col" className="py-2 pr-4 font-normal">Permitted</th>
              <th scope="col" className="py-2 pr-4 font-normal text-right">Observations</th>
              <th scope="col" className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {sources.map((source) => (
              <tr key={source.sourceInterfaceSlug} className="align-top">
                <td className="py-2.5 pr-4">
                  <span className="text-neutral-200">{source.providerName}</span>
                  <span className="block font-mono text-[11px] text-neutral-600">
                    {source.sourceInterfaceSlug}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-neutral-300">
                  {TIER_LABEL[source.maxTier] ?? "Unassessed"}
                  <span className="ml-1.5 text-neutral-600">
                    {source.maxTier === 4 ? "" : `(tier ${source.maxTier})`}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className={source.termsPermitted ? "text-neutral-300" : "text-neutral-500"}>
                    {source.termsPermitted ? "Yes" : "No"}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-300">
                  {source.freshObservations > 0 ? (
                    formatNumber(source.freshObservations, 0)
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </td>
                <td className="py-2.5 text-neutral-500">
                  {source.blockedReason ?? (
                    <span className="text-emerald-400">Contributing</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
