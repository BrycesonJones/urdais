/**
 * UGAI's homepage watchlist row.
 *
 * Built here rather than derived from the mock market dataset, for the same reason UBWI's is:
 * deriving it from a generated series is how a synthetic level reaches a rail that reads as
 * quoted values. UGAI's seeded walk rendered as "184.21 pts +1.14 %" beside UBWI's published
 * percentage, in the same type and the same colours, with nothing to separate them.
 *
 * The row stays in the rail. UGAI is part of the Urdais index family and a reader looking for it
 * should find it, with its state stated — removing it would answer "is Urdais building this?"
 * with silence. What it does not carry is a number: `value` and `asOf` are structurally required
 * by IndexSnapshot and are never rendered for an unpublished row, which is asserted by test.
 */

import type { IndexSnapshot } from "@/types/market";

export const UGAI_WATCHLIST_ROW: IndexSnapshot = {
  symbol: "UGAI",
  name: "Urdais Global AI Index",
  unit: "pts",
  // Never published, and no illustrative series behind it either.
  provenance: "unpublished",
  // Structurally required and deliberately inert. IndexRow renders no digits for an unpublished
  // row, so these are never read; a test asserts the rendered row contains no number.
  value: 0,
  changePercent: null,
  asOf: 0,
};
