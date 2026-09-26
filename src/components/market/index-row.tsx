import Link from "next/link";

import { movementClass } from "@/components/market/movement";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { marketHref } from "@/data/market-catalog";
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
 * **Where the row links is the catalog's decision, not this component's.** Most indices have a
 * `/markets/{symbol}` page; UTVI's canonical presentation is a section of Model Economics, and
 * asking `marketHref` is what lets one rail row type serve both without a symbol test here.
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
  // Publishes, but not as one number. Falling through to the value branch would render this
  // row's structurally-inert 0 as a quoted level, which is the failure the demo rows were
  // stripped to avoid -- and here it would be worse, because the index behind it is real.
  const multiSeries = index.provenance === "multi_series";
  return (
    <li>
      <Link
        href={marketHref(index.symbol)}
        className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-neutral-400"
      >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-50">{index.symbol}</p>
        <p className="truncate text-xs text-neutral-400">{index.name}</p>
      </div>
      {multiSeries ? (
        <div className="shrink-0 text-right">
          <p>
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              {seriesCountWord(index.seriesCount)} series
            </span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">No composite level</p>
        </div>
      ) : unpublished ? (
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
            {index.valueFormat === "compact"
              ? formatCompact(index.value)
              : formatNumber(index.value, index.valueFractionDigits ?? 2)}{" "}
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

/**
 * How many series a `multi_series` row stands for, spelled rather than written in digits.
 *
 * Two constraints meet here. The count must be the row's own -- it was the literal word "Two",
 * which was right while UMPI was the only such index and became wrong the moment UEPI joined
 * with three published market benchmarks. And a row in this rail must carry **no digit at all**,
 * because every other row in it is a quoted level and a numeral beside an index name reads as
 * one. Spelling the count satisfies both.
 */
function seriesCountWord(count: number | undefined): string {
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  return words[count ?? 2] ?? "Multiple";
}
