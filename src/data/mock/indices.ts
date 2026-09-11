/**
 * Deterministic dummy snapshots for the secondary Urdais indices.
 *
 * Derived from the market detail dataset so the homepage watchlist and the
 * detail pages always agree. UCPI is intentionally absent: it owns the
 * primary Information Markets panel. Replace with API data when the backend
 * publishes index values.
 */

import { defaultInstrument, MARKETS } from "@/data/mock/market-detail";
import type { IndexSnapshot } from "@/types/market";

export const INDEX_SNAPSHOTS: IndexSnapshot[] = MARKETS.filter((market) => market.symbol !== "UCPI").map(
  (market) => {
    const instrument = defaultInstrument(market);
    // The headline instrument's unit, since that is whose value the row shows.
    return { symbol: market.symbol, name: market.name, unit: instrument.unit, ...instrument.snapshot };
  },
);
