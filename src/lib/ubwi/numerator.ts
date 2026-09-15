/**
 * The UBWI numerator: Bitcoin market capitalization at an instant.
 *
 *   Bitcoin Market Capitalization = Issued BTC Supply x BTC Spot Price
 *
 * Supply is issued supply derived from the chain at a stated block height, not a
 * free-float or lost-coin-adjusted figure: no lost-coin adjustment is applied, because
 * no lost-coin estimate is deterministic and a non-deterministic adjustment inside a
 * published index is an opinion wearing a number's clothes.
 *
 * Price is the median of three independent venue tickers read directly by Urdais at one
 * instant. Reading the venues directly rather than taking a vendor aggregate is what
 * removes the licensing dependency and makes the construction reproducible: the venue
 * rows are retained, so the median is auditable rather than asserted.
 *
 * The numerator is instantaneous and the timestamp is load-bearing. Phase 1 measured
 * two retrievals two minutes apart differing by roughly 0.2 % of the price.
 */
import type { BtcMarketObservation } from "./types";

/** A median needs an odd, independent, and small set; three is the methodology minimum. */
export const MINIMUM_VENUE_COUNT = 3;

/**
 * The first Production V1 numerator observation. Supply and height were read from
 * Blockchain.com with the height independently confirmed by mempool.space; the three
 * venue readings were taken inside a 1.8-second window.
 *
 * Dispersion across venues at this instant was $7.39, or 0.95 basis points of the price.
 * That is the entire numerator uncertainty from venue choice, and it is three orders of
 * magnitude smaller than the denominator's.
 */
export const PRODUCTION_BTC_OBSERVATION: BtcMarketObservation = {
  observedAt: "2026-09-15T00:48:04Z",
  blockHeight: 967_044,
  heightSources: ["mempool.space/api/blocks/tip/height", "blockchain.info/q/getblockcount"],
  supplyBtc: 20_084_481,
  supplySourceInterface: "blockchain-info-supply",
  supplyConstruction: "claimed_issuance",
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
  priceRule: "median_of_venues",
  medianPriceUsd: 77_941.37,
  marketCapUsd: 20_084_481 * 77_941.37,
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
  | "BLOCK_HEIGHT_MISSING";

/**
 * Check a numerator observation against its own recorded parts. Arithmetic the code
 * verifies rather than trusts, the same posture the database takes in its constraints.
 */
export function checkNumerator(observation: BtcMarketObservation): NumeratorProblem[] {
  const problems: NumeratorProblem[] = [];
  const prices = observation.venues.map((v) => v.priceUsd);

  if (observation.venues.length < MINIMUM_VENUE_COUNT) problems.push("TOO_FEW_VENUES");
  if (!(observation.supplyBtc > 0)) problems.push("SUPPLY_NOT_POSITIVE");
  if (!Number.isFinite(observation.blockHeight) || observation.blockHeight <= 0) {
    problems.push("BLOCK_HEIGHT_MISSING");
  }

  if (prices.length > 0 && Math.abs(median(prices) - observation.medianPriceUsd) > 1e-6) {
    problems.push("MEDIAN_DISAGREES_WITH_VENUES");
  }

  const selected = observation.venues.filter((v) => v.selected);
  if (
    selected.length !== 1 ||
    Math.abs(selected[0]!.priceUsd - observation.medianPriceUsd) > 1e-6
  ) {
    problems.push("SELECTION_DISAGREES_WITH_MEDIAN");
  }

  const expected = observation.supplyBtc * observation.medianPriceUsd;
  if (Math.abs(expected - observation.marketCapUsd) > Math.max(1, expected * 1e-12)) {
    problems.push("MARKET_CAP_DISAGREES");
  }

  return problems;
}

/** Venue price dispersion at the observation instant, in basis points of the median. */
export function venueDispersionBasisPoints(observation: BtcMarketObservation): number {
  const prices = observation.venues.map((v) => v.priceUsd);
  if (prices.length === 0) return 0;
  const spread = Math.max(...prices) - Math.min(...prices);
  return (spread / observation.medianPriceUsd) * 10_000;
}
