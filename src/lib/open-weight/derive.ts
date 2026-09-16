/**
 * Deriving the three open-weight views from rows the platform already holds.
 *
 * Nothing here reads a source. Volume comes from UTVI's observations, capability from Epoch's
 * ingested scores, price from the Token Price selections Model Frontier already makes. This
 * module's whole job is to group them by access class without losing what it cannot group.
 *
 * Three rules, each a decision that could have gone the other way:
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
 * **The price band is derived, never chosen.** See `PriceGap`: the threshold is the lower of
 * the two class bests, so there is no constant anyone could tune. The demo this replaces used
 * a hardcoded capability score of 80, which is exactly the degree of freedom that makes a
 * price ratio unfalsifiable.
 */

import { percentOf } from "@/lib/market-share/derive";
import { publicClassOf, type PublicAccessClass } from "@/lib/open-weight/classification";
import {
  OpenWeightDerivationError,
  type BenchmarkComparison,
  type CapabilityGap,
  type ClassBest,
  type ClassPrice,
  type PriceGap,
  type UnclassifiedBreakdown,
  type VolumeShare,
  type VolumeSlice,
} from "@/lib/open-weight/types";

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

/** One capability observation joined to a canonical model, its class, and its selected price. */
export type ComparisonRow = {
  benchmarkSlug: string;
  benchmarkLabel: string;
  score: number;
  configuration: string | null;
  capabilityAsOf: string;
  providerModelId: string;
  displayName: string;
  accessClass: string;
  /** The blended list price per 1M tokens, or null when no eligible price was selected. */
  blendedUsdPer1m: number | null;
  priceAsOf: string | null;
};

const EMPTY_COUNTS = (): Record<PublicAccessClass, number> => ({
  open_weight: 0,
  proprietary: 0,
  unclassified: 0,
});

/**
 * Trailing-window volume share by public access class.
 *
 * The three unclassified causes are separated as they are counted, because they are different
 * work: the source's aggregated tail can never be resolved, an unlinked permaslug is identity
 * work Urdais has not done, and an undetermined model is evidence research not yet done.
 * Collapsing them would hide which of the three is actually growing.
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
  const breakdown = { sourceAggregated: 0n, unlinked: 0n, undetermined: 0n };
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
    // so it is never asked about its link state; a non-evidenced link is unresolved identity
    // whatever else is known; and only then can an absent class mean unestablished evidence.
    let publicClass: PublicAccessClass;
    if (row.isResidual) {
      breakdown.sourceAggregated += row.tokens;
      publicClass = "unclassified";
    } else if (row.linkState !== "evidenced" || row.providerModelId === null) {
      breakdown.unlinked += row.tokens;
      publicClass = "unclassified";
    } else if (row.accessClass === null) {
      breakdown.undetermined += row.tokens;
      publicClass = "unclassified";
    } else {
      publicClass = publicClassOf(row.accessClass);
      // `unknown` and `not_applicable` fold to unclassified but are *established* answers, so
      // they are counted as undetermined rather than as a gap in the identity bridge.
      if (publicClass === "unclassified") breakdown.undetermined += row.tokens;
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
    unlinked: breakdown.unlinked.toString(),
    undetermined: breakdown.undetermined.toString(),
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

/** The best-scoring configuration in one class, or null when the class has no measured model. */
function bestOf(rows: readonly ComparisonRow[], publicClass: PublicAccessClass): ClassBest | null {
  const mine = rows.filter((row) => publicClassOf(row.accessClass) === publicClass);
  if (mine.length === 0) return null;
  // Ties resolve on the model's canonical id, so the chosen row does not depend on row order.
  const best = mine.reduce((winner, row) =>
    row.score > winner.score || (row.score === winner.score && row.providerModelId < winner.providerModelId)
      ? row
      : winner,
  );
  return {
    publicClass,
    score: best.score,
    label: best.displayName,
    configuration: best.configuration,
    capabilityAsOf: best.capabilityAsOf,
  };
}

/**
 * Median blended list price among the models of one class at or above the threshold.
 *
 * Deduplicated by canonical model before the median is taken. A model measured at three
 * reasoning efforts is one product at one price, and letting it contribute three identical
 * prices would weight the median by how thoroughly Epoch happened to evaluate it.
 */
function priceOf(
  rows: readonly ComparisonRow[],
  publicClass: PublicAccessClass,
  threshold: number,
): ClassPrice | null {
  const byModel = new Map<string, number>();
  for (const row of rows) {
    if (publicClassOf(row.accessClass) !== publicClass) continue;
    if (row.score < threshold) continue;
    if (row.blendedUsdPer1m === null) continue;
    byModel.set(row.providerModelId, row.blendedUsdPer1m);
  }
  if (byModel.size === 0) return null;
  return {
    publicClass,
    medianBlendedUsdPer1m: median([...byModel.values()]),
    modelCount: byModel.size,
  };
}

/** Capability and price for one benchmark's rows. */
export function deriveComparison(slug: string, label: string, rows: readonly ComparisonRow[]): BenchmarkComparison {
  const openBest = bestOf(rows, "open_weight");
  const proprietaryBest = bestOf(rows, "proprietary");

  const capabilityGap: CapabilityGap = {
    openWeight: openBest,
    proprietary: proprietaryBest,
    gap: openBest === null || proprietaryBest === null ? null : proprietaryBest.score - openBest.score,
  };

  // The band both classes can clear. With one class absent there is no comparison to make, and
  // a threshold of zero would quietly compare a frontier against a tail.
  const threshold =
    openBest === null || proprietaryBest === null ? null : Math.min(openBest.score, proprietaryBest.score);

  const priceGap: PriceGap = {
    capabilityThreshold: threshold ?? 0,
    openWeight: threshold === null ? null : priceOf(rows, "open_weight", threshold),
    proprietary: threshold === null ? null : priceOf(rows, "proprietary", threshold),
    ratio: null,
  };
  if (priceGap.openWeight !== null && priceGap.proprietary !== null && priceGap.openWeight.medianBlendedUsdPer1m > 0) {
    priceGap.ratio = priceGap.proprietary.medianBlendedUsdPer1m / priceGap.openWeight.medianBlendedUsdPer1m;
  }

  const priceDates = rows.map((row) => row.priceAsOf).filter((date): date is string => date !== null).sort();

  return { slug, label, capabilityGap, priceGap, priceAsOf: priceDates.at(-1) ?? null };
}

/** Every benchmark present in the rows, in the order the rows name them. */
export function deriveComparisons(rows: readonly ComparisonRow[]): BenchmarkComparison[] {
  const bySlug = new Map<string, { label: string; rows: ComparisonRow[] }>();
  for (const row of rows) {
    const entry = bySlug.get(row.benchmarkSlug) ?? { label: row.benchmarkLabel, rows: [] };
    entry.rows.push(row);
    bySlug.set(row.benchmarkSlug, entry);
  }
  return [...bySlug.entries()].map(([slug, entry]) => deriveComparison(slug, entry.label, entry.rows));
}
