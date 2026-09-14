/**
 * The market list read model: one row per listed GPU instrument in the
 * registry, carrying the latest public series point where a calculation
 * exists and an explicit no-calculation state where none does. No placeholder
 * prices, no constituent fields; every point is checked against the public
 * contract before it leaves.
 */

import { validatePublicResponseShape, type UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import { instrumentPresentation, LISTED_GPU_INSTRUMENTS, type InstrumentPresentation } from "@/lib/ucpi/listed/instruments";
import { getSeries } from "@/lib/ucpi/read/series";
import type { Persistence } from "@/lib/ucpi/runtime/persistence";

export type MarketListingStatus = "published" | "delayed" | "unavailable" | "no_calculation";

export type MarketListing = InstrumentPresentation & {
  /** The child specification version the registry currently carries. */
  specVersion: string;
  status: MarketListingStatus;
  /** The latest current series point, or null when no calculation has been recorded. */
  latest: UcpiSeriesPoint | null;
};

export async function listListedMarkets(persistence: Pick<Persistence, "loadRegionalSeries">): Promise<MarketListing[]> {
  const out: MarketListing[] = [];
  for (const instrument of LISTED_GPU_INSTRUMENTS) {
    const points = await getSeries(persistence, { instrument: instrument.symbol });
    const latest = points.length === 0 ? null : points[points.length - 1]!;
    if (latest !== null) {
      const reasons = validatePublicResponseShape(JSON.parse(JSON.stringify(latest)) as unknown);
      if (reasons.length > 0) throw new Error(`${instrument.symbol}: series point is not publishable: ${reasons.join(", ")}`);
    }
    out.push({ ...instrumentPresentation(instrument.symbol), specVersion: instrument.specVersion, status: latest === null ? "no_calculation" : latest.status, latest });
  }
  return out;
}
