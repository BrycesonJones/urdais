import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/tokens/prices/route";
import { validatePublicTokenBenchmark } from "@/lib/tokens/read/api-contract";
import { publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { seedWave1ResearchPreview } from "@/lib/tokens/preview-seed";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";

describe("GET /api/tokens/prices", () => {
  it("returns provider benchmarks, not raw model facet rows", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { benchmarks?: unknown[]; series?: unknown[] };
    expect(body).toHaveProperty("benchmarks");
    // The primary endpoint is the benchmark; the facet catalog is internal.
    expect(body.series).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/pricingDimension|cacheTtl|serviceTier|contextTier|cached_input/);
    expect(JSON.stringify(body)).not.toMatch(/research_usable|under_review|parserId|responseBody|response_body/);
  });

  it("stays empty while no observation is production-publicable", async () => {
    const response = await GET();
    const body = (await response.json()) as { benchmarks: unknown[] };
    expect(body.benchmarks).toEqual([]);
  });

  it("would expose only allowlisted benchmark fields once rights permit publication", () => {
    const store = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(store);
    // The retained xAI artifact carries the Grok 4.7 row attested on 22 September, so a
    // catalog derived from the fixtures is a 22 September catalog.
    const rows = publishableBenchmarks(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "research_preview"), "2026-09-22");
    expect(rows).toHaveLength(6);  // six providers ingested, DeepSeek withheld
    for (const row of rows) {
      expect(validatePublicTokenBenchmark(JSON.parse(JSON.stringify(row)))).toEqual([]);
      expect(Object.keys(row)).not.toContain("pricingDimension");
    }
  });
});
