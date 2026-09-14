/**
 * Provenance of a canonical observation and of a frozen benchmark row.
 *
 * One predicate, used everywhere the question is asked: the read path deciding
 * what production may serve, and the readiness check deciding whether a
 * deployment is ready. Two rules that could drift apart would eventually
 * disagree about the same row.
 *
 * A frozen benchmark's provenance is the provenance of the two observations it
 * actually consumed, not of the provider it belongs to. A row frozen from
 * research legs stays research-derived however many production observations
 * that provider acquires later, because a frozen row is never recalculated.
 */

import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { observationIsPublicable } from "@/lib/tokens/read/publication";
import type { TokenReadCatalog } from "@/lib/tokens/read/series";

/** Is this exact observation production-publicable, resolved through its own retrieval and source? */
export function observationIsProduction(catalog: TokenReadCatalog, observationId: string | null): boolean {
  if (observationId === null) return false;
  const observation = catalog.observations.find((row) => row.id === observationId);
  if (!observation) return false;
  const retrieval = catalog.retrievals.find((row) => row.id === observation.retrievalId);
  const source = catalog.sourceInterfaces.find((row) => row.id === observation.sourceInterfaceId);
  return observationIsPublicable(observation, retrieval, source);
}

/**
 * Is this frozen row production-serveable? Both legs must resolve, and both
 * must be production-publicable. A withheld row has no legs and is never
 * production-serveable.
 */
export function frozenRowIsProduction(catalog: TokenReadCatalog, row: PersistedBenchmarkRow): boolean {
  if (row.calculationStatus !== "value") return false;
  return observationIsProduction(catalog, row.inputObservationId) && observationIsProduction(catalog, row.outputObservationId);
}

/** The frozen rows a production surface may serve. */
export function productionFrozenRows(
  catalog: TokenReadCatalog,
  rows: readonly PersistedBenchmarkRow[],
): PersistedBenchmarkRow[] {
  return rows.filter((row) => frozenRowIsProduction(catalog, row));
}

/** The frozen value rows whose own lineage is not production-publicable. */
export function researchDerivedFrozenRows(
  catalog: TokenReadCatalog,
  rows: readonly PersistedBenchmarkRow[],
): PersistedBenchmarkRow[] {
  return rows.filter((row) => row.calculationStatus === "value" && !frozenRowIsProduction(catalog, row));
}
