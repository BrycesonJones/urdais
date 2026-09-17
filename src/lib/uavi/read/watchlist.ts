/**
 * UAVI's homepage watchlist row.
 *
 * Built here rather than derived from the mock market dataset, for the reason UGAI's and UBWI's
 * are: deriving it from a generated series is how a synthetic level reaches a rail that reads as
 * quoted values. UAVI's seeded walk rendered as "27.84 pts −3.12 %" beside UBWI's published
 * percentage, in the same type and the same colours, with nothing to separate them — and on a
 * volatility index that number is more misleading than most, because a reader has no external
 * anchor to notice it is fictional.
 *
 * The row stays in the rail. UAVI is part of the Urdais index family and a reader looking for it
 * should find it, with its state stated; removing it would answer "is Urdais building this?" with
 * silence. What it does not carry is a number.
 */

import type { IndexSnapshot } from "@/types/market";

export const UAVI_WATCHLIST_ROW: IndexSnapshot = {
  symbol: "UAVI",
  name: "Urdais AI Volatility Index",
  unit: "pts",
  // Never published, and no illustrative series behind it either.
  provenance: "unpublished",
  // Structurally required by IndexSnapshot and deliberately inert. IndexRow renders no digits for
  // an unpublished row, so these are never read; a test asserts the rendered row contains no
  // number.
  value: 0,
  changePercent: null,
  asOf: 0,
};
