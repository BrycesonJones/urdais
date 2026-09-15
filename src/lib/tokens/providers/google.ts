/**
 * Google Gemini Developer API first-party pricing parser.
 *
 * Source: ai.google.dev/gemini-api/docs/pricing
 * Parser id: tokens.google.pricing.html.v1
 *
 * Three things about this page shape the parser.
 *
 * Output prices include thinking tokens at the output rate, so the published
 * output figure is the output figure; there is no separate reasoning dimension
 * to reconcile and none is invented.
 *
 * Pro-class rows split on a published 200k prompt threshold and Flash-class
 * rows do not. A row with no long-context column has one rate for its whole
 * window, which is a null context tier, not a tier named after a threshold the
 * source never states.
 *
 * Several rows carry a promotional rate with a dated successor. The rate in the
 * price column is the one in force on the retrieval date and is what is
 * ingested; the successor is reported as a diagnostic rather than written as a
 * future observation, because a price that is not yet charged is not an
 * observation of anything.
 *
 * The Vertex AI price list is a different surface with different terms and is
 * never mixed with this one.
 */

import { modelByNativeId } from "@/lib/tokens/catalog";
import {
  cellAt,
  extractHtmlTables,
  headerIndex,
  isMissingPriceCell,
  parseUsdTokenPrice,
  type HtmlTable,
} from "@/lib/tokens/html-tables";
import { assertStableModelIdentity, looksLikeLatestPointer, type ModelIdentity } from "@/lib/tokens/identity";
import { assertDistinctObservationKeys, createSourceQuote, type TokenPriceQuote } from "@/lib/tokens/observation";
import { MalformedPricingSourceError, type PricingDiagnostic, type ProviderParseResult } from "@/lib/tokens/types";

export const GOOGLE_PARSER_ID = "tokens.google.pricing.html.v1";
export const GOOGLE_SOURCE_SLUG = "google-gemini-api-pricing-docs";
const PROVIDER = "google";

/** The published threshold, named as the source names it. */
export const GOOGLE_BASE_CONTEXT_TIER = "prompt_lte_200k";
export const GOOGLE_LONG_CONTEXT_TIER = "prompt_gt_200k";

function identityFor(nativeId: string): ModelIdentity {
  if (looksLikeLatestPointer(nativeId)) {
    throw new MalformedPricingSourceError(`Gemini id '${nativeId}' is a latest pointer, not a stable identity`);
  }
  const seeded = modelByNativeId(PROVIDER, nativeId);
  if (!seeded) throw new MalformedPricingSourceError(`unmapped Gemini model id '${nativeId}'`);
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

function isStandardGrid(table: HtmlTable): boolean {
  const h = table.headers;
  return h.includes("model id") && h.some((x) => x.startsWith("input price")) && h.some((x) => x.startsWith("output price"));
}

export function parseGooglePricing(html: string, retrievedAt: string): ProviderParseResult {
  if (!html.trim()) throw new MalformedPricingSourceError("empty Gemini pricing body");
  const tables = extractHtmlTables(html);
  const standard = tables.find(isStandardGrid);
  if (!standard) throw new MalformedPricingSourceError("Gemini standard pricing table not found");

  const idI = headerIndex(standard.headers, (h) => h === "model id");
  const inputI = headerIndex(standard.headers, (h) => h === "input price");
  const outputI = headerIndex(standard.headers, (h) => h === "output price");
  const longInputI = headerIndex(standard.headers, (h) => h.startsWith("input price") && h.includes("200k"));
  const longOutputI = headerIndex(standard.headers, (h) => h.startsWith("output price") && h.includes("200k"));
  const scheduledI = headerIndex(standard.headers, (h) => h === "scheduled change");

  const quotes: TokenPriceQuote[] = [];
  const identities = new Map<string, ModelIdentity>();
  const diagnostics: PricingDiagnostic[] = [];

  for (const row of standard.rows) {
    const identity = identityFor(cellAt(row, idI, "model id").trim());
    identities.set(identity.providerModelId, identity);

    const longInput = cellAt(row, longInputI, "long-context input");
    const longOutput = cellAt(row, longOutputI, "long-context output");
    const tiered = !isMissingPriceCell(longInput) && !isMissingPriceCell(longOutput);
    // A row without a long-context column is one rate for the whole window.
    const baseTier = tiered ? GOOGLE_BASE_CONTEXT_TIER : null;

    const legs: Array<["input" | "output", string, string | null]> = [
      ["input", cellAt(row, inputI, "input price"), baseTier],
      ["output", cellAt(row, outputI, "output price"), baseTier],
    ];
    if (tiered) {
      legs.push(["input", longInput, GOOGLE_LONG_CONTEXT_TIER]);
      legs.push(["output", longOutput, GOOGLE_LONG_CONTEXT_TIER]);
    }

    for (const [dimension, cell, contextTier] of legs) {
      quotes.push(
        createSourceQuote({
          identity,
          dimension,
          native: { price: parseUsdTokenPrice(cell), currency: "USD", denominatorTokens: 1_000_000 },
          serviceTier: "standard",
          contextTier,
          region: null,
          cacheTtl: null,
          sourceInterfaceSlug: GOOGLE_SOURCE_SLUG,
          sourceEffectiveAt: null,
          retrievedAt,
        }),
      );
    }

    const scheduled = cellAt(row, scheduledI, "scheduled change");
    if (!isMissingPriceCell(scheduled)) {
      diagnostics.push({
        code: "PROMOTIONAL_RATE_SCHEDULED_CHANGE",
        detail: `${identity.providerModelId}: the ingested rate is promotional and the source publishes a successor (${scheduled.trim()}). The successor is not yet charged and is not written as an observation.`,
      });
    }
  }

  if (quotes.length === 0) throw new MalformedPricingSourceError("Gemini standard table produced no quotes");
  assertDistinctObservationKeys(quotes);

  diagnostics.push({
    code: "OUTPUT_INCLUDES_THINKING_TOKENS",
    detail: "Gemini bills thinking tokens at the output rate, so the published output price is the output leg. No separate reasoning dimension is created.",
  });

  if (/modality|per modality|audio\)/i.test(html)) {
    diagnostics.push({
      code: "MODALITY_SPLIT_ROWS_OMITTED",
      detail:
        "Rows whose standard paid price is published per modality, or per minute of audio, are not ingested: Urdais has no modality facet and does not collapse a split rate into one number.",
    });
  }
  if (/\bbatch\b/i.test(html)) {
    diagnostics.push({ code: "BATCH_TIER_NOT_INGESTED", detail: "Batch is published at half the standard rate; it is a separate service tier and no batch observation is written here." });
  }
  if (/per hour|storage price/i.test(html)) {
    diagnostics.push({
      code: "CACHE_STORAGE_OUT_OF_UNIT",
      detail: "Context-cache storage is charged per 1,000,000 tokens per hour, which is not a per-1M-token unit, and is not ingested.",
    });
  }
  if (/vertex/i.test(html)) {
    diagnostics.push({ code: "SECOND_SURFACE_NOT_MIXED", detail: "Vertex AI is a separate price list with separate terms and is never mixed into the Developer API series." });
  }

  return { quotes, identities: [...identities.values()], aliases: [], diagnostics };
}
