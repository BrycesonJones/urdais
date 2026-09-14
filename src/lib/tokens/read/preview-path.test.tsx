import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/detailed-market-chart", () => ({ DetailedMarketChart: () => null }));

import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { TokenPriceSection } from "@/components/model-economics/token-price-section";
import { findMarket } from "@/data/mock/market-detail";
import { seedWave1ResearchPreview, seedWave1ResearchPreviewDatabase } from "@/lib/tokens/preview-seed";
import { validatePublicTokenPricesResponse } from "@/lib/tokens/read/api-contract";
import { WAVE1_MODELS, WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { TOKEN_BENCHMARK_PENDING_NOTE } from "@/lib/tokens/read/benchmark";
import { benchmarkInstrumentsFromSeries, tokenInstrumentsFromSeries, withTokenInstruments } from "@/lib/tokens/read/instruments";
import { publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { MAX_COMPARISONS } from "@/components/market-detail/use-instrument-chart";
import { tokenVerificationReports } from "@/lib/tokens/read/verification";
import { tokenReadCatalogFromStore, visibleTokenBenchmarks, visibleTokenPricesResponse } from "@/lib/tokens/read/load";
import {
  isProductionRuntime,
  observationIsPublicable,
  tokenVisibilityMode,
} from "@/lib/tokens/read/publication";
import { loadTokenReadCatalogFromSql, persistTokenReadCatalog, type TokenSqlExecutor } from "@/lib/tokens/read/sql";
import { listPublicTokenSeries, listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

function previewCatalog() {
  const store = new InMemoryTokenPricingStore();
  seedWave1ResearchPreview(store);
  return tokenReadCatalogFromStore(store);
}

function modelRows() {
  return WAVE1_MODELS.map((model) => ({
    id: model.id,
    provider_model_id: model.providerModelId,
    display_name: model.displayName,
    model_family: model.modelFamily,
    version: model.version,
    lifecycle_status: model.lifecycleStatus,
    provider_slug: model.providerSlug,
  }));
}

function interfaceRows() {
  return (["anthropic", "xai", "openai"] as const).map((provider) => {
    const source = WAVE1_SOURCE_INTERFACES[provider];
    return {
      id: source.id,
      slug: source.slug,
      canonical_url: source.canonicalUrl,
      production_access_state: source.registry.productionAccessState,
      terms_review_state: source.registry.termsReviewState,
      data_use_terms_state: source.registry.dataUseTermsState,
      written_agreement_required: source.registry.writtenAgreementRequired,
      provider_slug: provider,
    };
  });
}

function memorySql(): TokenSqlExecutor & {
  retrievals: Map<string, unknown[]>;
  observations: Map<string, unknown[]>;
  statements: string[];
} {
  const retrievals = new Map<string, unknown[]>();
  const observations = new Map<string, unknown[]>();
  const statements: string[] = [];
  return {
    retrievals,
    observations,
    statements,
    async query(text, params) {
      statements.push(text);
      const sql = text.replace(/\s+/g, " ");
      if (/^\s*(begin|commit|rollback)\s*$/i.test(text)) return { rows: [] };
      if (sql.includes("FROM reference.models")) return { rows: modelRows() };
      if (sql.includes("FROM reference.source_interfaces")) return { rows: interfaceRows() };
      if (sql.includes("INSERT INTO pipeline.source_retrievals")) {
        const key = String(params[2]);
        if (retrievals.has(key)) return { rows: [] };
        retrievals.set(key, [...params]);
        return { rows: [{ id: params[0] }] };
      }
      if (sql.includes("INSERT INTO pipeline.token_price_observations")) {
        const key = [params[12], params[1], params[2], params[7] ?? "", params[8], params[9] ?? "", params[10] ?? ""].join("|");
        if (observations.has(key)) return { rows: [] };
        observations.set(key, [...params]);
        return { rows: [{ id: params[0] }] };
      }
      if (sql.includes("FROM pipeline.token_price_observations")) {
        return {
          rows: [...observations.values()].map((row) => {
            const model = WAVE1_MODELS.find((item) => item.id === row[1])!;
            return {
              id: row[0],
              model_id: row[1],
              pricing_dimension: row[2],
              source_native_price: row[3],
              source_native_currency: row[4],
              source_native_denominator_tokens: row[5],
              canonical_price_usd_per_1m: row[6],
              region: row[7],
              service_tier: row[8],
              context_tier: row[9],
              cache_ttl: row[10],
              source_interface_id: row[11],
              source_retrieval_id: row[12],
              source_effective_at: row[13],
              retrieved_at: row[14],
              provider_model_id: model.providerModelId,
              provider_slug: model.providerSlug,
            };
          }),
        };
      }
      if (sql.includes("FROM pipeline.source_retrievals")) {
        const wanted = new Set((params[0] as string[]) ?? []);
        return {
          rows: [...retrievals.values()]
            .filter((row) => wanted.has(String(row[0])))
            .map((row) => {
              const source = Object.values(WAVE1_SOURCE_INTERFACES).find((item) => item.id === row[1]);
              return {
                id: row[0],
                source_interface_id: row[1],
                idempotency_key: row[2],
                requested_at: row[3],
                completed_at: row[4],
                request_method: row[5],
                request_url: row[6],
                request_parameters: JSON.parse(String(row[7])),
                response_status: row[8],
                response_content_type: row[9],
                response_hash: row[10],
                response_byte_length: row[11],
                record_count: row[13],
                enumeration_assessment: row[14],
                enumeration_evidence: row[15],
                collector_identity: row[16],
                retrieval_purpose: row[17],
                permission_grant_id: row[18],
                source_interface_slug: source?.slug,
              };
            }),
        };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

describe("Wave-1 research fixture ingest", () => {
  it("produces canonical Anthropic, xAI, and OpenAI observations", () => {
    const catalog = previewCatalog();
    const anthropic = catalog.observations.filter((row) => row.providerSlug === "anthropic");
    const xai = catalog.observations.filter((row) => row.providerSlug === "xai");
    const openai = catalog.observations.filter((row) => row.providerSlug === "openai");
    expect(anthropic.length).toBeGreaterThan(0);
    expect(xai.length).toBeGreaterThan(0);
    expect(openai.length).toBeGreaterThan(0);
    expect(anthropic.every((row) => catalog.retrievals.find((r) => r.id === row.retrievalId)?.retrievalPurpose === "research")).toBe(true);
    expect(
      anthropic.find((row) => row.providerModelId === "claude-sonnet-5" && row.pricingDimension === "input" && row.serviceTier === "standard" && row.region == null)
        ?.canonicalPriceUsdPer1m,
    ).toBe(2);
    expect(
      xai.find((row) => row.providerModelId === "grok-4.6" && row.pricingDimension === "input" && row.contextTier === "prompt_lt_200k")
        ?.canonicalPriceUsdPer1m,
    ).toBe(2);
    expect(
      openai.find((row) => row.providerModelId === "gpt-5.6-sol" && row.pricingDimension === "input" && row.contextTier === "short_context" && row.serviceTier === "standard")
        ?.canonicalPriceUsdPer1m,
    ).toBe(4);
  });
});

describe("database loader and visibility", () => {
  it("retrieves persisted research observations and exposes them only in preview", async () => {
    const sql = memorySql();
    const first = await seedWave1ResearchPreviewDatabase(sql);
    expect(first.written.observationsInserted).toBeGreaterThan(0);
    const second = await seedWave1ResearchPreviewDatabase(sql);
    expect(second.written.observationsInserted).toBe(0);
    expect(second.written.retrievalsInserted).toBe(0);

    const loaded = await loadTokenReadCatalogFromSql(sql);
    expect(loaded.observations.length).toBe(first.catalog.observations.length);
    expect(sql.statements.some((text) => /production_access_state\s*=/.test(text))).toBe(false);
    expect(sql.statements.join("\n")).not.toMatch(/UPDATE reference\.source_interfaces/i);

    const preview = listVisibleTokenSeries(loaded, "research_preview");
    const production = listPublicTokenSeries(loaded);
    expect(preview.length).toBeGreaterThan(0);
    expect(production).toEqual([]);
    expect(new Set(preview.map((row) => row.providerSlug))).toEqual(new Set(["anthropic", "openai", "xai"]));
    expect(preview.every((row) => row.history.length === 1)).toBe(true);
    expect(preview.every((row) => row.percentageChange === null)).toBe(true);
    expect(preview.some((row) => row.seriesId.startsWith("tokens-anthropic") || row.displayName === "Anthropic")).toBe(false);

    for (const observation of loaded.observations) {
      const retrieval = loaded.retrievals.find((row) => row.id === observation.retrievalId);
      const source = loaded.sourceInterfaces.find((row) => row.id === observation.sourceInterfaceId);
      expect(observationIsPublicable(observation, retrieval, source)).toBe(false);
    }
  });

  it("persist path writes observations only and never updates registry rights", async () => {
    const sql = memorySql();
    await persistTokenReadCatalog(sql, previewCatalog());
    expect(sql.statements.some((text) => text.includes("INSERT INTO pipeline.source_retrievals"))).toBe(true);
    expect(sql.statements.some((text) => text.includes("INSERT INTO pipeline.token_price_observations"))).toBe(true);
    expect(sql.statements.join("\n")).not.toMatch(/UPDATE\s+reference\./i);
    expect(sql.statements.some((text) => /production_access_state\s*=/.test(text))).toBe(false);
  });
});

describe("research-preview mode cannot activate in production", () => {
  it("locks visibility and database defaults to production", () => {
    expect(isProductionRuntime({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: "production", NODE_ENV: "development" })).toBe(true);
    expect(tokenVisibilityMode({ NODE_ENV: "production", URDAIS_TOKEN_RESEARCH_PREVIEW: "1" })).toBe("production");
    expect(tokenVisibilityMode({ VERCEL_ENV: "production" })).toBe("production");
    expect(tokenVisibilityMode({ NODE_ENV: "development" })).toBe("research_preview");
    expect(resolveTokenDatabaseUrl({ NODE_ENV: "production", PGHOST: "localhost" })).toBeNull();
    expect(resolveTokenDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "postgresql://postgres@localhost/db" })).toBe(
      "postgresql://postgres@localhost/db",
    );
    expect(resolveTokenDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: "postgresql://postgres@localhost/db" })).toBeNull();
  });

  it("keeps the production API contract empty for research catalogs", () => {
    const catalog = previewCatalog();
    const production = visibleTokenPricesResponse(catalog, { NODE_ENV: "production" });
    const preview = visibleTokenPricesResponse(catalog, { NODE_ENV: "development" });
    expect(production).toEqual({ series: [] });
    expect(validatePublicTokenPricesResponse(production)).toEqual([]);
    expect(preview.series.length).toBeGreaterThan(0);
    expect(validatePublicTokenPricesResponse(preview)).toEqual([]);
    expect(JSON.stringify(preview)).not.toMatch(/research_usable|under_review|parserId|responseBody/);
  });
});

describe("Tokens and Model Economics preview UI", () => {
  it("ingests Wave-1 canonical observations for every provider, without publishing a market", () => {
    const series = listVisibleTokenSeries(previewCatalog(), "research_preview");
    expect(series.length).toBeGreaterThan(0);
    const reports = tokenVerificationReports(series);
    expect(reports.map((row) => row.providerSlug).sort()).toEqual(["anthropic", "openai", "xai"]);
    expect(reports.every((row) => row.models > 0 && row.observations > 0)).toBe(true);
    // Recorded observations only: one point per series, no synthetic intraday.
    const instruments = tokenInstrumentsFromSeries(series);
    expect(instruments.every((row) => row.series.daily.length === 1 && row.series.intraday.length === 0)).toBe(true);
    expect(instruments.some((row) => row.id === "tokens-anthropic" || row.shortLabel === "Anthropic")).toBe(false);
  });

  it("shows the Tokens family with the benchmark blocker and no model or dimension menus", () => {
    const market = withTokenInstruments(findMarket("ucpi")!, []);
    render(<MarketDetailPage market={market} researchPreview={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Tokens" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tokens");
    expect(screen.getByText(TOKEN_BENCHMARK_PENDING_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Model/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pricing dimension/ })).toBeNull();
    expect(screen.queryByText(/· Input$/)).toBeNull();
    expect(screen.queryByText("per 1M input tokens")).toBeNull();
    expect(screen.queryByText("Demo data")).toBeNull();
    expect(screen.queryByText("$9.00")).toBeNull();
  });

  it("keeps the Model Economics Token Price section rendered with the blocker rather than pricing controls", () => {
    render(<TokenPriceSection instruments={[]} researchPreview={true} />);
    expect(screen.getByRole("heading", { name: "Token Price" })).toBeInTheDocument();
    expect(screen.getByText(TOKEN_BENCHMARK_PENDING_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Model/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pricing dimension/ })).toBeNull();
  });

  it("does not show the research-preview indicator when the flag is off", () => {
    const instruments = tokenInstrumentsFromSeries(listVisibleTokenSeries(previewCatalog(), "research_preview"));
    const market = withTokenInstruments(findMarket("ucpi")!, instruments);
    render(<MarketDetailPage market={market} researchPreview={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Tokens" }));
    expect(screen.queryByText("Research preview")).toBeNull();
  });
});

describe("source registry is unchanged", () => {
  it("leaves Wave-1 interfaces research_usable / under_review", () => {
    expect(WAVE1_SOURCE_INTERFACES.anthropic.registry).toMatchObject({
      productionAccessState: "research_usable",
      termsReviewState: "under_review",
      dataUseTermsState: "under_review",
    });
    expect(WAVE1_SOURCE_INTERFACES.xai.registry.productionAccessState).toBe("research_usable");
    expect(WAVE1_SOURCE_INTERFACES.openai.registry.productionAccessState).toBe("research_usable");
  });
});

describe("Token Price benchmark on the product surfaces", () => {
  function benchmarkInstruments() {
    return benchmarkInstrumentsFromSeries(publishableBenchmarks(listVisibleTokenSeries(previewCatalog(), "research_preview"), "2026-09-14"));
  }

  it("shows one provider benchmark market with no model, dimension, cache, tier or region control", () => {
    const market = withTokenInstruments(findMarket("ucpi")!, benchmarkInstruments());
    render(<MarketDetailPage market={market} researchPreview={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Tokens" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Anthropic");
    expect(screen.getByText("$6.00")).toBeInTheDocument();
    expect(screen.getByText("per 1M tokens")).toBeInTheDocument();
    expect(screen.getByText(/Urdais Token Price · Claude Sonnet 5/)).toBeInTheDocument();
    expect(screen.getByText("Research preview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Model/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pricing dimension/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cache|Service tier|Context|Region/ })).toBeNull();
    expect(screen.queryByText("per 1M input tokens")).toBeNull();
    expect(screen.queryByText("per 1M output tokens")).toBeNull();
    expect(screen.queryByText("Demo data")).toBeNull();
  });

  it("compares provider benchmark against provider benchmark, capped at four series", () => {
    const instruments = benchmarkInstruments();
    expect(instruments).toHaveLength(3);
    expect(MAX_COMPARISONS).toBe(3);
    for (const instrument of instruments) {
      expect(instrument.comparisons.map((row) => row.label).sort()).toEqual(
        instruments.filter((row) => row.id !== instrument.id).map((row) => row.shortLabel).sort(),
      );
    }
  });

  it("gives Model Economics the same provider benchmark values, with only a lab selector", () => {
    render(<TokenPriceSection instruments={benchmarkInstruments()} researchPreview={true} />);
    expect(screen.getByRole("heading", { name: "Token Price" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Provider/ })).toHaveTextContent("Anthropic");
    expect(screen.getByText("$6.00")).toBeInTheDocument();
    expect(screen.getByText("per 1M tokens")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Model/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pricing dimension/ })).toBeNull();
  });

  it("publishes no benchmark in production even with research observations present", () => {
    expect(visibleTokenBenchmarks(previewCatalog(), { NODE_ENV: "production" })).toEqual([]);
    expect(visibleTokenBenchmarks(previewCatalog(), { NODE_ENV: "development" })).toHaveLength(3);
  });
});
