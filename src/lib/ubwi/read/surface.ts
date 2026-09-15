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

/**
 * The one-line explanation of what UBWI measures. Kept on the main surface; the
 * methodology carries the detail.
 */
export const UBWI_EXPLANATION =
  "UBWI estimates Bitcoin's share of total global wealth using directly observed national balance sheets where available and a versioned residual model for economies without comparable published balance sheets.";

export const UBWI_METHODOLOGY_HREF = "/docs/methodology/ubwi";

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
    reason: UBWI_WITHHELD_NOTE,
    gateFailures: gate.findings.map((f) => f.code),
    ...disclosure,
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
