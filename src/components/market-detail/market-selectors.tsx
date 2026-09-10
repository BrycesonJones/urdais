"use client";

import { ChevronDownIcon } from "@/components/icons/chevron-down-icon";
import type { MarketDetail, MarketInstrumentDetail } from "@/types/market";

type MarketSelectorsProps = {
  market: MarketDetail;
  instrument: MarketInstrumentDetail;
  comparisonId: string | null;
  onInstrumentChange: (instrumentId: string) => void;
  onComparisonChange: (instrumentId: string | null) => void;
};

const NONE = "";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300";
const selectClass =
  `h-10 w-full appearance-none rounded-md bg-transparent pl-3 pr-9 text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-500 [&>option]:bg-neutral-900 ${focusRing}`;
const fieldClass =
  "relative flex items-center rounded-md border border-white/10 bg-white/5 transition-colors hover:border-white/15 hover:bg-white/10 has-[:disabled]:hover:border-white/10 has-[:disabled]:hover:bg-white/5";

/**
 * Controls that choose what the chart shows: a segmented market-family
 * switch, an instrument select within that family, and a comparison select
 * limited to series that share the instrument's unit. Families and
 * instruments come from the market data, so a single-family index shows only
 * the comparison control. Native selects keep keyboard and mobile behaviour
 * from the platform; the chevron is decorative.
 */
export function MarketSelectors({
  market,
  instrument,
  comparisonId,
  onInstrumentChange,
  onComparisonChange,
}: MarketSelectorsProps) {
  const family = market.families.find((candidate) =>
    candidate.instruments.some((candidate) => candidate.id === instrument.id),
  );
  const showFamilies = market.families.length > 1;
  const showInstruments = (family?.instruments.length ?? 0) > 1;
  const comparisons = instrument.comparisons;

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto">
      {showFamilies && (
        <div
          role="group"
          aria-label="Market family"
          className="inline-flex h-10 items-center rounded-md border border-white/10 bg-white/5 p-1"
        >
          {market.families.map((option) => {
            const selected = option.id === family?.id;
            const available = option.instruments.length > 0;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={!available}
                title={available ? undefined : "Coming soon"}
                onClick={() => {
                  const first = option.instruments[0];
                  if (first && !selected) onInstrumentChange(first.id);
                }}
                className={`flex h-full flex-1 items-center justify-center rounded px-3 text-sm font-medium transition-colors sm:flex-none ${
                  selected
                    ? "bg-[#526fe0]/25 text-neutral-50 shadow-[inset_0_0_0_1px_rgba(140,164,255,0.45)]"
                    : available
                      ? "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
                      : "cursor-not-allowed text-neutral-600"
                } ${focusRing}`}
              >
                {option.label}
                {!available && <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide">soon</span>}
              </button>
            );
          })}
        </div>
      )}

      {showInstruments && family && (
        <div className={`${fieldClass} sm:min-w-52`}>
          <label htmlFor="market-instrument" className="sr-only">
            Instrument
          </label>
          <select
            id="market-instrument"
            value={instrument.id}
            onChange={(event) => onInstrumentChange(event.target.value)}
            className={selectClass}
          >
            {family.instruments.map((option) => (
              <option key={option.id} value={option.id}>
                {option.symbol}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 size-4 text-neutral-400" />
        </div>
      )}

      <div className={`${fieldClass} sm:min-w-64`}>
        <label htmlFor="market-comparison" className="shrink-0 whitespace-nowrap pl-3 text-sm text-neutral-400">
          Compare with
        </label>
        <select
          id="market-comparison"
          value={comparisonId ?? NONE}
          disabled={comparisons.length === 0}
          onChange={(event) => onComparisonChange(event.target.value === NONE ? null : event.target.value)}
          className={`${selectClass} pl-2`}
        >
          <option value={NONE}>{comparisons.length === 0 ? "No compatible series" : "None"}</option>
          {comparisons.map((option) => (
            <option key={option.instrumentId} value={option.instrumentId}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 size-4 text-neutral-400" />
      </div>
    </div>
  );
}
