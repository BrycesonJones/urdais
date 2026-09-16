/**
 * A withholding is a decision on the record, not an absence.
 *
 * Methodology 1.2 records DeepSeek as collected but withheld, and states that a withholding
 * is a decision rather than an absence. Production held twelve DeepSeek observations and no
 * benchmark row at all, so nothing could tell "reviewed and deliberately withheld" from
 * "never processed". These fix that distinction in place.
 */

import { describe, expect, it } from "vitest";

import {
  INSERT_WITHHOLDING_SQL,
  loadPersistedBenchmarks,
  persistProviderBenchmarks,
  persistableWithholdings,
  persistedBenchmarks,
  type PersistedBenchmarkRow,
} from "@/lib/tokens/read/benchmark-store";
import { TOKEN_BENCHMARK_WITHHELD, withholdingFor } from "@/lib/tokens/read/benchmark";
import { verificationFreshness } from "@/lib/tokens/verification-freshness";
import { seedTokenReadCatalog } from "@/lib/tokens/read/test-support";
import type { TokenReadCatalog } from "@/lib/tokens/read/series";

const TODAY = "2026-09-16";
const DEEPSEEK_REASON = "NO_STANDARD_SERVICE_TIER";

/**
 * The shape production actually holds: DeepSeek in peak and off-peak only, no standard tier.
 * Peak is exactly twice off-peak, as the provider publishes it.
 */
function deepseekCatalog(): TokenReadCatalog {
  return seedTokenReadCatalog([
    { provider: "deepseek", providerModelId: "deepseek-v4-pro", dimension: "input", price: 0.66, serviceTier: "off_peak", retrievedAt: "2026-09-14T17:43:35.197Z" },
    { provider: "deepseek", providerModelId: "deepseek-v4-pro", dimension: "input", price: 1.32, serviceTier: "peak", retrievedAt: "2026-09-14T17:43:35.197Z" },
    { provider: "deepseek", providerModelId: "deepseek-v4-pro", dimension: "output", price: 1.98, serviceTier: "off_peak", retrievedAt: "2026-09-14T17:43:35.197Z" },
    { provider: "deepseek", providerModelId: "deepseek-v4-pro", dimension: "output", price: 3.96, serviceTier: "peak", retrievedAt: "2026-09-14T17:43:35.197Z" },
  ]);
}

/** A minimal in-memory stand-in for the benchmark table, honouring the withholding uniqueness. */
function memorySql() {
  const rows = new Map<string, Record<string, unknown>>();
  const statements: string[] = [];
  let next = 0;
  return {
    rows,
    statements,
    async query(text: string, params: readonly unknown[]) {
      statements.push(text);
      if (/^\s*(begin|commit|rollback)\s*$/i.test(text)) return { rows: [] };
      if (text.includes("INSERT INTO pipeline.token_price_benchmarks")) {
        const withholding = text.includes("'withheld'");
        const key = withholding
          ? `w|${String(params[0])}|${String(params[2])}|${String(params[1])}`
          : `v|${String(params[0])}|${String(params[2])}|${String(params[6])}|${String(params[7])}|${String(params[1])}`;
        if (rows.has(key)) return { rows: [] };
        next += 1;
        rows.set(
          key,
          withholding
            ? {
                id: `row-${next}`,
                provider_slug: params[0],
                methodology_version: params[1],
                provider_model_id: null,
                display_name: null,
                calculation_status: "withheld",
                withheld_reason: params[2],
                price_usd_per_1m: null,
                input_observation_id: null,
                output_observation_id: null,
                input_price_usd_per_1m: null,
                output_price_usd_per_1m: null,
                input_observed_at: null,
                output_observed_at: null,
                calculated_at: params[3],
              }
            : {
                id: `row-${next}`,
                provider_slug: params[0],
                methodology_version: params[1],
                provider_model_id: params[2],
                display_name: params[2],
                calculation_status: "value",
                withheld_reason: null,
                price_usd_per_1m: params[5],
                input_observation_id: params[6],
                output_observation_id: params[7],
                input_price_usd_per_1m: params[8],
                output_price_usd_per_1m: params[9],
                input_observed_at: params[10],
                output_observed_at: params[11],
                calculated_at: params[12],
              },
        );
        return { rows: [{ id: `row-${next}` }] };
      }
      return { rows: [...rows.values()] };
    },
  };
}

describe("1. evaluating DeepSeek under 1.2 yields a withholding, not a price", () => {
  it("produces one persistable withholding carrying the canonical reason", () => {
    const [withholding, ...rest] = persistableWithholdings(deepseekCatalog(), TODAY);
    expect(rest).toEqual([]);
    expect(withholding).toMatchObject({
      providerSlug: "deepseek",
      reason: DEEPSEEK_REASON,
      methodologyVersion: "1.2",
    });
  });

  it("produces no numeric Token Price for DeepSeek", async () => {
    const sql = memorySql();
    const result = await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    expect(result.inserted).toBe(0);
    expect(result.points).toEqual([]);
    expect(result.withheld).toBe(1);
  });

  it("records the reason the register already states, not a new policy", () => {
    expect(withholdingFor("deepseek", TODAY)!.reason).toBe(DEEPSEEK_REASON);
  });

  it("dates the decision from the observations it was made about, never the clock", () => {
    const [withholding] = persistableWithholdings(deepseekCatalog(), TODAY);
    expect(withholding!.decidedAt).toBe("2026-09-14T17:43:35.197Z");
  });
});

describe("2. the decision is persisted durably", () => {
  it("writes exactly one withheld row and reads it back", async () => {
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const frozen = await loadPersistedBenchmarks(sql);
    expect(frozen).toHaveLength(1);
    expect(frozen[0]).toMatchObject({
      providerSlug: "deepseek",
      calculationStatus: "withheld",
      withheldReason: DEEPSEEK_REASON,
      methodologyVersion: "1.2",
      priceUsdPer1m: null,
      benchmarkModelId: null,
    });
  });

  it("names no model, because none is designated", async () => {
    // Writing a plausible DeepSeek model would manufacture the designation the methodology
    // declined to make.
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    expect((await loadPersistedBenchmarks(sql))[0]!.benchmarkModelId).toBeNull();
    expect(INSERT_WITHHOLDING_SQL).not.toMatch(/JOIN reference\.models/);
  });
});

describe("3. a withheld row can never become a public numeric benchmark", () => {
  it("carries no price and no legs", async () => {
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const row = (await loadPersistedBenchmarks(sql))[0]!;
    for (const field of [row.priceUsdPer1m, row.inputObservationId, row.outputObservationId, row.inputPriceUsdPer1m, row.outputPriceUsdPer1m]) {
      expect(field).toBeNull();
    }
    // Never a zero sentinel, which would be a price.
    expect(row.priceUsdPer1m).not.toBe(0);
  });

  it("is excluded from the public benchmark output", async () => {
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    expect(persistedBenchmarks(await loadPersistedBenchmarks(sql))).toEqual([]);
  });
});

describe("4. the read model distinguishes withheld from never evaluated", () => {
  it("returns the row rather than dropping it for having no model", async () => {
    // The inner join it used to carry would have written the decision and then hidden it.
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const frozen = await loadPersistedBenchmarks(sql);
    expect(frozen.some((row) => row.providerSlug === "deepseek")).toBe(true);
  });

  it("separates the two states that used to look identical", async () => {
    const withRow = memorySql();
    await persistProviderBenchmarks(withRow, deepseekCatalog(), "production", TODAY);
    const evaluated = await loadPersistedBenchmarks(withRow);
    const neverProcessed: PersistedBenchmarkRow[] = [];
    expect(evaluated.filter((r) => r.providerSlug === "deepseek")).toHaveLength(1);
    expect(neverProcessed.filter((r) => r.providerSlug === "deepseek")).toHaveLength(0);
  });
});

describe("5. the watchdog counts a recorded withholding as verified", () => {
  it("no longer reports DeepSeek as never_verified once the row exists", async () => {
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const report = verificationFreshness(await loadPersistedBenchmarks(sql), new Date("2026-09-16T07:00:00Z"));
    const deepseek = report.providers.find((p) => p.provider === "deepseek")!;
    expect(deepseek.state).toBe("current");
    expect(report.neverVerified).not.toContain("deepseek");
    expect(deepseek.latestStatus).toBe("withheld");
    expect(deepseek.withheldReason).toBe(DEEPSEEK_REASON);
  });

  it("still ages the decision, so a stale withholding comes up for review", async () => {
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const report = verificationFreshness(await loadPersistedBenchmarks(sql), new Date("2026-10-30T07:00:00Z"));
    expect(report.providers.find((p) => p.provider === "deepseek")!.state).toBe("review_due");
  });

  it("reported never_verified before the row existed, which is the bug being fixed", () => {
    const report = verificationFreshness([], new Date("2026-09-16T07:00:00Z"));
    expect(report.neverVerified).toContain("deepseek");
  });
});

describe("6. re-running is safe", () => {
  it("does not stack duplicate decisions", async () => {
    const sql = memorySql();
    const first = await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const second = await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const third = await persistProviderBenchmarks(sql, deepseekCatalog(), "production", "2026-10-01");
    expect(first.withheld).toBe(1);
    expect(second.withheld).toBe(0);
    expect(third.withheld).toBe(0);
    expect((await loadPersistedBenchmarks(sql)).filter((r) => r.calculationStatus === "withheld")).toHaveLength(1);
  });

  it("never updates or deletes an existing decision", async () => {
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const before = await loadPersistedBenchmarks(sql);
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    expect(await loadPersistedBenchmarks(sql)).toEqual(before);
    expect(sql.statements.some((row) => /^\s*UPDATE|^\s*DELETE/i.test(row))).toBe(false);
  });
});

describe("7 & 8. the rule is narrow", () => {
  it("writes no withholding for a provider with a normal designation", async () => {
    const sql = memorySql();
    const catalog = seedTokenReadCatalog([
      { provider: "anthropic", providerModelId: "claude-fable-5-1", dimension: "input", price: 10, retrievedAt: "2026-09-14T12:03:02.002Z" },
      { provider: "anthropic", providerModelId: "claude-fable-5-1", dimension: "output", price: 50, retrievedAt: "2026-09-14T12:03:02.002Z" },
    ]);
    const result = await persistProviderBenchmarks(sql, catalog, "production", TODAY);
    expect(result.withheld).toBe(0);
    expect(result.inserted).toBeGreaterThan(0);
  });

  it("writes no withholding for a provider nothing was collected for", () => {
    // Mistral is registered as designated_publication_blocked with nothing collected. A row
    // would assert a review that never happened, which is the same lie in the other direction.
    const mistral = TOKEN_BENCHMARK_WITHHELD.find((row) => row.providerSlug === "mistral")!;
    expect(mistral.state).toBe("designated_publication_blocked");
    expect(persistableWithholdings(deepseekCatalog(), TODAY).map((w) => w.providerSlug)).not.toContain("mistral");
    // Even on an empty catalog, nothing is recorded for a provider with no observations.
    expect(persistableWithholdings(seedTokenReadCatalog([]), TODAY)).toEqual([]);
  });

  it("records nothing before the withholding takes effect", () => {
    expect(persistableWithholdings(deepseekCatalog(), "2026-09-13")).toEqual([]);
  });
});

describe("9 & 10. the record is exact", () => {
  it("records the methodology version in force, and rewrites no earlier history", () => {
    expect(persistableWithholdings(deepseekCatalog(), TODAY)[0]!.methodologyVersion).toBe("1.2");
    // An earlier date resolves to the version in force then, never to today's.
    expect(persistableWithholdings(deepseekCatalog(), "2026-09-14")[0]!.methodologyVersion).toBe("1.2");
  });

  it("survives persistence and readback unchanged", async () => {
    const sql = memorySql();
    await persistProviderBenchmarks(sql, deepseekCatalog(), "production", TODAY);
    const row = (await loadPersistedBenchmarks(sql))[0]!;
    expect(row.withheldReason).toBe(DEEPSEEK_REASON);
    // A structured code, not prose: the explanation lives in the methodology.
    expect(row.withheldReason).toMatch(/^[A-Z_]+$/);
    expect(row.withheldReason!.length).toBeLessThan(40);
  });
});

describe("11. the repair touches one provider only", () => {
  it("adds DeepSeek's decision beside the existing values without disturbing them", async () => {
    const sql = memorySql();
    // The production shape: other providers already frozen, DeepSeek collected and absent.
    const catalog = seedTokenReadCatalog([
      { provider: "anthropic", providerModelId: "claude-fable-5-1", dimension: "input", price: 10, retrievedAt: "2026-09-14T12:03:02.002Z" },
      { provider: "anthropic", providerModelId: "claude-fable-5-1", dimension: "output", price: 50, retrievedAt: "2026-09-14T12:03:02.002Z" },
      { provider: "deepseek", providerModelId: "deepseek-v4-pro", dimension: "input", price: 0.66, serviceTier: "off_peak", retrievedAt: "2026-09-14T17:43:35.197Z" },
      { provider: "deepseek", providerModelId: "deepseek-v4-pro", dimension: "output", price: 1.98, serviceTier: "off_peak", retrievedAt: "2026-09-14T17:43:35.197Z" },
    ]);
    const first = await persistProviderBenchmarks(sql, catalog, "production", TODAY);
    const values = (await loadPersistedBenchmarks(sql)).filter((r) => r.calculationStatus === "value");
    const withheld = (await loadPersistedBenchmarks(sql)).filter((r) => r.calculationStatus === "withheld");
    expect(first.withheld).toBe(1);
    expect(withheld.map((r) => r.providerSlug)).toEqual(["deepseek"]);
    expect(values.every((r) => r.providerSlug !== "deepseek")).toBe(true);
    // The repair is a re-run of the ordinary freeze; a second one changes nothing.
    expect((await persistProviderBenchmarks(sql, catalog, "production", TODAY)).withheld).toBe(0);
  });
});

describe("12. publication still excludes DeepSeek", () => {
  it("serves other providers and never DeepSeek", async () => {
    const sql = memorySql();
    const catalog = seedTokenReadCatalog([
      { provider: "anthropic", providerModelId: "claude-fable-5-1", dimension: "input", price: 10, retrievedAt: "2026-09-14T12:03:02.002Z" },
      { provider: "anthropic", providerModelId: "claude-fable-5-1", dimension: "output", price: 50, retrievedAt: "2026-09-14T12:03:02.002Z" },
      { provider: "deepseek", providerModelId: "deepseek-v4-pro", dimension: "input", price: 0.66, serviceTier: "off_peak", retrievedAt: "2026-09-14T17:43:35.197Z" },
      { provider: "deepseek", providerModelId: "deepseek-v4-pro", dimension: "output", price: 1.98, serviceTier: "off_peak", retrievedAt: "2026-09-14T17:43:35.197Z" },
    ]);
    await persistProviderBenchmarks(sql, catalog, "production", TODAY);
    const published = persistedBenchmarks(await loadPersistedBenchmarks(sql));
    expect(published.map((s) => s.providerSlug)).not.toContain("deepseek");
    expect(published.map((s) => s.providerSlug)).toContain("anthropic");
  });
});
