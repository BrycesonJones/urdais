import { formatListedPrice } from "@/lib/format";
import type { MarketInstrumentDetail } from "@/types/market";

type ListedMarketListProps = {
  instruments: readonly MarketInstrumentDetail[];
  selectedId: string;
  onSelect: (instrumentId: string) => void;
};

function breadthLabel(breadth: "minimum" | "normal" | null): string | null {
  if (breadth === "normal") return "Normal breadth";
  if (breadth === "minimum") return "Minimum breadth";
  return null;
}

/**
 * Compact listed-GPU market list: name, price or coverage, economic object,
 * and breadth. Selection drives the detail header and chart.
 */
export function ListedMarketList({ instruments, selectedId, onSelect }: ListedMarketListProps) {
  if (instruments.length === 0 || instruments.every((instrument) => !instrument.listed)) return null;

  return (
    <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {instruments.map((instrument) => {
        const listed = instrument.listed!;
        const selected = instrument.id === selectedId;
        const unavailable = listed.status === "unavailable";
        const priceText = unavailable
          ? "Unavailable"
          : instrument.snapshot.value === null
            ? "not yet published"
            : `$${formatListedPrice(instrument.snapshot.value)} per hour`;
        const coverage = unavailable
          ? listed.participantCount === 1
            ? "1 eligible participant"
            : "Insufficient market breadth"
          : (breadthLabel(listed.breadth) ?? listed.statusLabel);
        return (
          <li key={instrument.id}>
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${instrument.shortLabel}, ${priceText}, ${listed.economicObject}, ${coverage}`}
              onClick={() => onSelect(instrument.id)}
              className={`flex h-full w-full flex-col items-start rounded-md px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff] ${
                selected
                  ? "bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(82,111,224,0.65)]"
                  : "border border-white/10 hover:bg-white/[0.03]"
              }`}
            >
              <span className="text-sm font-medium text-neutral-100">{instrument.shortLabel}</span>
              <span
                className={`mt-1 text-lg font-semibold tabular-nums ${unavailable ? "text-neutral-500" : "text-neutral-50"}`}
              >
                {unavailable
                  ? "Unavailable"
                  : instrument.snapshot.value === null
                    ? "—"
                    : `$${formatListedPrice(instrument.snapshot.value)}/hr`}
              </span>
              <span className="mt-1 text-xs text-neutral-500">{listed.economicObject}</span>
              <span className="mt-0.5 text-xs text-neutral-500">
                {unavailable
                  ? listed.participantCount === 1
                    ? "1 eligible participant"
                    : "Insufficient market breadth"
                  : (breadthLabel(listed.breadth) ?? listed.statusLabel)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
