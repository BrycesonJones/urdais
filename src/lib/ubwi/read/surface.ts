/**
 * What the public UBWI surface is allowed to say.
 *
 * Two states and no third. Either a gate-cleared value has been published, in which case
 * the surface shows it with its observed and modelled shares and its sensitivity range;
 * or nothing has been published, in which case the surface says so and says why.
 *
 * There is no demo state, no placeholder level and no back series. UBWI history begins at
 * the first verified production observation, and percentage change is unavailable until a
 * second one exists: there is no such thing as a change from nothing.
 */
import { MARKET_CATALOG } from "@/data/market-catalog";
import type { IndexSnapshot } from "@/types/market";

import { calculateUbwi, METHODOLOGY_VERSION, RESIDUAL_MODEL_VERSION, UBWI_UNIT } from "../calculate";
import { CHAINLINK_BTC_USD_FEED } from "../chainlink";
import { evaluateGate, PRODUCTION_V1_THRESHOLDS } from "../gate";
import { effectiveRightsStatus, sourceInterface } from "../rights";
import type { UbwiCalculation, UnobservedMajorEconomy } from "../types";

/**
 * Where the BTC price came from, in the terms a reader needs to check it.
 *
 * The surface names the feed, the network and the round's own update timestamp, because
 * "Bitcoin market capitalization" with no price provenance is an assertion. It stops
 * short of the aggregator address and the phase id: those are audit lineage, frozen on
 * the point and reachable from the methodology, not something a reader of the index
 * needs on the page.
 */
export type UbwiPriceProvenance = {
  /** e.g. "Chainlink BTC/USD". */
  feed: string;
  network: string;
  proxyAddress: string;
  /** The round the price came from. */
  roundId: string;
  /** When the feed itself last updated, ISO 8601. Not when Urdais read it. */
  feedUpdatedAt: string;
  /** How Urdais holds the right to use it, in the reader's words. */
  rightsNote: string;
};

export type UbwiDisclosure = {
  /** Total Global Wealth, in USD. */
  totalGlobalWealthUsd: number;
  bitcoinMarketCapUsd: number;
  /** Share of Total Global Wealth that is a directly observed national balance sheet. */
  observedSharePercent: number;
  /** Share of Total Global Wealth that is the versioned residual model. */
  modeledSharePercent: number;
  rightsClearedGdpCoverage: number;
  observedEconomyCount: number;
  sensitivity: { lowPercent: number; highPercent: number };
  unobservedMajorEconomies: readonly UnobservedMajorEconomy[];
  methodologyVersion: string;
  residualModelVersion: string;
  /** The instant the numerator was observed. */
  observedAt: string;
  blockHeight: number;
  /** Null under the retired three-venue rule, which published no single feed. */
  priceProvenance: UbwiPriceProvenance | null;
  /** Null under the retired retrieved-supply rule, which named a vendor instead. */
  supplyProvenance: UbwiSupplyProvenance | null;
};

/**
 * Where the BTC supply quantity came from, for the published surface.
 *
 * There is no provider field and no source name, because under methodology 1.2.0 there is
 * no supply provider. The surface must never name a supply vendor it does not use.
 */
export type UbwiSupplyProvenance = {
  /** e.g. "Protocol-derived scheduled issuance". */
  basis: string;
  /** The reference height, and that the convention includes it. */
  referenceBlockHeight: number;
  /** Cumulative scheduled issuance in BTC. */
  scheduledSupplyBtc: number;
  /** The same quantity in satoshis, as a string: it does not fit a double safely. */
  scheduledSupplySats: string;
  /** The halving era and its per-block subsidy, in BTC. */
  halvingEra: number;
  blockSubsidyBtc: number;
  /** The caveats that must travel with the number. */
  caveat: string;
};

export type UbwiSurface =
  | ({
      status: "published";
      valuePercent: number;
      unit: typeof UBWI_UNIT;
      publishedAt: string;
      /** Null until a second real observation exists under the same versions. */
      changePercent: number | null;
      changeWithheldReason: string | null;
    } & UbwiDisclosure)
  | ({
      status: "withheld";
      unit: typeof UBWI_UNIT;
      /** The single sentence the surface shows in place of a value. */
      reason: string;
      /** The gate codes that refused, so the surface never invents its own explanation. */
      gateFailures: readonly string[];
    } & UbwiDisclosure);

export const UBWI_WITHHELD_NOTE =
  "No UBWI value is published. The publication gate refuses the current denominator, and Urdais withholds the value rather than relaxing the gate to produce one.";

/** The gate passes and no point has been frozen yet. A history that has not started. */
export const UBWI_NOT_YET_PUBLISHED_NOTE =
  "No UBWI value is published yet. The publication gate passes on the current calculation; history begins at the first frozen production point, and Urdais shows no value before then rather than back-filling one.";

/**
 * The one-line explanation of what UBWI measures. Kept on the main surface; the
 * methodology carries the detail.
 */
export const UBWI_EXPLANATION =
  "UBWI estimates Bitcoin's share of total global wealth using directly observed national balance sheets where available and a versioned residual model for economies without comparable published balance sheets.";

export const UBWI_METHODOLOGY_HREF = "/docs/methodology/ubwi";

/**
 * Decimal places for a published UBWI value, wherever it is shown.
 *
 * UBWI's whole defensible range is about 0.22 % to 0.30 %. Two decimals would render
 * most of that band as the same number, so every surface that shows the value shares
 * this constant rather than choosing its own precision.
 */
export const UBWI_VALUE_FRACTION_DIGITS = 4;

/**
 * The homepage watchlist row for UBWI, or null when nothing is published.
 *
 * A row exists only for a frozen production point. There is deliberately no withheld
 * row and no placeholder level: a watchlist row is a number, and UBWI has a number only
 * once the gate has passed and a point is frozen. Until then the homepage shows no UBWI
 * row at all and the detail page carries the withheld state with its full disclosure.
 *
 * Change stays null until a second observation exists; IndexRow omits the movement line
 * for a null change rather than printing a fabricated 0 %.
 */
export function ubwiIndexSnapshot(
  publication: { publishedAt: string; valuePercent: number; changePercent: number | null } | null,
): IndexSnapshot | null {
  if (publication === null) return null;
  return {
    symbol: "UBWI",
    name: MARKET_CATALOG.find((market) => market.symbol === "UBWI")?.name ?? "Urdais Bitcoin Wealth Index",
    unit: UBWI_UNIT,
    // A frozen production publication is the only thing that reaches this line, so the row
    // carries the level and the movement while the demo rails beside it do not.
    provenance: "production",
    value: publication.valuePercent,
    valueFractionDigits: UBWI_VALUE_FRACTION_DIGITS,
    changePercent: publication.changePercent,
    asOf: Math.floor(new Date(publication.publishedAt).getTime() / 1000),
  };
}

/**
 * Build the surface state. `publication` is the frozen published point where one exists;
 * passing none is the ordinary case today and produces the withheld state.
 */
export function ubwiSurface(options?: {
  now?: string;
  publication?: { publishedAt: string; valuePercent: number; changePercent: number | null };
}): UbwiSurface {
  const calculatedAt = options?.now ?? new Date().toISOString();
  const calculation = calculateUbwi({ calculatedAt });
  const gate = evaluateGate(calculation);

  const disclosure: UbwiDisclosure = {
    totalGlobalWealthUsd: calculation.totalGlobalWealthUsd,
    bitcoinMarketCapUsd: calculation.numerator.marketCapUsd,
    observedSharePercent: calculation.observedShareOfTotal,
    modeledSharePercent: calculation.modeledShareOfTotal,
    rightsClearedGdpCoverage: calculation.coverage.rightsClearedGdpCoverage,
    observedEconomyCount: calculation.coverage.observedEconomyCount,
    sensitivity: calculation.sensitivity,
    unobservedMajorEconomies: calculation.unobservedMajorEconomies,
    methodologyVersion: METHODOLOGY_VERSION,
    residualModelVersion: RESIDUAL_MODEL_VERSION,
    observedAt: calculation.numerator.observedAt,
    blockHeight: calculation.numerator.blockHeight,
    priceProvenance: priceProvenance(calculation),
    supplyProvenance: supplyProvenance(calculation),
  };

  if (options?.publication && gate.passed) {
    return {
      status: "published",
      unit: UBWI_UNIT,
      valuePercent: options.publication.valuePercent,
      publishedAt: options.publication.publishedAt,
      changePercent: options.publication.changePercent,
      changeWithheldReason:
        options.publication.changePercent === null
          ? "Percentage change is unavailable until a second production observation exists."
          : null,
      ...disclosure,
    };
  }

  return {
    status: "withheld",
    unit: UBWI_UNIT,
    // Two different silences, and the surface must not conflate them. A gate that refuses
    // is Urdais declining to publish a number it does not stand behind; a passing gate with
    // nothing published yet is simply a history that has not started. Telling a reader the
    // gate refuses when it does not would be a fabricated explanation.
    reason: gate.passed ? UBWI_NOT_YET_PUBLISHED_NOTE : UBWI_WITHHELD_NOTE,
    gateFailures: gate.findings.map((f) => f.code),
    ...disclosure,
  };
}

function supplyProvenance(calculation: UbwiCalculation): UbwiSupplyProvenance | null {
  const lineage = calculation.numerator.supplyDerivation;
  if (lineage === undefined) return null;
  return {
    basis: "Protocol-derived scheduled issuance",
    referenceBlockHeight: calculation.numerator.blockHeight,
    scheduledSupplyBtc: calculation.numerator.supplyBtc,
    scheduledSupplySats: lineage.scheduledSupplySats,
    halvingEra: lineage.halvingEra,
    blockSubsidyBtc: Number(lineage.blockSubsidySats) / 1e8,
    caveat:
      "Cumulative block subsidy scheduled by the Bitcoin protocol through this block height, " +
      "inclusive. Transaction fees are excluded and no lost-coin or spendability adjustment is " +
      "applied, so this is scheduled issuance rather than an externally reported " +
      "circulating-supply figure.",
  };
}

function priceProvenance(calculation: UbwiCalculation): UbwiPriceProvenance | null {
  const feed = calculation.numerator.chainlink;
  if (feed === undefined) return null;
  const iface = sourceInterface(calculation.numerator.priceSourceInterface);
  const status = iface === undefined ? "under_review" : effectiveRightsStatus(iface);
  return {
    feed: `Chainlink ${feed.description.replace(/ /g, "")}`,
    network: CHAINLINK_BTC_USD_FEED.networkName,
    proxyAddress: feed.proxyAddress,
    roundId: feed.roundId,
    feedUpdatedAt: new Date(feed.updatedAt * 1000).toISOString(),
    // The surface says the rights state plainly rather than implying a licence. An
    // inference presented as a grant on a public page is the failure this phase was
    // most at risk of, so the page carries the qualification too.
    rightsNote:
      status === "inferred_permitted"
        ? "Read from the public feed under inferred permission, not an express licence from Chainlink."
        : "Read from the public feed.",
  };
}

/** The gate thresholds a surface may quote, so the page and the engine cannot disagree. */
export const UBWI_GATE_SUMMARY = {
  maxModeledSharePercent: PRODUCTION_V1_THRESHOLDS.maxImputedShareOfWealth * 100,
  minRightsClearedCoveragePercent: PRODUCTION_V1_THRESHOLDS.minRightsClearedGdpCoverage * 100,
} as const;
