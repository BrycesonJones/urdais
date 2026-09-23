"use client";

import Link from "next/link";
import { useState } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { movementClass } from "@/components/market/movement";
import { UmpiChart } from "@/components/umpi/umpi-chart";
import { formatNumber, formatPercent, formatUpdatedAt } from "@/lib/format";
import {
  formatReferenceMonth,
  umpiAvailableRanges,
  umpiRangeReturnPercent,
  umpiWindowPoints,
  UMPI_ALL_RANGE,
  type UmpiRange,
} from "@/lib/umpi/read/months";
import type { UmpiReadModel, UmpiSeriesView } from "@/lib/umpi/read/read-model";
import type { UmpiSeriesCode } from "@/lib/umpi/types";

/**
 * The public UMPI surface.
 *
 * UMPI V1 is two monthly index series built from Korean official statistics, and the single
 * most important thing this component does is refuse to combine them. A producer price index
 * and a trade unit-value index measure different objects by different methods; averaging them
 * would produce a headline with no referent, so there is no family level anywhere on this page
 * and the read model states `hasCompositeLevel: false` so a client cannot infer one. The series
 * selector switches the entire semantic context — name, level, change, base, source, warning and
 * chart — rather than swapping a line on a shared axis.
 *
 * **This replaces a demo market rather than filling a blank.** `/markets/UMPI` previously served
 * nine seeded random walks presented as DRAM and HBM chip prices — DDR5 16Gb at $5.20 a part,
 * HBM3E at $8.42 a gigabyte — with daily ranges and a "today" change. None of it was ever
 * collected from anywhere. There is no fallback path in this file: where nothing is published,
 * the surface says so and shows no number.
 *
 * Both range controls and the headline change are deliberately separate. The headline is MoM
 * because that is what the methodology defines the index's change to be; a range control must
 * not be able to redefine it, so the window's own change is labelled as its own thing.
 */
export function UmpiSection({ model }: { model: UmpiReadModel }) {
  const [selectedCode, setSelectedCode] = useState(model.series[0]?.seriesCode ?? null);
  const series = model.series.find((candidate) => candidate.seriesCode === selectedCode) ?? model.series[0] ?? null;

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading
        id="umpi"
        title={`${model.family.code} · ${model.family.name}`}
        subtitle={model.family.description}
        badge={
          model.unavailableReason ? (
            <span className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
              No published data
            </span>
          ) : null
        }
      />

      {model.unavailableReason ? (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-5">
          <p className="text-sm font-medium text-neutral-200">Nothing is published right now</p>
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
            {model.unavailableReason === "no database is configured"
              ? "Urdais cannot reach its published data from this deployment. No figure is shown, because there is no cached or illustrative value to show in its place."
              : `Urdais is not serving a UMPI value: ${model.unavailableReason}.`}
          </p>
        </div>
      ) : null}

      {series === null ? null : (
        <>
          <UmpiSeriesTabs
            series={model.series}
            selected={series.seriesCode}
            onSelect={setSelectedCode}
          />
          {/* Keyed by series: the range chosen for one series is not a meaningful choice for the
              other, whose published history is a different length. */}
          <UmpiSeriesPanel key={series.seriesCode} series={series} />
        </>
      )}

      <p className="max-w-3xl text-xs leading-relaxed text-neutral-500">
        UMPI publishes these two series separately and never combines them. They measure different
        economic objects by different methods, so there is no single UMPI level, no average of the
        two, and neither is ever used to fill a gap in the other.
      </p>
    </section>
  );
}

/** Two series, switched as a tab list so the whole panel changes with one control. */
function UmpiSeriesTabs({
  series,
  selected,
  onSelect,
}: {
  series: readonly UmpiSeriesView[];
  selected: UmpiSeriesCode;
  onSelect: (code: UmpiSeriesCode) => void;
}) {
  return (
    <div role="tablist" aria-label="UMPI series" className="flex flex-wrap gap-2">
      {series.map((candidate) => {
        const active = candidate.seriesCode === selected;
        return (
          <button
            key={candidate.seriesCode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(candidate.seriesCode)}
            className={`rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-neutral-400 ${
              active
                ? "border-neutral-500 bg-white/[0.06] text-neutral-50"
                : "border-neutral-800 text-neutral-400 hover:bg-white/[0.03] hover:text-neutral-200"
            }`}
          >
            {candidate.kind === "official_price_index" ? "DRAM PPI" : "Export Unit-Value"}
            <span className="sr-only"> — {candidate.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Everything about one series: headline, warning, chart, ranges and provenance. */
function UmpiSeriesPanel({ series }: { series: UmpiSeriesView }) {
  const ranges = umpiAvailableRanges(series.points);
  const [range, setRange] = useState<UmpiRange>(UMPI_ALL_RANGE);
  const active = ranges.includes(range) ? range : (ranges[ranges.length - 1] ?? UMPI_ALL_RANGE);
  const windowPoints = umpiWindowPoints(series.points, active);
  const rangeReturn = umpiRangeReturnPercent(series.points, active);

  return (
    <div role="tabpanel" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-neutral-100">{series.name}</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-neutral-400">{series.description}</p>
      </div>

      {series.semanticWarning ? (
        <p className="max-w-3xl rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 text-sm leading-relaxed text-amber-200">
          {series.semanticWarning}
        </p>
      ) : null}

      <UmpiHeadline series={series} />

      {series.points.length === 0 ? (
        <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-dashed border-neutral-800 px-6 py-10">
          <p className="max-w-lg text-center text-sm text-neutral-500">
            {/* The generic reason restates the heading, so it is folded in rather than appended
                as a second lowercase fragment. A more specific reason is worth showing. */}
            No published months for this series
            {series.unavailableReason && series.unavailableReason !== "no published observations"
              ? `: ${series.unavailableReason}`
              : ""}
            .
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <UmpiChart points={windowPoints} seriesName={series.name} base={series.base} />
          {ranges.length > 0 ? (
            <UmpiRangeControls
              ranges={ranges}
              active={active}
              onSelect={setRange}
              returnPercent={rangeReturn}
            />
          ) : (
            <p className="text-xs text-neutral-500">
              One published month. There is no window to measure a change over yet.
            </p>
          )}
        </div>
      )}

      <UmpiProvenance series={series} />
    </div>
  );
}

/**
 * The latest published month.
 *
 * States the reference month rather than a date, and labels the change MoM. There is no "today"
 * here and no daily change: the index describes a month, and the most recent one it describes is
 * the thing a reader is looking at.
 */
function UmpiHeadline({ series }: { series: UmpiSeriesView }) {
  const latest = series.latest;
  if (latest === null) return null;
  // The read model carries the change as a fraction; the shared formatter takes a percentage.
  const changePercent = latest.change === null ? null : latest.change * 100;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-4xl font-semibold tabular-nums text-neutral-50">
        {formatNumber(latest.level, 2)}
        <span className="ml-2 text-base font-normal text-neutral-400">index points</span>
      </p>
      {changePercent === null ? (
        <p className="text-sm text-neutral-400">
          {latest.changeWithheldReason === "no_prior_month"
            ? "First published month for this series; there is no prior month to compare against."
            : "No month-over-month change is published for this month."}
        </p>
      ) : (
        <p className={`text-sm tabular-nums ${movementClass(changePercent)}`}>
          {formatPercent(changePercent)}{" "}
          <span className="text-neutral-400">MoM</span>
        </p>
      )}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
        <div className="flex gap-1.5">
          <dt>Reference month</dt>
          <dd className="text-neutral-300">{formatReferenceMonth(latest.referenceMonth)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Base</dt>
          <dd className="text-neutral-300">{series.base}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Frequency</dt>
          <dd className="text-neutral-300">Monthly</dd>
        </div>
      </dl>
      {latest.tradeUnitValueUsdPerKg === null ? null : (
        // Named for what it is. This is export value divided by export weight, not a price a
        // buyer pays for a chip, and calling it one would undo the warning above it.
        <p className="text-xs text-neutral-500">
          Trade unit value{" "}
          <span className="tabular-nums text-neutral-300">
            ${formatNumber(latest.tradeUnitValueUsdPerKg, 2)} / kg
          </span>{" "}
          for {formatReferenceMonth(latest.referenceMonth)}, the figure this index is rebased from.
        </p>
      )}
      {series.lastPublishedAt ? (
        // Kept distinct from the reference month above: when Urdais published is not what the
        // number describes, and collapsing the two is how a monthly index starts looking daily.
        <p className="text-xs text-neutral-600">
          Last published {formatUpdatedAt(Date.parse(series.lastPublishedAt) / 1000)}
        </p>
      ) : null}
    </div>
  );
}

/** Horizons this history actually supports. A control is never shown for an empty window. */
function UmpiRangeControls({
  ranges,
  active,
  onSelect,
  returnPercent,
}: {
  ranges: readonly UmpiRange[];
  active: UmpiRange;
  onSelect: (range: UmpiRange) => void;
  returnPercent: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Chart range" className="flex flex-wrap gap-1">
        {ranges.map((range) => (
          <button
            key={range}
            type="button"
            aria-pressed={range === active}
            onClick={() => onSelect(range)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-neutral-400 ${
              range === active
                ? "bg-white/[0.08] text-neutral-50"
                : "text-neutral-500 hover:bg-white/[0.03] hover:text-neutral-300"
            }`}
          >
            {range === "ALL" ? "All" : range}
          </button>
        ))}
      </div>
      {returnPercent === null ? null : (
        <p className="text-xs text-neutral-500">
          Over this window{" "}
          <span className={`tabular-nums ${movementClass(returnPercent)}`}>
            {formatPercent(returnPercent)}
          </span>
        </p>
      )}
    </div>
  );
}

/** Methodology and source, taken from the read model rather than restated here. */
function UmpiProvenance({ series }: { series: UmpiSeriesView }) {
  return (
    <div className="grid gap-6 border-t border-neutral-900 pt-6 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-neutral-200">Methodology</h4>
        <p className="text-sm text-neutral-400">
          <Link className="underline hover:text-neutral-200" href={series.methodologyPath}>
            UMPI-KR DRAM
          </Link>{" "}
          <span className="tabular-nums">{series.methodologyVersion}</span>
          {series.methodologyEffectiveFrom ? (
            <span className="text-neutral-500">
              {" "}
              · effective{" "}
              {new Intl.DateTimeFormat("en-US", {
                timeZone: "UTC",
                year: "numeric",
                month: "short",
                day: "numeric",
              }).format(new Date(`${series.methodologyEffectiveFrom}T00:00:00Z`))}
            </span>
          ) : null}
        </p>
        <p className="text-sm text-neutral-500">
          Monthly, in index points on a base of {series.base}. The published change is
          month-over-month; Urdais interpolates nothing between published months.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-neutral-200">Source</h4>
        <p className="text-sm text-neutral-300">{series.attribution.agency}</p>
        <p className="text-sm text-neutral-500">{series.attribution.dataset}</p>
        <p className="text-xs tabular-nums text-neutral-500">{series.attribution.sourceIdentity}</p>
        {series.attribution.notice ? (
          <p className="text-xs text-neutral-500">{series.attribution.notice}</p>
        ) : null}
      </div>
    </div>
  );
}
