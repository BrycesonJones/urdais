/**
 * Deterministic dummy snapshots for the secondary Urdais indices.
 *
 * Derived from the market detail dataset so the homepage watchlist and the
 * detail pages always agree. UCPI is intentionally absent: it owns the
 * primary Information Markets panel. Replace with API data when the backend
 * publishes index values.
 *
 * A market with no instruments produces no row. UBWI is the first such market:
 * its production methodology is approved and its publication gate refuses the
 * current denominator, so there is no published value and no series. A watchlist
 * row needs a number, and inventing one for a market that publishes nothing is
 * exactly the demo-data problem this file still has for the others. Its detail
 * page renders the withheld state with its full disclosure instead.
 */

import { MARKETS } from "@/data/mock/market-detail";
import type { IndexSnapshot } from "@/types/market";

export const INDEX_SNAPSHOTS: IndexSnapshot[] = MARKETS.filter(
  (market) => market.symbol !== "UCPI",
)
  .map((market) => {
    const instrument = market.families
      .flatMap((family) => family.instruments)
      .find((candidate) => candidate.id === market.defaultInstrumentId);
    if (!instrument) return null;
    // The headline instrument's unit, since that is whose value the row shows.
    return {
      symbol: market.symbol,
      name: market.name,
      unit: instrument.unit,
      ...instrument.snapshot,
    } satisfies IndexSnapshot;
  })
  .filter((snapshot): snapshot is IndexSnapshot => snapshot !== null);
