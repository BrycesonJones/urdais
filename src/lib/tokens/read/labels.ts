/**
 * Display labels for public token-price series. Derived from canonical
 * facets; never a blended or ranked metric.
 */

import type { CacheTtl, ServiceTier, SourcePricingDimension } from "@/lib/tokens/dimensions";
import { isWave1Provider } from "@/lib/tokens/read/publication";
import type { Wave1Provider } from "@/lib/tokens/types";

export const TOKEN_CHART_UNIT = "$/1M tokens";

export const WAVE1_PROVIDER_NAMES: Record<Wave1Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
  google: "Google",
  deepseek: "DeepSeek",
  alibaba: "Alibaba Cloud",
};

const DIMENSION_LABELS: Record<SourcePricingDimension, string> = {
  input: "Input",
  output: "Output",
  cached_input: "Cached input",
  cache_write: "Cache write",
  cache_read: "Cache read",
};

const UNIT_CAPTIONS: Record<SourcePricingDimension, string> = {
  input: "per 1M input tokens",
  output: "per 1M output tokens",
  cached_input: "per 1M cached input tokens",
  cache_write: "per 1M cache-write tokens",
  cache_read: "per 1M cache-read tokens",
};

const SERVICE_TIER_LABELS: Record<ServiceTier, string> = {
  standard: "Standard",
  batch: "Batch",
  fast: "Fast",
  priority: "Priority",
  flex: "Flex",
  peak: "Peak",
  off_peak: "Off-peak",
};

export function providerDisplayName(slug: string): string {
  // Membership, not three literals: a provider missing from this test renders
  // as its raw slug in every chart label and instrument name.
  return isWave1Provider(slug) ? WAVE1_PROVIDER_NAMES[slug] : slug;
}

export function pricingDimensionLabel(dimension: SourcePricingDimension): string {
  return DIMENSION_LABELS[dimension];
}

export function tokenUnitCaption(dimension: SourcePricingDimension): string {
  return UNIT_CAPTIONS[dimension];
}

export function serviceTierLabel(tier: ServiceTier): string {
  return SERVICE_TIER_LABELS[tier];
}

export function contextTierLabel(tier: string): string {
  switch (tier) {
    case "short_context":
      return "Short context";
    case "long_context":
      return "Long context";
    case "prompt_lt_200k":
      return "Prompt < 200k";
    case "prompt_gte_200k":
      return "Prompt ≥ 200k";
    default:
      return tier.replaceAll("_", " ");
  }
}

export function cacheTtlLabel(ttl: CacheTtl): string {
  return ttl;
}

export function regionLabel(region: string): string {
  if (region === "us") return "US";
  return region.replaceAll("_", " ");
}

/** Dimension plus non-default facets so input and output are never anonymous. */
export function tokenFacetLabel(parts: {
  pricingDimension: SourcePricingDimension;
  serviceTier: ServiceTier;
  contextTier: string | null;
  cacheTtl: CacheTtl | null;
  region: string | null;
}): string {
  const pieces = [pricingDimensionLabel(parts.pricingDimension)];
  if (parts.serviceTier !== "standard") pieces.push(serviceTierLabel(parts.serviceTier));
  if (parts.contextTier) pieces.push(contextTierLabel(parts.contextTier));
  if (parts.cacheTtl) pieces.push(cacheTtlLabel(parts.cacheTtl));
  if (parts.region) pieces.push(regionLabel(parts.region));
  return pieces.join(" · ");
}

export function tokenSeriesLabel(displayName: string, facetLabel: string): string {
  return `${displayName} · ${facetLabel}`;
}
