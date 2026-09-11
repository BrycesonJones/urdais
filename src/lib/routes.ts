/** Canonical market routes. Kept in one place so links never drift. */

export const MARKETS_HREF = "/markets";

/** The Model Economics analytical market. Not an index route: it has no symbol. */
export const MODEL_ECONOMICS_HREF = `${MARKETS_HREF}/model-economics`;

/** Detail page for a first-class Urdais index, e.g. "UCPI" → "/markets/ucpi". */
export function marketIndexHref(symbol: string): string {
  return `${MARKETS_HREF}/${symbol.toLowerCase()}`;
}
