/**
 * Turning stored observations, links and price selections into plotted points.
 *
 * The join is three exact hops, and each one can drop a model. That is the design: an
 * observation whose identity is not evidenced, or whose model has no comparable price, is
 * **kept and not plotted**, and the count is reported beside the chart. Hiding the shortfall
 * would make a partial frontier look complete, which is the one failure this product cannot
 * afford — every remaining point would still look correct.
 *
 * Nothing here chooses. It joins what is evidenced, prices what is selectable, counts what
 * fell out, and hands the rest to the Pareto rule.
 */

import { markFrontier } from "@/lib/frontier/pareto";
import { blendedPrice } from "@/lib/frontier/price";
import {
  FRONTIER_BENCHMARKS,
  UNDECLARED_CONFIGURATION,
  type FrontierBenchmarkSlug,
  type FrontierExclusion,
  type FrontierPoint,
} from "@/lib/frontier/types";

/** One stored observation joined to whatever identity and price it has. */
export type JoinableRow = {
  benchmarkSlug: FrontierBenchmarkSlug;
  sourceModelIdentifier: string;
  sourceConfiguration: string | null;
  score: number;
  scoreMin: number;
  scoreMax: number;
  capabilityAsOf: string;
  /** Null unless the link is evidenced. */
  linkState: string;
  providerModelId: string | null;
  providerSlug: string | null;
  providerName: string | null;
  displayName: string | null;
  /** Null unless a price selection resolved to exactly one pair. */
  inputPrice: number | null;
  outputPrice: number | null;
  priceAsOf: string | null;
};

export type BenchmarkView = {
  slug: FrontierBenchmarkSlug;
  label: string;
  description: string;
  points: FrontierPoint[];
  frontierCount: number;
  distinctModelCount: number;
  rawObservationCount: number;
  exclusions: Record<FrontierExclusion, number>;
  /** The span of evaluation dates on this benchmark's plotted points. */
  capabilityAsOfRange: { first: string; last: string } | null;
  priceAsOf: string | null;
};

const EMPTY_EXCLUSIONS = (): Record<FrontierExclusion, number> => ({
  unmapped: 0,
  ambiguous: 0,
  not_applicable: 0,
  no_eligible_price: 0,
  scored_but_unpriced: 0,
});

/** Render a configuration for display. A declared null is a fact and says so. */
export function configurationLabel(configuration: string | null): string {
  return configuration ?? UNDECLARED_CONFIGURATION;
}

/**
 * Derive one benchmark's view.
 *
 * `rows` must already be restricted to live observations and live links; this function does
 * not filter by supersession, because doing it here would let a caller skip it.
 */
export function deriveBenchmark(slug: FrontierBenchmarkSlug, rows: readonly JoinableRow[]): BenchmarkView {
  const benchmark = FRONTIER_BENCHMARKS.find((entry) => entry.slug === slug)!;
  const mine = rows.filter((row) => row.benchmarkSlug === slug);
  const exclusions = EMPTY_EXCLUSIONS();
  const plottable: FrontierPoint[] = [];

  for (const row of mine) {
    if (row.linkState !== "evidenced" || row.providerModelId === null || row.providerSlug === null) {
      // Three different facts, reported as three different counts: research not done,
      // a catalogue that cannot distinguish two products, and a thing that is not a
      // purchasable model at all.
      if (row.linkState === "ambiguous") exclusions.ambiguous += 1;
      else if (row.linkState === "not_applicable") exclusions.not_applicable += 1;
      else exclusions.unmapped += 1;
      continue;
    }
    if (row.inputPrice === null || row.outputPrice === null || row.priceAsOf === null) {
      // The identity is evidenced and the model still cannot be plotted, which is a
      // different problem from an unknown identity and is counted separately.
      exclusions.no_eligible_price += 1;
      exclusions.scored_but_unpriced += 1;
      continue;
    }

    plottable.push({
      id: `${slug}:${row.sourceModelIdentifier}`,
      providerModelId: row.providerModelId,
      providerSlug: row.providerSlug,
      providerName: row.providerName ?? row.providerSlug,
      displayName: row.displayName ?? row.providerModelId,
      configuration: row.sourceConfiguration,
      sourceModelIdentifier: row.sourceModelIdentifier,
      benchmarkSlug: slug,
      score: row.score,
      scoreMin: row.scoreMin,
      scoreMax: row.scoreMax,
      capabilityAsOf: row.capabilityAsOf,
      blendedPrice: blendedPrice(row.inputPrice, row.outputPrice),
      inputPrice: row.inputPrice,
      outputPrice: row.outputPrice,
      priceAsOf: row.priceAsOf,
      onFrontier: false,
    });
  }

  const points = markFrontier(plottable);
  const dates = points.map((point) => point.capabilityAsOf).sort();
  const priceDates = points.map((point) => point.priceAsOf).sort();

  return {
    slug,
    label: benchmark.label,
    description: benchmark.description,
    points,
    frontierCount: points.filter((point) => point.onFrontier).length,
    distinctModelCount: new Set(points.map((point) => point.providerModelId)).size,
    rawObservationCount: mine.length,
    exclusions,
    capabilityAsOfRange: dates.length === 0 ? null : { first: dates[0]!, last: dates[dates.length - 1]! },
    // One price observation date today; the latest is the honest stamp if that ever changes.
    priceAsOf: priceDates.length === 0 ? null : priceDates[priceDates.length - 1]!,
  };
}

/** Every V1 benchmark, in declared order. A benchmark with no points still appears, empty. */
export function deriveAll(rows: readonly JoinableRow[]): BenchmarkView[] {
  return FRONTIER_BENCHMARKS.map((benchmark) => deriveBenchmark(benchmark.slug, rows));
}
