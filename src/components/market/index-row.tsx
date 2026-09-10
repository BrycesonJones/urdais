import Link from "next/link";

import { movementClass } from "@/components/market/movement";
import { formatNumber, formatPercent, formatSigned } from "@/lib/format";
import { marketIndexHref } from "@/lib/routes";
import type { IndexSnapshot } from "@/types/market";

/**
 * One compact watchlist-style row linking to the index detail page: symbol
 * and name left, value and change right. The row has no nested controls,
 * so the whole row is the anchor.
 */
export function IndexRow({ index }: { index: IndexSnapshot }) {
  return (
    <li>
      <Link
        href={marketIndexHref(index.symbol)}
        className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-neutral-400"
      >
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
      </Link>
    </li>
  );
}
