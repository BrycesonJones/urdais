/**
 * Bootstrap Wave-1 research-preview observations into the local database.
 *
 *   npm run tokens:preview:seed
 *
 * Uses the reviewed fixtures and the research ingest path. Idempotent.
 * Does not mark any source production-approved.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { seedWave1ResearchPreviewDatabase } from "@/lib/tokens/preview-seed";

function quote(
  series: ReturnType<typeof listVisibleTokenSeries>,
  provider: string,
  model: string,
  dimension: string,
  extra: { serviceTier?: string; contextTier?: string | null; cacheTtl?: string | null } = {},
) {
  return series.find(
    (row) =>
      row.providerSlug === provider &&
      row.providerModelId === model &&
      row.pricingDimension === dimension &&
      row.serviceTier === (extra.serviceTier ?? "standard") &&
      row.contextTier === (extra.contextTier ?? null) &&
      row.cacheTtl === (extra.cacheTtl ?? null),
  );
}

async function main(): Promise<void> {
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) {
    throw new Error("No database URL. Research preview cannot run in a production runtime.");
  }

  const sql = await createTokenSqlExecutor(url);
  try {
    const { reports, written, catalog } = await seedWave1ResearchPreviewDatabase(sql);
    const series = listVisibleTokenSeries(catalog, "research_preview");
    const production = listVisibleTokenSeries(catalog, "production");
    const providers = [...new Set(series.map((row) => row.providerSlug))].sort();
    const models = [...new Set(series.map((row) => `${row.providerSlug}:${row.providerModelId}`))].sort();

    const summary = {
      ok: true,
      database: url.replace(/:[^:@/]+@/, ":***@"),
      written,
      ingest: reports.map((report) => ({
        provider: report.provider,
        mode: report.mode,
        retrievalId: report.retrievalId,
        quotesParsed: report.quotesParsed,
        observationsInserted: report.observationsInserted,
        alreadyPresentForRetrieval: report.alreadyPresentForRetrieval,
      })),
      previewSeries: series.length,
      productionSeries: production.length,
      providers,
      models,
      representative: {
        anthropic: {
          modelId: "claude-sonnet-5",
          input: quote(series, "anthropic", "claude-sonnet-5", "input")?.priceUsdPer1m ?? null,
          output: quote(series, "anthropic", "claude-sonnet-5", "output")?.priceUsdPer1m ?? null,
          cacheRead: quote(series, "anthropic", "claude-sonnet-5", "cache_read")?.priceUsdPer1m ?? null,
          cacheWrite5m: quote(series, "anthropic", "claude-sonnet-5", "cache_write", { cacheTtl: "5m" })?.priceUsdPer1m ?? null,
          cacheWrite1h: quote(series, "anthropic", "claude-sonnet-5", "cache_write", { cacheTtl: "1h" })?.priceUsdPer1m ?? null,
        },
        xai: {
          modelId: "grok-4.6",
          input: quote(series, "xai", "grok-4.6", "input", { contextTier: "prompt_lt_200k" })?.priceUsdPer1m ?? null,
          cachedInput: quote(series, "xai", "grok-4.6", "cached_input", { contextTier: "prompt_lt_200k" })?.priceUsdPer1m ?? null,
          output: quote(series, "xai", "grok-4.6", "output", { contextTier: "prompt_lt_200k" })?.priceUsdPer1m ?? null,
          longContextInput: quote(series, "xai", "grok-4.6", "input", { contextTier: "prompt_gte_200k" })?.priceUsdPer1m ?? null,
        },
        openai: {
          modelId: "gpt-5.6-sol",
          input: quote(series, "openai", "gpt-5.6-sol", "input", { contextTier: "short_context" })?.priceUsdPer1m ?? null,
          cachedInput: quote(series, "openai", "gpt-5.6-sol", "cached_input", { contextTier: "short_context" })?.priceUsdPer1m ?? null,
          output: quote(series, "openai", "gpt-5.6-sol", "output", { contextTier: "short_context" })?.priceUsdPer1m ?? null,
          batchInput: quote(series, "openai", "gpt-5.6-sol", "input", { serviceTier: "batch", contextTier: "short_context" })?.priceUsdPer1m ?? null,
          fastInput: quote(series, "openai", "gpt-5.6-sol", "input", { serviceTier: "fast", contextTier: "short_context" })?.priceUsdPer1m ?? null,
        },
      },
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(message);
  console.error("Start the local database with `npm run db:start` and `npm run db:migrate`, then retry.");
  process.exit(1);
});
