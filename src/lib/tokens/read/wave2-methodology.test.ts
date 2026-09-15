/**
 * Methodology 1.2: a declared base region, and a withholding that is recorded
 * rather than left as an absence.
 */

import { describe, expect, it } from "vitest";

import {
  benchmarkProviders,
  constituentInForce,
  isEligibleLeg,
  methodologyInForce,
  tokenBenchmarkPrice,
  TOKEN_BENCHMARK_WITHHELD,
  TOKEN_PRICE_DEFAULT_PROVIDER,
  withholdingFor,
  type TokenBenchmarkConstituent,
} from "@/lib/tokens/read/benchmark";
import type { PublicTokenSeries } from "@/lib/tokens/read/api-contract";
import { persistProviderBenchmarks } from "@/lib/tokens/read/benchmark-store";
import { publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { benchmarkInstrumentsFromSeries, pickDefaultTokenInstrument } from "@/lib/tokens/read/instruments";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { verifyProviderProduction } from "@/lib/tokens/verify-production";
import type { ManualVerification, Wave1Provider } from "@/lib/tokens/types";

const VERIFICATION: Omit<ManualVerification, "sourceUrl"> = {
  verifiedBy: "Urdais operator",
  verifiedAt: "2026-09-14T17:05:51Z",
  evidence: "Reviewed the retained first-party artifacts and confirmed the designated rows.",
};

/** Verifies every designated provider; a withheld one has no legs to verify. */
function verifyAllProviders() {
  const store = new InMemoryTokenPricingStore();
  for (const provider of benchmarkProviders() as Wave1Provider[]) {
    verifyProviderProduction({
      provider,
      verification: { ...VERIFICATION, sourceUrl: WAVE1_SOURCE_INTERFACES[provider].canonicalUrl },
      store,
    });
  }
  return { store };
}

const TODAY = "2026-09-14";

function leg(overrides: Partial<PublicTokenSeries> = {}): PublicTokenSeries {
  return {
    seriesId: "s",
    providerSlug: "alibaba",
    providerName: "Alibaba Cloud",
    providerModelId: "qwen3.8-max",
    modelDisplayName: "Qwen3.8-Max",
    pricingDimension: "input",
    serviceTier: "standard",
    contextTier: null,
    cacheTtl: null,
    region: "international",
    unit: "USD / 1M tokens",
    currency: "USD",
    priceUsdPer1m: 2,
    updatedAt: "2026-09-14T17:05:51Z",
    percentageChange: null,
    history: [{ time: "2026-09-14T17:05:51Z", priceUsdPer1m: 2 }],
    ...overrides,
  } as PublicTokenSeries;
}

describe("a designation may declare the regional scope it is quoted under", () => {
  const alibaba = constituentInForce("alibaba", TODAY)!;

  it("designates Alibaba's International scope explicitly", () => {
    expect(alibaba.providerModelId).toBe("qwen3.8-max");
    expect(alibaba.baseRegion).toBe("international");
    expect(alibaba.rationale).toContain("International");
  });

  it("selects the leg quoted under the declared scope", () => {
    expect(isEligibleLeg(leg(), alibaba)).toBe(true);
  });

  it("rejects a different scope, so Beijing can never be published as International", () => {
    expect(isEligibleLeg(leg({ region: "china_beijing", priceUsdPer1m: 1.65 }), alibaba)).toBe(false);
  });

  it("rejects a region-neutral leg when a scope is declared, because the source publishes none", () => {
    expect(isEligibleLeg(leg({ region: null }), alibaba)).toBe(false);
  });

  it("computes $4.00 from the declared scope's two legs", () => {
    const methodology = methodologyInForce(TODAY)!;
    expect(tokenBenchmarkPrice(2, 6, methodology)).toBe(4);
  });
});

describe("Wave 1 keeps the behaviour it had under 1.1", () => {
  it("declares no base region for any Wave-1 provider", () => {
    for (const slug of ["anthropic", "openai", "xai"]) {
      expect(constituentInForce(slug, TODAY)!.baseRegion).toBeNull();
    }
  });

  it("still requires a region-neutral leg where no scope is declared", () => {
    const anthropic = constituentInForce("anthropic", TODAY)!;
    const base = { providerSlug: "anthropic", providerModelId: "claude-fable-5-1", contextTier: null };
    expect(isEligibleLeg(leg({ ...base, region: null }), anthropic)).toBe(true);
    // A regional rate published above the default is still excluded, as in 1.1.
    expect(isEligibleLeg(leg({ ...base, region: "us" }), anthropic)).toBe(false);
  });

  it("selects identically under 1.1 and 1.2 for a designation with no base region", () => {
    const anthropic = constituentInForce("anthropic", TODAY)!;
    const asIf11: TokenBenchmarkConstituent = { ...anthropic, methodologyVersion: "1.1" };
    const candidates = [null, "us", "international"].map((region) =>
      leg({ providerSlug: "anthropic", providerModelId: "claude-fable-5-1", contextTier: null, region }),
    );
    expect(candidates.map((row) => isEligibleLeg(row, anthropic))).toEqual(candidates.map((row) => isEligibleLeg(row, asIf11)));
  });
});

describe("Google enters on the declared base context tier, not the surcharge", () => {
  const google = constituentInForce("google", TODAY)!;

  it("designates the preview Pro and says why", () => {
    expect(google.providerModelId).toBe("gemini-3.1-pro-preview");
    expect(google.baseContextTier).toBe("prompt_lte_200k");
    expect(google.baseRegion).toBeNull();
    expect(google.rationale).toContain("no generally available 3.x Pro");
  });

  it("takes the rate at or below the published threshold and excludes the long-context rate", () => {
    const base = { providerSlug: "google", providerModelId: "gemini-3.1-pro-preview", region: null };
    expect(isEligibleLeg(leg({ ...base, contextTier: "prompt_lte_200k" }), google)).toBe(true);
    expect(isEligibleLeg(leg({ ...base, contextTier: "prompt_gt_200k" }), google)).toBe(false);
  });

  it("computes $7.00 from $2.00 input and $12.00 output", () => {
    expect(tokenBenchmarkPrice(2, 12, methodologyInForce(TODAY)!)).toBe(7);
  });
});

describe("a provider can be collected and deliberately not published", () => {
  it("records DeepSeek as withheld, with the reason on the record", () => {
    const withheld = withholdingFor("deepseek", TODAY)!;
    expect(withheld.reason).toBe("NO_STANDARD_SERVICE_TIER");
    expect(withheld.detail).toContain("peak");
    expect(withheld.detail).toContain("168 hours");
  });

  it("keeps DeepSeek out of the designated set, so readiness never demands a value for it", () => {
    expect(benchmarkProviders()).not.toContain("deepseek");
    expect(constituentInForce("deepseek", TODAY)).toBeUndefined();
  });

  it("publishes the designated providers, and records every unpublished one as a decision", () => {
    expect(benchmarkProviders()).toEqual(["alibaba", "anthropic", "google", "moonshot", "openai", "xai"]);
    // Both are decisions on the record, for different reasons; neither is a gap.
    expect(TOKEN_BENCHMARK_WITHHELD.map((row) => [row.providerSlug, row.state])).toEqual([
      ["deepseek", "collected_not_publishable"],
      ["mistral", "designated_publication_blocked"],
    ]);
  });

  it("would not select a peak or off-peak leg even if one were designated", () => {
    // The tier rule is what withholds DeepSeek; this is that rule, stated.
    const hypothetical: TokenBenchmarkConstituent = {
      providerSlug: "deepseek",
      providerModelId: "deepseek-v4-pro",
      baseContextTier: null,
      baseRegion: null,
      effectiveFrom: TODAY,
      methodologyVersion: "1.2",
      rationale: "hypothetical, to prove the tier rule is what excludes it",
    };
    const base = { providerSlug: "deepseek", providerModelId: "deepseek-v4-pro", contextTier: null, region: null };
    expect(isEligibleLeg(leg({ ...base, serviceTier: "peak" }), hypothetical)).toBe(false);
    expect(isEligibleLeg(leg({ ...base, serviceTier: "off_peak" }), hypothetical)).toBe(false);
  });
});

describe("a rulebook edit must not add a point to a published series", () => {
  it("does not freeze the same legs again under a new methodology version", async () => {
    // The hazard 1.2 introduced: the unique index includes the methodology
    // version, so bumping it would let the identical two leg observations be
    // frozen a second time under the new label, and a reader would see two
    // points at one instant. Prices move series; edits to the rulebook do not.
    const rows: unknown[][] = [];
    const sql = {
      async query(text: string, params: readonly unknown[]) {
        if (/^\s*(begin|commit|rollback)\s*$/i.test(text)) return { rows: [] };
        if (text.includes("INSERT INTO pipeline.token_price_benchmarks")) {
          rows.push([...params]);
          return { rows: [{ id: `bench-${rows.length}` }] };
        }
        if (text.includes("FROM pipeline.token_price_benchmarks")) {
          return {
            rows: rows.map((row, index) => ({
              id: `bench-${index + 1}`,
              provider_slug: row[0],
              methodology_version: row[1],
              provider_model_id: row[2],
              display_name: String(row[2]),
              calculation_status: row[3],
              withheld_reason: row[4],
              price_usd_per_1m: row[5],
              input_observation_id: row[6],
              output_observation_id: row[7],
              input_price_usd_per_1m: row[8],
              output_price_usd_per_1m: row[9],
              input_observed_at: row[10],
              output_observed_at: row[11],
              calculated_at: row[12],
            })),
          };
        }
        throw new Error(`unexpected SQL: ${text}`);
      },
    };

    const { store } = verifyAllProviders();
    const catalog = tokenReadCatalogFromStore(store);
    const first = await persistProviderBenchmarks(sql, catalog, "production", TODAY);
    expect(first.inserted).toBe(6);
    expect(first.conflicts).toEqual([]);

    // Re-freezing the identical state writes nothing, whatever the label says.
    const second = await persistProviderBenchmarks(sql, catalog, "production", TODAY);
    expect(second.inserted).toBe(0);
    expect(rows).toHaveLength(6);
  });
});

describe("the surfaces open on a designated provider, not on an ordering accident", () => {
  it("names Anthropic as the default rather than deriving it from slug order", () => {
    expect(TOKEN_PRICE_DEFAULT_PROVIDER).toBe("anthropic");
    // Alibaba sorts first alphabetically; the default must not follow that.
    expect([...benchmarkProviders()].sort()[0]).toBe("alibaba");
  });

  it("opens on the designated provider even though another sorts earlier", () => {
    const { store } = verifyAllProviders();
    const instruments = benchmarkInstrumentsFromSeries(
      publishableBenchmarks(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "production"), TODAY),
    );
    // The selector itself stays deterministic and alphabetical.
    expect(instruments.map((row) => row.shortLabel)).toEqual(["Alibaba Cloud", "Anthropic", "Google", "Moonshot AI", "OpenAI", "xAI"]);
    expect(pickDefaultTokenInstrument(instruments)!.benchmarkIdentity!.providerSlug).toBe("anthropic");
  });

  it("falls back to the ordering rule when the designated provider is absent", () => {
    const { store } = verifyAllProviders();
    const all = benchmarkInstrumentsFromSeries(
      publishableBenchmarks(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "production"), TODAY),
    );
    const withoutAnthropic = all.filter((row) => row.benchmarkIdentity?.providerSlug !== "anthropic");
    expect(pickDefaultTokenInstrument(withoutAnthropic)).toBeDefined();
    expect(pickDefaultTokenInstrument(withoutAnthropic)!.benchmarkIdentity!.providerSlug).not.toBe("anthropic");
  });
});
