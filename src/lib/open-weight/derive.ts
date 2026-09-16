/**
 * Deriving the three open-weight views from rows the platform already holds.
 *
 * Nothing here reads a source, and nothing here computes a frontier. Volume comes from UTVI's
 * observations; capability and price come from Model Frontier's own derivation, already joined,
 * already priced and already marked `onFrontier`. This module's whole job is to group them by
 * access class without losing what it cannot group.
 *
 * Four rules, each a decision that could have gone the other way:
 *
 * **One denominator, and it is UTVI's.** Volume share divides by total observed tokens in the
 * window -- including the source's own aggregated tail, including permaslugs with no canonical
 * model. Dividing by classified-only volume would make the two known classes sum to 100 % while
 * a quarter of the traffic sat outside the calculation, which turns "of what we could
 * classify" into "of the market" in the reader's head. This is the same denominator Market
 * Share 1.1.0 uses, deliberately: two products disagreeing about the size of the market would
 * be worse than either answer.
 *
 * **Token arithmetic is exact.** A thirty-day window runs to 1e14 tokens and the shares matter
 * to a tenth of a point, so the sums and the division happen in `bigint` and narrow once, at
 * the end, through Market Share's own `percentOf`.
 *
 * **The price population is Model Frontier's Pareto set, not a band of this module's
 * invention.** The configurations compared are exactly the ones the Frontier chart marks
 * efficient -- the same objects, from the same `markFrontier` call -- partitioned by class.
 * There is no capability threshold, fixed or derived. A second selection rule here could drift
 * from the one the chart draws, and then two sections of one page would disagree about which
 * models are efficient.
 *
 * **Configurations are the unit, and are never collapsed first.** Domination is
 * configuration-level: a model can be efficient at high effort and dominated at low effort.
 * Deduplicating to one price per model before the population is determined would decide which
 * of its configurations speaks for it, which is the choice the Frontier methodology refuses.
 */

import { percentOf } from "@/lib/market-share/derive";
import { publicClassOf, type PublicAccessClass } from "@/lib/open-weight/classification";
import {
  MINIMUM_FRONTIER_SAMPLE,
  OpenWeightDerivationError,
  type BenchmarkComparison,
  type CapabilityGap,
  type ClassBest,
  type ClassConfigurationCounts,
  type ClassPrice,
  type PriceGap,
  type UnclassifiedBreakdown,
  type VolumeShare,
  type VolumeSlice,
} from "@/lib/open-weight/types";
import type { BenchmarkView } from "@/lib/frontier/read/derive";

/** One UTVI observation, already joined to its link state and access class by the loader. */
export type VolumeRow = {
  date: string;
  permaslug: string;
  isResidual: boolean;
  tokens: bigint;
  /** `evidenced` is the only state that may carry a model. */
  linkState: string;
  /** The live internal access class, or null when the model has none recorded. */
  accessClass: string | null;
  providerModelId: string | null;
};

/**
 * The access class of a canonical model, keyed by provider and model id.
 *
 * Keyed on both because `provider_model_id` alone is not unique across providers, and a
 * collision would silently attach one publisher's licence to another publisher's model.
 */
export type AccessClassLookup = ReadonlyMap<string, string>;

export const accessKey = (providerSlug: string, providerModelId: string): string =>
  `${providerSlug}/${providerModelId}`;

const EMPTY_COUNTS = (): ClassConfigurationCounts => ({
  open_weight: 0,
  proprietary: 0,
  unclassified: 0,
});

/**
 * Trailing-window volume share by public access class.
 *
 * The five unclassified causes are separated as they are counted, because they are not the
 * same kind of thing. The source's aggregated tail names no model at all; an unmapped
 * permaslug is research debt that should shrink; an unresolvable alias never will, because
 * there is no model to research; an undetermined model is evidence work not yet done; and a
 * non-commercial model is a settled finding that does not belong in a commercial comparison.
 * Collapsing them would hide which is growing, and would let a permanent alias masquerade as
 * a backlog item.
 */
export function deriveVolumeShare(rows: readonly VolumeRow[], windowDays: number): VolumeShare {
  if (rows.length === 0) {
    throw new OpenWeightDerivationError("no observations fall inside the trailing window");
  }

  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const tokensByClass = new Map<PublicAccessClass, bigint>([
    ["open_weight", 0n],
    ["proprietary", 0n],
    ["unclassified", 0n],
  ]);
  const breakdown = {
    sourceAggregated: 0n,
    unmapped: 0n,
    unresolvableIdentity: 0n,
    undeterminedAccess: 0n,
    noncommercial: 0n,
  };
  const modelsByClass = new Map<PublicAccessClass, Set<string>>([
    ["open_weight", new Set()],
    ["proprietary", new Set()],
    ["unclassified", new Set()],
  ]);

  let total = 0n;
  for (const row of rows) {
    if (row.tokens < 0n) {
      throw new OpenWeightDerivationError(`${row.permaslug} on ${row.date} has negative tokens`);
    }
    total += row.tokens;

    // The order of these tests is the semantics. A residual row has no model by construction,
    // so it is never asked about its link state. A link the bridge marked `not_applicable` is
    // a decided refusal and is separated before the general unmapped case, or a permanent
    // alias would be counted as backlog. Only then can an absent class mean missing evidence.
    let publicClass: PublicAccessClass;
    if (row.isResidual) {
      breakdown.sourceAggregated += row.tokens;
      publicClass = "unclassified";
    } else if (row.linkState === "not_applicable") {
      // The identity bridge has already ruled on this one: the identifier names no model that
      // can be pinned to the observation. Research will not move it, so it is never counted
      // as backlog.
      breakdown.unresolvableIdentity += row.tokens;
      publicClass = "unclassified";
    } else if (row.linkState !== "evidenced" || row.providerModelId === null) {
      breakdown.unmapped += row.tokens;
      publicClass = "unclassified";
    } else if (row.accessClass === null) {
      breakdown.undeterminedAccess += row.tokens;
      publicClass = "unclassified";
    } else {
      publicClass = publicClassOf(row.accessClass);
      if (publicClass === "unclassified") {
        // Non-commercial weights are a settled finding, not missing work, so they are counted
        // apart from undetermined access. It is the one Unclassified cause that looks like
        // Open-weight from the outside.
        if (row.accessClass === "open_weights_noncommercial") breakdown.noncommercial += row.tokens;
        else breakdown.undeterminedAccess += row.tokens;
      }
    }

    tokensByClass.set(publicClass, tokensByClass.get(publicClass)! + row.tokens);
    if (row.providerModelId !== null && publicClass !== "unclassified") {
      modelsByClass.get(publicClass)!.add(row.providerModelId);
    }
  }

  if (total <= 0n) {
    throw new OpenWeightDerivationError("the trailing window contains no observed tokens");
  }

  const slices: VolumeSlice[] = [...tokensByClass.entries()].map(([publicClass, tokens]) => ({
    publicClass,
    tokens: tokens.toString(),
    sharePercent: percentOf(tokens, total),
  }));

  const modelCounts = EMPTY_COUNTS();
  for (const [publicClass, models] of modelsByClass) modelCounts[publicClass] = models.size;

  const unclassifiedBreakdown: UnclassifiedBreakdown = {
    sourceAggregated: breakdown.sourceAggregated.toString(),
    unmapped: breakdown.unmapped.toString(),
    unresolvableIdentity: breakdown.unresolvableIdentity.toString(),
    undeterminedAccess: breakdown.undeterminedAccess.toString(),
    noncommercial: breakdown.noncommercial.toString(),
  };

  return {
    windowDays,
    firstDate: dates[0]!,
    lastDate: dates.at(-1)!,
    totalObservedTokens: total.toString(),
    slices,
    unclassifiedBreakdown,
    modelCounts,
  };
}

/**
 * The median, defined explicitly because the even case is a choice.
 *
 * With an even count this averages the two middle values rather than taking the lower. Either
 * is defensible; the average is stated here and in the methodology so the number is
 * reproducible from the published rows.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new OpenWeightDerivationError("a median needs at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** A Frontier point with the class its model folds to. The only thing this module adds. */
type ClassifiedPoint = BenchmarkView["points"][number] & { publicClass: PublicAccessClass };

function classify(view: BenchmarkView, classes: AccessClassLookup): ClassifiedPoint[] {
  return view.points.map((point) => {
    const accessClass = classes.get(accessKey(point.providerSlug, point.providerModelId)) ?? null;
    return { ...point, publicClass: accessClass === null ? "unclassified" : publicClassOf(accessClass) };
  });
}

function countByClass(points: readonly ClassifiedPoint[]): ClassConfigurationCounts {
  const counts = EMPTY_COUNTS();
  for (const point of points) counts[point.publicClass] += 1;
  return counts;
}

/** The best-scoring configuration in one class, or null when the class has none measured. */
function bestOf(points: readonly ClassifiedPoint[], publicClass: PublicAccessClass): ClassBest | null {
  const mine = points.filter((point) => point.publicClass === publicClass);
  if (mine.length === 0) return null;
  // Ties resolve on the model's canonical id, so the chosen row does not depend on row order.
  const best = mine.reduce((winner, point) =>
    point.score > winner.score || (point.score === winner.score && point.providerModelId < winner.providerModelId)
      ? point
      : winner,
  );
  return {
    publicClass,
    score: best.score,
    label: best.displayName,
    configuration: best.configuration,
    capabilityAsOf: best.capabilityAsOf,
    blendedUsdPer1m: best.blendedPrice,
    onFrontier: best.onFrontier,
  };
}

/**
 * Median blended price among one class's Pareto-efficient configurations.
 *
 * No threshold, no deduplication, no reordering of the population. The filter is membership of
 * the frontier Model Frontier already computed, and nothing else.
 */
function priceOf(points: readonly ClassifiedPoint[], publicClass: PublicAccessClass): ClassPrice | null {
  const efficient = points.filter((point) => point.onFrontier && point.publicClass === publicClass);
  if (efficient.length === 0) return null;
  return {
    publicClass,
    medianBlendedUsdPer1m: median(efficient.map((point) => point.blendedPrice)),
    configurationCount: efficient.length,
  };
}

/** Capability and price for one benchmark's already-derived Frontier points. */
export function deriveComparison(view: BenchmarkView, classes: AccessClassLookup): BenchmarkComparison {
  const points = classify(view, classes);

  const openBest = bestOf(points, "open_weight");
  const proprietaryBest = bestOf(points, "proprietary");
  const capabilityGap: CapabilityGap = {
    openWeight: openBest,
    proprietary: proprietaryBest,
    gap: openBest === null || proprietaryBest === null ? null : proprietaryBest.score - openBest.score,
  };

  const openPrice = priceOf(points, "open_weight");
  const proprietaryPrice = priceOf(points, "proprietary");
  const publishable =
    openPrice !== null &&
    proprietaryPrice !== null &&
    openPrice.configurationCount >= MINIMUM_FRONTIER_SAMPLE &&
    proprietaryPrice.configurationCount >= MINIMUM_FRONTIER_SAMPLE &&
    openPrice.medianBlendedUsdPer1m > 0;

  const priceGap: PriceGap = {
    openWeight: openPrice,
    proprietary: proprietaryPrice,
    // Computed only when publishable. A ratio held in the view "but not shown" is a ratio one
    // careless render away from being shown.
    ratio: publishable ? proprietaryPrice!.medianBlendedUsdPer1m / openPrice!.medianBlendedUsdPer1m : null,
    ratioPublishable: publishable,
  };

  return {
    slug: view.slug,
    label: view.label,
    capabilityGap,
    priceGap,
    configurations: countByClass(points),
    frontierConfigurations: countByClass(points.filter((point) => point.onFrontier)),
    priceAsOf: view.priceAsOf,
  };
}

/** Every benchmark Model Frontier derived, classified. */
export function deriveComparisons(
  views: readonly BenchmarkView[],
  classes: AccessClassLookup,
): BenchmarkComparison[] {
  return views.map((view) => deriveComparison(view, classes));
}
