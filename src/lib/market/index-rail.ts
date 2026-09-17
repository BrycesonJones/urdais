/**
 * Assembling the homepage index rail.
 *
 * The rail draws from three places now — the mock dataset, UBWI's frozen production publication,
 * and UGAI's unpublished row — and a reader should not be able to tell which by where a row sits.
 * Catalog order is the product's order; appending each new source to the end would sort the rail
 * by Urdais's implementation history instead, which is a fact about us rather than about the
 * index family.
 *
 * Extracted so the page and its tests share one implementation. They previously each rebuilt the
 * join, which is exactly how a test keeps passing while the page it describes drifts.
 */

import { MARKET_CATALOG } from "@/data/market-catalog";
import type { IndexSnapshot } from "@/types/market";

/** Order rows by the market catalog, with anything unlisted kept in the order it arrived. */
export function assembleIndexRail(rows: readonly IndexSnapshot[]): IndexSnapshot[] {
  const order = new Map(MARKET_CATALOG.map((market, index) => [market.symbol, index]));
  const unlisted = MARKET_CATALOG.length;
  return [...rows].sort(
    (a, b) => (order.get(a.symbol) ?? unlisted) - (order.get(b.symbol) ?? unlisted),
  );
}
