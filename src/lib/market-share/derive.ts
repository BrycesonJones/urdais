/**
 * Deriving model and lab share from UTVI's own observations.
 *
 * This is an aggregation, not an ingestion. Every number below comes from rows UTVI already
 * collected, normalised and attributed; nothing here reads OpenRouter, and nothing here invents
 * a model, a lab or a date.
 *
 * Three rules do the work, and each one is a decision that could have gone the other way:
 *
 * **One denominator.** Model share and lab share both divide by the same total observed token
 * volume for the date — the figure UTVI publishes. Dividing lab share by attributed-only volume
 * would make the lab table sum to 100 % while the source's `other` row sat outside it, which
 * quietly promotes a share of *some* observed traffic into a share of *the* observed traffic.
 * Under one denominator the two residuals stay visible as rows and the decomposition closes.
 *
 * **Percentages are computed on integers.** Token counts run to 1e13 and the ratios matter to
 * the third decimal, so the division happens in `bigint` at a fixed scale and is narrowed once,
 * at the end. Summing narrowed doubles instead would make the reconciliation check measure
 * floating-point drift rather than the data.
 *
 * **A model's identity is the source's permaslug, verbatim.** Urdais has no canonical registry
 * covering the four hundred-odd permaslugs this dataset names, and inventing display names for
 * them would be exactly the guessing that `identity.ts` refuses for labs. The lab, where
 * evidenced, is the secondary label — canonical, from Urdais reference data.
 */

import {
  MarketShareDerivationError,
  PERCENT_SCALE,
  type MarketShareDerivation,
  type MarketShareRow,
  type ShareObservation,
  type UnattributedBreakdown,
} from "@/lib/market-share/types";
import type { SettlementState } from "@/lib/utvi/types";

/**
 * `tokens` as a percentage of `total`, to six decimal places, deterministically.
 *
 * The division is integer division on `bigint`, so the result depends on nothing but the two
 * inputs — no accumulation order, no platform float behaviour. It truncates rather than rounds,
 * which is why a decomposition can fall a few units in the last place short of 100 % and why
 * the reconciliation tolerance exists rather than being zero.
 */
export function percentOf(tokens: bigint, total: bigint): number {
  if (total <= 0n) {
    throw new MarketShareDerivationError(`the denominator must be positive, received ${total}`);
  }
  if (tokens < 0n) {
    throw new MarketShareDerivationError(`a token count may not be negative, received ${tokens}`);
  }
  return Number((tokens * 100n * PERCENT_SCALE) / total) / Number(PERCENT_SCALE);
}

/** The quality flag UTVI records when the serving platform appears as a model's author. */
const PLATFORM_FLAG = "SERVING_PLATFORM_AS_AUTHOR";

/**
 * Why one unattributed row is unattributed.
 *
 * Read from the attribution state first and the quality flag second, because the state is the
 * durable fact and the flag is the annotation. A platform row is `unmapped` by state — there is
 * genuinely no lab to map it to — but it is not an Urdais research gap, and the two should not
 * be reported as if closing one would close the other.
 */
function unattributedReason(observation: ShareObservation): keyof UnattributedBreakdown {
  if (observation.labAttributionState === "undisclosed") return "undisclosed";
  if (observation.qualityFlags.includes(PLATFORM_FLAG)) return "platform";
  return "unmapped";
}

function sum(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

/**
 * Derive both views for one date.
 *
 * `totalObservedTokens` is passed in rather than summed from the rows: it is the figure UTVI
 * published for the date, and it is the denominator precisely because it is the published one.
 * The rows are checked against it by `reconcile`, which reports a disagreement rather than
 * quietly preferring whichever number is to hand.
 */
export function deriveMarketShare(
  date: string,
  settlementState: SettlementState,
  totalObservedTokens: bigint,
  observations: readonly ShareObservation[],
): MarketShareDerivation {
  if (observations.length === 0) {
    throw new MarketShareDerivationError(`${date} has no observations`);
  }
  if (totalObservedTokens <= 0n) {
    throw new MarketShareDerivationError(`${date} has a non-positive denominator (${totalObservedTokens})`);
  }

  const residuals = observations.filter((row) => row.isResidual);
  if (residuals.length > 1) {
    throw new MarketShareDerivationError(`${date} carries ${residuals.length} residual rows; at most one is possible`);
  }
  const named = observations.filter((row) => !row.isResidual);
  if (named.length === 0) {
    throw new MarketShareDerivationError(`${date} names no model`);
  }

  // ---- Models: one row per named model, identity taken verbatim from the source.
  const models: MarketShareRow[] = named
    .map((row) => ({
      id: row.permaslug,
      kind: "model" as const,
      label: row.permaslug,
      detail: row.labName,
      tokens: row.tokens.toString(),
      sharePercent: percentOf(row.tokens, totalObservedTokens),
    }))
    .sort((a, b) => {
      const difference = BigInt(b.tokens) - BigInt(a.tokens);
      // Ties break on the permaslug so the ranking is total and stable across runs.
      return difference === 0n ? a.id.localeCompare(b.id) : difference > 0n ? 1 : -1;
    });

  // ---- Labs: named models whose lab Urdais evidenced, summed by canonical lab.
  const byLab = new Map<string, { name: string; tokens: bigint }>();
  for (const row of named) {
    if (row.labAttributionState !== "evidenced" || row.labSlug === null) continue;
    const entry = byLab.get(row.labSlug) ?? { name: row.labName ?? row.labSlug, tokens: 0n };
    entry.tokens += row.tokens;
    byLab.set(row.labSlug, entry);
  }
  const labs: MarketShareRow[] = [...byLab.entries()]
    .map(([slug, entry]) => ({
      id: slug,
      kind: "lab" as const,
      label: entry.name,
      detail: null,
      tokens: entry.tokens.toString(),
      sharePercent: percentOf(entry.tokens, totalObservedTokens),
    }))
    .sort((a, b) => {
      const difference = BigInt(b.tokens) - BigInt(a.tokens);
      return difference === 0n ? a.id.localeCompare(b.id) : difference > 0n ? 1 : -1;
    });

  // ---- The lab-attribution residual: a named model, no lab Urdais will claim.
  const unattributedRows = named.filter(
    (row) => row.labAttributionState !== "evidenced" || row.labSlug === null,
  );
  const unattributedTokens = sum(unattributedRows.map((row) => row.tokens));
  const breakdown: UnattributedBreakdown = { undisclosed: "0", platform: "0", unmapped: "0" };
  const accumulator = { undisclosed: 0n, platform: 0n, unmapped: 0n };
  for (const row of unattributedRows) accumulator[unattributedReason(row)] += row.tokens;
  for (const key of ["undisclosed", "platform", "unmapped"] as const) {
    breakdown[key] = accumulator[key].toString();
  }

  const unattributed: MarketShareRow = {
    id: "unattributed",
    kind: "unattributed",
    label: "Unattributed models",
    detail: `${unattributedRows.length} named model${unattributedRows.length === 1 ? "" : "s"} with no evidenced lab`,
    tokens: unattributedTokens.toString(),
    sharePercent: percentOf(unattributedTokens, totalObservedTokens),
  };

  // ---- The source's own residual row. Legitimately absent when the tail is empty.
  const residualRow = residuals[0];
  const sourceResidual: MarketShareRow | null =
    residualRow === undefined
      ? null
      : {
          id: "source-residual",
          kind: "source_residual",
          label: "Other models",
          detail: "OpenRouter residual: volume outside the models the dataset names",
          tokens: residualRow.tokens.toString(),
          sharePercent: percentOf(residualRow.tokens, totalObservedTokens),
        };

  return {
    date,
    settlementState,
    totalObservedTokens: totalObservedTokens.toString(),
    models,
    labs,
    sourceResidual,
    unattributed,
    unattributedBreakdown: breakdown,
    namedModelCount: named.length,
    labCount: labs.length,
  };
}

/**
 * Fold the ranked models below `topN` into one visual row.
 *
 * The folded row is `display_remainder`, never `other`. Those are different quantities — one is
 * a drawing decision about rows Urdais holds individually, the other is volume the source never
 * itemised — and a table that used one word for both would be claiming the source aggregated
 * something Urdais actually has.
 */
export function foldForDisplay(models: readonly MarketShareRow[], topN: number): MarketShareRow[] {
  if (models.length <= topN + 1) return [...models];
  const top = models.slice(0, topN);
  const rest = models.slice(topN);
  const tokens = sum(rest.map((row) => BigInt(row.tokens)));
  const sharePercent = rest.reduce((total, row) => total + row.sharePercent, 0);
  return [
    ...top,
    {
      id: "display-remainder",
      kind: "display_remainder",
      label: `${rest.length} further ranked models`,
      detail: "Named individually in the data; folded here for readability",
      tokens: tokens.toString(),
      sharePercent,
    },
  ];
}
