import Link from "next/link";

import { UcpiChart } from "@/components/market/ucpi-chart";
import { movementClass } from "@/components/market/movement";
import { formatNumber, formatPercent, formatTimestamp } from "@/lib/format";
import { marketIndexHref } from "@/lib/routes";
import type { IndexSeries, MarketIndex, MarketSnapshot } from "@/types/market";

type UcpiSummaryProps = {
  index: MarketIndex;
  snapshot: MarketSnapshot;
  series: IndexSeries;
};

/**
 * Primary Information Markets panel: UCPI value, change, and snapshot chart.
 *
 * The title and the chart preview link to the UCPI detail page. The panel
 * itself is not a link because it contains the timeframe buttons; nesting
 * those inside an anchor would be invalid. `group` lets the title arrow and
 * border respond when any part of the panel is hovered or focused.
 */
export function UcpiSummary({ index, snapshot, series }: UcpiSummaryProps) {
  return (
    <article
      aria-labelledby="ucpi-heading"
      className="group flex flex-col gap-5 rounded-xl border border-white/10 bg-[#111111] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(255,255,255,0.03),0_10px_32px_rgba(0,0,0,0.45),0_0_36px_rgba(82,111,224,0.16)] transition-[border-color,box-shadow] hover:border-white/15 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(255,255,255,0.04),0_10px_32px_rgba(0,0,0,0.45),0_0_40px_rgba(82,111,224,0.22)] focus-within:border-white/15 sm:p-6"
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id="ucpi-heading" className="text-lg font-semibold tracking-tight text-neutral-50">
            <Link
              href={marketIndexHref(index.symbol)}
              className="inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-400"
            >
              {index.symbol}
              {/* Reserved width keeps the name from shifting when the arrow appears. */}
              <span
                aria-hidden="true"
                className="w-3 text-sm text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                →
              </span>
            </Link>
          </h3>
          <span className="text-sm text-neutral-400">{index.name}</span>
          <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
            Demo data
          </span>
        </div>

        {/* Explicit spaces keep the text readable when announced or copied. */}
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
          <span className="text-3xl font-semibold tracking-tight text-neutral-50">
            {formatNumber(snapshot.value)}
          </span>{" "}
          <span className="text-sm text-neutral-400">{index.unit}</span>{" "}
          <span className={`text-sm font-medium ${movementClass(snapshot.changePercent)}`}>
            {formatPercent(snapshot.changePercent)}
          </span>{" "}
          <span className="text-xs text-neutral-400">
            1D · as of {formatTimestamp(snapshot.asOf, true)}
          </span>
        </p>
      </header>

      <UcpiChart symbol={index.symbol} unit={index.unit} series={series} />
    </article>
  );
}
