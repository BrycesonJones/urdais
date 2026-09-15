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
import {
  MAX_MONEY_SATS,
  PROTOCOL_SUPPLY_DERIVATION,
  SUPPLY_DERIVATION_VERSION,
  SupplyDerivationError,
  deriveScheduledSupply,
  satsToBtc,
} from "./supply";
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
 * The Phase 2E numerator observation, under methodology 1.1.0. Retained, not published.
 *
 * Its supply leg was read from Blockchain.com's Explorer API, and that is exactly the
 * dependency methodology 1.2.0 removes: the retained Blockchain.com terms grant retrieval
 * but scope the Explorer "solely for informational purposes", which does not grant the
 * commercial derived-index publication Urdais performs. The gate refused this observation
 * on that ground and was right to.
 *
 * It is kept so the retired supply leg is legible from the code rather than only from a
 * changelog. Nothing computes from it.
 */
export const RETIRED_RETRIEVED_SUPPLY_OBSERVATION: BtcMarketObservation = {
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

/**
 * The reference numerator observation, under methodology 1.2.0.
 *
 * **This is not the production source and nothing scheduled reads it.** It is a frozen,
 * deterministic test vector: the observation the first published UBWI point was frozen
 * against, captured by hand on 15 September 2026 and kept so that point stays reproducible
 * and so the methodology has one worked example in the code rather than only in prose.
 *
 * It was called `PRODUCTION_BTC_OBSERVATION` until the numerator became a live retrieval,
 * and the old name was accurate then and dangerous afterwards: a constant named "production"
 * is a constant somebody will eventually publish. The daily job now obtains its numerator
 * from ./retrieve/numerator-provider.ts at execution time, and this value's only remaining
 * roles are as a fixture, as the structural example the rights readiness check reads its
 * interface slugs from, and as the deterministic input the read surface's disclosure block
 * is computed from.
 *
 * Two structural facts keep the two apart. `runDailyUbwiPublication` never calls
 * `calculateUbwi` without a retrieved numerator, and this round is long past its
 * 3,600-second heartbeat, so even a path that reached it would be refused as stale rather
 * than publishing a duplicate of the first point.
 *
 * The supply leg is not retrieved from anybody. The chain tip was read from two
 * independent endpoints, which agreed exactly on the integer 967,075, and the supply is the
 * cumulative scheduled block subsidy through that height computed by ./supply.ts:
 * 2,008,461,250,000,000 satoshis. Height 967,075 is in halving era 4, where the scheduled
 * subsidy is 312,500,000 satoshis -- 3.125 BTC -- per block.
 *
 * Nobody licenses that arithmetic, which is why `supplySourceInterface` is absent rather
 * than set to some interface that could be said to have supplied it.
 *
 * The price is proxy round 129127208515966885594 -- phase 7, aggregator round 24282 --
 * read through the Chainlink BTC/USD proxy on Ethereum mainnet and confirmed
 * byte-identical through a second, independent public RPC endpoint. The round was 493
 * seconds old at retrieval, well inside the documented 3,600-second heartbeat.
 *
 * Height and price were read inside one 5.5-second window, which is what makes the product
 * a market capitalization at an instant rather than a mix of two instants.
 *
 * This is the observation the first published UBWI point is frozen against.
 */
export const REFERENCE_BTC_OBSERVATION: BtcMarketObservation = {
  observedAt: "2026-09-15T04:13:40Z",
  blockHeight: 967_075,
  heightSources: ["mempool.space/api/blocks/tip/height", "blockchain.info/q/getblockcount"],
  heightObservations: [
    {
      source: "mempool.space/api/blocks/tip/height",
      rawValue: "967075",
      blockHeight: 967_075,
      retrievedAt: "2026-09-15T04:13:35.623932Z",
      provenance:
        "mempool.space's public REST API, read for one integer. The height is a consensus fact, not a dataset: it is identical for every honest observer of the chain and Urdais derives nothing from this endpoint except that integer.",
    },
    {
      source: "blockchain.info/q/getblockcount",
      rawValue: "967075",
      blockHeight: 967_075,
      retrievedAt: "2026-09-15T04:13:36.088456Z",
      provenance:
        "Blockchain.com's Explorer query interface, read for one integer. Blockchain.com's retained terms grant retrieval outright; what they do not grant is the derived-index publication of a *supply dataset*, which is why methodology 1.2.0 no longer reads a supply figure from here. Reading the chain tip for cross-verification is a different act from taking a supply quantity on the provider's authority.",
    },
  ],
  supplyBtc: 20_084_612.5,
  supplyConstruction: "protocol_scheduled",
  supplyDerivation: {
    derivation: PROTOCOL_SUPPLY_DERIVATION,
    derivationVersion: SUPPLY_DERIVATION_VERSION,
    rightsBasis: "derived_from_protocol",
    halvingEra: 4,
    blockSubsidySats: "312500000",
    scheduledSupplySats: "2008461250000000",
    excludesTransactionFees: true,
    excludesLostCoinAdjustment: true,
  },
  priceRule: "chainlink_reference_feed",
  priceSourceInterface: CHAINLINK_SOURCE_INTERFACE,
  priceUsd: 77_723.013_278_59,
  chainlink: {
    chainId: 1,
    proxyAddress: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    aggregatorAddress: "0x4a3411ac2948b33c69666b35cc6d055b27ea84f1",
    aggregatorTypeAndVersion: "AccessControlledOCR2Aggregator 1.0.0",
    description: "BTC / USD",
    decimals: 8,
    proxyVersion: 6,
    roundId: "129127208515966885594",
    phaseId: 7,
    aggregatorRoundId: "24282",
    answer: "7772301327859",
    normalizedUsd: 77_723.013_278_59,
    startedAt: 1_789_445_076,
    updatedAt: 1_789_445_123,
    answeredInRound: "129127208515966885594",
    retrievalTimestamp: 1_789_445_616,
    blockNumber: 25_980_399,
    blockHash: "0xc3e08685ee80e1b361139c0c940c3410ca502fbfc3ca81f92179d194cc1da74b",
    rpcSource: "https://ethereum-rpc.publicnode.com",
    rpcCrossCheckSource: "https://eth.drpc.org",
  },
  marketCapUsd: 20_084_612.5 * 77_723.013_278_59,
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
 * Why a reference block height could not be trusted.
 *
 * Kept apart from the supply problems below, and both kept apart from the general
 * numerator problems, because the operator response differs entirely: a height
 * disagreement means re-read the tip, a derivation failure means the arithmetic is broken,
 * and an impossible supply means something far worse than either. Collapsing them into one
 * "numerator invalid" would throw away the only information an operator actually needs.
 */
export type BlockHeightProblem =
  | "HEIGHT_NOT_INTEGER"
  | "HEIGHT_NOT_POSITIVE"
  | "HEIGHT_EVIDENCE_MISSING"
  | "HEIGHT_SOURCES_TOO_FEW"
  | "HEIGHT_SOURCES_NOT_INDEPENDENT"
  | "HEIGHT_RAW_VALUE_MISPARSED"
  | "HEIGHT_SOURCES_DISAGREE"
  | "HEIGHT_DISAGREES_WITH_EVIDENCE";

/** Why a protocol-derived supply could not be trusted. */
export type SupplyDerivationCheckProblem =
  | "SUPPLY_LINEAGE_MISSING"
  | "SUPPLY_LINEAGE_UNEXPECTED"
  | "SUPPLY_INTERFACE_UNEXPECTED"
  | "SUPPLY_DERIVATION_FAILED"
  | "SUPPLY_DISAGREES_WITH_SCHEDULE"
  | "SUPPLY_SUBSIDY_DISAGREES"
  | "SUPPLY_ERA_DISAGREES"
  | "SUPPLY_BTC_DISAGREES_WITH_SATS"
  | "SUPPLY_ABOVE_PROTOCOL_CAP"
  | "SUPPLY_NEGATIVE"
  | "SUPPLY_FEE_EXCLUSION_NOT_RECORDED"
  | "SUPPLY_RIGHTS_BASIS_WRONG";

/**
 * The minimum independent observations of the chain tip. Two, because a single reading
 * cannot be wrong in a detectable way, and because Phase 2E already established the
 * cross-check at two. Part 4 of the 2F brief is explicit that this is preserved, not
 * redesigned.
 */
export const MINIMUM_HEIGHT_SOURCES = 2;

/**
 * Check the reference block height against its own evidence.
 *
 * The rule is exact agreement and fail-closed. No averaging, no "take the higher", no
 * bounded tolerance: a tolerance on a block height would be an invented licence to publish
 * a supply the chain never scheduled. Two honest observers of the same chain either report
 * the same integer or one of them is lagging, and a lagging observer is a reason to re-read
 * rather than to interpolate.
 */
export function checkBlockHeight(observation: BtcMarketObservation): BlockHeightProblem[] {
  const problems: BlockHeightProblem[] = [];
  const height = observation.blockHeight;

  if (!Number.isInteger(height)) {
    problems.push("HEIGHT_NOT_INTEGER");
  } else if (height <= 0) {
    problems.push("HEIGHT_NOT_POSITIVE");
  }

  // The per-source evidence is required from methodology 1.2.0 onward, where the height is
  // the sole input to the supply. The retired observations predate it and are not held to
  // it; they are checked on `heightSources` alone, which is all they ever carried.
  if (observation.supplyConstruction !== "protocol_scheduled") return problems;

  const evidence = observation.heightObservations;
  if (evidence === undefined || evidence.length === 0) {
    problems.push("HEIGHT_EVIDENCE_MISSING");
    return problems;
  }
  if (evidence.length < MINIMUM_HEIGHT_SOURCES) problems.push("HEIGHT_SOURCES_TOO_FEW");
  if (new Set(evidence.map((e) => e.source)).size !== evidence.length) {
    problems.push("HEIGHT_SOURCES_NOT_INDEPENDENT");
  }

  for (const reading of evidence) {
    // The raw body and the parsed integer must be the same number. This is what catches a
    // lineage record whose stored evidence was edited without the value being re-derived.
    if (!/^\d+$/.test(reading.rawValue.trim())) {
      problems.push("HEIGHT_RAW_VALUE_MISPARSED");
    } else if (Number(reading.rawValue.trim()) !== reading.blockHeight) {
      problems.push("HEIGHT_RAW_VALUE_MISPARSED");
    }
    if (!Number.isInteger(reading.blockHeight) || reading.blockHeight < 0) {
      problems.push("HEIGHT_NOT_INTEGER");
    }
  }

  const distinct = new Set(evidence.map((e) => e.blockHeight));
  if (distinct.size > 1) problems.push("HEIGHT_SOURCES_DISAGREE");
  else if (!distinct.has(height)) problems.push("HEIGHT_DISAGREES_WITH_EVIDENCE");

  return [...new Set(problems)];
}

/**
 * Check a protocol-derived supply by recomputing it.
 *
 * The recorded quantity is never trusted: it is recomputed from the recorded height and
 * compared. A published supply that cannot be reproduced from its own stated height is a
 * lineage failure whatever else is true of it.
 */
export function checkSupplyDerivation(
  observation: BtcMarketObservation,
): SupplyDerivationCheckProblem[] {
  const problems: SupplyDerivationCheckProblem[] = [];

  if (observation.supplyConstruction !== "protocol_scheduled") {
    // The retired leg. It must carry an interface and must not carry a derivation.
    if (observation.supplyDerivation !== undefined) problems.push("SUPPLY_LINEAGE_UNEXPECTED");
    return problems;
  }

  // Under protocol derivation nobody supplies the quantity, so naming a supply interface
  // would assert a dependency that does not exist.
  if (observation.supplySourceInterface !== undefined) {
    problems.push("SUPPLY_INTERFACE_UNEXPECTED");
  }

  const lineage = observation.supplyDerivation;
  if (lineage === undefined) {
    problems.push("SUPPLY_LINEAGE_MISSING");
    return problems;
  }
  if (lineage.rightsBasis !== "derived_from_protocol") problems.push("SUPPLY_RIGHTS_BASIS_WRONG");
  if (lineage.excludesTransactionFees !== true || lineage.excludesLostCoinAdjustment !== true) {
    problems.push("SUPPLY_FEE_EXCLUSION_NOT_RECORDED");
  }

  let recomputed: ReturnType<typeof deriveScheduledSupply>;
  try {
    recomputed = deriveScheduledSupply(observation.blockHeight);
  } catch (error) {
    problems.push(
      error instanceof SupplyDerivationError && error.problem === "SUPPLY_ABOVE_CAP"
        ? "SUPPLY_ABOVE_PROTOCOL_CAP"
        : error instanceof SupplyDerivationError && error.problem === "SUPPLY_NEGATIVE"
          ? "SUPPLY_NEGATIVE"
          : "SUPPLY_DERIVATION_FAILED",
    );
    return problems;
  }

  if (lineage.scheduledSupplySats !== recomputed.scheduledSupplySats) {
    problems.push("SUPPLY_DISAGREES_WITH_SCHEDULE");
  }
  if (lineage.blockSubsidySats !== recomputed.blockSubsidySats) {
    problems.push("SUPPLY_SUBSIDY_DISAGREES");
  }
  if (lineage.halvingEra !== recomputed.halvingEra) problems.push("SUPPLY_ERA_DISAGREES");

  // The one place satoshis become a double. Checked exactly, not approximately: the
  // conversion is exact for every reachable supply, so any difference at all is a bug.
  if (satsToBtc(BigInt(lineage.scheduledSupplySats)) !== observation.supplyBtc) {
    problems.push("SUPPLY_BTC_DISAGREES_WITH_SATS");
  }

  const sats = BigInt(lineage.scheduledSupplySats);
  if (sats < 0n) problems.push("SUPPLY_NEGATIVE");
  if (sats > MAX_MONEY_SATS) problems.push("SUPPLY_ABOVE_PROTOCOL_CAP");

  return [...new Set(problems)];
}

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
    // Absent under `protocol_scheduled`: there is no supply interface, because there is no
    // supply provider. This is the line that retires the last external rights dependency
    // from the UBWI numerator -- not a gate that was relaxed, a dependency that was removed.
    ...(observation.supplySourceInterface === undefined
      ? []
      : [observation.supplySourceInterface]),
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
