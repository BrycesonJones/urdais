/**
 * Production readiness: a deployment verifies that the data is ready and never
 * manufactures the verification that produced it. The check only reads.
 */

import { describe, expect, it } from "vitest";

import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { seedWave1ResearchPreview } from "@/lib/tokens/preview-seed";
import { checkTokenProductionReadiness, expectedMigrationVersions } from "@/lib/tokens/production-readiness";
import { benchmarkPoints } from "@/lib/tokens/read/benchmark-series";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { legObservationIndex, listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { WAVE1_PROVIDERS, type ManualVerification, type Wave1Provider } from "@/lib/tokens/types";
import { verifyProviderProduction } from "@/lib/tokens/verify-production";
import { benchmarkProviders } from "@/lib/tokens/read/benchmark";

/** Only designated providers have legs to verify; a withheld one has none by design. */
const DESIGNATED = benchmarkProviders() as Wave1Provider[];

const MIGRATIONS = ["20260914030000_token_price_benchmarks.sql", "20260914040000_manual_verified_acquisition.sql"];
const VERIFICATION: Omit<ManualVerification, "sourceUrl"> = {
  verifiedBy: "Urdais operator",
  verifiedAt: "2026-09-14T06:00:00Z",
  evidence: "Read the provider's published API pricing page and confirmed the standard input and output rates.",
};

function verifiedStore(providers: readonly Wave1Provider[] = DESIGNATED): InMemoryTokenPricingStore {
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

/**
 * Frozen rows carrying the real observation ids the calculator consumed, which
 * is what the readiness check now resolves. `benchmarkPoints` is the same
 * function the freeze uses, so the lineage here is the lineage in the table.
 */
function frozenRowsFrom(store: InMemoryTokenPricingStore, mode: "production" | "research_preview", providers: readonly Wave1Provider[] = DESIGNATED) {
  const catalog = tokenReadCatalogFromStore(store);
  const points = benchmarkPoints(listVisibleTokenSeries(catalog, mode), "2026-09-14", legObservationIndex(catalog, mode));
  return points
    .filter((point) => (providers as readonly string[]).includes(point.providerSlug))
    .map((point, index) => ({
      id: `bench-${point.providerSlug}-${index + 1}`,
      provider_slug: point.providerSlug,
      methodology_version: point.methodologyVersion,
      provider_model_id: point.providerModelId,
      display_name: point.benchmarkModelName,
      calculation_status: "value",
      withheld_reason: null,
      price_usd_per_1m: point.priceUsdPer1m,
      input_observation_id: point.inputObservationId,
      output_observation_id: point.outputObservationId,
      input_price_usd_per_1m: point.inputPriceUsdPer1m,
      output_price_usd_per_1m: point.outputPriceUsdPer1m,
      input_observed_at: point.inputAt,
      output_observed_at: point.outputAt,
      calculated_at: point.time,
    }));
}

function frozenRowsFor(store: InMemoryTokenPricingStore, providers: readonly Wave1Provider[] = DESIGNATED) {
  return frozenRowsFrom(store, "production", providers);
}

describe("production readiness", () => {
  it("passes when every designated provider has a production-visible frozen benchmark", async () => {
    const store = verifiedStore();
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: frozenRowsFor(store) }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.ready).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.providers.map((row) => [row.providerSlug, row.productionVisible, row.priceUsdPer1m])).toEqual([
      ["alibaba", true, 4],
      ["anthropic", true, 30],
      ["google", true, 7],
      ["openai", true, 30],
      ["xai", true, 4],
    ]);
  });

  it("fails when one provider is missing, and says what to run", async () => {
    const present = DESIGNATED.filter((provider) => provider !== "xai");
    const store = verifiedStore(present);
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: frozenRowsFor(store, present) }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => tokenReadCatalogFromStore(store),
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
    const frozen = frozenRowsFrom(store, "research_preview");
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => tokenReadCatalogFromStore(store),
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
      loadCatalog: async () => tokenReadCatalogFromStore(store),
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
      loadCatalog: async () => tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.findings.some((row) => row.code === "SCHEMA_MISSING" && row.detail.includes("verification_evidence"))).toBe(true);
  });

  it("reports outstanding migrations against the repository", async () => {
    const store = verifiedStore();
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: frozenRowsFor(store), ledger: ["20260914030000"] }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => tokenReadCatalogFromStore(store),
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
    await checkTokenProductionReadiness({ sql, migrationFiles: MIGRATIONS, loadCatalog: async () => tokenReadCatalogFromStore(store), onDate: "2026-09-14" });
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
      loadCatalog: async () => tokenReadCatalogFromStore(empty),
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
      loadCatalog: async () => tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(WAVE1_PROVIDERS.map((provider) => WAVE1_SOURCE_INTERFACES[provider].registry)).toEqual(before);
  });
});

describe("frozen lineage is proved, not inferred", () => {
  /**
   * The case that motivated this: a benchmark frozen from research legs, and
   * production legs for the same provider acquired afterwards. The provider now
   * has production observations, but that frozen row's own lineage is still
   * research-only, and a frozen row is never recalculated.
   */
  function storeWithResearchThenProduction() {
    // Research observations, and a benchmark frozen from them.
    const researchStore = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(researchStore);
    const researchFrozen = frozenRowsFrom(researchStore, "research_preview", ["anthropic"]);
    const researchCatalog = tokenReadCatalogFromStore(researchStore);

    // Later, genuine production legs for the same provider. They are acquired
    // separately because append-only change detection keys on price alone: an
    // identical board re-read under a production retrieval is "unchanged" and
    // writes nothing, so the two sets are built independently and merged here.
    const productionStore = verifiedStore(["anthropic"]);
    const productionCatalog = tokenReadCatalogFromStore(productionStore);

    const catalog = {
      models: researchCatalog.models,
      observations: [...researchCatalog.observations, ...productionCatalog.observations],
      retrievals: [...researchCatalog.retrievals, ...productionCatalog.retrievals],
      sourceInterfaces: [...researchCatalog.sourceInterfaces, ...productionCatalog.sourceInterfaces],
    };
    return { catalog, researchFrozen, productionStore };
  }

  it("fails a frozen row whose legs are research-only, even though production legs now exist", async () => {
    const { catalog, researchFrozen } = storeWithResearchThenProduction();

    // The provider genuinely has production observations now.
    const productionSeries = listVisibleTokenSeries(catalog, "production");
    expect(productionSeries.some((row) => row.providerSlug === "anthropic")).toBe(true);

    // But the retained frozen row is the research-derived one.
    expect(researchFrozen).toHaveLength(1);
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: researchFrozen }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => catalog,
      onDate: "2026-09-14",
    });

    expect(report.ready).toBe(false);
    const finding = report.findings.find((row) => row.code === "BENCHMARK_NOT_PRODUCTION");
    expect(finding).toBeDefined();
    expect(finding!.detail).toContain("anthropic");
    expect(finding!.detail).toContain(researchFrozen[0]!.id);
    expect(report.providers.find((row) => row.providerSlug === "anthropic")).toMatchObject({ frozen: true, productionVisible: false });
  });

  it("passes the same provider once the frozen row's own legs are the production ones", async () => {
    const { catalog, productionStore } = storeWithResearchThenProduction();
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: frozenRowsFrom(productionStore, "production", ["anthropic"]) }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => catalog,
      onDate: "2026-09-14",
    });
    expect(report.findings.some((row) => row.code === "BENCHMARK_NOT_PRODUCTION")).toBe(false);
    expect(report.providers.find((row) => row.providerSlug === "anthropic")).toMatchObject({ frozen: true, productionVisible: true });
  });

  it("fails a frozen row whose leg observations no longer resolve at all", async () => {
    const store = verifiedStore(["anthropic"]);
    const rows = frozenRowsFor(store, ["anthropic"]).map((row) => ({ ...row, input_observation_id: "missing-observation" }));
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: rows }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(report.ready).toBe(false);
    expect(report.findings.some((row) => row.code === "BENCHMARK_NOT_PRODUCTION")).toBe(true);
  });

  it("passes when the provider also has a research-derived row, and says what else is there", async () => {
    const { catalog, researchFrozen, productionStore } = storeWithResearchThenProduction();
    const productionFrozen = frozenRowsFrom(productionStore, "production", ["anthropic"]);
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ frozen: [...researchFrozen, ...productionFrozen] }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => catalog,
      onDate: "2026-09-14",
    });
    const anthropic = report.providers.find((row) => row.providerSlug === "anthropic")!;
    // Production filters the research-derived row out, so it is a note and not a blocker.
    expect(anthropic.productionVisible).toBe(true);
    expect(report.findings.some((row) => row.code === "BENCHMARK_NOT_PRODUCTION" && row.detail.includes("anthropic"))).toBe(false);
    expect(report.notes.join(" ")).toContain(researchFrozen[0]!.id);
    expect(anthropic.priceUsdPer1m).toBe(productionFrozen[0]!.price_usd_per_1m);
  });

  it("does not recalculate or replace a frozen row while checking it", async () => {
    const store = verifiedStore(["anthropic"]);
    const rows = frozenRowsFor(store, ["anthropic"]);
    const before = JSON.stringify(rows);
    const sql = readOnlySql({ frozen: rows });
    await checkTokenProductionReadiness({
      sql,
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => tokenReadCatalogFromStore(store),
      onDate: "2026-09-14",
    });
    expect(JSON.stringify(rows)).toBe(before);
    expect(sql.statements.every((statement) => /^\s*select/i.test(statement))).toBe(true);
  });
});

describe("schema checks run before the schema-dependent catalog load", () => {
  it("reports SCHEMA_MISSING without calling the catalog loader", async () => {
    let loaded = 0;
    const report = await checkTokenProductionReadiness({
      // An older database without the manual-acquisition columns.
      sql: readOnlySql({ columns: [] }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => {
        loaded += 1;
        throw new Error(`column "acquisition_mode" does not exist`);
      },
      onDate: "2026-09-14",
    });
    expect(loaded).toBe(0);
    expect(report.ready).toBe(false);
    const missing = report.findings.filter((row) => row.code === "SCHEMA_MISSING");
    expect(missing.map((row) => row.detail).join(" ")).toContain("acquisition_mode");
    expect(missing.map((row) => row.detail).join(" ")).toContain("verification_evidence");
    for (const finding of missing) expect(finding.remedy).toContain("apply the outstanding migrations");
    // The report still names every designated provider, with nothing claimed about them.
    expect(report.providers.map((row) => row.providerSlug)).toEqual(["alibaba", "anthropic", "google", "openai", "xai"]);
    expect(report.providers.every((row) => !row.frozen && !row.productionVisible)).toBe(true);
  });

  it("reports a missing benchmark table the same way, without loading the catalog", async () => {
    let loaded = 0;
    const report = await checkTokenProductionReadiness({
      sql: readOnlySql({ tables: ["pipeline.token_price_observations"] }),
      migrationFiles: MIGRATIONS,
      loadCatalog: async () => {
        loaded += 1;
        throw new Error("relation pipeline.token_price_benchmarks does not exist");
      },
      onDate: "2026-09-14",
    });
    expect(loaded).toBe(0);
    expect(report.findings.some((row) => row.code === "SCHEMA_MISSING" && row.detail.includes("token_price_benchmarks"))).toBe(true);
  });
});
