"use client";

import { SELECTOR_FOCUS, SELECTOR_SURFACE, SelectMenu } from "@/components/market-detail/select-menu";
import type { MarketDetail, MarketInstrumentDetail } from "@/types/market";

type MarketSelectorsProps = {
  market: MarketDetail;
  instrument: MarketInstrumentDetail;
  comparisonId: string | null;
  onInstrumentChange: (instrumentId: string) => void;
  onComparisonChange: (instrumentId: string | null) => void;
};

const NONE = "none";

/**
 * Controls that choose what the chart shows. The primary row holds the
 * segmented market-family switch and the instrument menu within that family:
 * together they decide what is being viewed. The comparison menu, limited to
 * series that share the instrument's unit, starts beneath them because it
 * only modifies the current view. Every part is driven by the market data;
 * a standalone index with one family, one instrument, and nothing to
 * compare renders nothing at all.
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
  const showComparison = comparisons.length > 0;

  if (!showFamilies && !showInstruments && !showComparison) return null;

  const comparison = comparisons.find((option) => option.instrumentId === comparisonId) ?? null;

  return (
    <div className="flex w-full flex-col gap-2 lg:w-auto">
      {(showFamilies || showInstruments) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {showFamilies && (
            <div
              role="group"
              aria-label="Market family"
              className={`inline-flex items-center p-0.5 ${SELECTOR_SURFACE} hover:bg-[#111111]`}
            >
              {market.families.map((option) => {
                const selected = option.id === family?.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      const first = option.instruments[0];
                      if (first && !selected) onInstrumentChange(first.id);
                    }}
                    className={`flex h-full flex-1 items-center justify-center rounded-[2px] px-3.5 text-sm font-medium transition-colors sm:flex-none ${
                      selected
                        ? "bg-white/[0.09] text-neutral-50"
                        : "text-neutral-500 hover:text-neutral-200"
                    } ${SELECTOR_FOCUS}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}

          {showInstruments && family && (
            <SelectMenu
              label="Instrument"
              options={family.instruments.map((option) => ({ id: option.id, label: option.shortLabel }))}
              value={instrument.id}
              onChange={onInstrumentChange}
              className="sm:min-w-40"
            >
              {instrument.shortLabel}
            </SelectMenu>
          )}
        </div>
      )}

      {showComparison && (
        <SelectMenu
          label="Compare with"
          emphasis="secondary"
          options={[
            { id: NONE, label: "None" },
            ...comparisons.map((option) => ({ id: option.instrumentId, label: option.label })),
          ]}
          value={comparisonId ?? NONE}
          onChange={(id) => onComparisonChange(id === NONE ? null : id)}
          className="sm:self-start"
        >
          <span>Compare with</span>
          {comparison && <span className="font-medium text-neutral-100">{comparison.label}</span>}
        </SelectMenu>
      )}
    </div>
  );
}
