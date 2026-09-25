/**
 * The seven canonical UEPI benchmarks, exactly as specification 1.0.0 §B defines them.
 *
 * This file is a mirror of `reference.power_price_benchmarks`, not a second authority. The
 * database is what a running calculation reads; these constants exist so that a drift between the
 * approved definitions and the code relying on them is a failing test rather than a wrong number,
 * and so that a reader of the code can see which market is which without a database.
 * `benchmarks.test.ts` asserts the two agree by reading the migration.
 *
 * Nothing here is a judgement. Every field traces to the Phase 1 research and to §B of the frozen
 * specification; where the research left something unresolved -- ISO-NE's hour convention, its
 * daylight-saving behaviour -- the field says so rather than guessing, and the release validator
 * refuses to release on that basis.
 */

import {
  UEPI_SERIES_IDS, UepiDomainError,
  type UepiBenchmark, type UepiSeriesId,
} from "@/lib/uepi/types";

/**
 * MISO's zone is a fixed offset, and that is the substantive fact about it.
 *
 * MISO publishes hours-ending in Eastern *Standard* Time all year and does not observe the
 * transitions, so its day is always 24 hours. Storing `America/New_York` here and converting would
 * delete an hour MISO actually priced every spring and invent a duplicate every autumn.
 */
const MISO_FIXED_EASTERN_STANDARD = "Etc/GMT+5";

export const UEPI_BENCHMARKS: Readonly<Record<UepiSeriesId, UepiBenchmark>> = {
  "uepi-ercot": {
    seriesId: "uepi-ercot",
    market: "ERCOT",
    gridOperatorSlug: "ercot",
    construct: "delivered_price",
    derivation: "published_column",
    derivationExpression: null,
    sourceLocator: "HB_HUBAVG",
    sourceInterfaceSlug: "ercot-emil-dam-settlement-point-prices",
    operatingTimezone: "America/Chicago",
    observesDst: true,
    hourConvention: "hour_ending",
    // Both transition days have now been parsed from the authenticated API: 23 rows with the
    // hour-ending label omitted in spring, 25 in autumn with the repeat marked by DSTFlag.
    dstEvidence: "verified",
    publicationPosture: "publishable",
    expectedRightsClassification: "reusable_with_attribution_or_conditions",
    benchmarkDefinition:
      "Day-ahead settlement point price for the ERCOT Hub Average 345 kV Hub (HB_HUBAVG), as published by ERCOT.",
    geographicScope:
      "Four-hub 345 kV average of North, South, Houston and West. Panhandle and Lower Rio Grande Valley excluded.",
    // The day-ahead hub average is a shift-factor construct, not the mean of the four hub prices:
    // the two differed by up to $0.005/MWh on 25 September 2026, so the published column is stored
    // and never recomputed.
    excludes: [],
  },
  "uepi-pjm": {
    seriesId: "uepi-pjm",
    market: "PJM",
    gridOperatorSlug: "pjm",
    construct: "delivered_price",
    derivation: "published_column",
    derivationExpression: null,
    sourceLocator: "1",
    sourceInterfaceSlug: "pjm-data-miner-da-hrl-lmps",
    operatingTimezone: "America/New_York",
    observesDst: true,
    hourConvention: "hour_beginning",
    dstEvidence: "expected_unverified",
    publicationPosture: "internal_only",
    expectedRightsClassification: "unsuitable_without_permission",
    benchmarkDefinition:
      "Day-ahead total LMP at PJM pricing node 1, the RTO aggregate, latest version only.",
    geographicScope:
      "PJM RTO aggregate zone, pricing node id 1. The display name differs between feeds, so the id is what identifies it.",
    excludes: [],
  },
  "uepi-caiso": {
    seriesId: "uepi-caiso",
    market: "CAISO",
    gridOperatorSlug: "caiso",
    construct: "system_energy_component",
    derivation: "published_column",
    derivationExpression: null,
    sourceLocator: "TH_NP15_GEN-APND",
    sourceInterfaceSlug: "caiso-oasis-prc-lmp",
    operatingTimezone: "America/Los_Angeles",
    observesDst: true,
    hourConvention: "hour_ending",
    // UEPI-2 captured and committed both transition days: 23 hours in spring with the label
    // omitted, 25 in autumn with the repeat filed as OPR_HR 25.
    dstEvidence: "verified",
    publicationPosture: "publishable",
    expectedRightsClassification: "ambiguous_requires_legal_review",
    benchmarkDefinition:
      "Day-ahead Marginal Energy Cost (MCE), the component the CAISO tariff defines as the same throughout the balancing authority area.",
    geographicScope:
      "CAISO balancing-authority reference price. The trading-hub row is a carrier for reading the system component, not a location.",
    excludes: [
      "marginal congestion (MCC)",
      "marginal losses (MCL)",
      "the marginal greenhouse-gas component (MGHG)",
    ],
  },
  "uepi-miso": {
    seriesId: "uepi-miso",
    market: "MISO",
    gridOperatorSlug: "miso",
    construct: "system_energy_component",
    derivation: "derived_residual",
    derivationExpression: "LMP - MCC - MLC",
    sourceLocator: "INDIANA.HUB",
    sourceInterfaceSlug: "miso-da-expost-lmp",
    operatingTimezone: MISO_FIXED_EASTERN_STANDARD,
    observesDst: false,
    hourConvention: "hour_ending",
    dstEvidence: "verified",
    publicationPosture: "internal_only",
    expectedRightsClassification: "unsuitable_without_permission",
    benchmarkDefinition:
      "Day-ahead ex-post system energy component, derived as LMP minus MCC minus MLC from the ex-post file. MISO publishes no MEC column.",
    geographicScope:
      "MISO system energy price. The carrier node is one of the eight official hubs; the residual is identical at every internal location.",
    excludes: ["marginal congestion (MCC)", "marginal losses (MLC)"],
  },
  "uepi-iso-ne": {
    seriesId: "uepi-iso-ne",
    market: "ISO-NE",
    gridOperatorSlug: "iso-ne",
    construct: "delivered_price",
    derivation: "published_column",
    derivationExpression: null,
    sourceLocator: "4000",
    sourceInterfaceSlug: "iso-ne-webservices-hourly-lmp-da-final",
    operatingTimezone: "America/New_York",
    observesDst: true,
    // Settled by observation. `BeginDate` states the hour's start with an explicit offset
    // (`2026-09-23T00:00:00.000-04:00`), and the transition days return 23 and 25 hours with the
    // repeated local hour separated by the offset itself.
    hourConvention: "hour_beginning",
    dstEvidence: "verified",
    // Evidence, not rights. The series may now be ingested, calculated and stored; it may not be
    // displayed, and its rights classification is untouched. Publication additionally waits on the
    // legal review the specification names.
    publicationPosture: "internal_only",
    expectedRightsClassification: "ambiguous_requires_legal_review",
    benchmarkDefinition:
      "Final day-ahead Hub LMP at location 4000, which Market Rule 1 defines as the arithmetic average of the Hub's nodes.",
    geographicScope: "ISO New England internal Hub, location id 4000.",
    excludes: [],
  },
  "uepi-nyiso": {
    seriesId: "uepi-nyiso",
    market: "NYISO",
    gridOperatorSlug: "nyiso",
    construct: "system_energy_component",
    derivation: "derived_residual",
    derivationExpression: "LBMP - Marginal Cost Losses + Marginal Cost Congestion",
    sourceLocator: "61752",
    sourceInterfaceSlug: "nyiso-mis-p-2a-dam-lbmp-zonal",
    operatingTimezone: "America/New_York",
    observesDst: true,
    hourConvention: "hour_beginning",
    dstEvidence: "verified",
    publicationPosture: "publishable",
    expectedRightsClassification: "ambiguous_requires_legal_review",
    benchmarkDefinition:
      "Day-ahead system marginal price at the NYCA reference bus, derived from one internal zone's LBMP, losses and congestion.",
    geographicScope:
      "NYISO reference bus. The carrier is internal zone WEST (PTID 61752); external proxies are never used.",
    excludes: ["marginal losses", "marginal congestion"],
  },
  "uepi-spp": {
    seriesId: "uepi-spp",
    market: "SPP",
    gridOperatorSlug: "spp",
    construct: "system_energy_component",
    derivation: "published_column",
    derivationExpression: null,
    sourceLocator: "SPP",
    sourceInterfaceSlug: "spp-portal-da-lmp-by-settlement-location",
    operatingTimezone: "America/Chicago",
    observesDst: true,
    hourConvention: "hour_ending",
    dstEvidence: "verified",
    publicationPosture: "internal_only",
    expectedRightsClassification: "unsuitable_without_permission",
    benchmarkDefinition:
      "Day-ahead Marginal Energy Component (MEC) for balancing authority SPP, the published system energy price.",
    geographicScope:
      "SPP Integrated Marketplace (east). Balancing authority SWPW is excluded; participant hubs are not the system price.",
    excludes: ["marginal congestion (MCC)", "marginal losses (MLC)"],
  },
};

export const UEPI_BENCHMARK_LIST: readonly UepiBenchmark[] =
  UEPI_SERIES_IDS.map((id) => UEPI_BENCHMARKS[id]);

export function benchmarkFor(seriesId: string): UepiBenchmark {
  const benchmark = (UEPI_BENCHMARKS as Record<string, UepiBenchmark | undefined>)[seriesId];
  if (benchmark === undefined) throw new UepiDomainError(`'${seriesId}' is not a UEPI series`);
  return benchmark;
}

/**
 * Series whose values may reach a public surface once their rights determination allows it.
 *
 * Posture and rights are two separate gates and both must pass. This one is Urdais's own editorial
 * state; `mayPublishUepiValue` is the terms. A series is never published because only one of them
 * says yes.
 */
export const PUBLISHABLE_SERIES_IDS: readonly UepiSeriesId[] =
  UEPI_BENCHMARK_LIST.filter((b) => b.publicationPosture === "publishable").map((b) => b.seriesId);

/** Series that are ingested and stored but never displayed: the rights answer is no. */
export const INTERNAL_ONLY_SERIES_IDS: readonly UepiSeriesId[] =
  UEPI_BENCHMARK_LIST.filter((b) => b.publicationPosture === "internal_only").map((b) => b.seriesId);

/** Series no adapter may emit for yet. ISO-NE: no credential, no payload ever observed. */
export const NOT_BUILT_SERIES_IDS: readonly UepiSeriesId[] =
  UEPI_BENCHMARK_LIST.filter((b) => b.publicationPosture === "not_built").map((b) => b.seriesId);
