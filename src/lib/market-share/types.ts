/**
 * Market Share domain types: share of observed OpenRouter token volume, as represented in UTVI.
 *
 * The public claim this module exists to keep narrow:
 *
 *   Market Share measures share of observed OpenRouter token volume represented in UTVI.
 *
 * It is not global AI market share, not global model usage, not total industry usage and not
 * total lab market share. The denominator is one marketplace's dataset, and every shape here
 * carries the pieces needed to say so beside the number.
 *
 * Two residuals appear throughout and must never be collapsed into one another. They are
 * different holes in different places:
 *
 *   `source_residual`   OpenRouter's own `other` row: volume with no model at all, because the
 *                       dataset names its top fifty models per day and aggregates the tail.
 *                       A *model-volume* residual. It belongs to no lab and is never assigned
 *                       to one.
 *
 *   `unattributed`      Volume with a named model whose lab Urdais will not claim: an
 *                       undisclosed author, the serving platform appearing as an author, or a
 *                       namespace Urdais has not yet mapped. A *lab-attribution* residual.
 *
 * A third category exists for the eye only and is never a fact about the data:
 *
 *   `display_remainder` The ranked models below the displayed top N, folded so a table of
 *                       fifty rows reads. Deliberately not named `other`, because `other` is
 *                       the source's word for something else entirely.
 */

import type { LabAttributionState, SettlementState } from "@/lib/utvi/types";

/** The percent scale: six decimal places of a percent, held as an integer before narrowing. */
export const PERCENT_SCALE = 1_000_000n;

/** How many named models the Models table ranks before folding the tail into a display remainder. */
export const MODEL_TABLE_TOP_N = 10;

/**
 * Reconciliation tolerance, in percentage points.
 *
 * Shares are computed by truncating integer division, so a decomposition of fifty-one rows can
 * fall short of 100 % by up to fifty-one units in the last place. That is 5.1e-5 points; the
 * tolerance is an order of magnitude above it and still far below anything a reader could see.
 */
export const RECONCILIATION_TOLERANCE_POINTS = 0.001;

/** What one row of a share table stands for. */
export type ShareEntityKind =
  | "model"
  | "lab"
  | "source_residual"
  | "unattributed"
  | "display_remainder";

/** One observation row as the derivation receives it: one model, one date. */
export type ShareObservation = {
  permaslug: string;
  namespace: string | null;
  isResidual: boolean;
  tokens: bigint;
  labSlug: string | null;
  labName: string | null;
  labAttributionState: LabAttributionState;
  qualityFlags: readonly string[];
};

/** One ranked row, with the exact token count preserved beside the narrowed percentage. */
export type MarketShareRow = {
  id: string;
  kind: ShareEntityKind;
  label: string;
  /** Secondary label: the resolved lab on a model row, or why a residual is a residual. */
  detail: string | null;
  /** Exact, as a decimal string. A token count exceeds what a double holds. */
  tokens: string;
  sharePercent: number;
};

/**
 * Why volume carries a named model but no lab, kept apart in the backend even where the
 * frontend groups them. `undisclosed` is a permanent property of the model; `unmapped` is work
 * Urdais has not done; `platform` is the observer appearing inside its own observation.
 */
export type UnattributedBreakdown = {
  undisclosed: string;
  platform: string;
  unmapped: string;
};

/** One date's derived shares, both views, from one active UTVI snapshot. */
export type MarketShareDerivation = {
  date: string;
  settlementState: SettlementState;
  /** The denominator, and the same one for both views. */
  totalObservedTokens: string;
  /** Every named model, ranked. No fold applied: the fold is a display concern. */
  models: MarketShareRow[];
  /** Every evidenced lab, ranked. */
  labs: MarketShareRow[];
  /** OpenRouter's `other` row, or null on a date where the tail was legitimately empty. */
  sourceResidual: MarketShareRow | null;
  /** Named-model volume with no evidenced lab, as one row for the Labs view. */
  unattributed: MarketShareRow;
  unattributedBreakdown: UnattributedBreakdown;
  namedModelCount: number;
  labCount: number;
};

/** A reconciliation or sanity failure on one date. Reported, never silently normalised. */
export type ShareCheckFailure = {
  date: string;
  check: string;
  detail: string;
};

export class MarketShareDerivationError extends Error {
  constructor(detail: string) {
    super(`market share cannot be derived: ${detail}`);
    this.name = "MarketShareDerivationError";
  }
}
