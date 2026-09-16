/**
 * Model Frontier domain types: benchmark capability against provider list price per 1M tokens.
 *
 * The one sentence the product is allowed to say, and the boundary that makes it true, both
 * live here as constants so that no surface can drift from them by editing a string.
 *
 * The plotted unit is not a model. It is a **canonical priced SKU plus the configuration the
 * source declared it under** — `gpt-6-astra` at `max` effort is one point, and `gpt-6-astra`
 * at `low` is another, at the same price. Collapsing them would require choosing which score
 * speaks for the model, and there is no non-arbitrary way to choose: there is no `standard`
 * effort, the available levels differ per model, and taking the best one is score-maximising
 * selection — the mirror of the cheapest-row price selection the price rule exists to prevent.
 */

/** The public claim, rendered verbatim wherever a frontier is shown. */
export const MODEL_FRONTIER_CLAIM =
  "Benchmark capability against provider list price per 1M tokens." as const;

/**
 * The condition under which configuration-level plotting is honest.
 *
 * Per-token price is a property of the SKU and does not move with inference-time settings,
 * while capability and token consumption do. So two points at one x are two prices per token,
 * not two equal-cost options — and where one dominates the other it bought that capability
 * with tokens this chart does not count.
 */
export const MODEL_FRONTIER_COST_BOUNDARY =
  "Model Frontier compares benchmark capability with provider list price per 1M tokens. " +
  "Reasoning effort may change the number of tokens consumed, so equal unit token prices do " +
  "not imply equal total cost per request or task.";

/** Rendered where the source declared no configuration. Never inferred, never filled in. */
export const UNDECLARED_CONFIGURATION = "(as published)" as const;

/** The V1 benchmarks. Epoch-administered only; nothing externally sourced is eligible. */
export const FRONTIER_BENCHMARKS = [
  {
    slug: "gpqa-diamond",
    label: "GPQA Diamond",
    sourceFile: "gpqa_diamond.csv",
    sourceBenchmarkName: "GPQA diamond",
    /** Accuracy on a 0–1 scale. Rendered as a percentage; stored as the source's own number. */
    scoreMin: 0,
    scoreMax: 1,
    description: "Graduate-level science questions written to resist search.",
  },
  {
    slug: "frontiermath-tiers-1-3-v2",
    label: "FrontierMath Tiers 1–3 v2",
    sourceFile: "frontiermath_tiers_1_3_v2.csv",
    sourceBenchmarkName: "FrontierMath-Tiers-1-3-v2-Private",
    scoreMin: 0,
    scoreMax: 1,
    description: "Research-level mathematics problems, held privately to resist contamination.",
  },
] as const;

export type FrontierBenchmark = (typeof FRONTIER_BENCHMARKS)[number];
export type FrontierBenchmarkSlug = FrontierBenchmark["slug"];

/** Epoch marks externally sourced files with this suffix; they retain their original licensing. */
export const EXTERNAL_FILE_SUFFIX = "_external.csv" as const;

export const EPOCH_SOURCE_SLUG = "epoch-ai-benchmark-data" as const;
export const EPOCH_BUNDLE_URL = "https://epoch.ai/data/benchmark_data.zip" as const;
export const EPOCH_LICENSE = "Creative Commons Attribution 4.0 International (CC BY 4.0)" as const;
export const EPOCH_CITATION =
  "Epoch AI, 'Capabilities & Benchmarking'. Published online at epoch.ai. " +
  "Retrieved from 'https://epoch.ai/benchmarks' [online resource].";

/** One published result, exactly as the source gave it. */
export type CapabilityObservation = {
  benchmarkSlug: FrontierBenchmarkSlug;
  sourceBenchmarkName: string;
  sourceBenchmarkFile: string;
  /** Verbatim. Never parsed into, never rewritten. */
  sourceModelIdentifier: string;
  /** What the source declared, or null. Null is a fact, not a gap to fill. */
  sourceConfiguration: string | null;
  sourceOrganization: string | null;
  score: number;
  scoreMin: number;
  scoreMax: number;
  capabilityAsOf: string;
  rowContentHash: string;
};

/** How confidently a source identifier is known to be a priced Urdais model. */
export type LinkState = "evidenced" | "ambiguous" | "unmapped" | "not_applicable";

export type IdentityLink = {
  sourceModelIdentifier: string;
  /** The canonical SKU, where one is evidenced. */
  providerModelId: string | null;
  providerSlug: string | null;
  sourceConfiguration: string | null;
  state: LinkState;
  /** Why the link is asserted, in words a later reader can check. */
  evidence: string;
};

/** The named product characteristics whose price represents a model. */
export type PriceSelection = {
  providerSlug: string;
  providerModelId: string;
  serviceTier: string;
  contextTier: string | null;
  region: string | null;
  rationale: string;
};

/** One plotted point: a SKU, a configuration, a benchmark. */
export type FrontierPoint = {
  /** Stable key. Unique by construction; asserted by the derivation. */
  id: string;
  providerModelId: string;
  providerSlug: string;
  providerName: string;
  displayName: string;
  /** The configuration as declared, or null rendered as `(as published)`. */
  configuration: string | null;
  sourceModelIdentifier: string;
  benchmarkSlug: FrontierBenchmarkSlug;
  score: number;
  scoreMin: number;
  scoreMax: number;
  capabilityAsOf: string;
  /** Blended price, USD per 1M tokens, under Token Price 1.2. */
  blendedPrice: number;
  inputPrice: number;
  outputPrice: number;
  priceAsOf: string;
  onFrontier: boolean;
};

/** Why an observation did not become a point. Reported, never hidden. */
export type FrontierExclusion =
  | "unmapped"
  | "ambiguous"
  | "not_applicable"
  | "no_eligible_price"
  | "scored_but_unpriced";

export class FrontierContractError extends Error {
  constructor(detail: string) {
    super(`model frontier contract violated: ${detail}`);
    this.name = "FrontierContractError";
  }
}
