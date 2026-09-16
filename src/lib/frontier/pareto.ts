/**
 * The Pareto frontier, computed over configurations rather than over models.
 *
 * A configuration is on the frontier when nothing else on the same benchmark is at least as
 * capable and at least as cheap, with at least one of those strict. That is the ordinary
 * definition; what is unusual here is the entity it ranges over.
 *
 * **Domination is configuration-level.** `gpt-6-astra` at `max` effort and at `low` effort are
 * two points at the *same* x, because per-token price is a property of the SKU and does not
 * move with inference-time settings. So a model can be on the frontier under one configuration
 * and not another, and the higher-effort point will generally dominate the lower one. That is
 * true on the axes drawn and it is not the whole economic truth — the high-effort point bought
 * its capability with tokens this chart does not count — which is why the cost boundary is
 * rendered beside every frontier rather than tucked into the methodology.
 *
 * Collapsing configurations before this runs would require choosing which score speaks for a
 * model, and there is no non-arbitrary way to choose. Plotting all of them selects nothing and
 * lets domination do the work.
 */

import { FrontierContractError, type FrontierPoint } from "@/lib/frontier/types";

/** The comparison a frontier point must survive. Exported for the tests to exercise directly. */
export function dominates(
  challenger: { score: number; blendedPrice: number },
  incumbent: { score: number; blendedPrice: number },
): boolean {
  const atLeastAsGood = challenger.score >= incumbent.score && challenger.blendedPrice <= incumbent.blendedPrice;
  const strictlyBetter = challenger.score > incumbent.score || challenger.blendedPrice < incumbent.blendedPrice;
  return atLeastAsGood && strictlyBetter;
}

/**
 * Mark the frontier members of one benchmark's points.
 *
 * Refuses a duplicate key rather than resolving it. Two rows for the same SKU, configuration
 * and benchmark would mean the source published one result twice or the identity layer
 * produced two links for one identifier; either is a defect, and picking one would hide it.
 *
 * Exact ties are handled by the definition and need no special case: two points with identical
 * score and price do not dominate each other, because neither is *strictly* better on either
 * axis, so both stay on the frontier. Ordering is by price then score then id, so the drawn
 * path and the reported list are stable across runs.
 */
export function markFrontier(points: readonly FrontierPoint[]): FrontierPoint[] {
  const seen = new Set<string>();
  for (const point of points) {
    const key = `${point.benchmarkSlug}${point.providerModelId}${point.configuration ?? ""}`;
    if (seen.has(key)) {
      throw new FrontierContractError(
        `duplicate point for ${point.providerModelId} (${point.configuration ?? "as published"}) on ${point.benchmarkSlug}`,
      );
    }
    seen.add(key);
  }

  const marked = points.map((point) => ({
    ...point,
    onFrontier: !points.some((other) => other.id !== point.id && dominates(other, point)),
  }));

  return marked.sort(
    (a, b) =>
      a.blendedPrice - b.blendedPrice ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  );
}

/** The frontier members, cheapest first: the path the chart draws. */
export function frontierPath(points: readonly FrontierPoint[]): FrontierPoint[] {
  return points.filter((point) => point.onFrontier).sort((a, b) => a.blendedPrice - b.blendedPrice || b.score - a.score);
}
