/**
 * Which demand series may be paired with which capacity result, and what happens everywhere else.
 *
 * A delivery gap is a subtraction between two studies, so the whole difficulty is deciding when
 * the two sides describe the same thing. Those conditions are written here as data rather than as
 * a query, because the interesting content of this phase is the decision and a decision buried in
 * a join is one nobody can review.
 *
 * Six of seven markets produce nothing. Each of them says why, and `pairingFor` returning null is
 * what actually stops a gap being written.
 */

export const DELIVERY_GAP_METHODOLOGY = "power-delivery-gap";
export const APPROVED_VERSION = "1.0.0";

export type GapStatus =
  | "public_gap_eligible" | "internal_gap_eligible"
  | "capacity_only" | "demand_only" | "component_only" | "blocked";

/** An approved pairing: exactly which demand rows meet exactly which capacity results. */
export type GapPairing = {
  marketSlug: string;
  status: "public_gap_eligible" | "internal_gap_eligible";

  /** The planning release the demand must come from, so a stale forecast cannot pair. */
  demandSourceInterfaceSlug: string;
  demandScenarioKey: string;
  demandGrain: string;
  demandPeriodKind: string;
  demandPeakType: string;
  /** The gross/net treatment the pairing was approved for. `unspecified` is never eligible. */
  demandLoadBasis: string;

  /** The capacity release and case, so the other half is pinned just as tightly. */
  capacitySourceInterfaceSlug: string;
  capacityScenarioKey: string;
  capacityBasis: string;

  periodBasis: string;
  notes: string;
};

export type ExcludedGapMarket = {
  marketSlug: string;
  status: Exclude<GapStatus, "public_gap_eligible" | "internal_gap_eligible">;
  blocker: string;
  unblockedBy: string;
};

export const GAP_PAIRINGS: readonly GapPairing[] = [
  {
    marketSlug: "ercot",
    status: "public_gap_eligible",
    demandSourceInterfaceSlug: "ercot-long-term-load-forecast",
    demandScenarioKey: "ERCOT_Adjusted",
    demandGrain: "balancing_authority",
    demandPeriodKind: "seasonal",
    // The system coincident peak. The non-coincident peak is a sum of zonal peaks and is not a
    // quantity the system must serve at any one moment.
    demandPeakType: "coincident_peak",
    demandLoadBasis: "net",
    capacitySourceInterfaceSlug: "ercot-capacity-demand-reserves",
    // Peak load hour only. The report's peak *net* load hour nets renewable output, while the
    // forecast's net basis nets behind-the-meter generation; they are different adjustments and
    // the net-load-hour capacity has no demand partner at all.
    capacityScenarioKey: "peak_load_hour",
    capacityBasis: "accredited",
    periodBasis: "seasonal",
    notes:
      "Full forecast peak against protocol prescribed total capacity. This is deliberately more "
      + "conservative than ERCOT's own reserve margin, which is computed against firm peak load and "
      + "so excludes load ERCOT may curtail; it will not reproduce ERCOT's published margin.",
  },
];

export const EXCLUDED_GAP_MARKETS: readonly ExcludedGapMarket[] = [
  {
    marketSlug: "pjm",
    status: "capacity_only",
    blocker:
      "Three independent mismatches, each sufficient alone. The demand forecast is monthly and the "
      + "capacity result is a delivery year, with no approved mapping between them. The demand's "
      + "gross-or-net treatment is unspecified because PJM's report does not state it. And the "
      + "capacity covers only what cleared through the Reliability Pricing Model while the demand "
      + "covers the whole RTO footprint, including the load Fixed Resource Requirement entities "
      + "serve with capacity this figure excludes.",
    unblockedBy:
      "A source-backed scope mapping — either FRR committed capacity on the supply side or "
      + "RPM-scope demand on the demand side — together with a seasonal or annual demand series "
      + "whose load basis PJM states.",
  },
  {
    marketSlug: "miso",
    status: "capacity_only",
    blocker:
      "There is no planning demand series for MISO at all: its long-term load forecast was blocked "
      + "on rights, and the public artifact is a set of growth-rate trajectories rather than a "
      + "vintaged megawatt series. MISO's capacity study does state a system peak demand beside the "
      + "capacity, which is the most closely aligned pair in the domain and is deliberately unused: "
      + "that figure is a capacity study's own input, and differencing a report against itself "
      + "restates MISO's published reserve margin rather than measuring a delivery gap.",
    unblockedBy: "A first-party MISO planning demand series in megawatts, with permission to use it.",
  },
  {
    marketSlug: "caiso",
    status: "demand_only",
    blocker:
      "Demand exists; no approved capacity result does. CAISO's net qualifying capacity is "
      + "resource-level evidence that cannot be frozen as a result input, so there is nothing to "
      + "subtract from the forecast.",
    unblockedBy: "An approved CAISO capacity result under the deliverable capacity methodology.",
  },
  {
    marketSlug: "iso-ne",
    status: "demand_only",
    blocker:
      "Demand exists; no approved capacity result does. The ingested ISO-NE artifact's only "
      + "capability rows are tie benefits, and its requirements — ICR, Net ICR, HQICC — are "
      + "obligations that never stand in for capacity.",
    unblockedBy: "An ISO-NE qualified capacity release, ingested and approved as a capacity result.",
  },
  {
    marketSlug: "nyiso",
    status: "component_only",
    blocker:
      "Neither side. NYISO publishes no machine-readable demand series this pipeline holds and no "
      + "capability at all; its requirements are percentages of each locality's own peak, and "
      + "multiplying one by a peak yields a requirement in megawatts rather than a capability.",
    unblockedBy: "A readable NYISO demand series and an approved capacity result. Both are needed.",
  },
  {
    marketSlug: "spp",
    status: "blocked",
    blocker:
      "Neither side, and publication is prohibited regardless. SPP's terms were reviewed and "
      + "refused, its capacity totals are raster images, and the study that states a deliverable "
      + "capacity is marked internal only and is not retained.",
    unblockedBy: "Written permission from SPP, and readable demand and capacity series. All three.",
  },
];

export function pairingFor(marketSlug: string): GapPairing | null {
  return GAP_PAIRINGS.find((pairing) => pairing.marketSlug === marketSlug) ?? null;
}

export function gapStatus(marketSlug: string): GapStatus | null {
  const pairing = pairingFor(marketSlug);
  if (pairing !== null) return pairing.status;
  return EXCLUDED_GAP_MARKETS.find((market) => market.marketSlug === marketSlug)?.status ?? null;
}

/** A load basis that says nothing cannot be differenced against anything. */
export function isComparableLoadBasis(basis: string | null): boolean {
  return basis !== null && basis !== "unspecified" && basis.trim() !== "";
}
