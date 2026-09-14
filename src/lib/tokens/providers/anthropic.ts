/**
 * Anthropic first-party Claude API pricing parser.
 *
 * Source: docs.anthropic.com/en/docs/about-claude/pricing
 * Parser id: tokens.anthropic.pricing.html.v1
 *
 * Cache write 5m/1h, cache read, batch, and (for 4.6+) US inference_geo 1.1x
 * stay distinct. Fast mode is input/output only as tabulated. Dateless 4.6+
 * ids are pinned snapshots. Haiku 4.5 display name resolves to the dated id.
 */

import { modelByNativeId } from "@/lib/tokens/catalog";
import {
  cellAt,
  extractHtmlTables,
  headerIndex,
  parseUsdTokenPrice,
  roundUsd,
  type HtmlTable,
} from "@/lib/tokens/html-tables";
import { assertStableModelIdentity, type ModelIdentity } from "@/lib/tokens/identity";
import { assertDistinctObservationKeys, createSourceQuote } from "@/lib/tokens/observation";
import type { CacheTtl, ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";
import { MalformedPricingSourceError, type PricingDiagnostic, type ProviderParseResult } from "@/lib/tokens/types";

export const ANTHROPIC_PARSER_ID = "tokens.anthropic.pricing.html.v1";
export const ANTHROPIC_SOURCE_SLUG = "anthropic-api-pricing-docs";
const US_MULTIPLIER = 1.1;
const PROVIDER = "anthropic";

/** Display names on the pricing table → stable native ids. No fuzzy matching. */
const DISPLAY_TO_ID: Readonly<Record<string, string>> = {
  "Claude Fable 5.1": "claude-fable-5-1",
  "Claude Opus 5": "claude-opus-5",
  "Claude Sonnet 5": "claude-sonnet-5",
  "Claude Haiku 4.5": "claude-haiku-4-5-20251001",
};

const SUPPORTS_US_INFERENCE_GEO = new Set(["claude-fable-5-1", "claude-opus-5", "claude-sonnet-5"]);
const HAS_FAST_MODE = new Set(["claude-opus-5"]);

type QuoteDraft = {
  identity: ModelIdentity;
  dimension: SourcePricingDimension;
  price: number;
  serviceTier: ServiceTier;
  cacheTtl?: CacheTtl | null;
  region?: string | null;
};

function identityFor(displayName: string): ModelIdentity {
  const nativeId = DISPLAY_TO_ID[displayName.trim()];
  if (!nativeId) {
    throw new MalformedPricingSourceError(`unmapped Anthropic display name '${displayName}'`);
  }
  const seeded = modelByNativeId(PROVIDER, nativeId);
  if (!seeded) throw new MalformedPricingSourceError(`no seeded identity for ${nativeId}`);
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
  return h.includes("model") && h.includes("base input tokens") && h.includes("5m cache writes") && h.includes("1h cache writes");
}

function isFastGrid(table: HtmlTable): boolean {
  const heading = `${table.precedingHeading ?? ""} ${table.caption ?? ""}`.toLowerCase();
  return heading.includes("fast") && table.headers.includes("model") && table.headers.includes("input") && table.headers.includes("output");
}

function isBatchGrid(table: HtmlTable): boolean {
  return table.headers.includes("model") && table.headers.includes("batch input") && table.headers.includes("batch output");
}

function quoteOf(
  draft: QuoteDraft,
  retrievedAt: string,
): ReturnType<typeof createSourceQuote> {
  return createSourceQuote({
    identity: draft.identity,
    dimension: draft.dimension,
    native: { price: draft.price, currency: "USD", denominatorTokens: 1_000_000 },
    serviceTier: draft.serviceTier,
    cacheTtl: draft.cacheTtl ?? null,
    region: draft.region ?? null,
    contextTier: null,
    sourceInterfaceSlug: ANTHROPIC_SOURCE_SLUG,
    sourceEffectiveAt: null,
    retrievedAt,
  });
}

function parseStandard(table: HtmlTable): QuoteDraft[] {
  const modelI = headerIndex(table.headers, (h) => h === "model");
  const inputI = headerIndex(table.headers, (h) => h === "base input tokens");
  const write5I = headerIndex(table.headers, (h) => h.includes("5m") && h.includes("cache write"));
  const write1hI = headerIndex(table.headers, (h) => h.includes("1h") && h.includes("cache write"));
  const hitI = headerIndex(table.headers, (h) => h.includes("cache hit"));
  const outputI = headerIndex(table.headers, (h) => h.includes("output"));
  const drafts: QuoteDraft[] = [];
  for (const row of table.rows) {
    const identity = identityFor(cellAt(row, modelI, "model"));
    const input = parseUsdTokenPrice(cellAt(row, inputI, "input"));
    drafts.push(
      { identity, dimension: "input", price: input, serviceTier: "standard" },
      { identity, dimension: "cache_write", price: parseUsdTokenPrice(cellAt(row, write5I, "5m cache write")), serviceTier: "standard", cacheTtl: "5m" },
      { identity, dimension: "cache_write", price: parseUsdTokenPrice(cellAt(row, write1hI, "1h cache write")), serviceTier: "standard", cacheTtl: "1h" },
      { identity, dimension: "cache_read", price: parseUsdTokenPrice(cellAt(row, hitI, "cache hit")), serviceTier: "standard" },
      { identity, dimension: "output", price: parseUsdTokenPrice(cellAt(row, outputI, "output")), serviceTier: "standard" },
    );
  }
  return drafts;
}

function parseFast(table: HtmlTable): QuoteDraft[] {
  const modelI = headerIndex(table.headers, (h) => h === "model");
  const inputI = headerIndex(table.headers, (h) => h === "input");
  const outputI = headerIndex(table.headers, (h) => h === "output");
  const drafts: QuoteDraft[] = [];
  for (const row of table.rows) {
    const identity = identityFor(cellAt(row, modelI, "model"));
    if (!HAS_FAST_MODE.has(identity.providerModelId)) {
      throw new MalformedPricingSourceError(`fast mode quoted for ${identity.providerModelId} which is not documented as fast-priced`);
    }
    drafts.push(
      { identity, dimension: "input", price: parseUsdTokenPrice(cellAt(row, inputI, "fast input")), serviceTier: "fast" },
      { identity, dimension: "output", price: parseUsdTokenPrice(cellAt(row, outputI, "fast output")), serviceTier: "fast" },
    );
  }
  return drafts;
}

function parseBatch(table: HtmlTable): QuoteDraft[] {
  const modelI = headerIndex(table.headers, (h) => h === "model");
  const inputI = headerIndex(table.headers, (h) => h === "batch input");
  const outputI = headerIndex(table.headers, (h) => h === "batch output");
  const drafts: QuoteDraft[] = [];
  for (const row of table.rows) {
    const identity = identityFor(cellAt(row, modelI, "model"));
    drafts.push(
      { identity, dimension: "input", price: parseUsdTokenPrice(cellAt(row, inputI, "batch input")), serviceTier: "batch" },
      { identity, dimension: "output", price: parseUsdTokenPrice(cellAt(row, outputI, "batch output")), serviceTier: "batch" },
    );
  }
  return drafts;
}

function applyUsMultiplier(drafts: QuoteDraft[]): QuoteDraft[] {
  return drafts.flatMap((draft) => {
    if (!SUPPORTS_US_INFERENCE_GEO.has(draft.identity.providerModelId)) return [draft];
    if (draft.region) return [draft];
    return [
      draft,
      { ...draft, region: "us", price: roundUsd(draft.price * US_MULTIPLIER) },
    ];
  });
}

export function parseAnthropicPricing(html: string, retrievedAt: string): ProviderParseResult {
  if (!html.trim()) throw new MalformedPricingSourceError("empty Anthropic pricing body");
  const tables = extractHtmlTables(html);
  const standard = tables.find(isStandardGrid);
  const fast = tables.find(isFastGrid);
  const batch = tables.find(isBatchGrid);
  if (!standard) throw new MalformedPricingSourceError("Anthropic base pricing table not found");
  if (!batch) throw new MalformedPricingSourceError("Anthropic batch pricing table not found");
  if (!fast) throw new MalformedPricingSourceError("Anthropic fast mode pricing table not found");

  let drafts = [...parseStandard(standard), ...parseFast(fast), ...parseBatch(batch)];
  drafts = applyUsMultiplier(drafts);

  const quotes = drafts.map((draft) => quoteOf(draft, retrievedAt));
  assertDistinctObservationKeys(quotes);
  const uniqueIdentities = [...new Map(drafts.map((d) => [d.identity.providerModelId, d.identity] as const)).values()];

  const diagnostics: PricingDiagnostic[] = [
    {
      code: "LONG_CONTEXT_NO_SURCHARGE",
      detail: "Claude 4.6+ bills the full 1M window at standard per-token rates; context_tier is null.",
    },
    {
      code: "US_INFERENCE_GEO",
      detail: "inference_geo=us is a 1.1x multiplier on 4.6+ models; Haiku 4.5 does not support it.",
    },
  ];

  return {
    quotes,
    identities: uniqueIdentities,
    aliases: [
      {
        providerSlug: PROVIDER,
        alias: "claude-haiku-4-5",
        targetProviderModelId: "claude-haiku-4-5-20251001",
        aliasKind: "family_alias",
      },
    ],
    diagnostics,
  };
}
