/**
 * Production serves the frozen record, filtered by each row's own lineage.
 *
 * The frozen rows are authoritative once written, so a raw leg corrected after
 * the freeze must not move the published value, and a row frozen from research
 * legs must never appear in production however many production observations
 * the provider has since acquired.
 */

import { describe, expect, it } from "vitest";

import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { seedWave1ResearchPreview } from "@/lib/tokens/preview-seed";
import { benchmarkPoints } from "@/lib/tokens/read/benchmark-series";
import { persistedBenchmarks, type PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { frozenRowIsProduction, productionFrozenRows, researchDerivedFrozenRows } from "@/lib/tokens/read/lineage";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { legObservationIndex, listVisibleTokenSeries, type TokenReadCatalog } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import type { ManualVerification } from "@/lib/tokens/types";
import { verifyProviderProduction } from "@/lib/tokens/verify-production";

const VERIFICATION: Omit<ManualVerification, "sourceUrl"> = {
  verifiedBy: "Urdais operator",
  verifiedAt: "2026-09-14T06:00:00Z",
  evidence: "Read the provider's published API pricing page and confirmed the standard input and output rates.",
};

function frozenRows(catalog: TokenReadCatalog, mode: "production" | "research_preview", tag: string): PersistedBenchmarkRow[] {
  return benchmarkPoints(listVisibleTokenSeries(catalog, mode), "2026-09-14", legObservationIndex(catalog, mode))
    .filter((point) => point.providerSlug === "anthropic")
    .map((point, index) => ({
      id: `${tag}-${index + 1}`,
      providerSlug: point.providerSlug,
      methodologyVersion: point.methodologyVersion,
      benchmarkModelId: point.providerModelId,
      benchmarkModelName: point.benchmarkModelName,
      calculationStatus: "value" as const,
      withheldReason: null,
      priceUsdPer1m: point.priceUsdPer1m,
      inputObservationId: point.inputObservationId,
      outputObservationId: point.outputObservationId,
      inputPriceUsdPer1m: point.inputPriceUsdPer1m,
      outputPriceUsdPer1m: point.outputPriceUsdPer1m,
      inputObservedAt: point.inputAt,
      outputObservedAt: point.outputAt,
      calculatedAt: point.time,
    }));
}

/** Research observations, then a genuine verification for the same provider. */
function researchThenProduction() {
  const store = new InMemoryTokenPricingStore();
  seedWave1ResearchPreview(store);
  const researchFrozen = frozenRows(tokenReadCatalogFromStore(store), "research_preview", "research");
  verifyProviderProduction({
    provider: "anthropic",
    verification: { ...VERIFICATION, sourceUrl: WAVE1_SOURCE_INTERFACES.anthropic.canonicalUrl },
    store,
  });
  const catalog = tokenReadCatalogFromStore(store);
  const productionFrozen = frozenRows(catalog, "production", "production");
  return { store, catalog, researchFrozen, productionFrozen };
}

describe("frozen rows in production", () => {
  it("serves a manually verified frozen row", () => {
    const { catalog, productionFrozen } = researchThenProduction();
    expect(productionFrozen).toHaveLength(1);
    expect(productionFrozen.every((row) => frozenRowIsProduction(catalog, row))).toBe(true);
    const series = persistedBenchmarks(productionFrozenRows(catalog, productionFrozen));
    expect(series.map((row) => [row.providerSlug, row.priceUsdPer1m])).toEqual([["anthropic", 30]]);
  });

  it("does not serve a research-derived frozen row, even with production observations present", () => {
    const { catalog, researchFrozen } = researchThenProduction();
    expect(researchFrozen).toHaveLength(1);
    expect(researchFrozen.every((row) => frozenRowIsProduction(catalog, row))).toBe(false);
    expect(productionFrozenRows(catalog, researchFrozen)).toEqual([]);
    expect(researchDerivedFrozenRows(catalog, researchFrozen)).toHaveLength(1);
  });

  it("when both exist, only the production lineage appears in production history", () => {
    const { catalog, researchFrozen, productionFrozen } = researchThenProduction();
    const all = [...researchFrozen, ...productionFrozen];
    const served = persistedBenchmarks(productionFrozenRows(catalog, all));
    expect(served).toHaveLength(1);
    expect(served[0]!.history).toHaveLength(1);
    expect(served[0]!.history[0]!.time).toBe(VERIFICATION.verifiedAt);
    // The research-derived point is absent from the published history.
    expect(served[0]!.history.some((point) => point.time !== VERIFICATION.verifiedAt)).toBe(false);
    // Research preview may still serve both.
    expect(persistedBenchmarks(all)[0]!.history).toHaveLength(2);
  });

  it("does not move when a raw leg is corrected after the freeze", () => {
    const { catalog, productionFrozen } = researchThenProduction();
    const before = persistedBenchmarks(productionFrozenRows(catalog, productionFrozen))[0]!;
    expect(before.priceUsdPer1m).toBe(30);

    const corrected: TokenReadCatalog = {
      ...catalog,
      observations: catalog.observations.map((row) =>
        row.id === productionFrozen[0]!.inputObservationId ? { ...row, canonicalPriceUsdPer1m: 999 } : row,
      ),
    };
    const after = persistedBenchmarks(productionFrozenRows(corrected, productionFrozen))[0]!;
    expect(after.priceUsdPer1m).toBe(30);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("builds history and percentage change from the frozen rows, not from recalculated raw history", () => {
    const { catalog, productionFrozen } = researchThenProduction();
    const later: PersistedBenchmarkRow = {
      ...productionFrozen[0]!,
      id: "production-2",
      priceUsdPer1m: 33,
      calculatedAt: "2026-09-20T06:00:00Z",
    };
    const served = persistedBenchmarks(productionFrozenRows(catalog, [...productionFrozen, later]))[0]!;
    expect(served.history.map((point) => point.priceUsdPer1m)).toEqual([30, 33]);
    expect(served.priceUsdPer1m).toBe(33);
    expect(served.percentageChange).toBeCloseTo(10, 6);
    // The raw legs still say 10 and 50, so a recalculation would have said 30.
    const raw = listVisibleTokenSeries(catalog, "production").filter((row) => row.providerSlug === "anthropic");
    expect(raw.some((row) => row.priceUsdPer1m === 10)).toBe(true);
  });

  it("treats a withheld frozen row as not production-serveable", () => {
    const { catalog, productionFrozen } = researchThenProduction();
    const withheld: PersistedBenchmarkRow = {
      ...productionFrozen[0]!,
      id: "withheld-1",
      calculationStatus: "withheld",
      withheldReason: "OUTPUT_LEG_UNAVAILABLE",
      priceUsdPer1m: null,
      inputObservationId: null,
      outputObservationId: null,
    };
    expect(frozenRowIsProduction(catalog, withheld)).toBe(false);
    expect(productionFrozenRows(catalog, [withheld])).toEqual([]);
  });
});
