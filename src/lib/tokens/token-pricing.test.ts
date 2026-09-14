/**
 * Token-pricing foundation: dimension taxonomy, identity stability,
 * USD/1M-token normalization, and the rule that input, output, cache, batch,
 * and context-tier quotes stay separate. Research snapshot figures are used
 * only as examples of first-party published rates retrieved 2026-09-14; they
 * are not production observations.
 */

import { describe, expect, it } from "vitest";

import { assertBlendWeights, blendInputOutput } from "@/lib/tokens/blend";
import {
  CANONICAL_UNIT,
  DERIVED_PRICING_DIMENSIONS,
  REQUIRED_DIMENSIONS,
  SOURCE_PRICING_DIMENSIONS,
  assertSourcePricingDimension,
  isDerivedPricingDimension,
  isSourcePricingDimension,
} from "@/lib/tokens/dimensions";
import {
  assertIdentitySurvivesRename,
  assertStableModelIdentity,
  classifyIdentityKind,
  isStableHistoricalIdentity,
  looksLikeLatestPointer,
  modelIdentityKey,
  type ModelIdentity,
} from "@/lib/tokens/identity";
import { normalizeToUsdPer1m } from "@/lib/tokens/normalize";
import { assertDistinctObservationKeys, createSourceQuote } from "@/lib/tokens/observation";

const RETRIEVED_AT = "2026-09-14T03:10:00Z";

const sonnet5: ModelIdentity = {
  providerSlug: "anthropic",
  providerModelId: "claude-sonnet-5",
  displayName: "Claude Sonnet 5",
  modelFamily: "Claude",
  version: "5",
  lifecycleStatus: "current",
  identityKind: "stable",
};

function quote(
  identity: ModelIdentity,
  dimension: string,
  price: number,
  extra: Partial<{
    serviceTier: "standard" | "batch" | "fast" | "peak" | "off_peak";
    contextTier: string | null;
    region: string | null;
    cacheTtl: "5m" | "1h";
    currency: string;
    denominatorTokens: number;
    fx: Parameters<typeof createSourceQuote>[0]["fx"];
  }> = {},
) {
  return createSourceQuote({
    identity,
    dimension,
    native: {
      price,
      currency: extra.currency ?? "USD",
      denominatorTokens: extra.denominatorTokens ?? 1_000_000,
    },
    fx: extra.fx,
    region: extra.region,
    serviceTier: extra.serviceTier,
    contextTier: extra.contextTier,
    cacheTtl: extra.cacheTtl,
    sourceInterfaceSlug: `${identity.providerSlug}-api-pricing-docs`,
    retrievedAt: RETRIEVED_AT,
  });
}

describe("pricing dimension taxonomy", () => {
  it("keeps required input and output as source dimensions and blended as derived", () => {
    expect(REQUIRED_DIMENSIONS).toEqual(["input", "output"]);
    expect(SOURCE_PRICING_DIMENSIONS).toContain("cached_input");
    expect(SOURCE_PRICING_DIMENSIONS).toContain("cache_write");
    expect(SOURCE_PRICING_DIMENSIONS).toContain("cache_read");
    expect(SOURCE_PRICING_DIMENSIONS).not.toContain("blended");
    expect(DERIVED_PRICING_DIMENSIONS).toEqual(["blended"]);
    expect(isSourcePricingDimension("input")).toBe(true);
    expect(isDerivedPricingDimension("blended")).toBe(true);
  });

  it("refuses to treat blended as a source quote", () => {
    expect(() => assertSourcePricingDimension("blended")).toThrow(/not a source quote/);
    expect(() => quote(sonnet5, "blended", 6)).toThrow(/not a source quote/);
  });
});

describe("model identity stability", () => {
  it("keys identity on provider slug and the exact native model id", () => {
    expect(modelIdentityKey("anthropic", "claude-sonnet-5")).toBe("anthropic::claude-sonnet-5");
    expect(classifyIdentityKind("claude-sonnet-5")).toBe("stable");
    expect(isStableHistoricalIdentity("stable")).toBe(true);
    assertStableModelIdentity(sonnet5);
  });

  it("survives a display-name rename without changing the key", () => {
    const renamed = { ...sonnet5, displayName: "Claude Sonnet" };
    assertIdentitySurvivesRename(sonnet5, renamed);
    expect(modelIdentityKey(renamed.providerSlug, renamed.providerModelId)).toBe(modelIdentityKey(sonnet5.providerSlug, sonnet5.providerModelId));
  });

  it("rejects latest pointers as stable historical identities", () => {
    expect(looksLikeLatestPointer("gpt-daybreak-blue-latest")).toBe(true);
    expect(looksLikeLatestPointer("claude-haiku-4-5")).toBe(false);
    expect(classifyIdentityKind("gpt-daybreak-blue-latest")).toBe("latest_pointer");
    expect(() =>
      assertStableModelIdentity({
        providerSlug: "openai",
        providerModelId: "gpt-daybreak-blue-latest",
        identityKind: "stable",
      }),
    ).toThrow(/latest pointer/);
    expect(() =>
      assertStableModelIdentity({
        providerSlug: "openai",
        providerModelId: "gpt-5.6-sol",
        identityKind: "latest_pointer",
      }),
    ).toThrow(/latest_pointer, not a stable historical identity/);
  });
});

describe("USD/1M-token normalization", () => {
  it("copies an already-canonical USD per 1M price and retains the native unit", () => {
    const canonical = normalizeToUsdPer1m({ price: 2, currency: "USD", denominatorTokens: 1_000_000 });
    expect(canonical).toMatchObject({
      priceUsdPer1m: 2,
      currency: "USD",
      denominatorTokens: 1_000_000,
      unit: CANONICAL_UNIT,
      fx: null,
      native: { price: 2, currency: "USD", denominatorTokens: 1_000_000 },
    });
  });

  it("scales a USD per-1k-token price to per 1M without FX", () => {
    const canonical = normalizeToUsdPer1m({ price: 0.002, currency: "usd", denominatorTokens: 1_000 });
    expect(canonical.priceUsdPer1m).toBe(2);
    expect(canonical.native.currency).toBe("USD");
    expect(canonical.native.denominatorTokens).toBe(1_000);
  });

  it("refuses a non-USD price without an explicit FX source", () => {
    expect(() => normalizeToUsdPer1m({ price: 14, currency: "CNY", denominatorTokens: 1_000_000 })).toThrow(
      /refusing silent conversion of CNY/,
    );
  });

  it("converts non-USD only when FX source, rate, and as-of are recorded", () => {
    const canonical = normalizeToUsdPer1m(
      { price: 14, currency: "CNY", denominatorTokens: 1_000_000 },
      { rate: 7, source: "example-fx-research", asOf: "2026-09-14", quotedAs: "native_per_usd" },
    );
    expect(canonical.priceUsdPer1m).toBe(2);
    expect(canonical.fx).toMatchObject({ source: "example-fx-research", rate: 7, quotedAs: "native_per_usd" });
  });
});

describe("input, output, cache, batch, and context-tier separation", () => {
  it("does not combine input and output into one quote", () => {
    // Anthropic Claude Sonnet 5, docs.anthropic.com/en/docs/about-claude/pricing, retrieved 2026-09-14.
    const input = quote(sonnet5, "input", 2);
    const output = quote(sonnet5, "output", 10);
    expect(input.observationKey).not.toBe(output.observationKey);
    expect(input.canonical.priceUsdPer1m).toBe(2);
    expect(output.canonical.priceUsdPer1m).toBe(10);
    assertDistinctObservationKeys([input, output]);
    const derived = blendInputOutput(sonnet5, input.canonical, output.canonical, {
      version: "equal-demo",
      inputWeight: 0.5,
      outputWeight: 0.5,
    });
    expect(derived.kind).toBe("derived");
    expect(derived.priceUsdPer1m).not.toBe(input.canonical.priceUsdPer1m);
    expect(derived.priceUsdPer1m).not.toBe(output.canonical.priceUsdPer1m);
  });

  it("treats the demo Anthropic $9 / 1M tokens figure as an undocumented blend, not a source quote", () => {
    const input = quote(sonnet5, "input", 3);
    const output = quote(sonnet5, "output", 15);
    const undocumented = blendInputOutput(sonnet5, input.canonical, output.canonical, {
      version: "demo-equal-weights-not-product-policy",
      inputWeight: 0.5,
      outputWeight: 0.5,
    });
    expect(undocumented.kind).toBe("derived");
    expect(undocumented.priceUsdPer1m).toBe(9);
    expect(() => quote(sonnet5, "blended", 9)).toThrow(/not a source quote/);
    expect(() => assertBlendWeights({ version: "missing-sum", inputWeight: 0.5, outputWeight: 0.4 })).toThrow(/sum to 1/);
    expect(() => blendInputOutput(sonnet5, input.canonical, output.canonical, { version: "", inputWeight: 0.5, outputWeight: 0.5 })).toThrow(
      /explicit version/,
    );
  });

  it("does not combine cache-hit and cache-miss, or cache write and cache read", () => {
    const miss = quote(sonnet5, "input", 2);
    const hit = quote(sonnet5, "cached_input", 0.2);
    const write5m = quote(sonnet5, "cache_write", 2.5, { cacheTtl: "5m" });
    const write1h = quote(sonnet5, "cache_write", 4, { cacheTtl: "1h" });
    const read = quote(sonnet5, "cache_read", 0.2);
    assertDistinctObservationKeys([miss, hit, write5m, write1h, read]);
    expect(write5m.observationKey).not.toBe(write1h.observationKey);
    expect(hit.observationKey).not.toBe(miss.observationKey);
  });

  it("does not combine standard and batch pricing", () => {
    const standard = quote(sonnet5, "input", 2, { serviceTier: "standard" });
    const batch = quote(sonnet5, "input", 1, { serviceTier: "batch" });
    expect(standard.observationKey).not.toBe(batch.observationKey);
    assertDistinctObservationKeys([standard, batch]);
  });

  it("does not combine long-context and default-context tiers", () => {
    const grok: ModelIdentity = {
      providerSlug: "xai",
      providerModelId: "grok-4.6",
      displayName: "Grok 4.6",
      modelFamily: "Grok",
      version: "4.6",
      lifecycleStatus: "current",
      identityKind: "stable",
    };
    // docs.x.ai/docs/models, retrieved 2026-09-14: < 200k vs ≥ 200k, all tokens billed at the higher rate above the threshold.
    const shortCtx = quote(grok, "input", 2, { contextTier: "prompt_lt_200k" });
    const longCtx = quote(grok, "input", 4, { contextTier: "prompt_gte_200k" });
    expect(shortCtx.observationKey).not.toBe(longCtx.observationKey);
    assertDistinctObservationKeys([shortCtx, longCtx]);
  });

  it("does not combine DeepSeek peak and off-peak or Alibaba regional list prices", () => {
    const flash: ModelIdentity = {
      providerSlug: "deepseek",
      providerModelId: "deepseek-flash",
      displayName: "DeepSeek V4.1 Flash",
      modelFamily: "DeepSeek",
      version: "V4.1-Flash",
      lifecycleStatus: "current",
      identityKind: "stable",
    };
    const qwen: ModelIdentity = {
      providerSlug: "alibaba",
      providerModelId: "qwen3.8-max",
      displayName: "Qwen3.8-Max",
      modelFamily: "Qwen",
      version: null,
      lifecycleStatus: "current",
      identityKind: "stable",
    };
    const offPeak = quote(flash, "input", 0.15, { serviceTier: "off_peak" });
    const peak = quote(flash, "input", 0.3, { serviceTier: "peak" });
    const intl = quote(qwen, "input", 2, { region: "international" });
    const beijing = quote(qwen, "input", 1.65, { region: "cn-beijing" });
    assertDistinctObservationKeys([offPeak, peak, intl, beijing]);
  });
});
