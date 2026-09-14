/**
 * The Urdais Token Price benchmark, methodology v1.0: the arithmetic, the
 * eligibility rules that pick its two legs, the effective-dated constituent
 * rule, and the withholding behaviour when a leg is missing.
 */

import { describe, expect, it } from "vitest";

import {
  TOKEN_BENCHMARK_CONSTITUENTS,
  TOKEN_PRICE_METHODOLOGY_VERSION,
  TOKEN_PRICE_UNIT_CAPTION,
  TOKEN_PRICE_WORKLOAD,
  benchmarkProviders,
  constituentInForce,
  isEligibleLeg,
  tokenBenchmarkPrice,
} from "@/lib/tokens/read/benchmark";
import { providerBenchmark, providerBenchmarks, publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { validatePublicTokenBenchmark, type PublicTokenSeries } from "@/lib/tokens/read/api-contract";
import { benchmarkInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import { loadVisibleTokenInstruments, tokenReadCatalogFromStore, visibleTokenBenchmarks } from "@/lib/tokens/read/load";
import { seedWave1ResearchPreview } from "@/lib/tokens/preview-seed";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";

const TODAY = "2026-09-14";

function previewSeries(): PublicTokenSeries[] {
  const store = new InMemoryTokenPricingStore();
  seedWave1ResearchPreview(store);
  return listVisibleTokenSeries(tokenReadCatalogFromStore(store), "research_preview");
}

function leg(over: Partial<PublicTokenSeries>): PublicTokenSeries {
  return {
    seriesId: "s",
    providerSlug: "anthropic",
    providerName: "Anthropic",
    providerModelId: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    modelFamily: "Claude",
    pricingDimension: "input",
    serviceTier: "standard",
    contextTier: null,
    cacheTtl: null,
    region: null,
    priceUsdPer1m: 2,
    currency: "USD",
    unit: "USD / 1M tokens",
    retrievedAt: "2026-09-14T03:10:00Z",
    sourceEffectiveAt: null,
    percentageChange: null,
    history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 2 }],
    ...over,
  };
}

const ANTHROPIC = constituentInForce("anthropic", TODAY)!;

describe("methodology v1.0 arithmetic", () => {
  it("is a standardized 1M-token workload of half input and half output", () => {
    expect(TOKEN_PRICE_WORKLOAD).toMatchObject({ inputTokens: 500_000, outputTokens: 500_000, inputWeight: 0.5, outputWeight: 0.5 });
    expect(TOKEN_PRICE_WORKLOAD.inputTokens + TOKEN_PRICE_WORKLOAD.outputTokens).toBe(1_000_000);
    expect(TOKEN_PRICE_WORKLOAD.inputWeight + TOKEN_PRICE_WORKLOAD.outputWeight).toBe(1);
    expect(TOKEN_PRICE_UNIT_CAPTION).toBe("per 1M tokens");
  });

  it("applies the exact 50/50 formula without rounding first", () => {
    expect(tokenBenchmarkPrice(2, 10)).toBe(6);
    expect(tokenBenchmarkPrice(4, 20)).toBe(12);
    expect(tokenBenchmarkPrice(2, 6)).toBe(4);
    expect(tokenBenchmarkPrice(1.25, 2.5)).toBeCloseTo(1.875, 10);
    expect(tokenBenchmarkPrice(0.2, 1.2)).toBeCloseTo(0.7, 10);
  });
});

describe("eligible legs", () => {
  it("accepts the standard, base-context, default-region input and output rates", () => {
    expect(isEligibleLeg(leg({}), ANTHROPIC)).toBe(true);
    expect(isEligibleLeg(leg({ pricingDimension: "output", priceUsdPer1m: 10 }), ANTHROPIC)).toBe(true);
  });

  it("excludes cache, batch, premium tiers, surcharged context and regional rates", () => {
    expect(isEligibleLeg(leg({ pricingDimension: "cached_input" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ pricingDimension: "cache_read" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ pricingDimension: "cache_write", cacheTtl: "1h" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ serviceTier: "batch" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ serviceTier: "fast" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ serviceTier: "priority" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ region: "us" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ contextTier: "long_context" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ providerModelId: "claude-opus-5" }), ANTHROPIC)).toBe(false);
  });

  it("takes each provider's declared base context tier, not whichever is cheapest", () => {
    const xai = constituentInForce("xai", TODAY)!;
    const openai = constituentInForce("openai", TODAY)!;
    expect(xai.baseContextTier).toBe("prompt_lt_200k");
    expect(openai.baseContextTier).toBe("short_context");
    const xaiLeg = (contextTier: string | null) => leg({ providerSlug: "xai", providerModelId: "grok-4.6", contextTier });
    expect(isEligibleLeg(xaiLeg("prompt_lt_200k"), xai)).toBe(true);
    expect(isEligibleLeg(xaiLeg("prompt_gte_200k"), xai)).toBe(false);
    expect(isEligibleLeg(xaiLeg(null), xai)).toBe(false);
  });
});

describe("benchmark constituents", () => {
  it("designates one explicit general-purpose model per Wave-1 provider, effective-dated", () => {
    expect(benchmarkProviders()).toEqual(["anthropic", "openai", "xai"]);
    expect(constituentInForce("anthropic", TODAY)?.providerModelId).toBe("claude-sonnet-5");
    expect(constituentInForce("xai", TODAY)?.providerModelId).toBe("grok-4.6");
    expect(constituentInForce("openai", TODAY)?.providerModelId).toBe("gpt-5.6-sol");
    for (const row of TOKEN_BENCHMARK_CONSTITUENTS) {
      expect(row.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.methodologyVersion).toBe(TOKEN_PRICE_METHODOLOGY_VERSION);
      expect(row.rationale.length).toBeGreaterThan(20);
    }
  });

  it("designates no specialist model while a general-purpose flagship exists", () => {
    const ids = TOKEN_BENCHMARK_CONSTITUENTS.map((row) => row.providerModelId);
    expect(ids).not.toContain("grok-build-0.1");
    expect(ids).not.toContain("grok-4.20-multi-agent-0309");
    expect(ids).not.toContain("gpt-5.3-codex");
    expect(ids).not.toContain("gpt-rosalind-research");
  });

  it("has no designation before its effective date, so no value is produced", () => {
    expect(constituentInForce("anthropic", "2026-09-13")).toBeUndefined();
    const outcome = providerBenchmark("anthropic", previewSeries(), "2026-09-13");
    expect(outcome).toMatchObject({ status: "withheld", reason: "NO_CONSTITUENT_DESIGNATED" });
  });

  it("does not rewrite history when a designation changes: each value keeps the model in force on its date", () => {
    const series = [
      leg({ history: [{ time: "2026-09-14T03:00:00Z", priceUsdPer1m: 2 }, { time: "2026-09-20T03:00:00Z", priceUsdPer1m: 2 }], retrievedAt: "2026-09-20T03:00:00Z" }),
      leg({ pricingDimension: "output", priceUsdPer1m: 10, history: [{ time: "2026-09-14T03:00:00Z", priceUsdPer1m: 10 }, { time: "2026-09-20T03:00:00Z", priceUsdPer1m: 10 }], retrievedAt: "2026-09-20T03:00:00Z" }),
    ];
    const outcome = providerBenchmark("anthropic", series, "2026-09-20");
    expect(outcome.status).toBe("value");
    if (outcome.status !== "value") return;
    // Same prices on a later retrieval confirm the point rather than adding one.
    expect(outcome.series.history).toHaveLength(1);
    expect(outcome.series.history[0]!.priceUsdPer1m).toBe(6);
    expect(outcome.series.benchmarkModelId).toBe("claude-sonnet-5");
  });
});

describe("withholding", () => {
  it("withholds when the input leg is missing, and never substitutes cached input or batch", () => {
    const outcome = providerBenchmark("anthropic", [leg({ pricingDimension: "output", priceUsdPer1m: 10 }), leg({ pricingDimension: "cached_input", priceUsdPer1m: 0.2 }), leg({ serviceTier: "batch", priceUsdPer1m: 1 })], TODAY);
    expect(outcome).toMatchObject({ status: "withheld", reason: "INPUT_LEG_UNAVAILABLE", providerModelId: "claude-sonnet-5" });
  });

  it("withholds when the output leg is missing, and never copies input into output", () => {
    const outcome = providerBenchmark("anthropic", [leg({})], TODAY);
    expect(outcome).toMatchObject({ status: "withheld", reason: "OUTPUT_LEG_UNAVAILABLE" });
  });

  it("withholds when no single date carries both legs", () => {
    const outcome = providerBenchmark(
      "anthropic",
      [
        leg({ history: [{ time: "2026-09-14T03:00:00Z", priceUsdPer1m: 2 }] }),
        leg({ pricingDimension: "output", priceUsdPer1m: 10, history: [{ time: "2026-09-16T03:00:00Z", priceUsdPer1m: 10 }] }),
      ],
      TODAY,
    );
    expect(outcome).toMatchObject({ status: "withheld", reason: "NO_OBSERVATION_DATE_WITH_BOTH_LEGS" });
  });
});

describe("Wave-1 benchmark values", () => {
  const series = previewSeries();
  const benchmarks = providerBenchmarks(series, TODAY);

  it("computes the benchmark for all three Wave-1 providers from canonical legs", () => {
    expect(benchmarks.map((row) => row.providerSlug)).toEqual(["anthropic", "openai", "xai"]);
    expect(benchmarks.every((row) => row.status === "value")).toBe(true);
  });

  it.each([
    ["anthropic", "claude-sonnet-5", 2, 10, 6],
    ["openai", "gpt-5.6-sol", 4, 20, 12],
    ["xai", "grok-4.6", 2, 6, 4],
  ])("%s uses %s: (%d + %d) / 2", (provider, modelId, input, output, expected) => {
    const row = benchmarks.find((entry) => entry.providerSlug === provider)!;
    expect(row.status).toBe("value");
    if (row.status !== "value") return;
    expect(row.series.benchmarkModelId).toBe(modelId);
    expect(row.series.priceUsdPer1m).toBeCloseTo(tokenBenchmarkPrice(input, output), 10);
    expect(row.series.priceUsdPer1m).toBeCloseTo(expected, 10);
    expect(row.series.unit).toBe("USD / 1M tokens");
    expect(row.series.methodologyVersion).toBe(TOKEN_PRICE_METHODOLOGY_VERSION);
  });

  it("withholds percentage change while only one observation exists, and never shows zero", () => {
    for (const row of benchmarks) {
      if (row.status !== "value") continue;
      expect(row.series.history).toHaveLength(1);
      expect(row.series.percentageChange).toBeNull();
    }
  });

  it("exposes only allowlisted public fields", () => {
    for (const row of publishableBenchmarks(series, TODAY)) {
      expect(validatePublicTokenBenchmark(JSON.parse(JSON.stringify(row)))).toEqual([]);
      const text = JSON.stringify(row);
      expect(text).not.toMatch(/retrievalId|sourceInterfaceId|productionAccessState|termsReviewState|rawBody|observationKey/);
    }
  });

  it("builds one market per provider, comparing benchmark against benchmark", () => {
    const instruments = benchmarkInstrumentsFromSeries(publishableBenchmarks(series, TODAY));
    expect(instruments.map((row) => row.symbol).sort()).toEqual(["Anthropic", "OpenAI", "xAI"]);
    expect(instruments.every((row) => row.unit === TOKEN_PRICE_UNIT_CAPTION)).toBe(true);
    expect(instruments.every((row) => row.comparisons.length === 2)).toBe(true);
    expect(instruments.flatMap((row) => row.comparisons.map((c) => c.label)).every((label) => !label.includes("·"))).toBe(true);
  });
});

describe("rights gating is unchanged", () => {
  it("publishes benchmarks in research preview and nothing in production", async () => {
    const store = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(store);
    const catalog = tokenReadCatalogFromStore(store);
    expect(visibleTokenBenchmarks(catalog, { NODE_ENV: "development" }).length).toBe(3);
    expect(visibleTokenBenchmarks(catalog, { NODE_ENV: "production" })).toEqual([]);
    expect(await loadVisibleTokenInstruments({ NODE_ENV: "production" })).toEqual([]);
  });
});
