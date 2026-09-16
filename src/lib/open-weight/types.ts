/**
 * Open-weight vs Proprietary: domain types.
 *
 * The public claim this module exists to keep narrow:
 *
 *   Whether a model's publisher makes its weights available for download, and what that
 *   distinction looks like across observed token volume, measured capability, and list price.
 *
 * It is not a claim about model quality, about openness in the OSI sense, about who may
 * lawfully use a model, or about where inference physically runs. A model with published
 * weights is overwhelmingly served through somebody's API; the class says what the publisher
 * released, never how the tokens in UTVI were actually served.
 *
 * **Six internal classes, three public ones.** The internal taxonomy is finer than the chart
 * because the licences are. Weights published under a revenue-capped community licence are
 * genuinely downloadable and genuinely not MIT, and a schema that could only say "open" or
 * "closed" would force the methodology to assert an equivalence the licence text denies. The
 * public rollup then folds them, and the methodology states the fold rather than hiding it.
 *
 * **`unclassified` is a published number, not a rounding error.** Volume whose permaslug
 * Urdais cannot link to a canonical model, volume the source itself aggregates into `other`,
 * and models whose access Urdais has not established all land there and are shown. The
 * alternative -- renormalising the two known classes to 100 % -- would silently convert
 * ignorance into confidence, which is the one failure this product cannot afford.
 */

import type { ModelAccessClass, PublicAccessClass } from "@/lib/open-weight/classification";

export { type ModelAccessClass, type PublicAccessClass };

/** What the section may be said to measure, rendered beside the numbers. */
export const OPEN_WEIGHT_CLAIM =
  "Whether each model's publisher released downloadable weights, measured across observed OpenRouter token volume, Epoch AI benchmark scores, and published list prices." as const;

/**
 * The semantic boundary, rendered publicly and asserted by test.
 *
 * Three separate over-readings are refused here, and each one is a claim a reader would
 * otherwise make for free: that open weights means open source, that a class share of
 * OpenRouter volume is a share of the industry, and that a cheaper median list price means a
 * cheaper system. The third is inherited from Model Frontier, where the same list-price
 * arithmetic is bounded the same way.
 */
export const OPEN_WEIGHT_BOUNDARY =
  "Open-weight means the publisher offers the weights for download; it does not mean open source, and several of these licences restrict commercial use. Volume is share of observed OpenRouter token volume, not of the industry. Prices are published list prices per token, not total inference cost: a model that emits more reasoning tokens to answer the same question costs more than its per-token price suggests." as const;

/** The trailing window for volume share. Matches Market Share, so the two cannot disagree. */
export const VOLUME_WINDOW_DAYS = 30;

/** One model's live access classification, as the read layer receives it. */
export type AccessClassification = {
  providerSlug: string;
  providerModelId: string;
  displayName: string;
  accessClass: ModelAccessClass;
  publicClass: PublicAccessClass;
  licenseName: string | null;
  evidenceUrl: string | null;
  evidenceType: string;
  effectiveFrom: string;
};

/** One public class's slice of the trailing window. */
export type VolumeSlice = {
  publicClass: PublicAccessClass;
  /** Exact, as a decimal string: a window's token count exceeds what a double holds. */
  tokens: string;
  sharePercent: number;
};

/**
 * Why volume is unclassified, kept apart because the three causes are different work.
 *
 * `sourceAggregated` is OpenRouter's own `other` row and can never be resolved by Urdais.
 * `unlinked` is a permaslug with no evidenced canonical model -- resolvable, and the number
 * to watch. `undetermined` is a linked model whose access class Urdais has not established.
 */
export type UnclassifiedBreakdown = {
  sourceAggregated: string;
  unlinked: string;
  undetermined: string;
};

export type VolumeShare = {
  windowDays: number;
  firstDate: string;
  lastDate: string;
  /** The denominator: total observed tokens in the window, the same one Market Share uses. */
  totalObservedTokens: string;
  slices: VolumeSlice[];
  unclassifiedBreakdown: UnclassifiedBreakdown;
  /** How many distinct evidenced models contributed, per public class. */
  modelCounts: Record<PublicAccessClass, number>;
};

/** The best-scoring configuration in one public class, on one benchmark. */
export type ClassBest = {
  publicClass: PublicAccessClass;
  score: number;
  label: string;
  configuration: string | null;
  capabilityAsOf: string;
};

export type CapabilityGap = {
  openWeight: ClassBest | null;
  proprietary: ClassBest | null;
  /** Proprietary minus open-weight, in benchmark score units. Negative means open leads. */
  gap: number | null;
};

/** One class's median list price within the capability-matched band. */
export type ClassPrice = {
  publicClass: PublicAccessClass;
  medianBlendedUsdPer1m: number;
  modelCount: number;
};

/**
 * The capability-matched price comparison.
 *
 * The threshold is not a constant. It is the lower of the two classes' best scores on the
 * selected benchmark, which makes the comparison symmetric, guarantees both sides are
 * non-empty, and removes the one degree of freedom that could be tuned to produce a
 * flattering ratio. Comparing every open model against every proprietary model instead would
 * measure the composition of each class's tail, not the price of comparable capability.
 */
export type PriceGap = {
  capabilityThreshold: number;
  openWeight: ClassPrice | null;
  proprietary: ClassPrice | null;
  /** Proprietary median divided by open-weight median. Null when either side is absent. */
  ratio: number | null;
};

/** Everything the section renders for one benchmark. */
export type BenchmarkComparison = {
  slug: string;
  label: string;
  capabilityGap: CapabilityGap;
  priceGap: PriceGap;
  priceAsOf: string | null;
};

export class OpenWeightDerivationError extends Error {
  constructor(detail: string) {
    super(`open-weight analysis cannot be derived: ${detail}`);
    this.name = "OpenWeightDerivationError";
  }
}
