/**
 * The public Market Share read model.
 *
 * What this serves is a derived Urdais statistic over UTVI's observations, and the shape exists
 * to stop three specific things being said by accident.
 *
 * **It is not a global share.** `universe` is required on every view and is read from the frozen
 * UTVI publication rather than from today's configuration, so the sentence that makes the number
 * true travels with it. The claim Market Share supports is exactly one sentence long: share of
 * observed OpenRouter token volume represented in UTVI.
 *
 * **The residuals are rows, not rounding.** Both reach the surface as ordinary rows with their
 * own labels, because a table that sums to 100 % with the unexplained volume deleted is a
 * stronger claim than the data supports, and the reader cannot tell it has been made.
 *
 * **Two versions govern one screen, and they are different.** The share is computed now, under
 * the breakdown rules in force now (`methodologyVersion`). The UTVI level it divides by was
 * published under whichever version was in force on that date (`sourceMethodologyVersion`) —
 * 1.0.0 for every date backfilled before the breakdown rules existed. Collapsing the two would
 * either backdate a rule to points that predate it or claim an old version authorised a
 * breakdown it explicitly declined to publish.
 */

import { attributionFor, isRequiredCitation, type UtviAttribution } from "@/lib/utvi/attribution";
import { foldForDisplay } from "@/lib/market-share/derive";
import type { DatedShare } from "@/lib/market-share/load";
import {
  MODEL_TABLE_TOP_N,
  type MarketShareRow,
  type UnattributedBreakdown,
} from "@/lib/market-share/types";
import type { SettlementState } from "@/lib/utvi/types";

/**
 * The UTVI methodology version whose §13–§14 govern this breakdown.
 *
 * Market Share has no methodology object of its own: it is the derived breakdown UTVI §14
 * describes, and 1.1.0 is the version that settled its denominator as total observed volume and
 * authorised publication. A constant rather than a database read because it is a property of
 * this code — the rules these functions implement — and not of any one date's publication.
 */
export const MARKET_SHARE_METHODOLOGY_VERSION = "1.1.0" as const;

/** The public claim, in the exact words every surface carrying a share must be able to render. */
export const MARKET_SHARE_CLAIM =
  "Share of observed OpenRouter token volume represented in UTVI." as const;

export type MarketShareView = {
  asOfDate: string;
  settlementState: SettlementState;
  /** The one denominator, exact, as a decimal string. */
  totalObservedTokens: string;
  /** Ranked named models, folded for display, with the source residual last. */
  models: MarketShareRow[];
  /** Ranked labs, then unattributed named models, then the source residual. */
  labs: MarketShareRow[];
  /** Kept apart from the display rows so a caller can report them without re-deriving. */
  sourceResidual: MarketShareRow | null;
  unattributed: MarketShareRow;
  unattributedBreakdown: UnattributedBreakdown;
  namedModelCount: number;
  labCount: number;
  claim: string;
  universe: string;
  /** The breakdown rules in force. */
  methodologyVersion: string;
  /** The version the underlying UTVI level was published under. Often older. */
  sourceMethodologyVersion: string;
  attribution: UtviAttribution;
  lineage: { publicationId: string; calculationId: string; snapshotId: string; revisionNumber: number };
};

/**
 * Build the view, or explain why there is none.
 *
 * A share whose citation is not the source's required one does not serve, for the same reason a
 * UTVI value does not: CC BY's single condition is attribution, and a paraphrase does not meet
 * it. Market Share republishes the same licensed observations at a finer grain, so it owes the
 * same credit and is held to the same test rather than a laxer one.
 */
export function buildMarketShareView(share: DatedShare | null): {
  view: MarketShareView | null;
  unavailableReason: string | null;
} {
  if (share === null) {
    return { view: null, unavailableReason: "no UTVI value has been published, so no share can be derived" };
  }

  const { derivation, lineage } = share;
  if (lineage.sourceAsOf === null) {
    return { view: null, unavailableReason: "the source timestamp the required citation interpolates is missing" };
  }
  if (!isRequiredCitation(lineage.sourceAttribution)) {
    return { view: null, unavailableReason: "the published value does not carry the source's required citation" };
  }

  const residual = derivation.sourceResidual;
  const models = [...foldForDisplay(derivation.models, MODEL_TABLE_TOP_N), ...(residual === null ? [] : [residual])];
  const labs = [...derivation.labs, derivation.unattributed, ...(residual === null ? [] : [residual])];

  return {
    view: {
      asOfDate: derivation.date,
      settlementState: derivation.settlementState,
      totalObservedTokens: derivation.totalObservedTokens,
      models,
      labs,
      sourceResidual: residual,
      unattributed: derivation.unattributed,
      unattributedBreakdown: derivation.unattributedBreakdown,
      namedModelCount: derivation.namedModelCount,
      labCount: derivation.labCount,
      claim: MARKET_SHARE_CLAIM,
      universe: lineage.universeDescriptor,
      methodologyVersion: MARKET_SHARE_METHODOLOGY_VERSION,
      sourceMethodologyVersion: lineage.methodologyVersion,
      attribution: attributionFor(lineage.sourceAsOf),
      lineage: {
        publicationId: lineage.publicationId,
        calculationId: lineage.calculationId,
        snapshotId: lineage.snapshotId,
        revisionNumber: lineage.revisionNumber,
      },
    },
    unavailableReason: null,
  };
}

/**
 * Validate what is about to be rendered.
 *
 * The same discipline the UTVI surface applies, and run for the same reason: a view good enough
 * to compute is not automatically good enough to put under a headline, and a page that renders a
 * number nobody checked is the failure this product exists to avoid.
 */
export function validateMarketShareView(candidate: unknown): string[] {
  const reasons: string[] = [];
  if (typeof candidate !== "object" || candidate === null) return ["view is not an object"];
  const view = candidate as Record<string, unknown>;

  if (typeof view.totalObservedTokens !== "string" || !/^\d+$/.test(view.totalObservedTokens)) {
    reasons.push("totalObservedTokens must be a decimal integer string");
  } else if (BigInt(view.totalObservedTokens) <= 0n) {
    reasons.push("totalObservedTokens must be positive");
  }
  if (typeof view.universe !== "string" || view.universe.trim() === "") {
    reasons.push("the observed universe must be published with the shares");
  }
  if (view.claim !== MARKET_SHARE_CLAIM) reasons.push("the public claim has been altered");

  for (const key of ["models", "labs"] as const) {
    const rows = view[key];
    if (!Array.isArray(rows)) {
      reasons.push(`${key} is not an array`);
      continue;
    }
    if (rows.length === 0) reasons.push(`${key} is empty`);
    for (const entry of rows as Record<string, unknown>[]) {
      if (typeof entry.sharePercent !== "number" || !Number.isFinite(entry.sharePercent)) {
        reasons.push(`${key}: a share is not a finite number`);
      } else if (entry.sharePercent < 0 || entry.sharePercent > 100) {
        reasons.push(`${key}: a share of ${entry.sharePercent} % is outside 0–100`);
      }
      if (typeof entry.tokens !== "string" || !/^\d+$/.test(entry.tokens)) {
        reasons.push(`${key}: tokens must be a decimal integer string`);
      }
      if (typeof entry.label !== "string" || entry.label.trim() === "") {
        reasons.push(`${key}: a row has no label`);
      }
    }
  }

  const attribution = view.attribution as Record<string, unknown> | undefined;
  if (typeof attribution !== "object" || attribution === null) {
    reasons.push("attribution is required");
  } else {
    for (const field of ["sourceName", "sourceUrl", "licenseName", "licenseUrl", "sourceAsOf", "citation"] as const) {
      if (typeof attribution[field] !== "string" || (attribution[field] as string).trim() === "") {
        reasons.push(`attribution.${field} is required`);
      }
    }
    if (typeof attribution.citation === "string" && !isRequiredCitation(attribution.citation)) {
      reasons.push("attribution.citation is not the source's required citation");
    }
  }

  return reasons;
}
