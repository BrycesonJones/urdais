/**
 * The read path from the publication layer to the UcpiSeriesPoint contract.
 * Internal for now; not routed. It reads only what the contract exposes: no
 * participant prices, no raw payloads, no permission documents, no secrets.
 */

import { toSeriesPoint, type UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import type { Persistence } from "@/lib/ucpi/runtime/persistence";

export type SeriesFilter = { instrument: string; country?: string; from?: string; to?: string };

export async function getSeries(persistence: Pick<Persistence, "loadRegionalSeries">, filter: SeriesFilter): Promise<UcpiSeriesPoint[]> {
  const rows = await persistence.loadRegionalSeries(filter);
  return rows.map((row) =>
    toSeriesPoint(
      // Participants never leave the read path.
      { ...row, participants: [] },
      { calculatedAt: row.calculatedAt, publishedAt: row.publication?.publishedAt ?? null },
    ),
  );
}

export async function getLatestPoint(persistence: Pick<Persistence, "loadRegionalSeries">, instrument: string, country: string): Promise<UcpiSeriesPoint | null> {
  const points = await getSeries(persistence, { instrument, country });
  return points.length === 0 ? null : points[points.length - 1]!;
}

/** Keys that must never appear on a series point, checked in tests and usable as a response guard. */
export const FORBIDDEN_RESPONSE_KEYS = ["participants", "rawPayload", "responseBody", "permissionGrantId", "authorization", "apiKey", "representativePrice", "memberSellerEntityIds"] as const;

export function assertSafeToExpose(point: UcpiSeriesPoint): void {
  const json = JSON.stringify(point);
  for (const key of FORBIDDEN_RESPONSE_KEYS) {
    if (json.includes(`"${key}"`)) throw new Error(`series point exposes forbidden key ${key}`);
  }
}
