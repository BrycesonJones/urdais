/** Canonical market routes. Kept in one place so links never drift. */

export const MARKETS_HREF = "/markets";

/** The Model Economics analytical market. Not an index route: it has no symbol. */
export const MODEL_ECONOMICS_HREF = `${MARKETS_HREF}/model-economics`;

/**
 * UTVI, the Urdais Observed Token Volume Index.
 *
 * An index with no market route of its own. Its canonical presentation is the Volume section of
 * Model Economics -- the chart, the universe statement, the settlement state and the methodology
 * all live there -- so this is a deep link into that page rather than a `/markets/utvi` page that
 * would have to duplicate every one of them. The `#volume` fragment is the id the section already
 * carries for the page's own anchor navigation.
 *
 * It is here rather than inline in the catalog because a canonical route belongs with the other
 * canonical routes, and because it is the answer to "where does UTVI live" for anything that
 * later needs to ask.
 */
export const UTVI_HREF = `${MODEL_ECONOMICS_HREF}#volume`;

/** The Compute Economics analytical market: current listed pricing and modeled hardware payback. Not an index route. */
export const COMPUTE_ANALYTICS_HREF = `${MARKETS_HREF}/compute-analytics`;

/** The Power Analytics analytical market: grid delivery capacity, not price. Not an index route. */
export const POWER_ANALYTICS_HREF = `${MARKETS_HREF}/power-analytics`;

/** Detail page for a first-class Urdais index, e.g. "UCPI" → "/markets/ucpi". */
export function marketIndexHref(symbol: string): string {
  return `${MARKETS_HREF}/${symbol.toLowerCase()}`;
}

/** The map workspace: a dedicated route so the MapLibre renderer stays isolated from the rest of the product. */
export const MAP_HREF = "/map";
