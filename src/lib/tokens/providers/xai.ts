/**
 * xAI first-party text API pricing parser.
 *
 * Source: docs.x.ai/docs/models
 * Parser id: tokens.xai.pricing.html.v1
 *
 * Input, cached input, and output stay distinct. Crossing the published 200k
 * prompt threshold bills all tokens in the request at the higher rate. Batch
 * is mentioned without a published token rate, so no batch observation is
 * written. Image/voice SKUs are incompatible units and are not ingested.
 */

import { modelByNativeId } from "@/lib/tokens/catalog";
import {
  cellAt,
  extractHtmlTables,
  headerIndex,
  parseUsdTokenPrice,
  type HtmlTable,
} from "@/lib/tokens/html-tables";
import { assertStableModelIdentity, looksLikeLatestPointer, type ModelIdentity } from "@/lib/tokens/identity";
import { assertDistinctObservationKeys, createSourceQuote, type TokenPriceQuote } from "@/lib/tokens/observation";
import type { SourcePricingDimension } from "@/lib/tokens/dimensions";
import { IncompatiblePricingUnitError, MalformedPricingSourceError, type PricingDiagnostic, type ProviderParseResult } from "@/lib/tokens/types";

export const XAI_PARSER_ID = "tokens.xai.pricing.html.v1";
export const XAI_SOURCE_SLUG = "xai-models-docs";
const PROVIDER = "xai";

const CONTEXT_ROW =
  /^(\S+)\s*\(\s*(<|≤|>=|≥)\s*(\d+)\s*k\s+prompt tokens\s*\)$/i;

function identityFor(nativeId: string): ModelIdentity {
  if (looksLikeLatestPointer(nativeId)) {
    throw new MalformedPricingSourceError(`xAI id '${nativeId}' is a latest pointer, not a stable identity`);
  }
  const seeded = modelByNativeId(PROVIDER, nativeId);
  if (!seeded) throw new MalformedPricingSourceError(`unmapped xAI model id '${nativeId}'`);
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

function parseContextModel(cell: string): { identity: ModelIdentity; contextTier: string } {
  const match = CONTEXT_ROW.exec(cell.trim());
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new MalformedPricingSourceError(`xAI model cell is not a thresholded id: '${cell}'`);
  }
  const nativeId = match[1];
  const op = match[2];
  const thresholdK = match[3];
  const contextTier = op === "<" || op === "≤" ? `prompt_lt_${thresholdK}k` : `prompt_gte_${thresholdK}k`;
  return { identity: identityFor(nativeId), contextTier };
}

function isTextApiGrid(table: HtmlTable): boolean {
  const h = table.headers;
  return (
    h.includes("model") &&
    h.some((x) => x.includes("input") && x.includes("1m")) &&
    h.some((x) => x.includes("cached input")) &&
    h.some((x) => x.includes("output") && x.includes("1m"))
  );
}

export function parseXaiPricing(html: string, retrievedAt: string): ProviderParseResult {
  if (!html.trim()) throw new MalformedPricingSourceError("empty xAI pricing body");
  const tables = extractHtmlTables(html);
  const text = tables.find(isTextApiGrid);
  if (!text) throw new MalformedPricingSourceError("xAI text API pricing table not found");

  const modelI = headerIndex(text.headers, (h) => h === "model");
  const inputI = headerIndex(text.headers, (h) => h.startsWith("input") && h.includes("1m"));
  const cachedI = headerIndex(text.headers, (h) => h.includes("cached input"));
  const outputI = headerIndex(text.headers, (h) => h.startsWith("output") && h.includes("1m"));

  const quotes: TokenPriceQuote[] = [];
  const identities = new Map<string, ModelIdentity>();
  for (const row of text.rows) {
    const { identity, contextTier } = parseContextModel(cellAt(row, modelI, "model"));
    identities.set(identity.providerModelId, identity);
    const dims: Array<[SourcePricingDimension, number]> = [
      ["input", inputI],
      ["cached_input", cachedI],
      ["output", outputI],
    ];
    for (const [dimension, index] of dims) {
      quotes.push(
        createSourceQuote({
          identity,
          dimension,
          native: {
            price: parseUsdTokenPrice(cellAt(row, index, dimension)),
            currency: "USD",
            denominatorTokens: 1_000_000,
          },
          serviceTier: "standard",
          contextTier,
          region: null,
          cacheTtl: null,
          sourceInterfaceSlug: XAI_SOURCE_SLUG,
          sourceEffectiveAt: null,
          retrievedAt,
        }),
      );
    }
  }
  if (quotes.length === 0) throw new MalformedPricingSourceError("xAI text API table produced no quotes");
  assertDistinctObservationKeys(quotes);

  const diagnostics: PricingDiagnostic[] = [
    {
      code: "LONG_CONTEXT_BILLS_ALL_TOKENS",
      detail:
        "Requests whose prompt reaches the listed token threshold are billed at the higher rate for all tokens in the request.",
    },
  ];

  if (/batch api/i.test(html)) {
    diagnostics.push({
      code: "BATCH_RATE_UNPUBLISHED",
      detail: "Batch API is mentioned on the models page but no batch token rate is published; no batch observation is written.",
    });
  }

  for (const table of tables) {
    if (isTextApiGrid(table)) continue;
    if (table.headers.some((h) => h === "cost" || h.includes("image") || h.includes("sec") || h.includes("min"))) {
      diagnostics.push({
        code: "INCOMPATIBLE_UNIT_SKIPPED",
        detail: `skipped non-token table '${table.precedingHeading ?? table.headers.join(",")}'`,
      });
      for (const row of table.rows) {
        for (const cell of row) {
          try {
            parseUsdTokenPrice(cell);
          } catch (error) {
            if (!(error instanceof IncompatiblePricingUnitError) && !(error instanceof MalformedPricingSourceError)) throw error;
          }
        }
      }
    }
  }

  if (quotes.some((q) => q.serviceTier === "batch")) {
    throw new MalformedPricingSourceError("xAI parser must not invent a batch rate");
  }

  return {
    quotes,
    identities: [...identities.values()],
    aliases: [],
    diagnostics,
  };
}
