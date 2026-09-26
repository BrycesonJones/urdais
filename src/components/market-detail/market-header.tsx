import { movementClass } from "@/components/market/movement";
import { ResearchPreviewBadge } from "@/components/market-detail/research-preview-badge";
import { formatNumber, formatPercent, formatSignedWithUnit, formatTimestamp, formatUpdatedAt } from "@/lib/format";
import { instrumentDisplaySymbol, isHeadlineInstrument } from "@/lib/market-display";
import type { MarketDetail, MarketInstrumentDetail, MarketSnapshot } from "@/types/market";

type MarketHeaderProps = {
  market: MarketDetail;
  instrument: MarketInstrumentDetail | null;
  /** Family label used when the selected family has no instruments yet. */
  emptyFamilyLabel?: string;
  /** One line saying why a family that exists has nothing to publish yet. */
  emptyNote?: string;
  /** Server-computed Wave-1 research-preview flag. Never true in production. */
  researchPreview?: boolean;
};

/**
 * Identity and headline for the selected instrument: its display symbol
 * (index-prefixed only for the market's headline benchmark), the name,
 * the index's definition and the question it answers when the product has
 * settled them, when it was last updated, and the current value at the largest size on
 * the page with the day's move beneath it. The page opens directly on this; the instrument
 * itself is the context. The move is the current-session change and does not follow the chart
 * range; historical returns live under the chart. It is withheld entirely when the series has no
 * prior comparable observation, and shown as a signed amount rather than a percentage where the
 * two endpoints are not both strictly positive -- see `headlineMovement` below.
 */
export function MarketHeader({ market, instrument, emptyFamilyLabel, emptyNote, researchPreview = false }: MarketHeaderProps) {
  if (!instrument) {
    return (
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50 md:text-3xl">
          {emptyFamilyLabel ?? market.symbol}
        </h1>
        {emptyNote && <p className="mt-2 max-w-2xl text-sm text-neutral-400">{emptyNote}</p>}
      </div>
    );
  }

  const { snapshot } = instrument;
  const token = instrument.benchmarkIdentity ?? instrument.tokenIdentity;
  const unitCaption = token?.unitCaption ?? instrument.unit;
  // Provenance is read off the instrument where it states one. Falling back to the
  // token check preserves the mock markets' behaviour exactly; what it no longer does
  // is label a production instrument demo merely because it is not a token benchmark.
  const showDemoBadge = instrument.provenance === undefined ? token === undefined : instrument.provenance === "demo";
  const today = headlineMovement(snapshot, unitCaption);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50 md:text-3xl">
          {instrumentDisplaySymbol(market, instrument)}
        </h1>
        {showDemoBadge && (
          <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
            Demo data
          </span>
        )}
        {token && researchPreview && <ResearchPreviewBadge />}
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
      {/*
        "Verified" and "Updated" are different claims, and the instrument says
        which one it can support. `verifiedAt` means a person confirmed this
        value is still what the source publishes; `snapshot.asOf` means the
        value entered the series then. For a product that records an observation
        only when a price moves -- Urdais Token Price -- those dates diverge the
        moment a re-check finds nothing changed, and printing only the second
        one said nobody had looked. An instrument with no verification concept
        carries no `verifiedAt` and reads exactly as it always has.
      */}
      <p className="mt-1 text-xs text-neutral-500 md:text-sm">
        {instrument.verifiedAt === undefined
          ? `Updated ${formatUpdatedAt(snapshot.asOf)}`
          : `Verified ${formatUpdatedAt(instrument.verifiedAt)}`}
      </p>

      {/* Explicit spaces keep the text readable when announced or copied. */}
      <p className="mt-6 flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className="text-6xl font-semibold leading-none tracking-tight text-neutral-50 sm:text-7xl lg:text-8xl">
          {token ? `$${formatNumber(snapshot.value)}` : formatNumber(snapshot.value)}
        </span>{" "}
        <span className="text-base text-neutral-400 sm:text-lg">{unitCaption}</span>
      </p>
      {today && (
        <p className={`mt-3 flex flex-wrap items-baseline gap-x-3 text-lg font-medium tabular-nums sm:text-xl ${today.movement}`}>
          <span>{today.text}</span>{" "}
          <span className="text-sm font-normal text-neutral-500">{today.caption}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The day's move, under UEPI specification 1.0.0 §D.
 *
 * Three cases, and the middle one is the reason this function exists. A percentage where both
 * endpoints are strictly positive -- which is every Urdais series but wholesale power, and their
 * rendering is byte-for-byte what it was. A signed amount in the instrument's own unit where a
 * percentage would be economically deceptive: 30 -> -5 is a $35/MWh fall, and "-116.67%" is a
 * number that describes no rate of return anyone can act on. And nothing at all where there is
 * no comparable prior observation.
 *
 * Direction comes from the sign of the amount in the second case, never from the percentage,
 * which is why -$10 -> -$5 still renders as a rise (§D.4 rows 8 and 9).
 *
 * The caption names the date the comparison measured from where the instrument states one
 * (§E.3), because a released series can have holes -- ERCOT published nothing for 2026-03-07 --
 * and "today" would then be a claim about a period nobody checked.
 */
function headlineMovement(
  snapshot: MarketSnapshot,
  unit: string,
): { text: string; movement: string; caption: string } | null {
  const caption = snapshot.baseTime === undefined ? "today" : `since ${formatTimestamp(snapshot.baseTime, false)}`;
  if (snapshot.changeBasis === "absolute") {
    if (snapshot.absoluteChange === null || snapshot.absoluteChange === undefined) return null;
    return {
      text: formatSignedWithUnit(snapshot.absoluteChange, unit),
      movement: movementClass(snapshot.absoluteChange),
      caption,
    };
  }
  if (snapshot.changePercent === null) return null;
  return { text: formatPercent(snapshot.changePercent), movement: movementClass(snapshot.changePercent), caption };
}
