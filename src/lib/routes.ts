/** Canonical market routes. Kept in one place so links never drift. */

export const MARKETS_HREF = "/markets";

/** Detail page for a first-class Urdais index, e.g. "UCPI" → "/markets/ucpi". */
export function marketIndexHref(symbol: string): string {
  return `${MARKETS_HREF}/${symbol.toLowerCase()}`;
}
