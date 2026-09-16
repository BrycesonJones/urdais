"use client";

import Link from "next/link";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { movementClass } from "@/components/market/movement";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { useInstrumentChart } from "@/components/market-detail/use-instrument-chart";
import { SectionHeading } from "@/components/analytics/section-heading";
import { formatCompact, formatPercent, formatUpdatedAt } from "@/lib/format";
import { DETAIL_RANGES } from "@/types/market";
import type { UtviInstrumentView } from "@/lib/utvi/read/instrument";

const noComparisons = () => undefined;

/**
 * UTVI, the Urdais Observed Token Volume Index: the token volume the source's dataset exposes,
 * in tokens per day, from production.
 *
 * Three things on this surface are load-bearing rather than decorative.
 *
 * The **universe** is rendered beside the value, not behind a methodology link, because the
 * headline is what gets quoted and the universe is what makes it true. Its wording defers to
 * the source rather than describing it: Urdais claims nothing about BYOK or hidden-application
 * traffic that OpenRouter has not documented.
 *
 * The **period changes come from the read model**, which anchors each one on a calendar date
 * and returns null when that date has no published point. The chart's own `periodReturn` would
 * instead compare against the nearest point inside the window, which quietly answers a
 * different question across a coverage gap.
 *
 * The **provisional label** appears only on the latest value while it is still settling, and
 * nowhere else. Settled history needs no badge, and a page that labelled every point would say
 * nothing by saying it everywhere.
 */
export function UtviSection({ view }: { view: UtviInstrumentView | null }) {
  if (view === null) {
    return (
      <section id="volume" aria-labelledby="volume-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
        <SectionHeading
          id="volume-heading"
          title="Observed Token Volume Index"
          subtitle="Observed model consumption over time"
        />
        <p className="mt-5 max-w-2xl text-sm text-neutral-400">
          No UTVI value is published. The index publishes only from a production retrieval of its
          approved source, and no substitute is shown.
        </p>
      </section>
    );
  }

  return <UtviChart view={view} />;
}

function UtviChart({ view }: { view: UtviInstrumentView }) {
  const { instrument } = view;
  const chart = useInstrumentChart(instrument, noComparisons);

  // The read model's calendar-anchored changes, in the chart's own range order, so a period
  // whose anchor date has no published point reads as absent rather than as flat.
  const performance = DETAIL_RANGES.map((range) => ({
    range,
    returnPercent: view.changePercent[range] ?? null,
  }));

  return (
    <section id="volume" aria-labelledby="volume-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="volume-heading"
        title="Observed Token Volume Index"
        subtitle="Observed model consumption over time"
        aside={
          <p className="text-xs text-neutral-500">
            <span className="font-semibold text-neutral-300">UTVI</span> · {instrument.name} · updated{" "}
            {formatUpdatedAt(instrument.snapshot.asOf)}
            {view.settlementState === "provisional" && (
              <>
                {" · "}
                <span
                  className="text-neutral-400"
                  title="The most recent completed UTC day is still accruing at the source and may be revised."
                >
                  Provisional
                </span>
              </>
            )}
          </p>
        }
      />

      <p className="mt-5 flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className="text-4xl font-semibold tracking-tight text-neutral-50 md:text-5xl">
          {formatCompact(instrument.snapshot.value)}
        </span>{" "}
        <span className="text-sm text-neutral-400">{instrument.unit}</span>{" "}
        {instrument.snapshot.changePercent !== null && (
          <span className={`text-sm font-medium ${movementClass(instrument.snapshot.changePercent)}`}>
            {formatPercent(instrument.snapshot.changePercent, 1)}
          </span>
        )}{" "}
        <span className="text-xs text-neutral-500">1D</span>
      </p>

      {/* The universe, with the value. A reader who sees only the headline still sees what was
          and was not observed. */}
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-neutral-500">{view.universe}</p>

      <DetailedMarketChart
        primary={chart.primarySeries}
        intraday={chart.intraday}
        compact
        label={chart.label}
        className="mt-4 h-[300px] sm:h-[360px] lg:h-[400px]"
      />
      <PeriodPerformance
        performance={performance}
        selected={chart.effectiveRange}
        onSelect={chart.setRange}
        className="mt-3 border-t border-white/10 pt-3"
      />

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-neutral-500">
        Source:{" "}
        <a
          href={view.attribution.sourceUrl}
          className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
          rel="noreferrer noopener"
          target="_blank"
        >
          {view.attribution.sourceName}
        </a>
        , as of {view.attribution.sourceAsOf}. Licensed under{" "}
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
          href="/docs/methodology/utvi"
          className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
        >
          UTVI {view.methodologyVersion}
        </Link>
        .
        {view.coverageGaps.length > 0 && (
          <>
            {" "}
            The source published no data for {view.coverageGaps.join(" and ")}; those dates carry no
            value and none is interpolated.
          </>
        )}
      </p>
    </section>
  );
}
