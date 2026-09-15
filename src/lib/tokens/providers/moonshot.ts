/**
 * Moonshot AI (Kimi) first-party pricing parser.
 *
 * Source: platform.moonshot.ai/docs/pricing, which serves the international
 * Kimi API Platform list at platform.kimi.ai
 * Parser id: tokens.moonshot.pricing.html.v1
 *
 * Two features of this catalog matter.
 *
 * Input is published twice, on a cache hit and on a cache miss. The cache-miss
 * figure is the ordinary input rate: it is what a request pays when nothing is
 * reused, which is what the standardized workload describes. The cache-hit
 * figure is a cache rate and is recorded as cached input, never blended into
 * input.
 *
 * Moonshot publishes two separate first-party lists, an international one in
 * USD and a China one in CNY, at different numbers for the same models. There
 * is no single global rate, so each observation carries the scope it was quoted
 * under and the two lists are never mixed. Which scope Urdais publishes from is
 * a designation, not a parser decision.
 */

import { modelByNativeId } from "@/lib/tokens/catalog";
import { cellAt, extractHtmlTables, headerIndex, parseUsdTokenPrice, type HtmlTable } from "@/lib/tokens/html-tables";
import { assertStableModelIdentity, looksLikeLatestPointer, type ModelIdentity } from "@/lib/tokens/identity";
import { assertDistinctObservationKeys, createSourceQuote, type TokenPriceQuote } from "@/lib/tokens/observation";
import type { SourcePricingDimension } from "@/lib/tokens/dimensions";
import { MalformedPricingSourceError, type PricingDiagnostic, type ProviderParseResult } from "@/lib/tokens/types";

export const MOONSHOT_PARSER_ID = "tokens.moonshot.pricing.html.v1";
export const MOONSHOT_SOURCE_SLUG = "moonshot-kimi-api-pricing-docs";
const PROVIDER = "moonshot";

/** The scope this list is quoted under, normalized for the region facet. */
export const MOONSHOT_INTERNATIONAL_REGION = "international";

function regionFor(scope: string): string {
  const normalized = scope.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) throw new MalformedPricingSourceError("Moonshot row has no deployment scope");
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function identityFor(nativeId: string): ModelIdentity {
  if (looksLikeLatestPointer(nativeId)) {
    throw new MalformedPricingSourceError(`Moonshot id '${nativeId}' is a latest pointer, not a stable identity`);
  }
  const seeded = modelByNativeId(PROVIDER, nativeId);
  if (!seeded) throw new MalformedPricingSourceError(`unmapped Moonshot model id '${nativeId}'`);
  const identity: ModelIdentity = {
    providerSlug: seeded.providerSlug,
    providerModelId: seeded.providerModelId,
    displayName: seeded.displayName,
    modelFamily: seeded.modelFamily,
    version: seeded.version,
    lifecycleStatus: seeded.lifecycleStatus,
    identityKind: "stable",
  };
  assertStableModelIdentity(identity);
  return identity;
}

function isPricingGrid(table: HtmlTable): boolean {
  const h = table.headers;
  return (
    h.includes("model") &&
    h.some((x) => x.includes("input price") && x.includes("cache miss")) &&
    h.some((x) => x.includes("output price"))
  );
}

export function parseMoonshotPricing(html: string, retrievedAt: string): ProviderParseResult {
  if (!html.trim()) throw new MalformedPricingSourceError("empty Moonshot pricing body");
  const tables = extractHtmlTables(html);
  const grid = tables.find(isPricingGrid);
  if (!grid) throw new MalformedPricingSourceError("Moonshot model pricing table not found");

  const modelI = headerIndex(grid.headers, (h) => h === "model");
  const scopeI = headerIndex(grid.headers, (h) => h === "deployment scope");
  const unitI = headerIndex(grid.headers, (h) => h === "unit");
  const hitI = headerIndex(grid.headers, (h) => h.includes("input price") && h.includes("cache hit"));
  const missI = headerIndex(grid.headers, (h) => h.includes("input price") && h.includes("cache miss"));
  const outputI = headerIndex(grid.headers, (h) => h.includes("output price"));
  const windowI = headerIndex(grid.headers, (h) => h.includes("context window"));

  const quotes: TokenPriceQuote[] = [];
  const identities = new Map<string, ModelIdentity>();
  const windows = new Map<string, string>();

  for (const row of grid.rows) {
    const identity = identityFor(cellAt(row, modelI, "model").trim());
    identities.set(identity.providerModelId, identity);
    const region = regionFor(cellAt(row, scopeI, "deployment scope"));
    windows.set(identity.providerModelId, cellAt(row, windowI, "context window").trim());

    // The unit is stated per row; a row that is not per 1M tokens is not this unit.
    const unit = cellAt(row, unitI, "unit").replace(/\s+/g, " ").trim().toLowerCase();
    if (unit !== "1m tokens") {
      throw new MalformedPricingSourceError(`Moonshot row for ${identity.providerModelId} is priced per '${unit}', not per 1M tokens`);
    }

    const legs: Array<[SourcePricingDimension, number]> = [
      // Cache miss is the ordinary input rate; cache hit is a cache rate.
      ["input", missI],
      ["cached_input", hitI],
      ["output", outputI],
    ];
    for (const [dimension, index] of legs) {
      quotes.push(
        createSourceQuote({
          identity,
          dimension,
          native: { price: parseUsdTokenPrice(cellAt(row, index, dimension)), currency: "USD", denominatorTokens: 1_000_000 },
          serviceTier: "standard",
          // One rate per model across its whole window; no surcharge band.
          contextTier: null,
          region,
          cacheTtl: null,
          sourceInterfaceSlug: MOONSHOT_SOURCE_SLUG,
          sourceEffectiveAt: null,
          retrievedAt,
        }),
      );
    }
  }

  if (quotes.length === 0) throw new MalformedPricingSourceError("Moonshot pricing table produced no quotes");
  assertDistinctObservationKeys(quotes);

  const diagnostics: PricingDiagnostic[] = [
    {
      code: "REGION_SCOPED_PRICE",
      detail:
        "Moonshot publishes an international list in USD and a China list in CNY at different numbers for the same models. Each observation carries the scope it was quoted under; no row is recorded as region-neutral and the two lists are never mixed.",
    },
    {
      code: "CACHE_HIT_IS_A_SEPARATE_DIMENSION",
      detail: "Input is published on a cache hit and on a cache miss. The cache-miss rate is the ordinary input leg; the cache-hit rate is recorded as cached input and never blended into it.",
    },
    {
      code: "CONTEXT_WINDOW_SINGLE_RATE",
      detail: `One rate per model across its whole context window, recorded as no context tier: ${[...windows.entries()].map(([id, size]) => `${id} ${size}`).join("; ")}.`,
    },
  ];

  if (/batchjob|batch/i.test(html)) {
    diagnostics.push({
      code: "BATCH_TIER_NOT_INGESTED",
      detail: "BatchJob pricing is published on a separate page. Batch is a separate service tier and no batch observation is written here.",
    });
  }
  if (/temporarily free/i.test(html)) {
    diagnostics.push({
      code: "FREE_SERVICE_NOT_A_TOKEN_PRICE",
      detail: "File content extraction and file storage APIs are temporarily free. A free service is not a token price and is not ingested.",
    });
  }

  return { quotes, identities: [...identities.values()], aliases: [], diagnostics };
}
