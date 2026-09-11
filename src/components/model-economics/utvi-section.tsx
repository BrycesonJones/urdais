"use client";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { movementClass } from "@/components/market/movement";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { useInstrumentChart } from "@/components/market-detail/use-instrument-chart";
import { SectionHeading } from "@/components/analytics/section-heading";
import { UTVI } from "@/data/mock/model-economics";
import { formatCompact, formatPercent, formatUpdatedAt } from "@/lib/format";

const noComparisons = () => undefined;

/**
 * UTVI, the Urdais Token Volume Index: aggregate observed token volume
 * across the demo model universe, in tokens per day. Every point is the sum
 * of the model volume observations on that date; the headline move is the
 * trailing one-month change.
 */
export function UtviSection() {
  const chart = useInstrumentChart(UTVI, noComparisons);

  return (
    <section id="volume" aria-labelledby="volume-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="volume-heading"
        title="Token Volume Index"
        subtitle="Observed model consumption over time"
        aside={
          <p className="text-xs text-neutral-500">
            <span className="font-semibold text-neutral-300">UTVI</span> · {UTVI.name} · updated {formatUpdatedAt(UTVI.snapshot.asOf)}
          </p>
        }
      />

      <p className="mt-5 flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className="text-4xl font-semibold tracking-tight text-neutral-50 md:text-5xl">
          {formatCompact(UTVI.snapshot.value)}
        </span>{" "}
        <span className="text-sm text-neutral-400">{UTVI.unit}</span>{" "}
        <span className={`text-sm font-medium ${movementClass(UTVI.snapshot.changePercent)}`}>
          {formatPercent(UTVI.snapshot.changePercent, 1)}
        </span>{" "}
        <span className="text-xs text-neutral-500">1M</span>
      </p>

      <DetailedMarketChart
        primary={chart.primarySeries}
        intraday={chart.intraday}
        compact
        label={chart.label}
        className="mt-4 h-[300px] sm:h-[360px] lg:h-[400px]"
      />
      <PeriodPerformance
        performance={chart.performance}
        selected={chart.effectiveRange}
        onSelect={chart.setRange}
        className="mt-3 border-t border-white/10 pt-3"
      />
    </section>
  );
}
