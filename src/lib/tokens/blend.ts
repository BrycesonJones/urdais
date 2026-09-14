/**
 * Derived blended price. Never a source quote.
 *
 *   blended = inputWeight * input + outputWeight * output
 *
 * Weights are versioned and must be supplied. There is no product-default
 * 50/50 blend. Cache, batch, and context-tier prices are not inputs to this
 * function.
 */

import { modelIdentityKey, type ModelIdentity } from "@/lib/tokens/identity";
import type { CanonicalTokenPrice } from "@/lib/tokens/normalize";

export type BlendWeights = {
  version: string;
  inputWeight: number;
  outputWeight: number;
};

export type DerivedBlend = {
  kind: "derived";
  dimension: "blended";
  priceUsdPer1m: number;
  weights: BlendWeights;
  identityKey: string;
};

const WEIGHT_SUM_TOLERANCE = 1e-12;

export function assertBlendWeights(weights: BlendWeights): void {
  if (!weights.version.trim()) throw new Error("blend weights require an explicit version");
  if (!Number.isFinite(weights.inputWeight) || !Number.isFinite(weights.outputWeight)) {
    throw new Error("blend weights must be finite");
  }
  if (weights.inputWeight < 0 || weights.outputWeight < 0) {
    throw new Error("blend weights must be ≥ 0");
  }
  const sum = weights.inputWeight + weights.outputWeight;
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`blend weights must sum to 1 (got ${sum}); no implicit 50/50 default`);
  }
}

export function blendInputOutput(
  identity: Pick<ModelIdentity, "providerSlug" | "providerModelId">,
  input: CanonicalTokenPrice,
  output: CanonicalTokenPrice,
  weights: BlendWeights,
): DerivedBlend {
  assertBlendWeights(weights);
  return {
    kind: "derived",
    dimension: "blended",
    priceUsdPer1m: weights.inputWeight * input.priceUsdPer1m + weights.outputWeight * output.priceUsdPer1m,
    weights,
    identityKey: modelIdentityKey(identity.providerSlug, identity.providerModelId),
  };
}
