/**
 * The read path from the publication layer to the UcpiSeriesPoint contract.
 * Internal for now; not routed. It reads only what the contract exposes: no
 * participant prices, no raw payloads, no permission documents, no secrets.
 */

import { CONSTITUENT_FIELDS, toSeriesPoint, validatePublicResponseShape, type UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
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

/** Keys that must never appear on a series point; the same list the publication gate enforces. */
export const FORBIDDEN_RESPONSE_KEYS = CONSTITUENT_FIELDS;

/** Structural guard for anything about to leave the read path: contract keys only, no constituent fields at any depth. */
export function assertSafeToExpose(point: UcpiSeriesPoint): void {
  const reasons = validatePublicResponseShape(JSON.parse(JSON.stringify(point)) as unknown);
  if (reasons.length > 0) throw new Error(`series point is not publishable: ${reasons.join(", ")}`);
}
