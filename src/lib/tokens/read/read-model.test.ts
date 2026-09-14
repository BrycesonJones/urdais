import { describe, expect, it } from "vitest";

import { ingestTokenPricing } from "@/lib/tokens/ingest";
import { loadPricingFixture } from "@/lib/tokens/fixtures";
import { publicTokenPricesResponse, validatePublicTokenPricesResponse, TOKEN_INTERNAL_FIELDS } from "@/lib/tokens/read/api-contract";
import { pickDefaultTokenSeries } from "@/lib/tokens/read/default-selection";
import { tokenInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { listPublicTokenSeries } from "@/lib/tokens/read/series";
import { seedTokenReadCatalog } from "@/lib/tokens/read/test-support";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";

function artifact(provider: "anthropic" | "xai" | "openai") {
  const fixture = loadPricingFixture(provider);
  return {
    body: fixture.body,
    contentType: fixture.contentType,
    url: fixture.sourceUrl,
    retrievedAt: fixture.retrievedAt,
    requestedAt: fixture.retrievedAt,
    method: "manual_read" as const,
    status: 200,
  };
}

describe("canonical token-price read model", () => {
  it("picks a deterministic current standard input series without ranking models", () => {
    const series = listPublicTokenSeries(
      seedTokenReadCatalog([
        { provider: "openai", providerModelId: "gpt-5.6-sol", dimension: "input", price: 4, retrievedAt: "2026-09-14T03:10:00Z", contextTier: "short_context" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "output", price: 10, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-fable-5-1", dimension: "input", price: 10, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "xai", providerModelId: "grok-4.6", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z", contextTier: "prompt_lt_200k" },
      ]),
    );
    const picked = pickDefaultTokenSeries(series);
    expect(picked).toMatchObject({
      providerSlug: "anthropic",
      providerModelId: "claude-fable-5-1",
      displayName: "Claude Fable 5.1",
      pricingDimension: "input",
      serviceTier: "standard",
      contextTier: null,
      region: null,
      priceUsdPer1m: 10,
    });
  });

  it("keeps provider, model, and dimension as separate series", () => {
    const series = listPublicTokenSeries(
      seedTokenReadCatalog([
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "output", price: 10, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "xai", providerModelId: "grok-4.6", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z", contextTier: "prompt_lt_200k" },
      ]),
    );
    expect(series).toHaveLength(3);
    expect(new Set(series.map((row) => row.seriesId)).size).toBe(3);
    expect(series.map((row) => `${row.providerSlug}:${row.providerModelId}:${row.pricingDimension}`).sort()).toEqual([
      "anthropic:claude-sonnet-5:input",
      "anthropic:claude-sonnet-5:output",
      "xai:grok-4.6:input",
    ]);
  });

  it("keeps service tiers, context tiers, and cache TTLs apart", () => {
    const series = listPublicTokenSeries(
      seedTokenReadCatalog([
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 1, retrievedAt: "2026-09-14T03:10:00Z", serviceTier: "batch" },
        { provider: "openai", providerModelId: "gpt-5.6-sol", dimension: "input", price: 4, retrievedAt: "2026-09-14T03:10:00Z", contextTier: "short_context" },
        { provider: "openai", providerModelId: "gpt-5.6-sol", dimension: "input", price: 8, retrievedAt: "2026-09-14T03:10:00Z", contextTier: "long_context" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "cache_write", price: 2.5, retrievedAt: "2026-09-14T03:10:00Z", cacheTtl: "5m" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "cache_write", price: 4, retrievedAt: "2026-09-14T03:10:00Z", cacheTtl: "1h" },
      ]),
    );
    expect(series).toHaveLength(6);
    expect(series.find((row) => row.serviceTier === "batch")?.priceUsdPer1m).toBe(1);
    expect(series.find((row) => row.contextTier === "long_context")?.priceUsdPer1m).toBe(8);
    expect(series.find((row) => row.cacheTtl === "5m")?.priceUsdPer1m).toBe(2.5);
    expect(series.find((row) => row.cacheTtl === "1h")?.priceUsdPer1m).toBe(4);
  });

  it("withholds percentage change when a series has one observation", () => {
    const series = listPublicTokenSeries(
      seedTokenReadCatalog([
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
      ]),
    );
    expect(series).toHaveLength(1);
    expect(series[0]?.percentageChange).toBeNull();
    expect(series[0]?.history).toEqual([{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 2 }]);
  });

  it("computes percentage change from the prior observation of the same series", () => {
    const series = listPublicTokenSeries(
      seedTokenReadCatalog([
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2.5, retrievedAt: "2026-09-15T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "output", price: 10, retrievedAt: "2026-09-15T03:10:00Z" },
      ]),
    );
    const input = series.find((row) => row.pricingDimension === "input");
    const output = series.find((row) => row.pricingDimension === "output");
    expect(input?.percentageChange).toBe(25);
    expect(output?.percentageChange).toBeNull();
    expect(input?.history).toHaveLength(2);
  });

  it("does not fabricate history beyond recorded observations", () => {
    const series = listPublicTokenSeries(
      seedTokenReadCatalog([
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
      ]),
    );
    const instruments = tokenInstrumentsFromSeries(series);
    expect(instruments[0]?.series.daily).toHaveLength(1);
    expect(instruments[0]?.series.intraday).toEqual([]);
    expect(instruments[0]?.availableRanges).toEqual([]);
    expect(instruments[0]?.snapshot.changePercent).toBeNull();
  });

  it("does not expose research-only fixture ingest as public series", () => {
    expect(WAVE1_SOURCE_INTERFACES.anthropic.registry.productionAccessState).toBe("research_usable");
    const store = new InMemoryTokenPricingStore();
    let n = 0;
    ingestTokenPricing({
      provider: "anthropic",
      mode: "research",
      artifact: artifact("anthropic"),
      store,
      idFactory: () => `research-${++n}`,
    });
    expect(store.allObservations().length).toBeGreaterThan(0);
    expect(listPublicTokenSeries(tokenReadCatalogFromStore(store))).toEqual([]);
  });

  it("does not publish production retrievals from under-review sources", () => {
    const series = listPublicTokenSeries(
      seedTokenReadCatalog([
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z", approved: false },
      ]),
    );
    expect(series).toEqual([]);
  });

  it("does not include Wave 2 providers", () => {
    const catalog = seedTokenReadCatalog([
      { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
    ]);
    const leaked = {
      ...catalog,
      observations: [
        ...catalog.observations,
        {
          ...catalog.observations[0]!,
          id: "obs-google",
          providerSlug: "google",
          providerModelId: "gemini-2.5-pro",
          observationKey: "google::gemini-2.5-pro|input|||standard||",
        },
      ],
    };
    const series = listPublicTokenSeries(leaked);
    expect(series.every((row) => ["anthropic", "openai", "xai"].includes(row.providerSlug))).toBe(true);
    expect(series.some((row) => row.providerSlug === "google")).toBe(false);
  });

  it("strips internal rights-state and retrieval fields from the public response", () => {
    const catalog = seedTokenReadCatalog([
      { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
    ]);
    const body = publicTokenPricesResponse(listPublicTokenSeries(catalog));
    const json = JSON.parse(JSON.stringify(body)) as unknown;
    expect(validatePublicTokenPricesResponse(json)).toEqual([]);
    const encoded = JSON.stringify(json);
    expect(encoded).not.toContain("SECRET_RETRIEVAL_BODY");
    expect(encoded).not.toContain("research_usable");
    expect(encoded).not.toContain("under_review");
    expect(encoded).not.toContain("parserId");
    expect(encoded).not.toContain("sourceInterfaceSlug");
    for (const field of TOKEN_INTERNAL_FIELDS) {
      expect(encoded.includes(`"${field}"`)).toBe(false);
    }
    expect(body.series[0]).toMatchObject({
      providerSlug: "anthropic",
      providerModelId: "claude-sonnet-5",
      pricingDimension: "input",
      priceUsdPer1m: 2,
    });
    expect(body.series[0]).not.toHaveProperty("changeAbsolute");
    expect(body.series[0]).not.toHaveProperty("pointChange");
  });

  it("maps compare options with identified dimensions and no absolute point change", () => {
    const instruments = tokenInstrumentsFromSeries(
      listPublicTokenSeries(
        seedTokenReadCatalog([
          { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
          { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "output", price: 10, retrievedAt: "2026-09-14T03:10:00Z" },
        ]),
      ),
    );
    const input = instruments.find((row) => row.tokenIdentity?.pricingDimension === "input")!;
    expect(input.snapshot).toEqual({
      value: 2,
      changePercent: null,
      asOf: expect.any(Number),
    });
    expect(input.snapshot).not.toHaveProperty("changeAbsolute");
    expect(input.comparisons).toEqual([
      { instrumentId: expect.stringContaining("output"), label: "Claude Sonnet 5 · Output", basis: "absolute" },
    ]);
  });
});
