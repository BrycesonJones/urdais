import { movementClass } from "@/components/market/movement";
import { formatNumber, formatPercent, formatUpdatedAt } from "@/lib/format";
import { instrumentDisplaySymbol, isHeadlineInstrument } from "@/lib/market-display";
import type { MarketDetail, MarketInstrumentDetail } from "@/types/market";

type MarketHeaderProps = {
  market: MarketDetail;
  instrument: MarketInstrumentDetail;
};

/**
 * Identity and headline for the selected instrument: its display symbol
 * (index-prefixed only for the market's headline benchmark), the name,
 * the index's definition and the question it answers when the product has
 * settled them, when it was last updated, and the current value at the largest size on
 * the page with the day's move beneath it as a percentage. The page opens
 * directly on this; the instrument itself is the context. The move is the
 * current-session change and does not follow the chart range; historical
 * returns live under the chart.
 */
export function MarketHeader({ market, instrument }: MarketHeaderProps) {
  const { snapshot } = instrument;
  const movement = movementClass(snapshot.changePercent);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50 md:text-3xl">
          {instrumentDisplaySymbol(market, instrument)}
        </h1>
        <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
          Demo data
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-400 md:text-base">
        {instrument.name}
        {instrument.regionLabel && <span className="text-neutral-500"> · {instrument.regionLabel}</span>}
      </p>
      {isHeadlineInstrument(market, instrument) && market.description && (
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">{market.description}</p>
      )}
      {isHeadlineInstrument(market, instrument) && market.question && (
        <p className="mt-1 text-sm italic text-neutral-500">{market.question}</p>
      )}
      <p className="mt-1 text-xs text-neutral-500 md:text-sm">Updated {formatUpdatedAt(snapshot.asOf)}</p>

      {/* Explicit spaces keep the text readable when announced or copied. */}
      <p className="mt-6 flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className="text-6xl font-semibold leading-none tracking-tight text-neutral-50 sm:text-7xl lg:text-8xl">
          {formatNumber(snapshot.value)}
        </span>{" "}
        <span className="text-base text-neutral-400 sm:text-lg">{instrument.unit}</span>
      </p>
      <p className={`mt-3 flex flex-wrap items-baseline gap-x-3 text-lg font-medium tabular-nums sm:text-xl ${movement}`}>
        <span>{formatPercent(snapshot.changePercent)}</span>{" "}
        <span className="text-sm font-normal text-neutral-500">today</span>
      </p>
    </div>
  );
}
