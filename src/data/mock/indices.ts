/**
 * Deterministic dummy snapshots for the secondary Urdais indices.
 *
 * Derived from the market detail dataset so the homepage watchlist and the
 * detail pages always agree. UCPI is intentionally absent: it owns the
 * primary Information Markets panel. Replace with API data when the backend
 * publishes index values.
 *
 * A market with no instruments produces no row, and UBWI is deliberately not here at
 * all. It is the one index with a real published value, so its row is built from the
 * frozen production publication in `@/lib/ubwi/read/surface` and joined to this list by
 * the homepage. Adding UBWI here would mean giving a production index a mock value,
 * which is precisely the demo-data problem this file still has for the others.
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
