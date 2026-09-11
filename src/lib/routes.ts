/** Canonical market routes. Kept in one place so links never drift. */

export const MARKETS_HREF = "/markets";

/** The Model Economics analytical market. Not an index route: it has no symbol. */
export const MODEL_ECONOMICS_HREF = `${MARKETS_HREF}/model-economics`;

/** The Power Analytics analytical market: grid delivery capacity, not price. Not an index route. */
export const POWER_ANALYTICS_HREF = `${MARKETS_HREF}/power-analytics`;

/** Detail page for a first-class Urdais index, e.g. "UCPI" → "/markets/ucpi". */
export function marketIndexHref(symbol: string): string {
  return `${MARKETS_HREF}/${symbol.toLowerCase()}`;
}
