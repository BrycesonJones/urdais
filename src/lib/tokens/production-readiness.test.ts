/**
 * Production readiness: a deployment verifies that the data is ready and never
 * manufactures the verification that produced it. The check only reads.
 */

import { describe, expect, it } from "vitest";

import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { seedWave1ResearchPreview } from "@/lib/tokens/preview-seed";
import { checkTokenProductionReadiness, expectedMigrationVersions } from "@/lib/tokens/production-readiness";
import { publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { WAVE1_PROVIDERS, type ManualVerification, type Wave1Provider } from "@/lib/tokens/types";
import { verifyProviderProduction } from "@/lib/tokens/verify-production";

const MIGRATIONS = ["20260914030000_token_price_benchmarks.sql", "20260914040000_manual_verified_acquisition.sql"];
const VERIFICATION: Omit<ManualVerification, "sourceUrl"> = {
  verifiedBy: "Urdais operator",
  verifiedAt: "2026-09-14T06:00:00Z",
  evidence: "Read the provider's published API pricing page and confirmed the standard input and output rates.",
};

function verifiedStore(providers: readonly Wave1Provider[] = WAVE1_PROVIDERS): InMemoryTokenPricingStore {
  const store = new InMemoryTokenPricingStore();
  for (const provider of providers) {
    verifyProviderProduction({
      provider,
      verification: { ...VERIFICATION, sourceUrl: WAVE1_SOURCE_INTERFACES[provider].canonicalUrl },
      store,
    });
  }
  return store;
}

/** A read-only executor that records every statement, so a write would be visible. */
function readOnlySql(options: { tables?: string[]; columns?: string[]; ledger?: string[]; frozen?: Record<string, unknown>[] } = {}) {
  const statements: string[] = [];
  const tables = options.tables ?? ["pipeline.token_price_observations", "pipeline.token_price_benchmarks"];
  const columns = options.columns ?? ["acquisition_mode", "verification_evidence"];
  return {
    statements,
    async query(text: string) {
      statements.push(text.trim().split("\n")[0]!);
      if (text.includes("information_schema.tables")) return { rows: tables.map((name) => ({ name })) };
      if (text.includes("information_schema.columns")) return { rows: columns.map((column) => ({ table_name: "source_retrievals", column_name: column })) };
      if (text.includes("supabase_migrations.schema_migrations")) {
        if (!options.ledger) throw new Error("no ledger");
        return { rows: options.ledger.map((version) => ({ version })) };
      }
      if (text.includes("FROM pipeline.token_price_benchmarks")) return { rows: options.frozen ?? [] };
      throw new Error(`unexpected SQL: ${text}`);
    },
  };
}

function frozenRowsFor(store: InMemoryTokenPricingStore, providers: readonly Wave1Provider[] = WAVE1_PROVIDERS) {
  const series = publishableBenchmarks(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "production"), "2026-09-14");
  return series
    .filter((row) => (providers as readonly string[]).includes(row.providerSlug))
    .map((row) => ({
      id: `bench-${row.providerSlug}`,
      provider_slug: row.providerSlug,
      methodology_version: row.methodologyVersion,
      provider_model_id: row.benchmarkModelId,
      display_name: row.benchmarkModelName,
      calculation_status: "value",
      withheld_reason: null,
      price_usd_per_1m: row.priceUsdPer1m,
      input_observation_id: "i",
      output_observation_id: "o",
      input_price_usd_per_1m: 1,
      output_price_usd_per_1m: 1,
      input_observed_at: row.updatedAt,
      output_observed_at: row.updatedAt,
      calculated_at: row.updatedAt,
    }));
}

describe("production readiness", () => {
  it("passes when every designated provider has a production-visible frozen benchmark", async () => {
    const store = verifiedStore();
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: frozenRowsFor(store) }),
      migrationFiles: MIGRATIONS,
      catalog: tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.ready).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.providers.map((row) => [row.providerSlug, row.productionVisible, row.priceUsdPer1m])).toEqual([
      ["anthropic", true, 30],
      ["openai", true, 30],
      ["xai", true, 4],
    ]);
  });

  it("fails when one provider is missing, and says what to run", async () => {
    const store = verifiedStore(["anthropic", "openai"]);
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: frozenRowsFor(store, ["anthropic", "openai"]) }),
      migrationFiles: MIGRATIONS,
      catalog: tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.ready).toBe(false);
    const missing = report.findings.filter((row) => row.code === "BENCHMARK_MISSING");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.detail).toContain("xai");
    expect(missing[0]!.remedy).toContain("tokens:verify-production");
  });

  it("fails on research-only data even when a benchmark is frozen", async () => {
    const store = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(store);
    const research = publishableBenchmarks(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "research_preview"), "2026-09-14");
    const frozen = research.map((row) => ({
      id: `bench-${row.providerSlug}`,
      provider_slug: row.providerSlug,
      methodology_version: row.methodologyVersion,
      provider_model_id: row.benchmarkModelId,
      display_name: row.benchmarkModelName,
      calculation_status: "value",
      withheld_reason: null,
      price_usd_per_1m: row.priceUsdPer1m,
      input_observation_id: "i",
      output_observation_id: "o",
      input_price_usd_per_1m: 1,
      output_price_usd_per_1m: 1,
      input_observed_at: row.updatedAt,
      output_observed_at: row.updatedAt,
      calculated_at: row.updatedAt,
    }));
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen }),
      migrationFiles: MIGRATIONS,
      catalog: tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.ready).toBe(false);
    expect(report.findings.every((row) => row.code === "BENCHMARK_NOT_PRODUCTION")).toBe(true);
    expect(report.providers.every((row) => row.frozen && !row.productionVisible)).toBe(true);
  });

  it("fails when the schema is missing the benchmark table", async () => {
    const store = verifiedStore();
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ tables: ["pipeline.token_price_observations"] }),
      migrationFiles: MIGRATIONS,
      catalog: tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.ready).toBe(false);
    expect(report.findings.some((row) => row.code === "SCHEMA_MISSING" && row.detail.includes("token_price_benchmarks"))).toBe(true);
  });

  it("fails when the acquisition columns are missing", async () => {
    const store = verifiedStore();
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ columns: ["acquisition_mode"], frozen: frozenRowsFor(store) }),
      migrationFiles: MIGRATIONS,
      catalog: tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.findings.some((row) => row.code === "SCHEMA_MISSING" && row.detail.includes("verification_evidence"))).toBe(true);
  });

  it("reports outstanding migrations against the repository", async () => {
    const store = verifiedStore();
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: frozenRowsFor(store), ledger: ["20260914030000"] }),
      migrationFiles: MIGRATIONS,
      catalog: tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.ready).toBe(false);
    expect(report.pendingMigrations).toEqual(["20260914040000"]);
    const outdated = report.findings.find((row) => row.code === "SCHEMA_OUTDATED")!;
    expect(outdated.remedy).toContain("apply the outstanding migrations");
    expect(expectedMigrationVersions(MIGRATIONS)).toEqual(["20260914030000", "20260914040000"]);
  });

  it("writes nothing: every statement it issues is a read", async () => {
    const store = verifiedStore();
    const sql = readOnlySql({ frozen: frozenRowsFor(store) });
    await checkTokenProductionReadiness({ sql, migrationFiles: MIGRATIONS, catalog: tokenReadCatalogFromStore(store), onDate: "2026-09-14" });
    expect(sql.statements.length).toBeGreaterThan(0);
    for (const statement of sql.statements) {
      expect(statement).toMatch(/^\s*select/i);
      expect(statement).not.toMatch(/insert|update|delete|begin|commit/i);
    }
  });

  it("does not synthesize a verification: an unready database stays unready", async () => {
    const empty = new InMemoryTokenPricingStore();
    const sql = readOnlySql({ frozen: [] });
    const report = await checkTokenProductionReadiness({
      sql,
      migrationFiles: MIGRATIONS,
      catalog: tokenReadCatalogFromStore(empty),
      onDate: "2026-09-14",
    });
    expect(report.ready).toBe(false);
    expect(report.providers.every((row) => !row.frozen)).toBe(true);
    expect(sql.statements.some((row) => /insert/i.test(row))).toBe(false);
  });

  it("leaves every source permission state untouched", async () => {
    const before = WAVE1_PROVIDERS.map((provider) => ({ ...WAVE1_SOURCE_INTERFACES[provider].registry }));
    const store = verifiedStore();
    await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: frozenRowsFor(store) }),
      migrationFiles: MIGRATIONS,
      catalog: tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(WAVE1_PROVIDERS.map((provider) => WAVE1_SOURCE_INTERFACES[provider].registry)).toEqual(before);
  });
});
