/**
 * The Urdais Token Price benchmark: methodology v1.0, as code.
 *
 * docs/methodology/token-price.md is authoritative. This module holds the
 * machine-readable parts of it: the standardized workload and its weights,
 * the effective-dated designation of each provider's benchmark model, and
 * the rule deciding which canonical quotes are eligible legs.
 *
 * The benchmark is a derived Urdais value, never a provider quote. It is the
 * cost of a fixed 1M-token workload, half input and half output, at a
 * provider's ordinary standard published rates for one designated model.
 */

import type { PublicTokenSeries } from "@/lib/tokens/read/api-contract";

export const TOKEN_PRICE_METHODOLOGY_VERSION = "1.0" as const;
export const TOKEN_PRICE_METHODOLOGY_DOC = "docs/methodology/token-price.md" as const;

/** The standardized workload, fixed by the methodology and not configurable per provider. */
export const TOKEN_PRICE_WORKLOAD = {
  inputTokens: 500_000,
  outputTokens: 500_000,
  inputWeight: 0.5,
  outputWeight: 0.5,
} as const;

export const TOKEN_PRICE_UNIT = "USD / 1M tokens" as const;
/** What the product prints beside the value. Never "per 1M input tokens". */
export const TOKEN_PRICE_UNIT_CAPTION = "per 1M tokens" as const;
export const TOKEN_PRICE_BENCHMARK_NAME = "Urdais Token Price" as const;

/**
 * A provider's designated benchmark model, effective from a date. A provider
 * may have several designations over time; the one in force on an observation
 * date is the one that produced its value, and a later designation never
 * rewrites an earlier value.
 */
export type TokenBenchmarkConstituent = {
  providerSlug: string;
  providerModelId: string;
  /** The provider's base, non-surcharge context tier, named rather than inferred. Null where the provider has none. */
  baseContextTier: string | null;
  /** ISO date from which this designation applies. */
  effectiveFrom: string;
  methodologyVersion: string;
  /** Why this model and not another; the methodology document carries the same reasoning. */
  rationale: string;
};

export const TOKEN_BENCHMARK_CONSTITUENTS: readonly TokenBenchmarkConstituent[] = [
  {
    providerSlug: "anthropic",
    providerModelId: "claude-sonnet-5",
    baseContextTier: null,
    effectiveFrom: "2026-09-14",
    methodologyVersion: TOKEN_PRICE_METHODOLOGY_VERSION,
    rationale: "Current general-purpose flagship of the Claude family in the qualified roster; Opus 5 and Fable 5.1 sit above it, Haiku 4.5 below.",
  },
  {
    providerSlug: "xai",
    providerModelId: "grok-4.6",
    baseContextTier: "prompt_lt_200k",
    effectiveFrom: "2026-09-14",
    methodologyVersion: TOKEN_PRICE_METHODOLOGY_VERSION,
    rationale: "Highest current general-purpose Grok in the qualified roster. Grok Build 0.1 is coding-specific, the 4.20 multi-agent build is agent-specific, and the 4.20 reasoning and non-reasoning entries are mode variants of an earlier version.",
  },
  {
    providerSlug: "openai",
    providerModelId: "gpt-5.6-sol",
    baseContextTier: "short_context",
    effectiveFrom: "2026-09-14",
    methodologyVersion: TOKEN_PRICE_METHODOLOGY_VERSION,
    rationale: "Current general-purpose flagship in the qualified roster. GPT-5.3 Codex is coding-specific and GPT-Rosalind Research is research-only.",
  },
];

/** The designation in force for a provider on a date, or undefined when none is. */
export function constituentInForce(providerSlug: string, onDate: string): TokenBenchmarkConstituent | undefined {
  return TOKEN_BENCHMARK_CONSTITUENTS.filter((row) => row.providerSlug === providerSlug && row.effectiveFrom <= onDate).sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom),
  )[0];
}

/** Every provider the methodology designates a model for. */
export function benchmarkProviders(): string[] {
  return [...new Set(TOKEN_BENCHMARK_CONSTITUENTS.map((row) => row.providerSlug))].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Is this canonical quote an eligible leg for the constituent's benchmark?
 * Standard tier only; the base context tier only; the default region only;
 * input or output only. Cache dimensions and every cache time-to-live are
 * excluded by the dimension test, batch and priority by the tier test, a
 * long-context surcharge by the context test, and a regional rate by the
 * region test.
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

/**
 * The benchmark from two legs, at full precision. Callers must have checked
 * eligibility; this is only the arithmetic the methodology fixes.
 */
export function tokenBenchmarkPrice(inputPrice: number, outputPrice: number): number {
  return TOKEN_PRICE_WORKLOAD.inputWeight * inputPrice + TOKEN_PRICE_WORKLOAD.outputWeight * outputPrice;
}

/** Why a provider has no benchmark. Reported, never silently swallowed. */
export type TokenBenchmarkWithheld =
  | "NO_CONSTITUENT_DESIGNATED"
  | "INPUT_LEG_UNAVAILABLE"
  | "OUTPUT_LEG_UNAVAILABLE"
  | "NO_OBSERVATION_DATE_WITH_BOTH_LEGS";

/**
 * Shown when a surface has no publishable benchmark at all. The methodology
 * needs a standard input and output rate for each provider's designated
 * model; without both, Urdais withholds rather than approximates.
 */
export const TOKEN_BENCHMARK_PENDING_NOTE =
  "No Token Price benchmark is available. It needs the standard input and output rates of each provider's designated benchmark model, and Urdais withholds the value rather than approximating it.";
