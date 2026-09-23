/**
 * Deterministic dummy snapshots for the secondary Urdais indices.
 *
 * Derived from the market detail dataset so the homepage watchlist and the
 * detail pages always agree. UCPI is intentionally absent: it owns the
 * primary Information Markets panel. Replace with API data when the backend
 * publishes index values.
 *
 * A market with no instruments produces no row, and UBWI and UGAI are deliberately not here
 * at all. It is the one index with a real published value, so its row is built from the
 * frozen production publication in `@/lib/ubwi/read/surface` and joined to this list by
 * the homepage. Adding UBWI here would mean giving a production index a mock value.
 *
 * Every row from this module carries `provenance: "demo"`, and `IndexRow` shows no level
 * and no movement for such a row. These walks remain the detail pages' illustrative
 * series; they are no longer quoted as though the index published them.
 */

import { isPubliclyListed } from "@/data/market-catalog";
import { MARKETS } from "@/data/mock/market-detail";
import type { IndexSnapshot } from "@/types/market";

export const INDEX_SNAPSHOTS: IndexSnapshot[] = MARKETS.filter(
  // A deferred index keeps its market definition and its illustrative series; what it loses is
  // the rail row, because the rail is where a reader is told what Urdais currently publishes.
  (market) => market.symbol !== "UCPI" && isPubliclyListed(market.symbol),
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
      // Carried from the instrument rather than hardcoded here, so a row can never claim a
      // provenance its own series does not have. Every instrument in this module is demo;
      // the fallback covers a future hydrated one that forgot to say so.
      provenance: instrument.provenance ?? "demo",
      ...instrument.snapshot,
    } satisfies IndexSnapshot;
  })
  .filter((snapshot): snapshot is IndexSnapshot => snapshot !== null);
