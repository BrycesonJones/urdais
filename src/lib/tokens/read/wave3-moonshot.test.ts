/**
 * Wave 3: Moonshot enters under the existing methodology, and Mistral does not
 * enter at all until its designation is decided.
 */

import { describe, expect, it } from "vitest";

import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { loadPricingFixture } from "@/lib/tokens/fixtures";
import {
  benchmarkProviders,
  constituentInForce,
  isEligibleLeg,
  methodologyInForce,
  TOKEN_PRICE_METHODOLOGY_VERSION,
  tokenBenchmarkPrice,
} from "@/lib/tokens/read/benchmark";
import { providerParser } from "@/lib/tokens/providers";
import { publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { WAVE1_PROVIDERS, type ManualVerification } from "@/lib/tokens/types";
import { verifyProviderProduction } from "@/lib/tokens/verify-production";
import type { PublicTokenSeries } from "@/lib/tokens/read/api-contract";

const TODAY = "2026-09-14";
const RETRIEVED = "2026-09-14T22:02:42Z";

function leg(overrides: Partial<PublicTokenSeries> = {}): PublicTokenSeries {
  return {
    seriesId: "s",
    providerSlug: "moonshot",
    providerName: "Moonshot AI",
    providerModelId: "kimi-k3",
    modelDisplayName: "Kimi K3",
    pricingDimension: "input",
    serviceTier: "standard",
    contextTier: null,
    cacheTtl: null,
    region: "international",
    unit: "USD / 1M tokens",
    currency: "USD",
    priceUsdPer1m: 3,
    updatedAt: RETRIEVED,
    percentageChange: null,
    history: [{ time: RETRIEVED, priceUsdPer1m: 3 }],
    ...overrides,
  } as PublicTokenSeries;
}

describe("the Moonshot artifact parses to its published rows", () => {
  const parsed = providerParser("moonshot")(loadPricingFixture("moonshot").body, RETRIEVED);

  it("reads every model on the international list", () => {
    expect([...new Set(parsed.quotes.map((row) => row.identityKey))].sort()).toEqual([
      "moonshot::kimi-k2.6",
      "moonshot::kimi-k2.7-code",
      "moonshot::kimi-k2.7-code-highspeed",
      "moonshot::kimi-k3",
    ]);
  });

  it("takes the cache-miss rate as input and keeps the cache-hit rate separate", () => {
    const k3 = parsed.quotes.filter((row) => row.identityKey === "moonshot::kimi-k3");
    const byDimension = Object.fromEntries(k3.map((row) => [row.dimension, row.canonical.priceUsdPer1m]));
    expect(byDimension.input).toBe(3);
    expect(byDimension.output).toBe(15);
    // The cheaper cache-hit figure is a cache rate, never the input leg.
    expect(byDimension.cached_input).toBe(0.3);
  });

  it("carries the scope each row was quoted under", () => {
    expect(parsed.quotes.every((row) => row.region === "international")).toBe(true);
    expect(parsed.diagnostics.some((row) => row.code === "REGION_SCOPED_PRICE")).toBe(true);
  });

  it("refuses a row priced in another unit rather than assuming per-1M", () => {
    const body = loadPricingFixture("moonshot").body.replace("<td>1M tokens</td>", "<td>1K tokens</td>");
    expect(() => providerParser("moonshot")(body, RETRIEVED)).toThrow(/not per 1M tokens/);
  });
});

describe("Moonshot is designated under the methodology as it already stands", () => {
  const moonshot = constituentInForce("moonshot", TODAY)!;

  it("designates Kimi K3, not a coding build or the previous generation", () => {
    expect(moonshot.providerModelId).toBe("kimi-k3");
    expect(moonshot.rationale).toContain("coding builds");
  });

  it("needs no new methodology version: 1.2 already carries a declared base region", () => {
    expect(moonshot.methodologyVersion).toBe("1.2");
    expect(TOKEN_PRICE_METHODOLOGY_VERSION).toBe("1.2");
    expect(moonshot.baseRegion).toBe("international");
    expect(moonshot.baseContextTier).toBeNull();
  });

  it("selects the international legs and refuses any other scope", () => {
    expect(isEligibleLeg(leg(), moonshot)).toBe(true);
    expect(isEligibleLeg(leg({ region: "china" }), moonshot)).toBe(false);
    expect(isEligibleLeg(leg({ region: null }), moonshot)).toBe(false);
  });

  it("excludes the cache and batch dimensions from the benchmark", () => {
    expect(isEligibleLeg(leg({ pricingDimension: "cached_input", priceUsdPer1m: 0.3 }), moonshot)).toBe(false);
    expect(isEligibleLeg(leg({ serviceTier: "batch" }), moonshot)).toBe(false);
  });

  it("computes $9.00 from $3.00 input and $15.00 output", () => {
    expect(tokenBenchmarkPrice(3, 15, methodologyInForce(TODAY)!)).toBe(9);
  });
});

describe("Moonshot publishes alongside the existing roster without disturbing it", () => {
  const VERIFICATION: Omit<ManualVerification, "sourceUrl"> = {
    verifiedBy: "Urdais operator",
    verifiedAt: RETRIEVED,
    evidence: "Reviewed the retained first-party artifact and confirmed the designated row.",
  };

  function verified() {
    const store = new InMemoryTokenPricingStore();
    for (const provider of benchmarkProviders() as (typeof WAVE1_PROVIDERS)[number][]) {
      verifyProviderProduction({
        provider,
        verification: { ...VERIFICATION, sourceUrl: WAVE1_SOURCE_INTERFACES[provider].canonicalUrl },
        store,
      });
    }
    return publishableBenchmarks(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "production"), TODAY);
  }

  it("publishes six providers, with the earlier five unchanged", () => {
    const rows = verified();
    expect(rows.map((row) => [row.providerSlug, row.priceUsdPer1m])).toEqual([
      ["alibaba", 4],
      ["anthropic", 30],
      ["google", 7],
      ["moonshot", 9],
      ["openai", 30],
      ["xai", 4],
    ]);
  });

  it("starts Moonshot with one point and no fabricated history", () => {
    const moonshot = verified().find((row) => row.providerSlug === "moonshot")!;
    expect(moonshot.history).toHaveLength(1);
    expect(moonshot.percentageChange).toBeNull();
    expect(moonshot.benchmarkModelName).toBe("Kimi K3");
  });
});

describe("Mistral is researched but not seeded", () => {
  it("is absent from the roster until its designation is decided", () => {
    expect(WAVE1_PROVIDERS as readonly string[]).not.toContain("mistral");
    expect(benchmarkProviders()).not.toContain("mistral");
  });

  it("has no parser registered, so nothing can ingest it by accident", () => {
    expect(() => providerParser("mistral")).toThrow(/no pricing parser is registered/);
  });
});
