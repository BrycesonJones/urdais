/**
 * Deterministic default series selection. Prefers a current model, standard
 * service tier, standard/short context, and input pricing. Tie-breaks are
 * identity (provider slug, then native model id), never a quality ranking.
 */

import { SOURCE_PRICING_DIMENSIONS, type SourcePricingDimension } from "@/lib/tokens/dimensions";
import { WAVE1_MODELS, type Wave1ModelSeed } from "@/lib/tokens/catalog";
import { modelIdentityKey } from "@/lib/tokens/identity";
import type { PublicTokenSeries } from "@/lib/tokens/read/api-contract";

const PREFERRED_CONTEXT = new Set([null, "", "short_context", "prompt_lt_200k", "default"]);

function dimensionRank(dimension: SourcePricingDimension): number {
  const index = SOURCE_PRICING_DIMENSIONS.indexOf(dimension);
  if (dimension === "input") return 0;
  return 1 + (index < 0 ? SOURCE_PRICING_DIMENSIONS.length : index);
}

function lifecycleRank(model: Wave1ModelSeed | undefined): number {
  return model?.lifecycleStatus === "current" ? 0 : 1;
}

function modelFor(series: PublicTokenSeries, models: readonly Wave1ModelSeed[]): Wave1ModelSeed | undefined {
  const key = modelIdentityKey(series.providerSlug, series.providerModelId);
  return models.find((row) => modelIdentityKey(row.providerSlug, row.providerModelId) === key);
}

function defaultRank(series: PublicTokenSeries, models: readonly Wave1ModelSeed[]): number[] {
  return [
    lifecycleRank(modelFor(series, models)),
    dimensionRank(series.pricingDimension),
    series.serviceTier === "standard" ? 0 : 1,
    PREFERRED_CONTEXT.has(series.contextTier) ? 0 : 1,
    series.cacheTtl === null ? 0 : 1,
    series.region === null ? 0 : 1,
  ];
}

function compareIdentity(a: PublicTokenSeries, b: PublicTokenSeries): number {
  return (
    a.providerSlug.localeCompare(b.providerSlug, "en") ||
    a.providerModelId.localeCompare(b.providerModelId, "en") ||
    a.pricingDimension.localeCompare(b.pricingDimension, "en") ||
    a.serviceTier.localeCompare(b.serviceTier, "en") ||
    (a.contextTier ?? "").localeCompare(b.contextTier ?? "", "en") ||
    (a.cacheTtl ?? "").localeCompare(b.cacheTtl ?? "", "en") ||
    (a.region ?? "").localeCompare(b.region ?? "", "en")
  );
}

export function pickDefaultTokenSeries(
  series: readonly PublicTokenSeries[],
  models: readonly Wave1ModelSeed[] = WAVE1_MODELS,
): PublicTokenSeries | undefined {
  if (series.length === 0) return undefined;
  return [...series].sort((a, b) => {
    const ra = defaultRank(a, models);
    const rb = defaultRank(b, models);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
    }
    return compareIdentity(a, b);
  })[0];
}
