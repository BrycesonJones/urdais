/**
 * The Urdais Token Price benchmark: the arithmetic, leg eligibility, and the
 * historical guarantees the methodology makes. Constituent and methodology
 * changes must never rewrite an earlier value; a change in one leg must
 * recalculate against the current state of the other; timestamps must be real.
 */

import { describe, expect, it } from "vitest";

import {
  TOKEN_BENCHMARK_CONSTITUENTS,
  TOKEN_PRICE_METHODOLOGY_VERSION,
  TOKEN_PRICE_METHODOLOGY_VERSIONS,
  TOKEN_PRICE_UNIT_CAPTION,
  TOKEN_PRICE_WORKLOAD,
  benchmarkProviders,
  constituentInForce,
  constituentSegments,
  isEligibleLeg,
  methodologyInForce,
  tokenBenchmarkPrice,
} from "@/lib/tokens/read/benchmark";
import { providerBenchmark, providerBenchmarks, publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { loadPersistedBenchmarks, persistProviderBenchmarks, persistedBenchmarks, type PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { validatePublicTokenBenchmark, type PublicTokenSeries } from "@/lib/tokens/read/api-contract";
import { benchmarkInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import { loadVisibleTokenInstruments, tokenReadCatalogFromStore, visibleTokenBenchmarks } from "@/lib/tokens/read/load";
import { seedWave1ResearchPreview } from "@/lib/tokens/preview-seed";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";

const TODAY = "2026-09-14";
const V11 = methodologyInForce(TODAY)!;

function previewSeries(): PublicTokenSeries[] {
  const store = new InMemoryTokenPricingStore();
  seedWave1ResearchPreview(store);
  return listVisibleTokenSeries(tokenReadCatalogFromStore(store), "research_preview");
}

function leg(over: Partial<PublicTokenSeries>): PublicTokenSeries {
  const history = over.history ?? [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: over.priceUsdPer1m ?? 2 }];
  return {
    seriesId: `s:${over.pricingDimension ?? "input"}:${over.providerModelId ?? "claude-fable-5-1"}`,
    providerSlug: "anthropic",
    providerName: "Anthropic",
    providerModelId: "claude-fable-5-1",
    displayName: "Claude Fable 5.1",
    modelFamily: "Claude",
    pricingDimension: "input",
    serviceTier: "standard",
    contextTier: null,
    cacheTtl: null,
    region: null,
    priceUsdPer1m: history[history.length - 1]!.priceUsdPer1m,
    currency: "USD",
    unit: "USD / 1M tokens",
    retrievedAt: history[history.length - 1]!.time,
    sourceEffectiveAt: null,
    percentageChange: null,
    ...over,
    history,
  };
}

const ANTHROPIC = constituentInForce("anthropic", TODAY)!;

describe("methodology registry", () => {
  it("fixes a standardized 1M-token workload of half input and half output", () => {
    expect(TOKEN_PRICE_WORKLOAD.inputTokens + TOKEN_PRICE_WORKLOAD.outputTokens).toBe(1_000_000);
    expect(V11.inputWeight + V11.outputWeight).toBe(1);
    expect(TOKEN_PRICE_UNIT_CAPTION).toBe("per 1M tokens");
    expect(TOKEN_PRICE_METHODOLOGY_VERSION).toBe("1.1");
  });

  it("applies the exact formula of the version in force, without rounding first", () => {
    expect(tokenBenchmarkPrice(10, 50, V11)).toBe(30);
    expect(tokenBenchmarkPrice(2, 6, V11)).toBe(4);
    expect(tokenBenchmarkPrice(1.25, 2.5, V11)).toBeCloseTo(1.875, 10);
  });

  it("is effective-dated, so no version applies before the first", () => {
    expect(methodologyInForce("2026-09-13")).toBeUndefined();
    expect(methodologyInForce(TODAY)?.version).toBe("1.1");
    for (const row of TOKEN_PRICE_METHODOLOGY_VERSIONS) expect(row.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("eligible legs", () => {
  it("accepts the standard, base-context, default-region input and output rates", () => {
    expect(isEligibleLeg(leg({}), ANTHROPIC)).toBe(true);
    expect(isEligibleLeg(leg({ pricingDimension: "output", priceUsdPer1m: 50 }), ANTHROPIC)).toBe(true);
  });

  it("excludes cache, batch, premium tiers, surcharged context and regional rates", () => {
    expect(isEligibleLeg(leg({ pricingDimension: "cached_input" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ pricingDimension: "cache_read" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ pricingDimension: "cache_write", cacheTtl: "1h" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ serviceTier: "batch" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ serviceTier: "fast" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ region: "us" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ contextTier: "long_context" }), ANTHROPIC)).toBe(false);
    expect(isEligibleLeg(leg({ providerModelId: "claude-sonnet-5" }), ANTHROPIC)).toBe(false);
  });

  it("takes each provider's declared base context tier", () => {
    const xai = constituentInForce("xai", TODAY)!;
    const openai = constituentInForce("openai", TODAY)!;
    expect(xai.baseContextTier).toBe("prompt_lt_200k");
    expect(openai.baseContextTier).toBe("short_context");
    const xaiLeg = (contextTier: string | null) => leg({ providerSlug: "xai", providerModelId: "grok-4.6", contextTier });
    expect(isEligibleLeg(xaiLeg("prompt_lt_200k"), xai)).toBe(true);
    expect(isEligibleLeg(xaiLeg("prompt_gte_200k"), xai)).toBe(false);
  });
});

describe("constituent selection", () => {
  it("designates each provider's broadly available flagship frontier model", () => {
    expect(benchmarkProviders()).toEqual(["anthropic", "openai", "xai"]);
    expect(constituentInForce("anthropic", TODAY)?.providerModelId).toBe("claude-fable-5-1");
    expect(constituentInForce("openai", TODAY)?.providerModelId).toBe("gpt-6-astra");
    expect(constituentInForce("xai", TODAY)?.providerModelId).toBe("grok-4.6");
  });

  it("excludes narrow specialists and access-restricted models", () => {
    const ids = TOKEN_BENCHMARK_CONSTITUENTS.map((row) => row.providerModelId);
    for (const excluded of ["grok-build-0.1", "grok-4.20-multi-agent-0309", "gpt-5.3-codex", "gpt-rosalind-research", "gpt-5.6-cyber"]) {
      expect(ids).not.toContain(excluded);
    }
    expect(TOKEN_BENCHMARK_CONSTITUENTS.find((row) => row.providerSlug === "anthropic")!.rationale).toMatch(/Mythos/);
  });

  it("records an effective date and a rationale for every designation", () => {
    for (const row of TOKEN_BENCHMARK_CONSTITUENTS) {
      expect(row.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.rationale.length).toBeGreaterThan(40);
    }
  });
});

describe("leg synchronization", () => {
  const outputs = (points: { time: string; priceUsdPer1m: number }[]) => leg({ pricingDimension: "output", history: points });
  const inputs = (points: { time: string; priceUsdPer1m: number }[]) => leg({ pricingDimension: "input", history: points });

  it("recalculates when only the input changes, using the output still in force", () => {
    const series = [
      inputs([
        { time: "2026-09-14T03:10:00Z", priceUsdPer1m: 2 },
        { time: "2026-09-15T03:10:00Z", priceUsdPer1m: 3 },
      ]),
      outputs([{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 10 }]),
    ];
    const outcome = providerBenchmark("anthropic", series, "2026-09-15");
    expect(outcome.series!.history.map((point) => point.priceUsdPer1m)).toEqual([6, 6.5]);
    expect(outcome.series!.priceUsdPer1m).toBe(6.5);
    expect(outcome.series!.updatedAt).toBe("2026-09-15T03:10:00Z");
  });

  it("recalculates when only the output changes, using the input still in force", () => {
    const series = [
      inputs([{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 2 }]),
      outputs([
        { time: "2026-09-14T03:10:00Z", priceUsdPer1m: 10 },
        { time: "2026-09-16T04:00:00Z", priceUsdPer1m: 12 },
      ]),
    ];
    const outcome = providerBenchmark("anthropic", series, "2026-09-16");
    expect(outcome.series!.history.map((point) => point.priceUsdPer1m)).toEqual([6, 7]);
    expect(outcome.series!.updatedAt).toBe("2026-09-16T04:00:00Z");
  });

  it("recalculates once when both legs change together", () => {
    const series = [
      inputs([
        { time: "2026-09-14T03:10:00Z", priceUsdPer1m: 2 },
        { time: "2026-09-17T05:00:00Z", priceUsdPer1m: 4 },
      ]),
      outputs([
        { time: "2026-09-14T03:10:00Z", priceUsdPer1m: 10 },
        { time: "2026-09-17T05:00:00Z", priceUsdPer1m: 20 },
      ]),
    ];
    const outcome = providerBenchmark("anthropic", series, "2026-09-17");
    expect(outcome.series!.history.map((point) => point.priceUsdPer1m)).toEqual([6, 12]);
  });

  it("adds no point when a later retrieval repeats the same prices", () => {
    const series = [
      inputs([
        { time: "2026-09-14T03:10:00Z", priceUsdPer1m: 2 },
        { time: "2026-09-18T03:10:00Z", priceUsdPer1m: 2 },
      ]),
      outputs([
        { time: "2026-09-14T03:10:00Z", priceUsdPer1m: 10 },
        { time: "2026-09-18T03:10:00Z", priceUsdPer1m: 10 },
      ]),
    ];
    const outcome = providerBenchmark("anthropic", series, "2026-09-18");
    expect(outcome.series!.history).toHaveLength(1);
    expect(outcome.series!.updatedAt).toBe("2026-09-14T03:10:00Z");
  });

  it("keeps real timestamps and never rounds a point to midnight", () => {
    const series = [
      inputs([{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 2 }]),
      outputs([{ time: "2026-09-14T07:45:12Z", priceUsdPer1m: 10 }]),
    ];
    const outcome = providerBenchmark("anthropic", series, TODAY);
    // The later of the two legs used: the moment both supported the value.
    expect(outcome.series!.updatedAt).toBe("2026-09-14T07:45:12Z");
    expect(outcome.series!.history.every((point) => !point.time.endsWith("T00:00:00.000Z"))).toBe(true);
  });
});

describe("history across designation and methodology changes", () => {
  /** Two designations for one provider, as a future Fable 5.1 to Fable 6 move would be. */
  const TWO_DESIGNATIONS = [
    { ...ANTHROPIC },
    {
      providerSlug: "anthropic",
      providerModelId: "claude-fable-6",
      baseContextTier: null,
      effectiveFrom: "2026-11-01",
      methodologyVersion: "1.1",
      rationale: "Hypothetical successor designation used to prove history is not rewritten.",
    },
  ];

  function seriesForBoth(): PublicTokenSeries[] {
    return [
      leg({ pricingDimension: "input", history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 10 }] }),
      leg({ pricingDimension: "output", history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 50 }] }),
      leg({ providerModelId: "claude-fable-6", displayName: "Claude Fable 6", pricingDimension: "input", history: [{ time: "2026-11-02T03:10:00Z", priceUsdPer1m: 12 }] }),
      leg({ providerModelId: "claude-fable-6", displayName: "Claude Fable 6", pricingDimension: "output", history: [{ time: "2026-11-02T03:10:00Z", priceUsdPer1m: 60 }] }),
    ];
  }

  it("splits a provider's history into designation segments and never recomputes the old one", () => {
    const segments = constituentSegments("anthropic", TWO_DESIGNATIONS);
    expect(segments.map((row) => [row.constituent.providerModelId, row.from, row.until])).toEqual([
      ["claude-fable-5-1", "2026-09-14", "2026-11-01"],
      ["claude-fable-6", "2026-11-01", null],
    ]);
  });

  it("keeps the earlier model's points after a successor becomes effective", () => {
    const before = providerBenchmark("anthropic", seriesForBoth(), "2026-10-01");
    expect(before.series!.history.map((point) => point.priceUsdPer1m)).toEqual([30]);
    expect(before.series!.benchmarkModelId).toBe("claude-fable-5-1");
  });

  it("a designation without eligible legs serves the last good value and reports the withholding separately", () => {
    const series = [
      leg({ pricingDimension: "input", history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 10 }] }),
      leg({ pricingDimension: "output", history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 50 }] }),
    ];
    const outcome = providerBenchmark("anthropic", series, TODAY);
    expect(outcome.series!.priceUsdPer1m).toBe(30);
    expect(outcome.current).toMatchObject({ ok: true });

    const missingOutput = providerBenchmark("anthropic", [series[0]!], TODAY);
    expect(missingOutput.series).toBeNull();
    expect(missingOutput.current).toMatchObject({ ok: false, reason: "OUTPUT_LEG_UNAVAILABLE", providerModelId: "claude-fable-5-1" });
  });

  it("withholds percentage change when the previous point came from a different model", () => {
    const points = [
      leg({ pricingDimension: "input", history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 10 }] }),
      leg({ pricingDimension: "output", history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 50 }] }),
    ];
    const outcome = providerBenchmark("anthropic", points, TODAY);
    expect(outcome.series!.percentageChange).toBeNull();
  });

  it("has no value before the first designation's effective date", () => {
    expect(constituentInForce("anthropic", "2026-09-13")).toBeUndefined();
    const outcome = providerBenchmark("anthropic", previewSeries(), "2026-09-13");
    expect(outcome.series).toBeNull();
    expect(outcome.current).toMatchObject({ ok: false, reason: "NO_CONSTITUENT_DESIGNATED" });
  });

  it("a later methodology version cannot change a value already computed under an earlier one", () => {
    const series = [
      leg({ pricingDimension: "input", history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 10 }] }),
      leg({ pricingDimension: "output", history: [{ time: "2026-09-14T03:10:00Z", priceUsdPer1m: 50 }] }),
    ];
    const before = providerBenchmark("anthropic", series, TODAY).series!;
    expect(before.priceUsdPer1m).toBe(30);

    // A hypothetical v2.0 with different weights, effective later.
    const future = { version: "2.0", effectiveFrom: "2026-12-01", inputTokens: 250_000, outputTokens: 750_000, inputWeight: 0.25, outputWeight: 0.75 };
    expect(tokenBenchmarkPrice(10, 50, future)).toBe(40);
    // The point dated 2026-09-14 is still computed with the version in force then.
    expect(methodologyInForce("2026-09-14")!.version).toBe("1.1");
    expect(tokenBenchmarkPrice(10, 50, methodologyInForce("2026-09-14")!)).toBe(30);
    const after = providerBenchmark("anthropic", series, "2026-12-15").series!;
    expect(after.history[0]!.priceUsdPer1m).toBe(30);
  });
});

describe("withholding", () => {
  it("never substitutes cached input, batch or a copied leg", () => {
    const outcome = providerBenchmark(
      "anthropic",
      [
        leg({ pricingDimension: "output", priceUsdPer1m: 50 }),
        leg({ pricingDimension: "cached_input", priceUsdPer1m: 0.25 }),
        leg({ pricingDimension: "input", serviceTier: "batch", priceUsdPer1m: 5 }),
      ],
      TODAY,
    );
    expect(outcome.series).toBeNull();
    expect(outcome.current).toMatchObject({ ok: false, reason: "INPUT_LEG_UNAVAILABLE" });
  });
});

describe("Wave-1 benchmark values", () => {
  const series = previewSeries();
  const benchmarks = providerBenchmarks(series, TODAY);

  it.each([
    ["anthropic", "claude-fable-5-1", 10, 50, 30],
    ["openai", "gpt-6-astra", 10, 50, 30],
    ["xai", "grok-4.6", 2, 6, 4],
  ])("%s uses %s: (%d + %d) / 2", (provider, modelId, input, output, expected) => {
    const row = benchmarks.find((entry) => entry.providerSlug === provider)!;
    expect(row.current).toMatchObject({ ok: true });
    expect(row.series!.benchmarkModelId).toBe(modelId);
    expect(row.series!.priceUsdPer1m).toBeCloseTo(tokenBenchmarkPrice(input, output, V11), 10);
    expect(row.series!.priceUsdPer1m).toBeCloseTo(expected, 10);
    expect(row.series!.methodologyVersion).toBe("1.1");
  });

  it("carries a real retrieval timestamp, not a date boundary", () => {
    for (const row of benchmarks) {
      expect(row.series!.updatedAt).not.toMatch(/T00:00:00\.000Z$/);
      expect(Number.isNaN(Date.parse(row.series!.updatedAt))).toBe(false);
    }
  });

  it("withholds percentage change while only one calculation event exists", () => {
    for (const row of benchmarks) {
      expect(row.series!.history).toHaveLength(1);
      expect(row.series!.percentageChange).toBeNull();
    }
  });

  it("exposes only allowlisted public fields", () => {
    for (const row of publishableBenchmarks(series, TODAY)) {
      expect(validatePublicTokenBenchmark(JSON.parse(JSON.stringify(row)))).toEqual([]);
      expect(JSON.stringify(row)).not.toMatch(/retrievalId|sourceInterfaceId|productionAccessState|termsReviewState|observationKey|response_body/);
    }
  });

  it("builds one market per provider, comparing benchmark against benchmark", () => {
    const instruments = benchmarkInstrumentsFromSeries(publishableBenchmarks(series, TODAY));
    expect(instruments.map((row) => row.symbol).sort()).toEqual(["Anthropic", "OpenAI", "xAI"]);
    expect(instruments.every((row) => row.benchmarkIdentity !== undefined && row.tokenIdentity === undefined)).toBe(true);
    expect(instruments.every((row) => row.unit === TOKEN_PRICE_UNIT_CAPTION)).toBe(true);
    expect(instruments.every((row) => row.comparisons.length === 2)).toBe(true);
  });
});

describe("rights gating is unchanged", () => {
  it("publishes benchmarks in research preview and nothing in production", async () => {
    const store = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(store);
    const catalog = tokenReadCatalogFromStore(store);
    expect(visibleTokenBenchmarks(catalog, { NODE_ENV: "development" })).toHaveLength(3);
    expect(visibleTokenBenchmarks(catalog, { NODE_ENV: "production" })).toEqual([]);
    expect(await loadVisibleTokenInstruments({ NODE_ENV: "production" })).toEqual([]);
  });
});

describe("frozen benchmark observations", () => {
  function catalog() {
    const store = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(store);
    return tokenReadCatalogFromStore(store);
  }

  /** A minimal executor with the same lineage idempotence the unique index enforces. */
  function memoryBenchmarkSql() {
    const rows = new Map<string, unknown[]>();
    const statements: string[] = [];
    return {
      rows,
      statements,
      async query(text: string, params: readonly unknown[]) {
        statements.push(text.trim().split("\n")[0]!);
        if (/^\s*(begin|commit|rollback)\s*$/i.test(text)) return { rows: [] };
        if (text.includes("INSERT INTO pipeline.token_price_benchmarks")) {
          const key = [params[0], params[1], params[2], params[6] ?? "", params[7] ?? ""].join("|");
          if (rows.has(key)) return { rows: [] };
          rows.set(key, [...params]);
          return { rows: [{ id: `bench-${rows.size}` }] };
        }
        if (text.includes("FROM pipeline.token_price_benchmarks")) {
          return {
            rows: [...rows.values()].map((row, index) => ({
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
  }

  it("freezes one row per provider with its full lineage", async () => {
    const sql = memoryBenchmarkSql();
    const { inserted, points } = await persistProviderBenchmarks(sql, catalog(), "research_preview", TODAY);
    expect(inserted).toBe(3);
    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.inputObservationId).toBeTruthy();
      expect(point.outputObservationId).toBeTruthy();
      expect(point.inputPriceUsdPer1m).toBeGreaterThan(0);
      expect(point.outputPriceUsdPer1m).toBeGreaterThan(0);
      expect(point.methodologyVersion).toBe("1.1");
      expect(point.time).not.toMatch(/T00:00:00\.000Z$/);
    }
  });

  it("is idempotent: recalculating the same state writes nothing new", async () => {
    const sql = memoryBenchmarkSql();
    // The same catalog, as a re-run against the database would see: the same observation rows.
    const same = catalog();
    const first = await persistProviderBenchmarks(sql, same, "research_preview", TODAY);
    const second = await persistProviderBenchmarks(sql, same, "research_preview", TODAY);
    const third = await persistProviderBenchmarks(sql, same, "research_preview", TODAY);
    expect(first.inserted).toBe(3);
    expect(second.inserted).toBe(0);
    expect(third.inserted).toBe(0);
    expect(sql.rows.size).toBe(3);
    // Only inserts and transaction control; nothing updates a frozen row.
    expect(sql.statements.some((row) => /^\s*UPDATE|^\s*DELETE/i.test(row))).toBe(false);
  });

  it("serves the frozen rows as the authoritative history", async () => {
    const sql = memoryBenchmarkSql();
    await persistProviderBenchmarks(sql, catalog(), "research_preview", TODAY);
    const frozen = await loadPersistedBenchmarks(sql);
    const series = persistedBenchmarks(frozen);
    expect(series.map((row) => row.providerSlug)).toEqual(["anthropic", "openai", "xai"]);
    expect(series.find((row) => row.providerSlug === "anthropic")!.priceUsdPer1m).toBe(30);
    expect(series.find((row) => row.providerSlug === "xai")!.priceUsdPer1m).toBe(4);
    for (const row of series) expect(validatePublicTokenBenchmark(JSON.parse(JSON.stringify(row)))).toEqual([]);
  });

  it("a frozen value does not change when a raw leg is later corrected", async () => {
    const sql = memoryBenchmarkSql();
    await persistProviderBenchmarks(sql, catalog(), "research_preview", TODAY);
    const before = persistedBenchmarks(await loadPersistedBenchmarks(sql)).find((row) => row.providerSlug === "anthropic")!;
    expect(before.priceUsdPer1m).toBe(30);

    // The raw catalog is rebuilt with a different input price, as an upstream correction would.
    const corrected = catalog();
    const rewritten = {
      ...corrected,
      observations: corrected.observations.map((row) =>
        row.providerModelId === "claude-fable-5-1" && row.pricingDimension === "input"
          ? { ...row, canonicalPriceUsdPer1m: 99 }
          : row,
      ),
    };
    const recalculated = publishableBenchmarks(listVisibleTokenSeries(rewritten, "research_preview"), TODAY);
    expect(recalculated.find((row) => row.providerSlug === "anthropic")!.priceUsdPer1m).not.toBe(30);

    // The frozen record is unmoved, and reading it again returns the published number.
    const after = persistedBenchmarks(await loadPersistedBenchmarks(sql)).find((row) => row.providerSlug === "anthropic")!;
    expect(after.priceUsdPer1m).toBe(30);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("withholds percentage change across a frozen constituent change", () => {
    const rows: PersistedBenchmarkRow[] = [
      {
        id: "b1", providerSlug: "anthropic", methodologyVersion: "1.1", benchmarkModelId: "claude-fable-5-1", benchmarkModelName: "Claude Fable 5.1",
        calculationStatus: "value", withheldReason: null, priceUsdPer1m: 30, inputObservationId: "i1", outputObservationId: "o1",
        inputPriceUsdPer1m: 10, outputPriceUsdPer1m: 50, inputObservedAt: "2026-09-14T03:10:00Z", outputObservedAt: "2026-09-14T03:10:00Z",
        calculatedAt: "2026-09-14T03:10:00Z",
      },
      {
        id: "b2", providerSlug: "anthropic", methodologyVersion: "1.1", benchmarkModelId: "claude-fable-6", benchmarkModelName: "Claude Fable 6",
        calculationStatus: "value", withheldReason: null, priceUsdPer1m: 36, inputObservationId: "i2", outputObservationId: "o2",
        inputPriceUsdPer1m: 12, outputPriceUsdPer1m: 60, inputObservedAt: "2026-11-02T03:10:00Z", outputObservedAt: "2026-11-02T03:10:00Z",
        calculatedAt: "2026-11-02T03:10:00Z",
      },
    ];
    const series = persistedBenchmarks(rows)[0]!;
    // Both points survive; the change across the boundary is withheld.
    expect(series.history.map((point) => point.priceUsdPer1m)).toEqual([30, 36]);
    expect(series.percentageChange).toBeNull();
    expect(series.benchmarkModelId).toBe("claude-fable-6");
  });

  it("keeps a withheld calculation in the record without making it a point", () => {
    const rows: PersistedBenchmarkRow[] = [
      {
        id: "b1", providerSlug: "xai", methodologyVersion: "1.1", benchmarkModelId: "grok-4.6", benchmarkModelName: "Grok 4.6",
        calculationStatus: "value", withheldReason: null, priceUsdPer1m: 4, inputObservationId: "i1", outputObservationId: "o1",
        inputPriceUsdPer1m: 2, outputPriceUsdPer1m: 6, inputObservedAt: "2026-09-14T03:10:00Z", outputObservedAt: "2026-09-14T03:10:00Z",
        calculatedAt: "2026-09-14T03:10:00Z",
      },
      {
        id: "b2", providerSlug: "xai", methodologyVersion: "1.1", benchmarkModelId: "grok-5", benchmarkModelName: "Grok 5",
        calculationStatus: "withheld", withheldReason: "OUTPUT_LEG_UNAVAILABLE", priceUsdPer1m: null, inputObservationId: null, outputObservationId: null,
        inputPriceUsdPer1m: null, outputPriceUsdPer1m: null, inputObservedAt: null, outputObservedAt: null,
        calculatedAt: "2026-12-01T00:00:00Z",
      },
    ];
    const series = persistedBenchmarks(rows)[0]!;
    // Last known good survives the withheld successor.
    expect(series.priceUsdPer1m).toBe(4);
    expect(series.history).toHaveLength(1);
    expect(series.updatedAt).toBe("2026-09-14T03:10:00Z");
  });
});
