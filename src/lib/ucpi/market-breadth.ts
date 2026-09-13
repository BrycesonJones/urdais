/**
 * Reference implementation of the UCPI family's participant-count rule and
 * market-breadth qualifier, from docs/methodology/ucpi.md 0.1.1-draft,
 * "Publication Gates" and "Coverage and Composition".
 *
 * This states the rule in executable form so that the methodology can be
 * tested. It is not a calculation engine: it reads no data, evaluates none of
 * the other publication gates, and publishes nothing. Every other gate applies
 * at every participant count; Minimum breadth exempts nothing.
 */

/** The two values of the market-breadth qualifier. `Limited` is reserved for availability and is never breadth. */
export type MarketBreadth = "minimum" | "normal";

/** The named structural condition under which a region has no market price. */
export type StructuralCondition = "NO_ELIGIBLE_PARTICIPANT" | "SINGLE_PARTICIPANT";

export type BreadthDecision =
  | { status: "unavailable"; participantCount: 0 | 1; condition: StructuralCondition }
  | {
      status: "published";
      participantCount: number;
      breadth: MarketBreadth;
      /** At two participants, removing either leaves no market price and each moves the value by half its own move. */
      allParticipantsPivotal: boolean;
      /** Percentiles and the interquartile range are withheld at two participants: they would be the two prices. */
      dispersionPublished: boolean;
      diagnostics: readonly ["MARKET_BREADTH_MINIMUM"] | readonly [];
    };

/**
 * The participant-count rule. Deterministic in the count for one calculation
 * date, with no hysteresis: the previous date's state is not an input.
 */
export function decideBreadth(participantCount: number): BreadthDecision {
  if (!Number.isInteger(participantCount) || participantCount < 0) {
    throw new RangeError(`participant count must be a non-negative integer, got ${participantCount}`);
  }
  if (participantCount === 0) {
    return { status: "unavailable", participantCount, condition: "NO_ELIGIBLE_PARTICIPANT" };
  }
  if (participantCount === 1) {
    return { status: "unavailable", participantCount, condition: "SINGLE_PARTICIPANT" };
  }
  if (participantCount === 2) {
    return {
      status: "published",
      participantCount,
      breadth: "minimum",
      allParticipantsPivotal: true,
      dispersionPublished: false,
      diagnostics: ["MARKET_BREADTH_MINIMUM"],
    };
  }
  return {
    status: "published",
    participantCount,
    breadth: "normal",
    allParticipantsPivotal: false,
    dispersionPublished: true,
    diagnostics: [],
  };
}

/**
 * The regional median over final capacity-source prices, with the family's
 * fixed even-N convention: the arithmetic mean of the two central ordered
 * observations. Inputs are unrounded normalized prices.
 */
export function regionalMedian(prices: readonly number[]): number {
  if (prices.length === 0) throw new RangeError("a median over no participants is not defined");
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/**
 * A seller-level observation's identity inputs. Identifiers share one
 * market-entity namespace, so a seller that is also another participant's
 * disclosed operator carries the same id in both roles.
 */
export type CapacitySourceParticipant = {
  /** The seller by legal identity. Brands, tiers, and datacenters of one legal entity share it. */
  sellerLegalEntityId: string;
  /** The infrastructure operator where reliably determinable on evidence, otherwise null. Never inferred from prices. */
  operatorId: string | null;
};

/** The capacity source: the operator where determinable, the seller otherwise. */
export function capacitySourceKey(participant: CapacitySourceParticipant): string {
  return participant.operatorId ?? participant.sellerLegalEntityId;
}

/** The number of independent capacity sources after the family's collapse rule. */
export function countIndependentCapacitySources(participants: readonly CapacitySourceParticipant[]): number {
  return new Set(participants.map(capacitySourceKey)).size;
}
