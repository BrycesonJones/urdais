/**
 * OpenAI first-party API pricing parser.
 *
 * Source: platform.openai.com/docs/pricing
 * Parser id: tokens.openai.pricing.html.v1
 *
 * Input, cached input, cache writes, and output stay distinct. Standard, batch,
 * and fast are separate service tiers. Short vs long context are provider
 * column labels; the unpublished token cutoff is not guessed. `*-latest`
 * aliases are not canonical model ids. Regional 10% uplift is documented but
 * per-model eligibility is not on the table, so regional rows are not emitted.
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
import type { ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";
import { MalformedPricingSourceError, type PricingDiagnostic, type ProviderParseResult, type ResolvedAlias } from "@/lib/tokens/types";

export const OPENAI_PARSER_ID = "tokens.openai.pricing.html.v1";
export const OPENAI_SOURCE_SLUG = "openai-api-pricing-docs";
const PROVIDER = "openai";

const DOCUMENTED_ALIASES: readonly ResolvedAlias[] = [
  {
    providerSlug: PROVIDER,
    alias: "gpt-daybreak-blue-latest",
    targetProviderModelId: "gpt-5.6-sol",
    aliasKind: "latest_pointer",
  },
  {
    providerSlug: PROVIDER,
    alias: "gpt-daybreak-red-latest",
    targetProviderModelId: "gpt-5.6-cyber",
    aliasKind: "latest_pointer",
  },
];

function classifyTier(table: HtmlTable, ordinalAmongGrids: number): ServiceTier {
  const heading = `${table.precedingHeading ?? ""} ${table.caption ?? ""}`.toLowerCase();
  if (/\bbatch\b/.test(heading)) return "batch";
  if (/\bfast\b|\bpriority\b/.test(heading)) return "fast";
  if (/\bstandard\b/.test(heading) || ordinalAmongGrids === 0) return "standard";
  throw new MalformedPricingSourceError(`OpenAI pricing table is not labeled standard, batch, or fast ('${table.precedingHeading}')`);
}

function isTokenGrid(table: HtmlTable): boolean {
  const h = table.headers;
  return h.some((x) => x === "model") && h.some((x) => x.includes("short context") && x.includes("input")) && h.some((x) => x.includes("long context"));
}

function identityFor(nativeId: string): ModelIdentity {
  if (looksLikeLatestPointer(nativeId)) {
    throw new MalformedPricingSourceError(`OpenAI id '${nativeId}' is a latest pointer, not a stable identity`);
  }
  const seeded = modelByNativeId(PROVIDER, nativeId);
  if (!seeded) throw new MalformedPricingSourceError(`unmapped OpenAI model id '${nativeId}'`);
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

type Band = { contextTier: "short_context" | "long_context"; prefix: string };

const BANDS: readonly Band[] = [
  { contextTier: "short_context", prefix: "short context" },
  { contextTier: "long_context", prefix: "long context" },
];

const DIMS: ReadonlyArray<{ header: string; dimension: SourcePricingDimension }> = [
  { header: "cached input", dimension: "cached_input" },
  { header: "cache writes", dimension: "cache_write" },
  { header: "output", dimension: "output" },
  { header: "input", dimension: "input" },
];

function columnFor(headers: readonly string[], band: Band, dimHeader: string): number {
  return headerIndex(headers, (h) => h.includes(band.prefix) && h.includes(dimHeader) && (dimHeader !== "input" || (!h.includes("cached") && !h.includes("cache writes"))));
}

export function parseOpenAiPricing(html: string, retrievedAt: string): ProviderParseResult {
  if (!html.trim()) throw new MalformedPricingSourceError("empty OpenAI pricing body");
  const tables = extractHtmlTables(html);
  const grids = tables.filter(isTokenGrid);
  if (grids.length === 0) throw new MalformedPricingSourceError("OpenAI token pricing table not found");

  const quotes: TokenPriceQuote[] = [];
  const identities = new Map<string, ModelIdentity>();
  const diagnostics: PricingDiagnostic[] = [
    {
      code: "CONTEXT_TIER_CUTOFF_UNRESOLVED",
      detail: "Short context and long context are ingested as column labels. The token cutoff is not published in the table headers and is not guessed.",
    },
    {
      code: "REGIONAL_UPLIFT_NOT_EMITTED",
      detail: "A 10% regional-processing uplift is documented for eligible models released on/after 2026-03-05, but per-model eligibility is not on the pricing table, so no region rows are written.",
    },
    {
      code: "PRIORITY_ALIAS_OF_FAST",
      detail: "Priority processing was renamed Fast mode; observations use service_tier=fast. The API still accepts service_tier=priority as the same product, not a second price.",
    },
  ];

  grids.forEach((table, ordinal) => {
    const serviceTier = classifyTier(table, ordinal);
    const modelI = headerIndex(table.headers, (h) => h === "model");
    for (const row of table.rows) {
      const nativeId = cellAt(row, modelI, "model").trim();
      if (looksLikeLatestPointer(nativeId)) {
        diagnostics.push({ code: "ALIAS_ROW_SKIPPED", detail: `skipped latest-pointer row '${nativeId}'` });
        continue;
      }
      const identity = identityFor(nativeId);
      identities.set(identity.providerModelId, identity);
      for (const band of BANDS) {
        for (const dim of DIMS) {
          const index = columnFor(table.headers, band, dim.header);
          const cell = cellAt(row, index, `${band.contextTier} ${dim.header}`);
          if (isMissingPriceCell(cell)) continue;
          quotes.push(
            createSourceQuote({
              identity,
              dimension: dim.dimension,
              native: { price: parseUsdTokenPrice(cell), currency: "USD", denominatorTokens: 1_000_000 },
              serviceTier,
              contextTier: band.contextTier,
              region: null,
              cacheTtl: null,
              sourceInterfaceSlug: OPENAI_SOURCE_SLUG,
              sourceEffectiveAt: null,
              retrievedAt,
            }),
          );
        }
      }
    }
  });

  if (quotes.length === 0) throw new MalformedPricingSourceError("OpenAI token tables produced no quotes");
  assertDistinctObservationKeys(quotes);

  const aliases = DOCUMENTED_ALIASES.filter((alias) => html.includes(alias.alias) && html.includes(alias.targetProviderModelId));
  if (aliases.length !== DOCUMENTED_ALIASES.length) {
    throw new MalformedPricingSourceError("OpenAI alias text for gpt-daybreak-*-latest is missing from the source");
  }

  if (quotes.some((q) => q.contextTier?.includes("k") || q.contextTier?.includes("prompt_"))) {
    throw new MalformedPricingSourceError("OpenAI parser must not invent a token cutoff for context tiers");
  }

  return { quotes, identities: [...identities.values()], aliases, diagnostics };
}
