/**
 * The UBWI numerator: Bitcoin market capitalization at an instant.
 *
 *   Bitcoin Market Capitalization = Issued BTC Supply x BTC/USD reference price
 *
 * Supply is issued supply derived from the chain at a stated block height, not a
 * free-float or lost-coin-adjusted figure: no lost-coin adjustment is applied, because
 * no lost-coin estimate is deterministic and a non-deterministic adjustment inside a
 * published index is an opinion wearing a number's clothes. That leg is unchanged by the
 * 1.1.0 amendment.
 *
 * Price, under methodology 1.1.0, is the latest valid Chainlink BTC/USD Data Feed
 * reference price on Ethereum mainnet available at the calculation timestamp. See
 * ./chainlink.ts for the feed pin, the lineage record and the fail-closed validator.
 *
 * Methodology 1.0.0's three-venue median is retired, not deleted: `RETIRED_VENUE_MEDIAN_
 * OBSERVATION` below is the observation Production V1 carried, kept so that a published
 * history can be read against the methodology that produced it. Nothing computes from it.
 *
 * The numerator is instantaneous and the timestamp is load-bearing. Phase 1 measured
 * two retrievals two minutes apart differing by roughly 0.2 % of the price.
 */
import {
  CHAINLINK_BTC_USD_FEED,
  CHAINLINK_SOURCE_INTERFACE,
  validateChainlinkObservation,
} from "./chainlink";
import type { BtcMarketObservation } from "./types";

/** A median needed an odd, independent, and small set; three was the 1.0.0 minimum. */
export const MINIMUM_VENUE_COUNT = 3;

/**
 * The Production V1 numerator under methodology 1.0.0, retained for history.
 *
 * It was never published: the gate refused it, and from Phase 2D it refused it on the
 * venues' own terms. It is here so the retired price rule is legible from the code rather
 * than only from a changelog, and so a future reader can see exactly what was retired.
 */
export const RETIRED_VENUE_MEDIAN_OBSERVATION: BtcMarketObservation = {
  observedAt: "2026-09-15T00:48:04Z",
  blockHeight: 967_044,
  heightSources: ["mempool.space/api/blocks/tip/height", "blockchain.info/q/getblockcount"],
  supplyBtc: 20_084_481,
  supplySourceInterface: "blockchain-info-supply",
  supplyConstruction: "claimed_issuance",
  priceRule: "median_of_venues",
  priceSourceInterface: "bitstamp-ticker",
  priceUsd: 77_941.37,
  venues: [
    {
      venue: "coinbase",
      sourceInterface: "coinbase-spot",
      endpoint: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      priceUsd: 77_948.285,
      selected: false,
    },
    {
      venue: "bitstamp",
      sourceInterface: "bitstamp-ticker",
      endpoint: "https://www.bitstamp.net/api/v2/ticker/btcusd/",
      priceUsd: 77_941.37,
      selected: true,
    },
    {
      venue: "kraken",
      sourceInterface: "kraken-ticker",
      endpoint: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
      priceUsd: 77_940.9,
      selected: false,
    },
  ],
  marketCapUsd: 20_084_481 * 77_941.37,
};

/**
 * The Phase 2E production numerator observation, under methodology 1.1.0.
 *
 * Supply and height were read from Blockchain.com with the height independently confirmed
 * by mempool.space. The price is proxy round 129127208515966885593 -- phase 7, aggregator
 * round 24281 -- read through the Chainlink BTC/USD proxy on Ethereum mainnet and
 * confirmed byte-identical through a second, independent public RPC endpoint. The round
 * was 352 seconds old at retrieval, against a documented 3600-second heartbeat.
 *
 * Reading the supply and the price inside one 4.9-second window is what makes the product
 * of the two a market capitalization at an instant rather than a mix of two instants.
 */
export const PRODUCTION_BTC_OBSERVATION: BtcMarketObservation = {
  observedAt: "2026-09-15T03:10:39Z",
  blockHeight: 967_062,
  heightSources: ["mempool.space/api/blocks/tip/height", "blockchain.info/q/getblockcount"],
  supplyBtc: 20_084_546,
  supplySourceInterface: "blockchain-info-supply",
  supplyConstruction: "claimed_issuance",
  priceRule: "chainlink_reference_feed",
  priceSourceInterface: CHAINLINK_SOURCE_INTERFACE,
  priceUsd: 77_779.484_602_64,
  chainlink: {
    chainId: 1,
    proxyAddress: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    aggregatorAddress: "0x4a3411ac2948b33c69666b35cc6d055b27ea84f1",
    aggregatorTypeAndVersion: "AccessControlledOCR2Aggregator 1.0.0",
    description: "BTC / USD",
    decimals: 8,
    proxyVersion: 6,
    roundId: "129127208515966885593",
    phaseId: 7,
    aggregatorRoundId: "24281",
    answer: "7777948460264",
    normalizedUsd: 77_779.484_602_64,
    startedAt: 1_789_441_474,
    updatedAt: 1_789_441_487,
    answeredInRound: "129127208515966885593",
    retrievalTimestamp: 1_789_441_839,
    blockNumber: 25_980_084,
    blockHash: "0xeb845b61503fd6c54584ac0e19d757c54f337c5674a1b1c244463fccf3a33640",
    rpcSource: "https://ethereum-rpc.publicnode.com",
    rpcCrossCheckSource: "https://eth.drpc.org",
  },
  marketCapUsd: 20_084_546 * 77_779.484_602_64,
};

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type NumeratorProblem =
  | "TOO_FEW_VENUES"
  | "MEDIAN_DISAGREES_WITH_VENUES"
  | "SELECTION_DISAGREES_WITH_MEDIAN"
  | "MARKET_CAP_DISAGREES"
  | "SUPPLY_NOT_POSITIVE"
  | "PRICE_NOT_POSITIVE"
  | "BLOCK_HEIGHT_MISSING"
  | "PRICE_LINEAGE_MISSING"
  | "PRICE_RULE_LINEAGE_MISMATCH"
  | "PRICE_DISAGREES_WITH_FEED"
  | `CHAINLINK_${string}`;

/**
 * Check a numerator observation against its own recorded parts. Arithmetic the code
 * verifies rather than trusts, the same posture the database takes in its constraints.
 *
 * Under `chainlink_reference_feed` the whole Chainlink validator runs here, so the gate
 * inherits chain-id, feed-identity, round and staleness enforcement without the gate
 * having to know what a phase id is.
 */
export function checkNumerator(observation: BtcMarketObservation): NumeratorProblem[] {
  const problems: NumeratorProblem[] = [];

  if (!(observation.supplyBtc > 0)) problems.push("SUPPLY_NOT_POSITIVE");
  if (!(observation.priceUsd > 0)) problems.push("PRICE_NOT_POSITIVE");
  if (!Number.isFinite(observation.blockHeight) || observation.blockHeight <= 0) {
    problems.push("BLOCK_HEIGHT_MISSING");
  }

  if (observation.priceRule === "chainlink_reference_feed") {
    if (observation.venues !== undefined) problems.push("PRICE_RULE_LINEAGE_MISMATCH");
    const feed = observation.chainlink;
    if (feed === undefined) {
      problems.push("PRICE_LINEAGE_MISSING");
    } else {
      for (const problem of validateChainlinkObservation(feed, CHAINLINK_BTC_USD_FEED).problems) {
        problems.push(`CHAINLINK_${problem}` as const);
      }
      if (Math.abs(feed.normalizedUsd - observation.priceUsd) > 1e-9) {
        problems.push("PRICE_DISAGREES_WITH_FEED");
      }
    }
  } else {
    // The retired rule. Kept executable so the retained 1.0.0 observation stays checkable.
    if (observation.chainlink !== undefined) problems.push("PRICE_RULE_LINEAGE_MISMATCH");
    const venues = observation.venues ?? [];
    const prices = venues.map((v) => v.priceUsd);
    if (venues.length < MINIMUM_VENUE_COUNT) problems.push("TOO_FEW_VENUES");
    if (prices.length > 0 && Math.abs(median(prices) - observation.priceUsd) > 1e-6) {
      problems.push("MEDIAN_DISAGREES_WITH_VENUES");
    }
    const selected = venues.filter((v) => v.selected);
    if (selected.length !== 1 || Math.abs(selected[0]!.priceUsd - observation.priceUsd) > 1e-6) {
      problems.push("SELECTION_DISAGREES_WITH_MEDIAN");
    }
  }

  const expected = observation.supplyBtc * observation.priceUsd;
  if (Math.abs(expected - observation.marketCapUsd) > Math.max(1, expected * 1e-12)) {
    problems.push("MARKET_CAP_DISAGREES");
  }

  return problems;
}

/**
 * Every source interface slug a numerator observation reads through, so the gate can hold
 * the numerator to the same rights standard as the denominator without knowing which
 * price rule produced it.
 */
export function numeratorSourceInterfaces(observation: BtcMarketObservation): string[] {
  return [
    observation.supplySourceInterface,
    ...(observation.venues?.map((v) => v.sourceInterface) ?? [observation.priceSourceInterface]),
  ];
}

/** Venue price dispersion at the observation instant, in basis points of the price. */
export function venueDispersionBasisPoints(observation: BtcMarketObservation): number {
  const prices = observation.venues?.map((v) => v.priceUsd) ?? [];
  if (prices.length === 0) return 0;
  const spread = Math.max(...prices) - Math.min(...prices);
  return (spread / observation.priceUsd) * 10_000;
}
