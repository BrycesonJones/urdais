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
 * because the licences are. Weights under a revenue-capped community licence are genuinely
 * downloadable and genuinely not MIT, and a schema that could only say "open" or "closed"
 * would force the methodology to assert an equivalence the licence text denies. The public
 * rollup folds them, and `classification.ts` is the single place that fold happens.
 *
 * **`unclassified` is a published number, not a rounding error.** Volume whose permaslug
 * Urdais cannot link to a canonical model, volume the source itself aggregates into `other`,
 * models whose access Urdais has not established, and models whose weights are published for
 * non-commercial use only all land there and are shown. The alternative -- renormalising the
 * two known classes to 100 % -- would silently convert ignorance into confidence, which is the
 * one failure this product cannot afford.
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
  "Open-weight means the publisher offers the weights for download under a licence permitting commercial use; it does not mean open source, and several of these licences restrict it. Weights published for non-commercial use only are reported as Unclassified. Volume is share of observed OpenRouter token volume, not of the industry. Prices are published list prices per token, not total inference cost: a model that emits more reasoning tokens to answer the same question costs more than its per-token price suggests." as const;

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
 * `sourceAggregated` is OpenRouter's own `other` row: the source-defined residual, named by
 * the source rather than by Urdais, and never resolvable here. `unlinked` is a permaslug with
 * no evidenced canonical model -- resolvable, and the number to watch. `undetermined` is a
 * linked model whose access class Urdais has not established. `noncommercial` is a model whose
 * weights are published but not for commercial use.
 */
export type UnclassifiedBreakdown = {
  sourceAggregated: string;
  unlinked: string;
  undetermined: string;
  /**
   * Downloadable weights that may not serve commercial inference. Broken out because it is the
   * one Unclassified cause that looks like Open-weight from the outside, and a reader comparing
   * this section against a licence table needs to see where it went.
   */
  noncommercial: string;
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
  /** Carried so the companion metric beside the price panel needs no second selection. */
  blendedUsdPer1m: number;
  onFrontier: boolean;
};

export type CapabilityGap = {
  openWeight: ClassBest | null;
  proprietary: ClassBest | null;
  /** Proprietary minus open-weight, in benchmark score units. Negative means open leads. */
  gap: number | null;
};

/** One class's slice of the benchmark's Pareto-efficient set. */
export type ClassPrice = {
  publicClass: PublicAccessClass;
  medianBlendedUsdPer1m: number;
  /**
   * The sample: how many Pareto-efficient **configurations** this class contributes. Never a
   * model count. A model evaluated at three efforts that is efficient at all three is three
   * members of the frontier, and collapsing it would change the population being described.
   */
  configurationCount: number;
};

/**
 * Below this many Pareto-efficient configurations in a class, no ratio is published.
 *
 * A median over one or two points is not a median, and a headline multiple drawn from it would
 * be an artefact of which two models happened to be evaluated and priced. Reporting the
 * shortfall is the correct product state; widening the population until a ratio appears is the
 * failure this floor exists to prevent.
 */
export const MINIMUM_FRONTIER_SAMPLE = 3;

/**
 * The price comparison, taken over the Model Frontier's own Pareto-efficient set.
 *
 * The population is not selected by this module. It is exactly the set of configurations that
 * Model Frontier marks `onFrontier` for the benchmark -- the same objects, from the same
 * derivation -- partitioned by public access class. There is no capability threshold, derived
 * or fixed, and no second frontier rule that could drift from the one the chart draws.
 *
 * Configurations stay the unit throughout. They are not deduplicated to one price per model
 * before the Pareto population is determined, because domination is configuration-level: a
 * model can be efficient at high effort and dominated at low effort, and collapsing it first
 * would decide which of its configurations speaks for it.
 */
export type PriceGap = {
  openWeight: ClassPrice | null;
  proprietary: ClassPrice | null;
  /**
   * Proprietary median over open-weight median, published only when **both** classes carry at
   * least `MINIMUM_FRONTIER_SAMPLE` efficient configurations. Null otherwise, and the section
   * says why rather than showing a number it cannot stand behind.
   */
  ratio: number | null;
  /** Whether the sample floor is met on both sides. False is a reportable product state. */
  ratioPublishable: boolean;
};

/** How many configurations each class contributes to the benchmark, before the frontier. */
export type ClassConfigurationCounts = Record<PublicAccessClass, number>;

/** Everything the section renders for one benchmark. */
export type BenchmarkComparison = {
  slug: string;
  label: string;
  capabilityGap: CapabilityGap;
  priceGap: PriceGap;
  /** Every plotted configuration on this benchmark, by class. Coverage, not a claim. */
  configurations: ClassConfigurationCounts;
  /** Pareto-efficient configurations, by class. `unclassified` is reported, never compared. */
  frontierConfigurations: ClassConfigurationCounts;
  priceAsOf: string | null;
};

export class OpenWeightDerivationError extends Error {
  constructor(detail: string) {
    super(`open-weight analysis cannot be derived: ${detail}`);
    this.name = "OpenWeightDerivationError";
  }
}
