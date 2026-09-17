import Link from "next/link";

import { movementClass } from "@/components/market/movement";
import { formatNumber, formatPercent } from "@/lib/format";
import { marketIndexHref } from "@/lib/routes";
import type { IndexSnapshot } from "@/types/market";

/**
 * One compact watchlist-style row linking to the index detail page: symbol
 * and name left, value and change right. The row has no nested controls,
 * so the whole row is the anchor.
 *
 * **A demo row shows no level and no movement.** The rail is a watchlist, and a
 * watchlist is read as quoted values: UGAI's seeded walk rendered here as "184.21 pts
 * +1.14 %" in the same rail, the same type and the same colours as UBWI's published
 * percentage, with nothing to separate them. A badge alongside the number would still
 * leave the number to be skimmed, screenshotted or quoted, so the number goes instead
 * and the row states what it is. This follows the treatment UBWI already received when
 * its own synthetic walk was removed rather than labelled.
 *
 * The distinction is text, not colour: `Demo data` and `Not published` are both read
 * aloud in the row's accessible name. "Not published" is the literal state -- these
 * indices have no backend series at all -- and deliberately not "unavailable", which
 * would imply a published index Urdais failed to fetch.
 *
 * The row still links to the detail page, where the illustrative series lives under its
 * own `Demo data` badge.
 *
 * An `unpublished` row is narrower still: no level, no movement, and no illustrative series
 * behind it either. UGAI is the case -- its seeded walk was removed rather than relabelled, so
 * "Demo data" would now promise a chart its detail page does not have.
 */
export function IndexRow({ index }: { index: IndexSnapshot }) {
  const demo = index.provenance === "demo";
  // An index that has never published and has no illustrative series either. "Not yet live" is
  // the product state; "Demo data" would promise a synthetic series that no longer exists.
  const unpublished = index.provenance === "unpublished";
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
      {unpublished ? (
        <div className="shrink-0 text-right">
          <p>
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              Not yet live
            </span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">No published observations</p>
        </div>
      ) : demo ? (
        <div className="shrink-0 text-right">
          <p>
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              Demo data
            </span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">Not published</p>
        </div>
      ) : (
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-sm font-medium text-neutral-50">
            {formatNumber(index.value, index.valueFractionDigits ?? 2)}{" "}
            <span className="text-xs font-normal text-neutral-400">{index.unit}</span>
          </p>
          {index.changePercent !== null && (
            <p className={`text-xs font-medium ${movementClass(index.changePercent)}`}>
              {formatPercent(index.changePercent)}
            </p>
          )}
        </div>
      )}
      </Link>
    </li>
  );
}
