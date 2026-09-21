/**
 * Which markets produce a deliverable capacity result, and from exactly what.
 *
 * This is the approved methodology expressed as data, so that the rule a number was produced
 * under can be read rather than reconstructed. Every eligible market names one component by the
 * publisher's own term, its kind and its basis; version 1.0.0 approves no arithmetic, so a result
 * is an identity on a single canonical row and the interesting decisions are all about which row.
 *
 * The four ineligible markets are listed here too, with their reasons. A market that produces
 * nothing is a decision, and a decision that lives only in a document is one the code can drift
 * away from; `resultRuleFor` returning null is what actually stops a result being written.
 */

export const DELIVERABLE_CAPACITY_METHODOLOGY = "deliverable-capacity";
export const APPROVED_VERSION = "1.0.0";

export type MarketStatus = "approved_result" | "internal_result_only" | "component_only" | "blocked";

/** A market that produces a result, and the single component the result is taken from. */
export type ResultRule = {
  marketSlug: string;
  status: "approved_result" | "internal_result_only";
  /** The release the component must come from, so a result cannot be built from a stale vintage. */
  sourceInterfaceSlug: string;
  /** The publisher's own term for the quantity, matched exactly. */
  sourceTerm: string;
  componentKind: string;
  capacityBasis: string;
  /**
   * Whether `capability - forecast peak demand` is a valid question for this market. PJM's is not:
   * its capability excludes capacity committed by Fixed Resource Requirement entities while its
   * forecast peak includes the load those entities serve.
   */
  questionAEligible: boolean;
  /** What the published number does and does not cover, carried onto every result row. */
  scope: string;
};

/** A market that produces nothing, and why. */
export type ExcludedMarket = {
  marketSlug: string;
  status: "component_only" | "blocked";
  reason: string;
  unblockedBy: string;
};

export const RESULT_RULES: readonly ResultRule[] = [
  {
    marketSlug: "ercot",
    status: "approved_result",
    sourceInterfaceSlug: "ercot-capacity-demand-reserves",
    sourceTerm: "Total Capacity",
    componentKind: "accredited_resource_capacity",
    capacityBasis: "accredited",
    questionAEligible: true,
    scope:
      "Protocol prescribed total capacity for the season, at the stated peak hour. The peak load "
      + "hour and peak net load hour are separate results and are never combined. Excludes DC-tie "
      + "ratings, which are interconnection ratings rather than an accredited contribution.",
  },
  {
    marketSlug: "pjm",
    status: "approved_result",
    sourceInterfaceSlug: "pjm-bra-results",
    sourceTerm: "Participant Sell Offers Cleared",
    componentKind: "procured_capacity",
    capacityBasis: "ucap",
    questionAEligible: false,
    scope:
      "Capacity committed through the Reliability Pricing Model for the delivery year, and only "
      + "that. Excludes capacity committed by Fixed Resource Requirement entities, which PJM states "
      + "only in its narrative report, and excludes price responsive demand. Because PJM's forecast "
      + "peak load includes the load FRR entities serve, this figure must not be differenced "
      + "against it: a large part of the result would be an artifact of mismatched scope.",
  },
  {
    marketSlug: "miso",
    status: "internal_result_only",
    sourceInterfaceSlug: "miso-lole-study",
    sourceTerm: "Unforced Capacity",
    componentKind: "accredited_resource_capacity",
    capacityBasis: "ucap",
    questionAEligible: true,
    scope:
      "System unforced capacity for the season, as the loss of load expectation study states it. "
      + "This is UCAP and is labelled UCAP; it is not Seasonal Accredited Capacity, which is an "
      + "auction accreditation whose posting is not publicly retrievable. Retained internally: "
      + "MISO's terms were reviewed and refused and no permission grant exists.",
  },
];

export const EXCLUDED_MARKETS: readonly ExcludedMarket[] = [
  {
    marketSlug: "caiso",
    status: "component_only",
    reason:
      "Summing resource-level net qualifying capacity survives every mechanical objection — energy-"
      + "only resources already carry zero, interim and partial deliverability are already reduced "
      + "by CAISO, there are no duplicate resource-months and no import resources — and still "
      + "cannot be approved, because a result must be reconstructible from its frozen input rows "
      + "and the input table can freeze only components and constraints. CAISO has neither: its "
      + "evidence is raw records, and the schema has no resource-level component grain.",
    unblockedBy:
      "A CAISO-published area total, or a resource-level component grain added deliberately with "
      + "its own aggregation rules. Maximum import capability stays out either way.",
  },
  {
    marketSlug: "nyiso",
    status: "component_only",
    reason:
      "NYISO publishes its requirements as percentages of each locality's own forecast peak and "
      + "publishes no machine-readable market-level capability. There is nothing to carry through, "
      + "and multiplying a requirement rate by a peak would produce a requirement in megawatts "
      + "rather than a capability.",
    unblockedBy: "A NYISO-published capability series in megawatts that this pipeline can read.",
  },
  {
    marketSlug: "iso-ne",
    status: "component_only",
    reason:
      "The ingested artifact states requirements and network limits. Its only capability rows are "
      + "tie benefits, which are credits for interconnections rather than the region's accredited "
      + "resource capability. Qualified Capacity is published in the auction qualification reports, "
      + "a different release that is not ingested.",
    unblockedBy: "Ingesting an ISO-NE capacity qualification report as its own source.",
  },
  {
    marketSlug: "spp",
    status: "component_only",
    reason:
      "Two independent facts, both holding. SPP publishes no readable capability: its accredited "
      + "capacity totals and aggregate requirement are raster images. And SPP's terms were reviewed "
      + "and refused, so a value it did publish could not be shown. The deliverability study that "
      + "does state a total is stamped \"SPP Internal Only\" on every page and is not retained.",
    unblockedBy:
      "An SPP workbook of the resource adequacy outlook, and separately, written permission from "
      + "SPP. Neither alone is enough.",
  },
];

export function resultRuleFor(marketSlug: string): ResultRule | null {
  return RESULT_RULES.find((rule) => rule.marketSlug === marketSlug) ?? null;
}

export function marketStatus(marketSlug: string): MarketStatus | null {
  const rule = resultRuleFor(marketSlug);
  if (rule !== null) return rule.status;
  return EXCLUDED_MARKETS.find((market) => market.marketSlug === marketSlug)?.status ?? null;
}

/** Every market PD-4 ingests, so a new one cannot be added without a status being decided. */
export const ALL_CAPACITY_MARKETS: readonly string[] = [
  "ercot", "pjm", "miso", "caiso", "nyiso", "iso-ne", "spp",
];
