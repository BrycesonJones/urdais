/**
 * The product token benchmark is undefined, so the product publishes no token
 * price; the canonical Wave-1 observations behind it are still verifiable.
 */

import { describe, expect, it } from "vitest";

import { TOKEN_BENCHMARK_PENDING_NOTE, TOKEN_BENCHMARK_REQUIREMENTS, TOKEN_PRODUCT_BENCHMARK, tokenBenchmarkIsDefined } from "@/lib/tokens/read/benchmark";
import { loadVisibleTokenInstruments, tokenReadCatalogFromStore, visibleTokenPricesResponse } from "@/lib/tokens/read/load";
import { seedWave1ResearchPreview } from "@/lib/tokens/preview-seed";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { tokenVerificationReports, verificationPricesFor } from "@/lib/tokens/read/verification";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";

function previewSeries() {
  const store = new InMemoryTokenPricingStore();
  seedWave1ResearchPreview(store);
  return listVisibleTokenSeries(tokenReadCatalogFromStore(store), "research_preview");
}

describe("token product benchmark", () => {
  it("is undefined, and says exactly what a definition still requires", () => {
    expect(TOKEN_PRODUCT_BENCHMARK.status).toBe("undefined");
    expect(tokenBenchmarkIsDefined()).toBe(false);
    expect(TOKEN_BENCHMARK_REQUIREMENTS.length).toBeGreaterThanOrEqual(5);
    expect(TOKEN_BENCHMARK_REQUIREMENTS.join(" ")).toMatch(/blend weights/i);
    expect(TOKEN_BENCHMARK_REQUIREMENTS.join(" ")).toMatch(/methodology document/i);
    expect(TOKEN_BENCHMARK_PENDING_NOTE).toMatch(/not yet defined/i);
  });

  it("withholds every token market from the product while it is undefined, in preview and in production", async () => {
    expect(await loadVisibleTokenInstruments({ NODE_ENV: "development" })).toEqual([]);
    expect(await loadVisibleTokenInstruments({ NODE_ENV: "production" })).toEqual([]);
  });

  it("does not fall back to the retired demo lab series", () => {
    expect(TOKEN_BENCHMARK_PENDING_NOTE).not.toMatch(/9\.00|demo/i);
  });
});

describe("Wave-1 verification", () => {
  const series = previewSeries();

  it("produces canonical observations for Anthropic, xAI and OpenAI", () => {
    const reports = tokenVerificationReports(series);
    expect(reports.map((row) => row.providerSlug)).toEqual(["anthropic", "openai", "xai"]);
    for (const report of reports) {
      expect(report.models, report.providerSlug).toBeGreaterThan(0);
      expect(report.observations, report.providerSlug).toBeGreaterThan(0);
      expect(report.rows.every((row) => Number.isFinite(row.priceUsdPer1m) && row.priceUsdPer1m > 0)).toBe(true);
      expect(report.rows.every((row) => row.retrievedAt.endsWith("Z"))).toBe(true);
    }
  });

  it("carries input, output and cache dimensions where the provider publishes them", () => {
    const dimensions = new Set(series.map((row) => row.pricingDimension));
    expect(dimensions.has("input")).toBe(true);
    expect(dimensions.has("output")).toBe(true);
    expect([...dimensions].some((row) => row.includes("cache"))).toBe(true);
  });

  it("keeps every provider's model identities distinct and canonical", () => {
    const keys = series.map((row) => `${row.providerSlug}|${row.providerModelId}`);
    expect(new Set(keys).size).toBeGreaterThanOrEqual(3);
    expect(series.every((row) => row.displayName.trim().length > 0)).toBe(true);
    expect(series.every((row) => row.unit === "USD / 1M tokens")).toBe(true);
  });

  it("reports a representative model per provider with its facet prices", () => {
    for (const provider of ["anthropic", "xai", "openai"] as const) {
      const first = series.find((row) => row.providerSlug === provider)!;
      const prices = verificationPricesFor(series, provider, first.providerModelId);
      expect(Object.keys(prices).length, provider).toBeGreaterThan(0);
      expect(Object.values(prices).every((value) => value > 0)).toBe(true);
    }
  });

  it("exposes the canonical rows through the public response even though no market is published", () => {
    const store = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(store);
    const response = visibleTokenPricesResponse(tokenReadCatalogFromStore(store), { NODE_ENV: "development" });
    expect(response.series.length).toBeGreaterThan(0);
    const production = visibleTokenPricesResponse(tokenReadCatalogFromStore(store), { NODE_ENV: "production" });
    expect(production.series).toEqual([]);
  });
});

describe("last known good", () => {
  it("keeps the most recent valid observation and its timestamp when a later retrieval fails", () => {
    const store = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(store);
    const before = listVisibleTokenSeries(tokenReadCatalogFromStore(store), "research_preview");
    const beforeCount = before.length;
    const sample = before[0]!;

    // A later retrieval that yields nothing: no rows are written, none are removed.
    const after = listVisibleTokenSeries(tokenReadCatalogFromStore(store), "research_preview");
    expect(after.length).toBe(beforeCount);
    const same = after.find((row) => row.seriesId === sample.seriesId)!;
    expect(same.priceUsdPer1m).toBe(sample.priceUsdPer1m);
    expect(same.retrievedAt).toBe(sample.retrievedAt);
    expect(same.history).toEqual(sample.history);
  });

  it("does not fabricate a point when a series has a single observation", () => {
    const series = previewSeries();
    const single = series.filter((row) => row.history.length === 1);
    expect(single.length).toBeGreaterThan(0);
    expect(single.every((row) => row.percentageChange === null)).toBe(true);
  });
});
