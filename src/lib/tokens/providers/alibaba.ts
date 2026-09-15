/**
 * Alibaba Cloud Model Studio first-party pricing parser.
 *
 * Source: alibabacloud.com/help/en/model-studio/model-pricing
 * Parser id: tokens.alibaba.pricing.html.v1
 *
 * The distinguishing feature of this catalog is that there is no unscoped
 * price. Every row states a deployment scope, and the same model is a different
 * number under a different scope: International lists qwen3.8-max at $2 and $6,
 * while China (Beijing) lists $1.65 and $4.951. A row is therefore only
 * meaningful carried together with its scope, and the parser records the scope
 * as the observation's region rather than dropping it to make the row look
 * region-neutral. Which scope Urdais publishes from is a methodology
 * designation, not a parser decision.
 *
 * Each model here publishes one token band covering its own window, so the
 * band is not a surcharge tier and the context tier is null. The band is
 * reported as a diagnostic so the excerpt's scope stays visible.
 */

import { modelByNativeId } from "@/lib/tokens/catalog";
import { cellAt, extractHtmlTables, headerIndex, parseUsdTokenPrice, type HtmlTable } from "@/lib/tokens/html-tables";
import { assertStableModelIdentity, looksLikeLatestPointer, type ModelIdentity } from "@/lib/tokens/identity";
import { assertDistinctObservationKeys, createSourceQuote, type TokenPriceQuote } from "@/lib/tokens/observation";
import { MalformedPricingSourceError, type PricingDiagnostic, type ProviderParseResult } from "@/lib/tokens/types";

export const ALIBABA_PARSER_ID = "tokens.alibaba.pricing.html.v1";
export const ALIBABA_SOURCE_SLUG = "alibaba-model-studio-pricing-docs";
const PROVIDER = "alibaba";

/** The scope this excerpt reproduces, normalized for the region facet. */
export const ALIBABA_INTERNATIONAL_REGION = "international";

function regionFor(scope: string): string {
  const normalized = scope.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) throw new MalformedPricingSourceError("Alibaba row has no deployment scope");
  // Scopes are recorded as published, lowercased. A row without one would be a
  // row whose price cannot be attributed, and is refused above.
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function identityFor(nativeId: string): ModelIdentity {
  if (looksLikeLatestPointer(nativeId)) {
    throw new MalformedPricingSourceError(`Alibaba id '${nativeId}' is a latest pointer, not a stable identity`);
  }
  const seeded = modelByNativeId(PROVIDER, nativeId);
  if (!seeded) throw new MalformedPricingSourceError(`unmapped Alibaba model id '${nativeId}'`);
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

function isTextGrid(table: HtmlTable): boolean {
  const h = table.headers;
  return h.includes("model id") && h.includes("deployment scope") && h.some((x) => x.startsWith("input price"));
}

export function parseAlibabaPricing(html: string, retrievedAt: string): ProviderParseResult {
  if (!html.trim()) throw new MalformedPricingSourceError("empty Alibaba pricing body");
  const tables = extractHtmlTables(html);
  const grid = tables.find(isTextGrid);
  if (!grid) throw new MalformedPricingSourceError("Alibaba text pricing table not found");

  const idI = headerIndex(grid.headers, (h) => h === "model id");
  const scopeI = headerIndex(grid.headers, (h) => h === "deployment scope");
  const bandI = headerIndex(grid.headers, (h) => h.includes("tokens per request"));
  const inputI = headerIndex(grid.headers, (h) => h.startsWith("input price"));
  const outputI = headerIndex(grid.headers, (h) => h.startsWith("output price"));

  const quotes: TokenPriceQuote[] = [];
  const identities = new Map<string, ModelIdentity>();
  const bands = new Map<string, string>();

  for (const row of grid.rows) {
    const identity = identityFor(cellAt(row, idI, "model id").trim());
    identities.set(identity.providerModelId, identity);
    const region = regionFor(cellAt(row, scopeI, "deployment scope"));
    bands.set(identity.providerModelId, cellAt(row, bandI, "token band").trim());

    for (const [dimension, index] of [
      ["input", inputI],
      ["output", outputI],
    ] as const) {
      quotes.push(
        createSourceQuote({
          identity,
          dimension,
          native: { price: parseUsdTokenPrice(cellAt(row, index, dimension)), currency: "USD", denominatorTokens: 1_000_000 },
          serviceTier: "standard",
          // One published band per model, covering that model's own window.
          contextTier: null,
          region,
          cacheTtl: null,
          sourceInterfaceSlug: ALIBABA_SOURCE_SLUG,
          sourceEffectiveAt: null,
          retrievedAt,
        }),
      );
    }
  }

  if (quotes.length === 0) throw new MalformedPricingSourceError("Alibaba text table produced no quotes");
  assertDistinctObservationKeys(quotes);

  const diagnostics: PricingDiagnostic[] = [
    {
      code: "REGION_SCOPED_PRICE",
      detail:
        "Every Alibaba row is scoped to a deployment region and the scopes differ in price; each observation carries its scope as the region facet and no row is recorded as region-neutral.",
    },
    {
      code: "CONTEXT_BAND_SINGLE",
      detail: `One published token band per model, recorded as no context tier: ${[...bands.entries()].map(([id, band]) => `${id} ${band}`).join("; ")}.`,
    },
  ];

  if (/batch/i.test(html)) {
    diagnostics.push({
      code: "BATCH_TIER_NOT_INGESTED",
      detail: "Batch calls are billed at 50% of the real-time price. Batch is a separate service tier and no batch observation is written here.",
    });
  }
  if (/free quota/i.test(html)) {
    diagnostics.push({
      code: "FREE_QUOTA_NOT_A_LIST_PRICE",
      detail: "A time-limited free quota is offered in Singapore. A free quota is not a list price and is not ingested.",
    });
  }
  if (/context cach/i.test(html)) {
    diagnostics.push({
      code: "CACHE_DISCOUNT_SEPARATE_DIMENSION",
      detail: "Context caching discounts apply to input tokens only and cannot combine with the batch discount. Cache rates are a separate pricing dimension.",
    });
  }

  return { quotes, identities: [...identities.values()], aliases: [], diagnostics };
}
