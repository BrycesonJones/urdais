import Link from "next/link";

import { SectionHeading } from "@/components/analytics/section-heading";
import { formatNumber, formatUpdatedAt } from "@/lib/format";
import { lifecycleCarriesLevel } from "@/lib/ugai/read/lifecycle";
import type { UgaiReadModel, UgaiSeriesPoint } from "@/lib/ugai/read/read-model";

/**
 * The public UGAI surface.
 *
 * Two experiences, decided by one thing: whether a legitimate published observation exists.
 *
 * Where one does, the surface shows the level, the change, the chart drawn only from canonical
 * published observations, and the observation's own timestamp. Where none does — the current
 * state — it shows what UGAI is, how it is built, what its methodology says, and a plain
 * statement that live publication has not begun. It shows no level, no change, no chart and no
 * "last updated", because there is nothing to have updated.
 *
 * The thing this component must never do is fill the gap. A flat line at 1,000 is the most
 * tempting version of that and the most misleading: it looks like an index that has launched and
 * gone nowhere, which is a claim about the AI equity market rather than about Urdais's readiness.
 * So there is no fallback path here, no placeholder series, and no default level anywhere in the
 * file — the absence is rendered as an absence.
 */
export function UgaiSection({
  model,
  series = [],
}: {
  model: UgaiReadModel;
  series?: readonly UgaiSeriesPoint[];
}) {
  const live = lifecycleCarriesLevel(model.lifecycle);
  const hasSeries = series.length > 0;

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading
        id="ugai"
        title={`${model.symbol} · ${model.name}`}
        subtitle="A capitalization-weighted measure of the public equity of companies with an evidenced, material role in the AI value chain."
        badge={
          live ? null : (
            <span className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
              Not yet live
            </span>
          )
        }
      />

      {live ? (
        <div className="flex flex-col gap-2">
          <p className="text-4xl font-semibold tabular-nums text-neutral-50">
            {formatNumber(model.level!, 2)}
            <span className="ml-2 text-base font-normal text-neutral-400">{model.unit}</span>
          </p>
          {model.changePercent === null ? (
            // One observation and no prior. There is no change from nothing, and a zero here
            // would render identically to a flat day.
            <p className="text-sm text-neutral-400">
              First published observation; no prior level to compare against.
            </p>
          ) : (
            <p
              className={`text-sm tabular-nums ${model.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {model.change! >= 0 ? "+" : ""}
              {formatNumber(model.change!, 2)} ({model.changePercent >= 0 ? "+" : ""}
              {formatNumber(model.changePercent, 2)}%)
            </p>
          )}
          {model.publishedAt ? (
            <p className="text-xs text-neutral-500">
              Updated {formatUpdatedAt(Date.parse(model.publishedAt) / 1000)}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-5">
          <p className="text-sm font-medium text-neutral-200">Not yet live</p>
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">{model.publicReason}</p>
        </div>
      )}

      {live && hasSeries ? (
        <UgaiSeriesChart points={series} />
      ) : (
        <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-dashed border-neutral-800 px-6 py-10">
          <p className="max-w-lg text-center text-sm text-neutral-500">
            No published history. UGAI&rsquo;s series begins at its first live observation, and
            nothing is shown before then.
          </p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-neutral-200">Methodology</h3>
          <p className="text-sm text-neutral-400">
            <Link className="underline hover:text-neutral-200" href={model.methodology.documentPath}>
              {model.methodology.name}
            </Link>{" "}
            <span className="tabular-nums">{model.methodology.version}</span>
            {model.methodology.status === "draft" ? (
              // Presented as the draft it is. A draft methodology shown as settled would make the
              // index look further along than it is.
              <span className="ml-2 rounded border border-amber-700/60 px-1.5 py-0.5 text-xs text-amber-500">
                Draft
              </span>
            ) : null}
          </p>
          <p className="text-sm text-neutral-400">
            Membership is defined separately by the{" "}
            <Link
              className="underline hover:text-neutral-200"
              href={model.parentMethodology.documentPath}
            >
              {model.parentMethodology.name}
            </Link>{" "}
            <span className="tabular-nums">{model.parentMethodology.version}</span>
            {model.parentMethodology.status === "draft" ? (
              <span className="ml-2 rounded border border-amber-700/60 px-1.5 py-0.5 text-xs text-amber-500">
                Draft
              </span>
            ) : null}
            . That document decides who is in the universe; this one decides how they are weighted
            and how the level is calculated.
          </p>
          <p className="text-sm text-neutral-500">
            Base level {formatNumber(model.baseLevel, 0)} on the date of the first live published
            observation.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-neutral-200">Sources</h3>
          <ul className="flex flex-col gap-3">
            {model.sources.map((source) => (
              <li key={source.category} className="text-sm">
                <p className="text-neutral-300">{source.category}</p>
                <p className="text-neutral-500">{source.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** A minimal line over published observations. Drawn only from what exists. */
function UgaiSeriesChart({ points }: { points: readonly UgaiSeriesPoint[] }) {
  const levels = points.map((p) => p.level);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const span = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = points.length === 1 ? 0 : (i / (points.length - 1)) * 100;
      const y = 100 - ((p.level - min) / span) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(" ");

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-48 w-full"
        role="img"
        aria-label={`UGAI published observations, ${points.length} point${points.length === 1 ? "" : "s"}`}
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth="0.6" className="text-emerald-400" />
      </svg>
      <figcaption className="text-xs text-neutral-500">
        {points.length} published observation{points.length === 1 ? "" : "s"}, from{" "}
        {points[0]!.date} to {points[points.length - 1]!.date}.
      </figcaption>
    </figure>
  );
}
