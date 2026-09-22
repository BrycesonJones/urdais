/**
 * Wave-1 Anthropic, xAI, and OpenAI parsers plus shared ingest behaviour:
 * identity, USD/1M normalization, idempotency, append-only, permission gate,
 * and fail-closed malformed sources.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { detectObservationChanges } from "@/lib/tokens/change-detection";
import { fixtureMeta, loadPricingFixture } from "@/lib/tokens/fixtures";
import { sha256Hex } from "@/lib/tokens/hash";
import { ingestTokenPricing } from "@/lib/tokens/ingest";
import { parseAnthropicPricing } from "@/lib/tokens/providers/anthropic";
import { parseOpenAiPricing } from "@/lib/tokens/providers/openai";
import { parseXaiPricing } from "@/lib/tokens/providers/xai";
import { AppendOnlyViolationError, InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { TokenPermissionError } from "@/lib/tokens/types";
import { extractHtmlTables } from "@/lib/tokens/html-tables";
import type { TokenPriceQuote } from "@/lib/tokens/observation";
import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";

const RETRIEVED = "2026-09-14T03:10:00Z";
const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function quote(
  quotes: readonly TokenPriceQuote[],
  modelId: string,
  dimension: string,
  extra: { serviceTier?: string; contextTier?: string | null; cacheTtl?: string | null; region?: string | null } = {},
): TokenPriceQuote {
  const found = quotes.find(
    (row) =>
      row.identityKey.endsWith(`::${modelId}`) &&
      row.dimension === dimension &&
      row.serviceTier === (extra.serviceTier ?? "standard") &&
      row.contextTier === (extra.contextTier ?? null) &&
      row.cacheTtl === (extra.cacheTtl ?? null) &&
      row.region === (extra.region ?? null),
  );
  expect(found, `${modelId} ${dimension} ${JSON.stringify(extra)}`).toBeDefined();
  return found!;
}

function artifact(provider: "anthropic" | "xai" | "openai", body?: string, retrievedAt = RETRIEVED) {
  const fixture = loadPricingFixture(provider);
  return {
    body: body ?? fixture.body,
    contentType: fixture.contentType,
    url: fixture.sourceUrl,
    retrievedAt,
    requestedAt: retrievedAt,
    method: "manual_read" as const,
    status: 200,
  };
}

function seqIds(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe("fixture provenance", () => {
  it("records provider, source URL, retrieval date, and a matching content hash", () => {
    for (const provider of ["anthropic", "xai", "openai"] as const) {
      const fixture = loadPricingFixture(provider);
      expect(fixture.sourceUrl).toMatch(/^https:\/\//);
      expect(fixture.retrievedAt).toBe(fixtureMeta(provider).retrievedAt);
      expect(Number.isNaN(Date.parse(fixture.retrievedAt))).toBe(false);
      expect(fixture.sha256).toBe(sha256Hex(fixture.body));
      expect(fixture.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(fixture.provenance.length).toBeGreaterThan(20);
      expect(readFileSync(path.join(FIXTURE_DIR, fixture.bodyFile), "utf8")).toBe(fixture.body);
    }
  });

  it("names each artifact's own capture date, including the one that has since been superseded", () => {
    // The three Wave-1 artifacts were captured together on 14 September. xAI's has since been
    // superseded by the 22 September excerpt carrying the attested Grok 4.7 row, and its
    // provenance says which artifact it replaces rather than quietly reusing the old date.
    expect(loadPricingFixture("anthropic").retrievedAt).toBe(RETRIEVED);
    expect(loadPricingFixture("openai").retrievedAt).toBe(RETRIEVED);
    expect(loadPricingFixture("xai").retrievedAt).toBe("2026-09-22T00:00:00Z");
    expect(loadPricingFixture("xai").provenance).toContain("7f13f36394f39b9aef4b9e52218d22633ce94ab33aa0f8483d87dcad72e42a5b");
  });
});

describe("html table extraction", () => {
  it("expands colspan grouped headers", () => {
    const tables = extractHtmlTables(loadPricingFixture("openai").body);
    const standard = tables[0];
    expect(standard?.headers).toContain("model");
    expect(standard?.headers).toContain("short context input");
    expect(standard?.headers).toContain("long context cache writes");
  });
});

describe("Anthropic parser", () => {
  const parsed = parseAnthropicPricing(loadPricingFixture("anthropic").body, RETRIEVED);

  it("keeps input and output separate and normalizes to USD/1M", () => {
    expect(quote(parsed.quotes, "claude-sonnet-5", "input").canonical.priceUsdPer1m).toBe(2);
    expect(quote(parsed.quotes, "claude-sonnet-5", "output").canonical.priceUsdPer1m).toBe(10);
    expect(quote(parsed.quotes, "claude-sonnet-5", "input").observationKey).not.toBe(
      quote(parsed.quotes, "claude-sonnet-5", "output").observationKey,
    );
  });

  it("keeps cache read, 5m write, and 1h write distinct", () => {
    expect(quote(parsed.quotes, "claude-sonnet-5", "cache_read").canonical.priceUsdPer1m).toBe(0.2);
    expect(quote(parsed.quotes, "claude-sonnet-5", "cache_write", { cacheTtl: "5m" }).canonical.priceUsdPer1m).toBe(2.5);
    expect(quote(parsed.quotes, "claude-sonnet-5", "cache_write", { cacheTtl: "1h" }).canonical.priceUsdPer1m).toBe(4);
    expect(quote(parsed.quotes, "claude-fable-5-1", "cache_read").canonical.priceUsdPer1m).toBe(0.25);
  });

  it("keeps batch separate from standard and does not blend", () => {
    expect(quote(parsed.quotes, "claude-sonnet-5", "input", { serviceTier: "batch" }).canonical.priceUsdPer1m).toBe(1);
    expect(quote(parsed.quotes, "claude-sonnet-5", "output", { serviceTier: "batch" }).canonical.priceUsdPer1m).toBe(5);
    expect(parsed.quotes.some((row) => row.dimension === ("blended" as never))).toBe(false);
  });

  it("applies documented US 1.1x on 4.6+ and not on Haiku 4.5", () => {
    expect(quote(parsed.quotes, "claude-sonnet-5", "input", { region: "us" }).canonical.priceUsdPer1m).toBe(2.2);
    expect(quote(parsed.quotes, "claude-opus-5", "input", { serviceTier: "fast", region: "us" }).canonical.priceUsdPer1m).toBe(11);
    expect(parsed.quotes.some((row) => row.identityKey.endsWith("claude-haiku-4-5-20251001") && row.region === "us")).toBe(false);
  });

  it("uses dated Haiku identity and dateless 4.6+ ids as stable snapshots", () => {
    expect(parsed.identities.map((i) => i.providerModelId).sort()).toEqual(
      ["claude-fable-5-1", "claude-haiku-4-5-20251001", "claude-opus-5", "claude-sonnet-5"].sort(),
    );
    expect(parsed.identities.every((i) => i.identityKind === "stable")).toBe(true);
    expect(parsed.aliases).toEqual([
      { providerSlug: "anthropic", alias: "claude-haiku-4-5", targetProviderModelId: "claude-haiku-4-5-20251001", aliasKind: "family_alias" },
    ]);
  });

  it("does not invent a long-context surcharge", () => {
    expect(parsed.quotes.every((row) => row.contextTier === null)).toBe(true);
    expect(parsed.diagnostics.some((d) => d.code === "LONG_CONTEXT_NO_SURCHARGE")).toBe(true);
  });
});

describe("xAI parser", () => {
  const parsed = parseXaiPricing(loadPricingFixture("xai").body, RETRIEVED);

  it("keeps input, cached input, and output separate", () => {
    expect(quote(parsed.quotes, "grok-4.6", "input", { contextTier: "prompt_lt_200k" }).canonical.priceUsdPer1m).toBe(2);
    expect(quote(parsed.quotes, "grok-4.6", "cached_input", { contextTier: "prompt_lt_200k" }).canonical.priceUsdPer1m).toBe(0.5);
    expect(quote(parsed.quotes, "grok-4.6", "output", { contextTier: "prompt_lt_200k" }).canonical.priceUsdPer1m).toBe(6);
  });

  it("preserves the 200k long-context rule without collapsing tiers", () => {
    expect(quote(parsed.quotes, "grok-4.6", "input", { contextTier: "prompt_gte_200k" }).canonical.priceUsdPer1m).toBe(4);
    expect(parsed.diagnostics.some((d) => d.code === "LONG_CONTEXT_BILLS_ALL_TOKENS")).toBe(true);
  });

  it("does not fabricate a batch rate and skips per-image SKUs", () => {
    expect(parsed.quotes.some((row) => row.serviceTier === "batch")).toBe(false);
    expect(parsed.quotes.some((row) => row.identityKey.includes("imagine"))).toBe(false);
    expect(parsed.diagnostics.some((d) => d.code === "BATCH_RATE_UNPUBLISHED")).toBe(true);
    expect(parsed.diagnostics.some((d) => d.code === "INCOMPATIBLE_UNIT_SKIPPED")).toBe(true);
  });

  it("seeds only stable native ids", () => {
    expect(parsed.identities.every((i) => i.identityKind === "stable")).toBe(true);
    expect(parsed.identities.map((i) => i.providerModelId)).toContain("grok-4.20-0309-reasoning");
  });
});

describe("OpenAI parser", () => {
  const parsed = parseOpenAiPricing(loadPricingFixture("openai").body, RETRIEVED);

  it("keeps input, cached input, cache writes, and output separate", () => {
    expect(quote(parsed.quotes, "gpt-5.6-sol", "input", { contextTier: "short_context" }).canonical.priceUsdPer1m).toBe(4);
    expect(quote(parsed.quotes, "gpt-5.6-sol", "cached_input", { contextTier: "short_context" }).canonical.priceUsdPer1m).toBe(0.4);
    expect(quote(parsed.quotes, "gpt-5.6-sol", "cache_write", { contextTier: "short_context" }).canonical.priceUsdPer1m).toBe(5);
    expect(quote(parsed.quotes, "gpt-5.6-sol", "output", { contextTier: "short_context" }).canonical.priceUsdPer1m).toBe(20);
  });

  it("keeps batch and fast separate from standard", () => {
    expect(quote(parsed.quotes, "gpt-5.6-sol", "input", { serviceTier: "batch", contextTier: "short_context" }).canonical.priceUsdPer1m).toBe(2);
    expect(quote(parsed.quotes, "gpt-5.6-sol", "input", { serviceTier: "fast", contextTier: "short_context" }).canonical.priceUsdPer1m).toBe(8);
  });

  it("treats daybreak latest pointers as aliases, not canonical models", () => {
    expect(parsed.quotes.some((row) => row.identityKey.includes("latest"))).toBe(false);
    expect(parsed.aliases.map((a) => a.alias).sort()).toEqual(["gpt-daybreak-blue-latest", "gpt-daybreak-red-latest"].sort());
    expect(parsed.aliases.find((a) => a.alias === "gpt-daybreak-blue-latest")?.targetProviderModelId).toBe("gpt-5.6-sol");
  });

  it("does not guess the unpublished long-context token cutoff", () => {
    expect(parsed.quotes.every((row) => row.contextTier === "short_context" || row.contextTier === "long_context")).toBe(true);
    expect(parsed.quotes.some((row) => row.contextTier?.includes("k"))).toBe(false);
    expect(parsed.diagnostics.some((d) => d.code === "CONTEXT_TIER_CUTOFF_UNRESOLVED")).toBe(true);
    expect(parsed.quotes.some((row) => row.identityKey.endsWith("gpt-5.6-cyber") && row.contextTier === "long_context")).toBe(false);
  });

  it("does not emit regional rows without per-model eligibility on the table", () => {
    expect(parsed.quotes.every((row) => row.region === null)).toBe(true);
    expect(parsed.diagnostics.some((d) => d.code === "REGIONAL_UPLIFT_NOT_EMITTED")).toBe(true);
  });
});

describe("shared ingest", () => {
  it("normalizes native USD/MTok quotes to USD/1M and retains the native unit", () => {
    const store = new InMemoryTokenPricingStore();
    const report = ingestTokenPricing({
      provider: "anthropic",
      mode: "research",
      artifact: artifact("anthropic"),
      store,
      idFactory: seqIds("a"),
    });
    const sonnetIn = store.allObservations().find((row) => row.providerModelId === "claude-sonnet-5" && row.pricingDimension === "input" && row.serviceTier === "standard" && row.region === null);
    expect(sonnetIn).toMatchObject({
      sourceNativePrice: 2,
      sourceNativeCurrency: "USD",
      sourceNativeDenominatorTokens: 1_000_000,
      canonicalPriceUsdPer1m: 2,
    });
    expect(report.observationsInserted).toBe(report.quotesParsed);
    expect(report.alreadyPresentForRetrieval).toBe(false);
  });

  it("is idempotent for the same retained retrieval", () => {
    const store = new InMemoryTokenPricingStore();
    const input = { provider: "xai" as const, mode: "research" as const, artifact: artifact("xai"), store, idFactory: seqIds("x") };
    const first = ingestTokenPricing(input);
    const second = ingestTokenPricing(input);
    expect(second.alreadyPresentForRetrieval).toBe(true);
    expect(second.retrievalId).toBe(first.retrievalId);
    expect(store.allObservations()).toHaveLength(first.observationsInserted);
    expect(store.retrievals).toHaveLength(1);
  });

  it("does not insert a synthetic daily copy when the board is unchanged", () => {
    const store = new InMemoryTokenPricingStore();
    ingestTokenPricing({ provider: "openai", mode: "research", artifact: artifact("openai", undefined, "2026-09-14T03:10:00Z"), store, idFactory: seqIds("o1") });
    const second = ingestTokenPricing({
      provider: "openai",
      mode: "research",
      artifact: artifact("openai", undefined, "2026-09-15T03:10:00Z"),
      store,
      idFactory: seqIds("o2"),
    });
    expect(second.observationsInserted).toBe(0);
    expect(second.observationsSkippedUnchanged).toBeGreaterThan(0);
    expect(second.decisions.every((d) => d.kind === "unchanged")).toBe(true);
    expect(store.retrievals).toHaveLength(2);
  });

  it("inserts a new observation when a published price changes and when a model appears or disappears", () => {
    const store = new InMemoryTokenPricingStore();
    ingestTokenPricing({ provider: "anthropic", mode: "research", artifact: artifact("anthropic"), store, idFactory: seqIds("c1") });
    const changed = loadPricingFixture("anthropic").body.replace("$2 / MTok", "$3 / MTok");
    const report = ingestTokenPricing({
      provider: "anthropic",
      mode: "research",
      artifact: artifact("anthropic", changed, "2026-09-15T00:00:00Z"),
      store,
      idFactory: seqIds("c2"),
    });
    expect(report.decisions.some((d) => d.kind === "price_changed")).toBe(true);
    expect(report.observationsInserted).toBeGreaterThan(0);
    const withoutFable = parseAnthropicPricing(loadPricingFixture("anthropic").body, RETRIEVED).quotes.filter(
      (row) => !row.identityKey.endsWith("::claude-fable-5-1"),
    );
    const removed = detectObservationChanges(withoutFable, store.latestByObservationKey("anthropic"));
    expect(removed.some((d) => d.kind === "model_removed" && d.observationKey.includes("claude-fable-5-1"))).toBe(true);
  });

  it("is append-only", () => {
    const store = new InMemoryTokenPricingStore();
    expect(() => store.updateObservation()).toThrow(AppendOnlyViolationError);
    expect(() => store.deleteObservation()).toThrow(AppendOnlyViolationError);
  });

  it("fails closed for production collection while sources remain under review", () => {
    const store = new InMemoryTokenPricingStore();
    expect(WAVE1_SOURCE_INTERFACES.anthropic.registry.productionAccessState).toBe("research_usable");
    expect(WAVE1_SOURCE_INTERFACES.anthropic.registry.termsReviewState).toBe("under_review");
    expect(() =>
      ingestTokenPricing({ provider: "anthropic", mode: "production", artifact: artifact("anthropic"), store }),
    ).toThrow(TokenPermissionError);
    expect(store.allObservations()).toHaveLength(0);
    expect(store.retrievals).toHaveLength(0);
  });

  it("records the retrieval before refusing a malformed source structure", () => {
    const store = new InMemoryTokenPricingStore();
    expect(() =>
      ingestTokenPricing({
        provider: "anthropic",
        mode: "research",
        artifact: artifact("anthropic", "<html><body><p>no tables</p></body></html>"),
        store,
        idFactory: seqIds("m"),
      }),
    ).toThrow(/malformed pricing source/);
    expect(store.retrievals).toHaveLength(1);
    expect(store.retrievals[0]?.responseHash).toBe(sha256Hex("<html><body><p>no tables</p></body></html>"));
    expect(store.allObservations()).toHaveLength(0);
  });
});
