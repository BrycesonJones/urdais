/**
 * Assembling the homepage index rail.
 *
 * The rail draws from several places — the mock dataset, UBWI's frozen production publication,
 * UMPI's own row — and a reader should not be able to tell which by where a row sits.
 * Catalog order is the product's order; appending each new source to the end would sort the rail
 * by Urdais's implementation history instead, which is a fact about us rather than about the
 * index family.
 *
 * Order is taken from the *public* catalog, which is also what decides membership: an index that
 * Urdais does not present as a product has no row here, whichever source offered one.
 *
 * Extracted so the page and its tests share one implementation. They previously each rebuilt the
 * join, which is exactly how a test keeps passing while the page it describes drifts.
 */

import { PUBLIC_MARKET_CATALOG } from "@/data/market-catalog";
import type { IndexSnapshot } from "@/types/market";

/**
 * Order rows by the public market catalog, dropping any row for an index Urdais does not
 * present as a product.
 *
 * The filter lives here rather than at each caller because the rail is the public index
 * catalog: a row reaching it is a claim that Urdais sells the index. Sources feeding the rail
 * are independent of one another -- the mock dataset still builds a UACI row, and would
 * happily hand it over -- so the one place they all pass through is the one place that can
 * hold the line.
 */
export function assembleIndexRail(rows: readonly IndexSnapshot[]): IndexSnapshot[] {
  const order = new Map(PUBLIC_MARKET_CATALOG.map((market, index) => [market.symbol, index]));
  return rows
    .filter((row) => order.has(row.symbol))
    .sort((a, b) => order.get(a.symbol)! - order.get(b.symbol)!);
}
