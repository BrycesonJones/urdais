/**
 * The product-level token-price benchmark.
 *
 * Urdais's canonical token data is per model and per pricing dimension: a
 * model has an input price, an output price, and often cached-input,
 * cache-write, batch, service-tier, context-tier and regional prices. The
 * product concept is simpler than that: one token price per lab, quoted per
 * 1M tokens, the way the Tokens market has always been presented.
 *
 * Turning the first into the second is a methodology decision Urdais has not
 * taken. `blend.ts` supplies the mechanism and deliberately refuses a default:
 * "Weights are versioned and must be supplied. There is no product-default
 * 50/50 blend." No token methodology document exists under docs/methodology,
 * so no approved weights, no approved economic object and no approved model
 * selection rule exist either.
 *
 * Until they do, this module reports the benchmark as undefined and the
 * product publishes no token price. It does not pick a dimension, average
 * anything, or fall back to the retired demo series. The canonical
 * observations remain readable for verification; they are simply not a
 * published benchmark yet.
 */

export type TokenBenchmarkDefinition =
  | { status: "undefined"; requires: readonly string[] }
  | {
      status: "defined";
      version: string;
      /** How one published number is derived from a lab's canonical prices. */
      describe: string;
    };

/**
 * What must be settled before a lab-level token price can be published. Each
 * line is a decision, not an implementation task.
 */
export const TOKEN_BENCHMARK_REQUIREMENTS: readonly string[] = [
  "A token methodology document under docs/methodology defining the economic object: what a published lab token price measures, as UCPI does for compute.",
  "Which pricing dimensions enter the benchmark, and which are excluded. Input and output are candidates; cached input, cache writes, batch and priority tiers are separate products.",
  "Versioned blend weights, which blend.ts requires and refuses to default (inputWeight + outputWeight = 1, with an explicit version string).",
  "Whether the benchmark is per model or per lab, and if per lab, which models represent it and how they are weighted.",
  "Which service tier, context tier and region are canonical when a lab publishes several.",
  "The publication rule: breadth, freshness and the fail-closed state when a lab's prices cannot be observed.",
];

/** No approved benchmark exists. Published token prices are therefore withheld. */
export const TOKEN_PRODUCT_BENCHMARK: TokenBenchmarkDefinition = {
  status: "undefined",
  requires: TOKEN_BENCHMARK_REQUIREMENTS,
};

/** One line for a product surface that has markets but no publishable number. */
export const TOKEN_BENCHMARK_PENDING_NOTE =
  "Token price benchmark not yet defined. Canonical model prices are collected; the published lab benchmark awaits an approved methodology.";

export function tokenBenchmarkIsDefined(benchmark: TokenBenchmarkDefinition = TOKEN_PRODUCT_BENCHMARK): boolean {
  return benchmark.status === "defined";
}
