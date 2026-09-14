/**
 * Token-pricing dimension taxonomy.
 *
 * A pricing dimension is one economically distinct published rate for a model.
 * Input, output, cache, and (where the source prices them separately) cache
 * writes/reads are never collapsed. Batch, fast, peak, and long-context are
 * not dimensions: they are facets on an observation of a dimension.
 *
 * Blended is derived in application code. It is not a source dimension and
 * must never be stored as a quote.
 */

export const CANONICAL_CURRENCY = "USD" as const;
export const CANONICAL_DENOMINATOR_TOKENS = 1_000_000 as const;
export const CANONICAL_UNIT = "USD / 1M tokens" as const;

/** Source-native rates Urdais will ingest. Closed set. */
export const SOURCE_PRICING_DIMENSIONS = [
  "input",
  "output",
  "cached_input",
  "cache_write",
  "cache_read",
] as const;

export type SourcePricingDimension = (typeof SOURCE_PRICING_DIMENSIONS)[number];

/** Computed fields. Never a source quote. */
export const DERIVED_PRICING_DIMENSIONS = ["blended"] as const;
export type DerivedPricingDimension = (typeof DERIVED_PRICING_DIMENSIONS)[number];

export type PricingDimension = SourcePricingDimension | DerivedPricingDimension;

export const REQUIRED_DIMENSIONS = ["input", "output"] as const;
export const OPTIONAL_CACHE_DIMENSIONS = ["cached_input", "cache_write", "cache_read"] as const;

/**
 * Service tier is how the request is served, not which token class is billed.
 * Standard vs batch vs fast vs peak are distinct prices for the same dimension.
 */
export const SERVICE_TIERS = [
  "standard",
  "batch",
  "fast",
  "priority",
  "flex",
  "peak",
  "off_peak",
] as const;

export type ServiceTier = (typeof SERVICE_TIERS)[number];

/** Cache-write TTL when the source prices writes by duration. */
export const CACHE_TTLS = ["5m", "1h"] as const;
export type CacheTtl = (typeof CACHE_TTLS)[number];

export function isSourcePricingDimension(value: string): value is SourcePricingDimension {
  return (SOURCE_PRICING_DIMENSIONS as readonly string[]).includes(value);
}

export function isDerivedPricingDimension(value: string): value is DerivedPricingDimension {
  return (DERIVED_PRICING_DIMENSIONS as readonly string[]).includes(value);
}

export function assertSourcePricingDimension(value: string): SourcePricingDimension {
  if (!isSourcePricingDimension(value)) {
    throw new Error(
      `pricing dimension '${value}' is not a source quote; source dimensions are ${SOURCE_PRICING_DIMENSIONS.join(", ")}`,
    );
  }
  return value;
}

export function defaultServiceTier(tier: ServiceTier | null | undefined): ServiceTier {
  return tier ?? "standard";
}
