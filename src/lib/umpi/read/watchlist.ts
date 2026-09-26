/**
 * UMPI's homepage watchlist row.
 *
 * Built here rather than derived from the mock dataset, which is how the row used to work: it
 * took the default instrument of the demo memory market — the HBM3E walk — and carried its
 * `$/GB` unit into a rail of index levels. That instrument no longer exists, and nothing should
 * replace it, because UMPI has no single level to put in a rail. V1 publishes two monthly series
 * measuring different economic objects, and the methodology is explicit that they are never
 * averaged or combined; picking one as "the" UMPI number would manufacture the composite by the
 * back door, on the most-read surface Urdais has.
 *
 * The row stays. UMPI is a live part of the index family and a reader looking for it should find
 * it, with its state stated and a link to the two series. What it does not carry is a number.
 */

import type { IndexSnapshot } from "@/types/market";

export const UMPI_WATCHLIST_ROW: IndexSnapshot = {
  symbol: "UMPI",
  name: "Urdais Memory Price Index",
  unit: "pts",
  // Published, but as two series rather than one level. `IndexRow` renders no digits for this.
  provenance: "multi_series",
  seriesCount: 2,
  // Structurally required by IndexSnapshot and deliberately inert, on the same footing as UAVI's:
  // no branch reads them, and a test asserts the rendered row contains no number.
  value: 0,
  changePercent: null,
  asOf: 0,
};
