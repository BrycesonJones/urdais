import Link from "next/link";

import { SectionHeading } from "@/components/analytics/section-heading";
import { formatNumber, formatUpdatedAt } from "@/lib/format";
import { lifecycleCarriesLevel } from "@/lib/uavi/read/lifecycle";
import type { UaviReadModel, UaviSeriesPoint } from "@/lib/uavi/read/read-model";

/**
 * The public UAVI surface.
 *
 * Two experiences, decided by one thing: whether a legitimate published observation exists.
 *
 * Where one does, the surface shows the level, the change, the coverage that qualifies it, the
 * chart drawn only from canonical published observations, and the observation's own timestamp.
 * Where none does — the current state — it shows what UAVI is, what it is not, what its
 * methodology says, and a plain statement of why it is not publishing. It shows no level, no
 * change, no chart and no "last updated", because there is nothing to have updated.
 *
 * **This component replaces a fabrication rather than filling a blank.** UAVI previously carried a
 * seeded mean-reverting walk around 30 with a year of history, rendered as "27.84 pts". On a
 * volatility index that is the most dangerous kind of placeholder: a reader has no external anchor
 * for what AI-equity implied volatility "should" be, so a plausible number is indistinguishable
 * from a real one, and a year of plausible history invites exactly the comparison — "is today
 * high?" — that the fabrication cannot support. There is no fallback path in this file, no
 * placeholder series, and no default level.
 *
 * The three non-live states are shown distinctly. "Not yet live", "blocked upstream" and
 * "calculated and withheld" are different facts, and the last is the one worth naming clearly:
 * it is the state in which UAVI is working correctly and declining to publish because its
 * coverage of the parent universe is too thin to represent it.
 */
export function UaviSection({
  model,
  series = [],
}: {
  model: UaviReadModel;
  series?: readonly UaviSeriesPoint[];
}) {
  const live = lifecycleCarriesLevel(model.lifecycle);
  const hasSeries = series.length > 0;
  const stateLabel =
    model.lifecycle === "unavailable" ? "Withheld this session" : "Not yet live";

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading
        id="uavi"
        title={`${model.symbol} · ${model.name}`}
        subtitle="The weighted average 30-day option-implied volatility of the companies in the Urdais AI Equity Universe, in annualized volatility points."
        badge={
          live ? null : (
            <span className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
              {stateLabel}
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
            // One observation and no prior. There is no change from nothing, and a zero here would
            // render identically to a flat day.
            <p className="text-sm text-neutral-400">
              First published observation; no prior level to compare against.
            </p>
          ) : (
            <p
              className={`text-sm tabular-nums ${model.changePercent >= 0 ? "text-amber-400" : "text-sky-400"}`}
            >
              {model.change! >= 0 ? "+" : ""}
              {formatNumber(model.change!, 2)} ({model.changePercent >= 0 ? "+" : ""}
              {formatNumber(model.changePercent, 2)}%)
            </p>
          )}
          <p className="text-xs text-neutral-500">
            {model.horizonDays}-day horizon. A rise means the market is paying more for volatility
            exposure in these companies; UAVI has no direction and is not a forecast of losses.
          </p>
          {model.publishedAt ? (
            <p className="text-xs text-neutral-500">
              Updated {formatUpdatedAt(Date.parse(model.publishedAt) / 1000)}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-5">
          <p className="text-sm font-medium text-neutral-200">{stateLabel}</p>
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">{model.publicReason}</p>
        </div>
      )}

      <UaviCoveragePanel model={model} />

      {live && hasSeries ? (
        <UaviSeriesChart points={series} />
      ) : (
        <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-dashed border-neutral-800 px-6 py-10">
          <p className="max-w-lg text-center text-sm text-neutral-500">
            No published history. UAVI&rsquo;s series begins at its first live observation, and
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
            Membership and weights are defined separately by the{" "}
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
            . UAVI inherits that universe and its base weights unchanged, and measures each member
            on its own listed options.
          </p>
          <p className="text-sm text-neutral-500">
            UAVI is not the implied volatility of UGAI, is not portfolio volatility, and contains
            no correlation information.
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

/**
 * Coverage, shown in every state that measured it.
 *
 * Published alongside the level because it is part of what the level means: the methodology is
 * explicit that twenty-seven constituents representing 84% of parent weight and twenty-seven
 * representing 30% are different measurements. Shown when there is no level for the same reason
 * in reverse — where a gate withheld the headline, the coverage is the explanation for it.
 *
 * Renders nothing at all when nothing was measured, rather than a row of dashes that would
 * suggest a measurement returning zero.
 */
function UaviCoveragePanel({ model }: { model: UaviReadModel }) {
  const { coverage } = model;
  if (coverage.coveredParentWeight === null && coverage.coveredIssuerCount === null) return null;

  return (
    <dl className="grid gap-4 rounded-lg border border-neutral-800 p-4 sm:grid-cols-4">
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-neutral-500">Covered parent weight</dt>
        <dd className="text-sm tabular-nums text-neutral-200">
          {coverage.coveredParentWeight === null
            ? "—"
            : `${formatNumber(coverage.coveredParentWeight * 100, 1)}%`}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-neutral-500">Covered issuers</dt>
        <dd className="text-sm tabular-nums text-neutral-200">
          {coverage.coveredIssuerCount ?? "—"}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-neutral-500">Largest weight</dt>
        <dd className="text-sm tabular-nums text-neutral-200">
          {coverage.maxConstituentWeight === null
            ? "—"
            : `${formatNumber(coverage.maxConstituentWeight * 100, 1)}%`}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-xs text-neutral-500">Effective issuers</dt>
        <dd className="text-sm tabular-nums text-neutral-200">
          {coverage.effectiveIssuerCount === null
            ? "—"
            : formatNumber(coverage.effectiveIssuerCount, 1)}
        </dd>
      </div>
    </dl>
  );
}

/** A minimal line over published observations. Drawn only from what exists. */
function UaviSeriesChart({ points }: { points: readonly UaviSeriesPoint[] }) {
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
        aria-label={`UAVI published observations, ${points.length} point${points.length === 1 ? "" : "s"}`}
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth="0.6" className="text-amber-400" />
      </svg>
      <figcaption className="text-xs text-neutral-500">
        {points.length} published observation{points.length === 1 ? "" : "s"}, from{" "}
        {points[0]!.date} to {points[points.length - 1]!.date}.
      </figcaption>
    </figure>
  );
}
