/**
 * The Urdais Token Price benchmark: docs/methodology/token-price.md, as code.
 *
 * The document is authoritative. This module holds its machine-readable
 * parts: effective-dated methodology versions with their workload weights,
 * effective-dated designations of each provider's benchmark model, and the
 * rule deciding which canonical quotes are eligible legs.
 *
 * Both registries are effective-dated on purpose. A value is computed with
 * the version and designation in force on its own calculation date, so a
 * later version or designation cannot alter an earlier value: it can only
 * produce different values from its own effective date onward.
 */

import type { PublicTokenSeries } from "@/lib/tokens/read/api-contract";

export const TOKEN_PRICE_UNIT = "USD / 1M tokens" as const;
/** What the product prints beside the value. Never "per 1M input tokens". */
export const TOKEN_PRICE_UNIT_CAPTION = "per 1M tokens" as const;
export const TOKEN_PRICE_BENCHMARK_NAME = "Urdais Token Price" as const;
export const TOKEN_PRICE_METHODOLOGY_DOC = "docs/methodology/token-price.md" as const;

/**
 * One methodology version: the standardized workload and the weights it fixes,
 * effective from a date. Adding a later version never changes an earlier one.
 */
export type TokenPriceMethodologyVersion = {
  version: string;
  effectiveFrom: string;
  inputTokens: number;
  outputTokens: number;
  inputWeight: number;
  outputWeight: number;
};

export const TOKEN_PRICE_METHODOLOGY_VERSIONS: readonly TokenPriceMethodologyVersion[] = [
  { version: "1.0", effectiveFrom: "2026-09-14", inputTokens: 500_000, outputTokens: 500_000, inputWeight: 0.5, outputWeight: 0.5 },
  // 1.1 corrects constituent selection and calculation-event semantics; the workload and weights are unchanged.
  { version: "1.1", effectiveFrom: "2026-09-14", inputTokens: 500_000, outputTokens: 500_000, inputWeight: 0.5, outputWeight: 0.5 },
];

/** The current version, for labelling a new calculation and for reports. */
export const TOKEN_PRICE_METHODOLOGY_VERSION = "1.1" as const;

/** The version in force on a date, or undefined before the first one. */
export function methodologyInForce(onDate: string): TokenPriceMethodologyVersion | undefined {
  return TOKEN_PRICE_METHODOLOGY_VERSIONS.filter((row) => row.effectiveFrom <= onDate).sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version.localeCompare(a.version, "en", { numeric: true }),
  )[0];
}

/** The current workload, for display and for tests. Historical values use the version in force on their own date. */
export const TOKEN_PRICE_WORKLOAD = {
  inputTokens: 500_000,
  outputTokens: 500_000,
  inputWeight: 0.5,
  outputWeight: 0.5,
} as const;

/**
 * A provider's designated benchmark model, effective from a date: the
 * provider's current, broadly available flagship frontier model. A provider
 * may have several designations over time, and a later one never rewrites a
 * value produced under an earlier one.
 */
export type TokenBenchmarkConstituent = {
  providerSlug: string;
  providerModelId: string;
  /** The provider's base, non-surcharge context tier, named rather than inferred. Null where the provider has none. */
  baseContextTier: string | null;
  effectiveFrom: string;
  /** The methodology version that introduced this designation. */
  methodologyVersion: string;
  rationale: string;
};

export const TOKEN_BENCHMARK_CONSTITUENTS: readonly TokenBenchmarkConstituent[] = [
  {
    providerSlug: "anthropic",
    providerModelId: "claude-fable-5-1",
    baseContextTier: null,
    effectiveFrom: "2026-09-14",
    methodologyVersion: "1.1",
    rationale:
      "Anthropic's product page, retrieved 2026-09-14: \"Claude Fable 5.1 is our most capable generally available model\", available to Pro, Max, Team and Enterprise users and to developers through the Claude Platform and major cloud providers. Claude Mythos 5.1 is restricted to vetted organisations and is therefore not broadly available; Opus 5, Sonnet 5 and Haiku 4.5 sit below Fable 5.1.",
  },
  {
    providerSlug: "openai",
    providerModelId: "gpt-6-astra",
    baseContextTier: "short_context",
    effectiveFrom: "2026-09-14",
    methodologyVersion: "1.1",
    rationale:
      "Highest generation general-purpose model in the qualified roster and the most expensive of its general-purpose models. GPT-5.3 Codex is coding-specific, GPT-Rosalind Research is research-only, and GPT-5.6 Cyber is domain-scoped with no long-context rate. The reviewed artifact is a pricing table with no positioning statement, so the designation rests on generation and price tier and changes with a new effective date if positioning evidence contradicts it.",
  },
  {
    providerSlug: "xai",
    providerModelId: "grok-4.6",
    baseContextTier: "prompt_lt_200k",
    effectiveFrom: "2026-09-14",
    methodologyVersion: "1.1",
    rationale:
      "Highest current general-purpose Grok in the qualified roster. Grok Build 0.1 is coding-specific, the 4.20 multi-agent build is agent-specific, and the 4.20 reasoning and non-reasoning entries are mode variants of an earlier version.",
  },
];

/** The designation in force for a provider on a date, or undefined when none is. */
export function constituentInForce(
  providerSlug: string,
  onDate: string,
  constituents: readonly TokenBenchmarkConstituent[] = TOKEN_BENCHMARK_CONSTITUENTS,
): TokenBenchmarkConstituent | undefined {
  return constituents
    .filter((row) => row.providerSlug === providerSlug && row.effectiveFrom <= onDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/**
 * A provider's designations in time order, each with the date its successor
 * takes over. History is assembled one segment at a time from these.
 */
export function constituentSegments(
  providerSlug: string,
  constituents: readonly TokenBenchmarkConstituent[] = TOKEN_BENCHMARK_CONSTITUENTS,
): { constituent: TokenBenchmarkConstituent; from: string; until: string | null }[] {
  const rows = constituents
    .filter((row) => row.providerSlug === providerSlug)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return rows.map((constituent, index) => ({
    constituent,
    from: constituent.effectiveFrom,
    until: rows[index + 1]?.effectiveFrom ?? null,
  }));
}

export function benchmarkProviders(constituents: readonly TokenBenchmarkConstituent[] = TOKEN_BENCHMARK_CONSTITUENTS): string[] {
  return [...new Set(constituents.map((row) => row.providerSlug))].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Is this canonical quote an eligible leg for the designation's benchmark?
 * Standard tier only; the declared base context tier only; the default region
 * only; input or output only. Cache dimensions and every cache time-to-live
 * are excluded by the dimension test, batch and priority by the tier test, a
 * long-context surcharge by the context test, a regional rate by the region test.
 */
export function isEligibleLeg(series: PublicTokenSeries, constituent: TokenBenchmarkConstituent): boolean {
  if (series.providerSlug !== constituent.providerSlug) return false;
  if (series.providerModelId !== constituent.providerModelId) return false;
  if (series.pricingDimension !== "input" && series.pricingDimension !== "output") return false;
  if (series.serviceTier !== "standard") return false;
  if (series.region !== null) return false;
  if (series.cacheTtl !== null) return false;
  if ((series.contextTier ?? null) !== constituent.baseContextTier) return false;
  return true;
}

/** The benchmark from two legs under one methodology version, at full precision. */
export function tokenBenchmarkPrice(inputPrice: number, outputPrice: number, methodology: TokenPriceMethodologyVersion): number {
  return methodology.inputWeight * inputPrice + methodology.outputWeight * outputPrice;
}

/** Why a provider's current designation cannot be calculated. Reported, never silently swallowed. */
export type TokenBenchmarkWithheld =
  | "NO_CONSTITUENT_DESIGNATED"
  | "NO_METHODOLOGY_VERSION_IN_FORCE"
  | "INPUT_LEG_UNAVAILABLE"
  | "OUTPUT_LEG_UNAVAILABLE"
  | "NO_CALCULATION_EVENT_WITH_BOTH_LEGS";

export const TOKEN_BENCHMARK_PENDING_NOTE =
  "No Token Price benchmark is available. It needs the standard input and output rates of each provider's designated benchmark model, and Urdais withholds the value rather than approximating it.";
