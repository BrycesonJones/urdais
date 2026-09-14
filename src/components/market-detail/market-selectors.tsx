"use client";

import Link from "next/link";

import { MultiSelectMenu, SELECTOR_FOCUS, SELECTOR_SURFACE, SelectMenu } from "@/components/market-detail/select-menu";
import { TokenSeriesSelectors } from "@/components/market-detail/token-series-selectors";
import type { MarketDetail, MarketFamily, MarketInstrumentDetail } from "@/types/market";

type MarketSelectorsProps = {
  market: MarketDetail;
  family: MarketFamily;
  instrument: MarketInstrumentDetail | null;
  comparisonIds: string[];
  /** Most comparison series that may be shown at once alongside the primary. */
  maxComparisons: number;
  onFamilyChange: (familyId: string) => void;
  onInstrumentChange: (instrumentId: string) => void;
  onToggleComparison: (instrumentId: string) => void;
  onClearComparisons: () => void;
};

/**
 * Controls that choose what the chart shows. The primary row holds the
 * segmented market-family switch and the instrument menu within that family:
 * together they decide what is being viewed. The multi-select comparison
 * menu, limited to series compatible with the instrument, starts beneath
 * them because it only modifies the current view. Every part is driven by
 * the market data; a standalone index with one family, one instrument, and
 * nothing to compare renders nothing at all.
 */
export function MarketSelectors({
  market,
  family,
  instrument,
  comparisonIds,
  maxComparisons,
  onFamilyChange,
  onInstrumentChange,
  onToggleComparison,
  onClearComparisons,
}: MarketSelectorsProps) {
  const showFamilies = market.families.length > 1;
  const isTokens = family.id === "tokens";
  const showTokenSelectors = isTokens && Boolean(instrument?.tokenIdentity) && family.instruments.length > 0;
  const showInstruments = !isTokens && family.instruments.length > 1;
  const comparisons = instrument?.comparisons ?? [];
  const showComparison = comparisons.length > 0;
  const showPrimary = showFamilies || showInstruments || showTokenSelectors;

  if (!showPrimary && !showComparison && !family.explore) return null;

  const selectedLabels = comparisonIds
    .map((id) => comparisons.find((option) => option.instrumentId === id)?.label)
    .filter((label): label is string => Boolean(label));

  return (
    <div className="flex w-full flex-col gap-2 lg:w-auto">
      {showPrimary && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
          {showFamilies && (
            <div
              role="group"
              aria-label="Market family"
              className={`inline-flex items-center p-0.5 ${SELECTOR_SURFACE} hover:bg-[#111111]`}
            >
              {market.families.map((option) => {
                const selected = option.id === family.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (!selected) onFamilyChange(option.id);
                    }}
                    className={`flex h-full flex-1 items-center justify-center rounded-[2px] px-3.5 text-sm font-medium transition-colors sm:flex-none ${
                      selected ? "bg-white/[0.09] text-neutral-50" : "text-neutral-500 hover:text-neutral-200"
                    } ${SELECTOR_FOCUS}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}

          {showTokenSelectors && instrument && (
            <TokenSeriesSelectors instruments={family.instruments} instrument={instrument} onInstrumentChange={onInstrumentChange} />
          )}

          {showInstruments && (
            <SelectMenu
              label="Instrument"
              options={family.instruments.map((option) => ({ id: option.id, label: option.shortLabel }))}
              value={instrument?.id ?? family.defaultInstrumentId}
              onChange={onInstrumentChange}
              className="sm:min-w-40"
            >
              {instrument?.shortLabel ?? family.label}
            </SelectMenu>
          )}
        </div>
      )}

      {showComparison && instrument && (
        <MultiSelectMenu
          label="Compare with"
          options={comparisons.map((option) => ({ id: option.instrumentId, label: option.label }))}
          selected={comparisonIds}
          max={maxComparisons}
          onToggle={onToggleComparison}
          onClear={onClearComparisons}
          limitNote={`Maximum ${maxComparisons + 1} series`}
          className="sm:self-start"
        >
          <span>Compare with</span>
          {selectedLabels.length === 1 && <span className="font-medium text-neutral-100">{selectedLabels[0]}</span>}
          {selectedLabels.length > 1 && (
            <span className="rounded-[2px] bg-white/[0.09] px-1.5 text-xs font-medium tabular-nums text-neutral-100">
              {selectedLabels.length}
            </span>
          )}
        </MultiSelectMenu>
      )}

      {family.explore && (
        <Link
          href={family.explore.href}
          className={`group inline-flex items-center gap-1.5 self-start rounded-sm text-sm text-neutral-400 transition-colors hover:text-neutral-100 ${SELECTOR_FOCUS}`}
        >
          {family.explore.label}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      )}
    </div>
  );
}
