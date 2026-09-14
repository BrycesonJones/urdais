/**
 * DeepSeek first-party API pricing parser.
 *
 * Source: api-docs.deepseek.com/quick_start/pricing
 * Parser id: tokens.deepseek.pricing.html.v1
 *
 * DeepSeek publishes no standard rate. Every price on this page is a peak rate
 * or an off-peak rate, and the page states the split in hours: peak is
 * 01:00-04:00 and 06:00-10:00 UTC Monday to Friday, which is 35 of the 168
 * hours in a week. Off-peak is therefore the majority condition, not a
 * discount window, and neither figure is the list price with the other beside
 * it.
 *
 * The parser records both faithfully, each under its own service tier, and
 * invents nothing in between. No blended rate is produced here, and none should
 * be produced downstream without a methodology version that says how. The
 * consequence is deliberate: because the benchmark's eligibility rule selects
 * the standard tier, DeepSeek has no eligible leg and its headline Token Price
 * is withheld rather than guessed at.
 *
 * Cache-hit input is a different dimension from cache-miss input and the two
 * are never blended.
 */

import { modelByNativeId } from "@/lib/tokens/catalog";
import { cellAt, extractHtmlTables, headerIndex, parseUsdTokenPrice, type HtmlTable } from "@/lib/tokens/html-tables";
import { assertStableModelIdentity, type ModelIdentity } from "@/lib/tokens/identity";
import { assertDistinctObservationKeys, createSourceQuote, type TokenPriceQuote } from "@/lib/tokens/observation";
import type { ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";
import { MalformedPricingSourceError, type PricingDiagnostic, type ProviderParseResult } from "@/lib/tokens/types";

export const DEEPSEEK_PARSER_ID = "tokens.deepseek.pricing.html.v1";
export const DEEPSEEK_SOURCE_SLUG = "deepseek-api-pricing-docs";
const PROVIDER = "deepseek";

/** Published dimension label to canonical dimension. Cache hit is not input. */
const DIMENSIONS: ReadonlyArray<{ match: RegExp; dimension: SourcePricingDimension }> = [
  { match: /input tokens\s*\(cache hit\)/i, dimension: "cached_input" },
  { match: /input tokens\s*\(cache miss\)/i, dimension: "input" },
  { match: /output tokens/i, dimension: "output" },
];

function dimensionFor(label: string): SourcePricingDimension {
  const found = DIMENSIONS.find((row) => row.match.test(label));
  if (!found) throw new MalformedPricingSourceError(`unrecognised DeepSeek pricing dimension '${label}'`);
  return found.dimension;
}

function identityFor(nativeId: string): ModelIdentity {
  const seeded = modelByNativeId(PROVIDER, nativeId);
  if (!seeded) throw new MalformedPricingSourceError(`unmapped DeepSeek model id '${nativeId}'`);
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
  return h.includes("model") && h.includes("pricing dimension") && h.some((x) => x.includes("off-peak")) && h.some((x) => x === "peak price");
}

export function parseDeepSeekPricing(html: string, retrievedAt: string): ProviderParseResult {
  if (!html.trim()) throw new MalformedPricingSourceError("empty DeepSeek pricing body");
  const tables = extractHtmlTables(html);
  const grid = tables.find(isPricingGrid);
  if (!grid) throw new MalformedPricingSourceError("DeepSeek pricing table not found");

  const modelI = headerIndex(grid.headers, (h) => h === "model");
  const dimI = headerIndex(grid.headers, (h) => h === "pricing dimension");
  const offPeakI = headerIndex(grid.headers, (h) => h.includes("off-peak"));
  const peakI = headerIndex(grid.headers, (h) => h === "peak price");

  const quotes: TokenPriceQuote[] = [];
  const identities = new Map<string, ModelIdentity>();

  for (const row of grid.rows) {
    const identity = identityFor(cellAt(row, modelI, "model").trim());
    identities.set(identity.providerModelId, identity);
    const dimension = dimensionFor(cellAt(row, dimI, "pricing dimension"));

    const tiers: Array<[ServiceTier, number]> = [
      ["off_peak", offPeakI],
      ["peak", peakI],
    ];
    for (const [serviceTier, index] of tiers) {
      quotes.push(
        createSourceQuote({
          identity,
          dimension,
          native: { price: parseUsdTokenPrice(cellAt(row, index, `${serviceTier} ${dimension}`)), currency: "USD", denominatorTokens: 1_000_000 },
          serviceTier,
          contextTier: null,
          region: null,
          cacheTtl: null,
          sourceInterfaceSlug: DEEPSEEK_SOURCE_SLUG,
          sourceEffectiveAt: null,
          retrievedAt,
        }),
      );
    }
  }

  if (quotes.length === 0) throw new MalformedPricingSourceError("DeepSeek pricing table produced no quotes");
  assertDistinctObservationKeys(quotes);

  // The parser must not manufacture the tier the provider does not publish.
  if (quotes.some((quote) => quote.serviceTier === "standard")) {
    throw new MalformedPricingSourceError("DeepSeek publishes no standard rate; a standard-tier quote would be invented");
  }

  const diagnostics: PricingDiagnostic[] = [
    {
      code: "NO_STANDARD_SERVICE_TIER",
      detail:
        "DeepSeek publishes only peak and off-peak rates. Peak is 01:00-04:00 and 06:00-10:00 UTC Monday to Friday, 35 of the 168 hours in a week, so off-peak is the majority condition. Both are recorded; neither is treated as the standard rate and no blend is computed.",
    },
    {
      code: "CACHE_HIT_IS_A_SEPARATE_DIMENSION",
      detail: "Cache-hit input is recorded as cached input and is never blended with cache-miss input.",
    },
  ];

  if (/thinking mode/i.test(html)) {
    diagnostics.push({ code: "REASONING_NOT_SEPARATELY_PRICED", detail: "Thinking mode is supported in both modes and is not separately priced; no reasoning dimension is created." });
  }
  if (/no batch table|There is no batch/i.test(html)) {
    diagnostics.push({ code: "BATCH_RATE_UNPUBLISHED", detail: "No batch table is published on this page; no batch observation is written." });
  }

  return { quotes, identities: [...identities.values()], aliases: [], diagnostics };
}
