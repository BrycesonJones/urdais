import { movementClass } from "@/components/market/movement";
import { formatNumber, formatPercent, formatSigned } from "@/lib/format";
import type { IndexSnapshot } from "@/types/market";

/** One compact watchlist-style row: symbol and name left, value and change right. */
export function IndexRow({ index }: { index: IndexSnapshot }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-50">{index.symbol}</p>
        <p className="truncate text-xs text-neutral-400">{index.name}</p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p className="text-sm font-medium text-neutral-50">
          {formatNumber(index.value)}{" "}
          <span className="text-xs font-normal text-neutral-400">{index.unit}</span>
        </p>
        <p className={`text-xs font-medium ${movementClass(index.change)}`}>
          {formatSigned(index.change)} · {formatPercent(index.changePercent)}
        </p>
      </div>
    </li>
  );
}
