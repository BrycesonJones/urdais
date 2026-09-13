/**
 * The aggregation stages after eligibility, as the family defines them:
 *
 *   P2 observations -> seller-level reduction -> capacity-source collapse
 *                   -> regional median with the market-breadth qualifier
 *
 * Each stage returns objects that mirror the publication-layer tables
 * (seller_observations, capacity_source_observations, regional_observations)
 * and retains lineage to everything it considered. Nothing here reads a
 * database or the network.
 */

import { calculationWindow, percentageChangeDisposition, type PriorObservation } from "@/lib/ucpi/calculation-window";
import type { MarketEntity, NormalizedObservation } from "@/lib/ucpi/domain";
import { sellerRepresentativePrice, type CellOffer } from "@/lib/ucpi/launch-parameters";
import { decideBreadth, regionalMedian, type MarketBreadth, type StructuralCondition } from "@/lib/ucpi/market-breadth";

// Seller-level reduction ---------------------------------------------------------

export type SellerObservation = {
  sellerEntityId: string;
  canonicalRegionCode: string;
  canonicalQuantity: number;
  representativePrice: number;
  selectedObservationId: string;
  consideredCount: number;
  canonicalCount: number;
  reductionRule: "canonical_quantity_then_minimum";
  candidates: readonly { observationId: string; atCanonicalQuantity: boolean; selected: boolean }[];
  /** Distinct source interfaces the candidates came through. */
  sourceInterfaceSlugs: readonly string[];
  /** The selected observation's operator, if determinable. */
  operatorEntityId: string | null;
};

/** Groups P2-eligible observations into cells of one seller in one country and reduces each. */
export function reduceSellers(eligible: readonly NormalizedObservation[]): SellerObservation[] {
  const cells = new Map<string, NormalizedObservation[]>();
  for (const o of eligible) {
    if (o.canonicalRegionCode === null) throw new Error(`observation ${o.id} reached seller reduction without a canonical region`);
    const key = `${o.sellerEntityId}|${o.canonicalRegionCode}`;
    const cell = cells.get(key) ?? [];
    cell.push(o);
    cells.set(key, cell);
  }
  const out: SellerObservation[] = [];
  for (const cell of cells.values()) {
    const offers: (CellOffer & { observation: NormalizedObservation })[] = cell.map((o) => {
      if (o.gpuCount === null || o.normalizedPrice === null) throw new Error(`observation ${o.id} is P2 but lacks a count or price`);
      return { acceleratorCount: o.gpuCount, pricePerAcceleratorHour: o.normalizedPrice, variant: o.serviceTier?.tier_label ?? undefined, observation: o };
    });
    const r = sellerRepresentativePrice(offers);
    const selected = (r.selected as (typeof offers)[number]).observation;
    const first = cell[0]!;
    out.push({
      sellerEntityId: first.sellerEntityId,
      canonicalRegionCode: first.canonicalRegionCode!,
      canonicalQuantity: r.canonicalQuantity,
      representativePrice: r.representativePrice,
      selectedObservationId: selected.id,
      consideredCount: r.consideredCount,
      canonicalCount: r.canonicalCount,
      reductionRule: "canonical_quantity_then_minimum",
      candidates: cell.map((o) => ({
        observationId: o.id,
        atCanonicalQuantity: o.gpuCount === r.canonicalQuantity,
        selected: o.id === selected.id,
      })),
      sourceInterfaceSlugs: [...new Set(cell.map((o) => o.sourceInterfaceSlug))].sort(),
      operatorEntityId: selected.operatorEntityId,
    });
  }
  return out.sort((a, b) => a.canonicalRegionCode.localeCompare(b.canonicalRegionCode) || a.sellerEntityId.localeCompare(b.sellerEntityId));
}

// Capacity-source collapse --------------------------------------------------------

export type AttributionStatus = "operator_determined" | "seller_fallback" | "common_control";

export type CapacitySourceObservation = {
  capacitySourceEntityId: string;
  canonicalRegionCode: string;
  representativePrice: number;
  attributionStatus: AttributionStatus;
  collapseRule: "lowest_accessible_channel";
  memberSellerEntityIds: readonly string[];
  sourceInterfaceSlugs: readonly string[];
  sourceInterfaceCount: number;
};

/**
 * The capacity source is the operator where determinable on evidence, the
 * controlling entity where common control is evidenced, and the seller
 * otherwise. Its price is the lowest accessible channel among its members.
 * Nothing is inferred from prices.
 */
export function collapseCapacitySources(sellers: readonly SellerObservation[], entities: ReadonlyMap<string, MarketEntity>): CapacitySourceObservation[] {
  const groups = new Map<string, { status: AttributionStatus; members: SellerObservation[] }>();
  for (const s of sellers) {
    const entity = entities.get(s.sellerEntityId);
    let key: string;
    let status: AttributionStatus;
    if (s.operatorEntityId !== null) {
      key = s.operatorEntityId;
      status = "operator_determined";
    } else if (entity?.controllingEntityId) {
      key = entity.controllingEntityId;
      status = "common_control";
    } else {
      key = s.sellerEntityId;
      status = "seller_fallback";
    }
    const gk = `${key}|${s.canonicalRegionCode}`;
    const g = groups.get(gk) ?? { status, members: [] };
    // Operator determination on any member outranks the fallback for the group's status.
    if (status === "operator_determined") g.status = status;
    else if (status === "common_control" && g.status === "seller_fallback") g.status = status;
    g.members.push(s);
    groups.set(gk, g);
  }
  const out: CapacitySourceObservation[] = [];
  for (const [gk, g] of groups) {
    const [entityId, region] = gk.split("|") as [string, string];
    const slugs = [...new Set(g.members.flatMap((m) => m.sourceInterfaceSlugs))].sort();
    out.push({
      capacitySourceEntityId: entityId,
      canonicalRegionCode: region,
      representativePrice: Math.min(...g.members.map((m) => m.representativePrice)),
      attributionStatus: g.status,
      collapseRule: "lowest_accessible_channel",
      memberSellerEntityIds: g.members.map((m) => m.sellerEntityId).sort(),
      sourceInterfaceSlugs: slugs,
      sourceInterfaceCount: slugs.length,
    });
  }
  return out.sort((a, b) => a.canonicalRegionCode.localeCompare(b.canonicalRegionCode) || a.capacitySourceEntityId.localeCompare(b.capacitySourceEntityId));
}

// Regional calculation -----------------------------------------------------------

export type Dispersion = { p10: number; p50: number; p90: number; iqr: number };

export type RegionalObservation = {
  instrument: string;
  canonicalRegionCode: string;
  calculationDate: string;
  windowStart: string;
  cutoff: string;
  publicationDeadline: string;
  methodologyVersion: string;
  instrumentSpecVersion: string;
  outcome: "value" | "unavailable";
  structuralCondition: StructuralCondition | null;
  marketBreadth: MarketBreadth | null;
  priceLevel: number | null;
  currency: "USD";
  unit: "accelerator_hour";
  participantCount: number;
  contributingSourceCount: number;
  largestSourceParticipantShare: number | null;
  dispersionPublished: boolean;
  dispersion: Dispersion | null;
  percentageChange1d: number | null;
  changeDisposition: "published" | "annotated" | "withheld" | null;
  diagnostics: readonly string[];
  participants: readonly CapacitySourceObservation[];
};

/** Hyndman and Fan type 7, the child's fixed quantile convention. */
export function quantileType7(sortedAscending: readonly number[], q: number): number {
  const n = sortedAscending.length;
  if (n === 0) throw new RangeError("quantile of nothing");
  const h = (n - 1) * q;
  const f = Math.floor(h);
  if (f + 1 >= n) return sortedAscending[n - 1]!;
  return sortedAscending[f]! + (h - f) * (sortedAscending[f + 1]! - sortedAscending[f]!);
}

export type RegionalInput = {
  instrument: string;
  canonicalRegionCode: string;
  calculationDate: string;
  methodologyVersion: string;
  instrumentSpecVersion: string;
  participants: readonly CapacitySourceObservation[];
  /** The immediately preceding calculation date's observation, or null if none exists. */
  prior: (PriorObservation & { priceLevel?: number | null }) | null;
  /** Ids of participants that were also present on the preceding date, used for the composition annotation. */
  priorParticipantIds?: readonly string[];
};

export function calculateRegion(input: RegionalInput): RegionalObservation {
  const window = calculationWindow(input.calculationDate);
  const n = input.participants.length;
  const breadth = decideBreadth(n);
  const base = {
    instrument: input.instrument,
    canonicalRegionCode: input.canonicalRegionCode,
    calculationDate: input.calculationDate,
    windowStart: window.windowStart,
    cutoff: window.cutoff,
    publicationDeadline: window.publicationDeadline,
    methodologyVersion: input.methodologyVersion,
    instrumentSpecVersion: input.instrumentSpecVersion,
    currency: "USD" as const,
    unit: "accelerator_hour" as const,
    participants: input.participants,
  };

  if (breadth.status === "unavailable") {
    return {
      ...base,
      outcome: "unavailable",
      structuralCondition: breadth.condition,
      marketBreadth: null,
      priceLevel: null,
      participantCount: n,
      contributingSourceCount: countInterfaces(input.participants),
      largestSourceParticipantShare: null,
      dispersionPublished: false,
      dispersion: null,
      percentageChange1d: null,
      changeDisposition: null,
      diagnostics: [breadth.condition],
    };
  }

  const prices = input.participants.map((p) => p.representativePrice).sort((a, b) => a - b);
  const level = regionalMedian(prices);
  const dispersion: Dispersion | null = breadth.dispersionPublished
    ? {
        p10: quantileType7(prices, 0.1),
        p50: quantileType7(prices, 0.5),
        p90: quantileType7(prices, 0.9),
        iqr: quantileType7(prices, 0.75) - quantileType7(prices, 0.25),
      }
    : null;

  const participantSetChanged =
    input.priorParticipantIds !== undefined &&
    (input.priorParticipantIds.length !== n || input.participants.some((p) => !input.priorParticipantIds!.includes(p.capacitySourceEntityId)));
  const prior: PriorObservation | null =
    input.prior === null ? null : input.prior.status === "published" ? { ...input.prior, participantSetChanged: input.prior.participantSetChanged || participantSetChanged } : input.prior;
  const disposition = prior === null ? "withheld" : percentageChangeDisposition(prior, { breadth: breadth.breadth });
  const priorLevel = input.prior?.status === "published" ? (input.prior.priceLevel ?? null) : null;
  const change = disposition === "withheld" || priorLevel === null || priorLevel <= 0 ? null : ((level - priorLevel) / priorLevel) * 100;

  const diagnostics: string[] = [...breadth.diagnostics];
  if (breadth.allParticipantsPivotal) diagnostics.push("ALL_PARTICIPANTS_PIVOTAL");

  return {
    ...base,
    outcome: "value",
    structuralCondition: null,
    marketBreadth: breadth.breadth,
    priceLevel: level,
    participantCount: n,
    contributingSourceCount: countInterfaces(input.participants),
    largestSourceParticipantShare: largestSourceShare(input.participants),
    dispersionPublished: breadth.dispersionPublished,
    dispersion,
    percentageChange1d: change,
    changeDisposition: change === null ? "withheld" : disposition,
    diagnostics,
  };
}

function countInterfaces(participants: readonly CapacitySourceObservation[]): number {
  return new Set(participants.flatMap((p) => p.sourceInterfaceSlugs)).size;
}

/** The share of participants observed through the single most-used interface. */
function largestSourceShare(participants: readonly CapacitySourceObservation[]): number | null {
  if (participants.length === 0) return null;
  const counts = new Map<string, number>();
  for (const p of participants) for (const s of p.sourceInterfaceSlugs) counts.set(s, (counts.get(s) ?? 0) + 1);
  return Math.max(...counts.values()) / participants.length;
}
