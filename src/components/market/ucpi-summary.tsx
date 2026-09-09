import { UcpiChart } from "@/components/market/ucpi-chart";
import { movementClass } from "@/components/market/movement";
import { formatNumber, formatPercent, formatSigned, formatTimestamp } from "@/lib/format";
import type { IndexSeries, MarketIndex, MarketSnapshot } from "@/types/market";

type UcpiSummaryProps = {
  index: MarketIndex;
  snapshot: MarketSnapshot;
  series: IndexSeries;
};

/** Primary Information Markets panel: UCPI value, change, and historical chart. */
export function UcpiSummary({ index, snapshot, series }: UcpiSummaryProps) {
  return (
    <article
      aria-labelledby="ucpi-heading"
      className="flex flex-col gap-5 rounded-xl border border-neutral-800 bg-[#111111] p-5 sm:p-6"
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id="ucpi-heading" className="text-lg font-semibold tracking-tight text-neutral-50">
            {index.symbol}
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
          <span className={`text-sm font-medium ${movementClass(snapshot.change)}`}>
            {formatSigned(snapshot.change)}
          </span>{" "}
          <span className={`text-sm font-medium ${movementClass(snapshot.change)}`}>
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
