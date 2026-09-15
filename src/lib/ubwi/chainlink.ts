/**
 * The UBWI BTC price leg: the Chainlink BTC/USD Data Feed on Ethereum mainnet.
 *
 * Methodology 1.1.0 replaces the three-venue exchange median with one reference price:
 *
 *   UBWI BTC price = the latest valid Chainlink BTC/USD Data Feed reference price on
 *   Ethereum mainnet available at the UBWI calculation timestamp.
 *
 * Why the venues were retired is a rights fact, not a quality judgement. Phase 2D
 * retrieved Coinbase's, Kraken's and Bitstamp's own terms and found that reproducing a
 * construction yourself does not reproduce the permission to publish it: Coinbase
 * prohibits recording by automated program at all, Kraken permits its content "only for
 * your own benefit", and Bitstamp grants exactly the UBWI use -- but only to a company
 * that has signed a Data License Agreement Urdais does not hold. Those findings and their
 * retained artifacts stay in the rights record. They are the reason for this change.
 *
 * What the reader must not conclude from this file:
 *
 *   - Chainlink is not a spot exchange. The feed is an aggregate published onchain by a
 *     decentralised oracle network, and Urdais cannot reconstruct the underlying source
 *     basket. The feed's own documentation says it "aggregate[s] many data sources".
 *   - Chainlink has granted Urdais nothing in writing. The rights posture is
 *     `inferred_permitted`, recorded as such in ./rights.ts, and it is an inference from
 *     a documented public interface rather than a licence.
 *
 * Two things are pinned and two are deliberately not.
 *
 *   Pinned (a change fails closed pending methodology review): the network, the proxy
 *   address, the pair, the decimals and the product type. These are the methodology.
 *
 *   Not pinned: the aggregator behind the proxy, and its phase. Chainlink upgrades
 *   aggregators behind a stable proxy by design; treating that as a methodology break
 *   would refuse every ordinary upgrade. The aggregator is therefore observation
 *   lineage -- frozen on every published point so the round can be audited later -- and
 *   not a pin.
 *
 * Every number below was read from the live contract through two independent public RPC
 * endpoints in this session, and the heartbeat and deviation threshold were read from
 * Chainlink's own reference-data directory, the file docs.chain.link itself renders.
 */

/**
 * The approved feed. A change to any field here is a methodology amendment, not a
 * configuration edit.
 */
export const CHAINLINK_BTC_USD_FEED = {
  /** Ethereum mainnet. */
  chainId: 1,
  networkName: "Ethereum mainnet",
  /**
   * The proxy, which is what the methodology pins. Reads go through it and never through
   * a transient aggregator implementation, because the aggregator is expected to change.
   */
  proxyAddress: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
  /** `description()` on the proxy, verbatim. The spacing is the contract's, not ours. */
  pair: "BTC / USD",
  /** `decimals()` on the proxy, verified live rather than taken from documentation. */
  decimals: 8,
  /**
   * The documented heartbeat: the maximum idle time before the oracle network opens a new
   * round regardless of price movement. This is the staleness bound and nothing is added
   * to it -- V1 has no grace period, because a grace period is an invented tolerance.
   */
  heartbeatSeconds: 3600,
  /** The documented deviation threshold, in per cent. Recorded, not enforced by Urdais. */
  deviationThresholdPercent: 0.5,
  /**
   * A standard push-based Data Feed reference price. Not Data Streams, and not Smart
   * Value Recapture: Chainlink's own catalogue names this feed
   * `BTC/USD-RefPrice-DF-Ethereum-001`, where `DF` is the Data Feed delivery channel and
   * `RefPrice` the product type.
   */
  productType: "data_feed_reference_price",
  clicProductName: "BTC/USD-RefPrice-DF-Ethereum-001",
  /** Chainlink's own feed metadata document, which docs.chain.link renders. */
  metadataUrl: "https://reference-data-directory.vercel.app/feeds-mainnet.json",
  documentationUrl: "https://docs.chain.link/data-feeds",
} as const;

/** The source interface slug the rights record registers this feed under. */
export const CHAINLINK_SOURCE_INTERFACE = "chainlink-btc-usd-ethereum" as const;

/**
 * One Chainlink observation, frozen whole.
 *
 * This is the audit record for the numerator's price leg, and it is deliberately more
 * than the price: a published point that cannot be re-read from the chain later is not
 * reproducible, and a round id alone does not identify a round once the aggregator behind
 * the proxy has been replaced.
 */
export type ChainlinkPriceObservation = {
  chainId: number;
  proxyAddress: string;
  /** The aggregator the proxy pointed at when the round was read. Lineage, not a pin. */
  aggregatorAddress: string | null;
  /** `typeAndVersion()` on the aggregator where it answers. Null where it does not. */
  aggregatorTypeAndVersion: string | null;
  /** `description()` on the proxy at read time, compared against the approved pair. */
  description: string;
  decimals: number;
  /** `version()` on the proxy. Recorded; not a validity condition. */
  proxyVersion: number | null;
  /** The proxy round id: phase in the high 64 bits, aggregator round in the low 64. */
  roundId: string;
  phaseId: number;
  aggregatorRoundId: string;
  /** The integer the contract returned, before any scaling. */
  answer: string;
  /** answer / 10**decimals. Recomputed and checked rather than trusted. */
  normalizedUsd: number;
  /** Unix seconds, from the contract. */
  startedAt: number;
  updatedAt: number;
  /**
   * Deprecated by Chainlink: "Previously used when answers could take multiple rounds to
   * be computed." Frozen because it is part of the round, never read as a validity
   * condition.
   */
  answeredInRound: string | null;
  /** When Urdais read the contract, in unix seconds. The staleness clock's other hand. */
  retrievalTimestamp: number;
  /** The chain head the read was pinned to, re-fetched so the lineage is reproducible. */
  blockNumber: number;
  blockHash: string;
  /** The RPC endpoint's identity. Never a key, and no endpoint here carries one. */
  rpcSource: string;
  /** A second, independent endpoint that returned the identical round, where one did. */
  rpcCrossCheckSource: string | null;
};

export type ChainlinkProblem =
  | "CHAIN_ID_MISMATCH"
  | "PROXY_ADDRESS_MISMATCH"
  | "FEED_DESCRIPTION_MISMATCH"
  | "DECIMALS_MISMATCH"
  | "ANSWER_NOT_POSITIVE"
  | "UPDATED_AT_NOT_POSITIVE"
  | "ROUND_ID_MISSING"
  | "PHASE_LINEAGE_INCONSISTENT"
  | "NORMALIZATION_DISAGREES"
  | "RETRIEVAL_BEFORE_UPDATE"
  | "OBSERVATION_STALE"
  | "BLOCK_LINEAGE_INCOMPLETE"
  | "RPC_SOURCE_MISSING";

export type ChainlinkValidation = {
  valid: boolean;
  problems: readonly ChainlinkProblem[];
  /** retrieval_timestamp - updatedAt, in seconds. Negative where the clocks disagree. */
  ageSeconds: number;
  /** The bound the age was checked against. */
  heartbeatSeconds: number;
  /** True only where the sole reason for refusal is age. Lets the caller say "stale". */
  stale: boolean;
};

/** Addresses compare case-insensitively; EIP-55 checksum casing is presentation. */
function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Fail closed. The observation is valid only if every applicable check passes, and each
 * check names one thing so the operator response is not guesswork.
 *
 * Deliberately absent: any use of `answeredInRound`. Chainlink's API reference marks it
 * deprecated, and the old `answeredInRound >= roundId` idiom is a validity test on a
 * field that no longer carries that meaning.
 */
export function validateChainlinkObservation(
  observation: ChainlinkPriceObservation,
  feed: typeof CHAINLINK_BTC_USD_FEED = CHAINLINK_BTC_USD_FEED,
): ChainlinkValidation {
  const problems: ChainlinkProblem[] = [];

  if (observation.chainId !== feed.chainId) problems.push("CHAIN_ID_MISMATCH");
  if (!sameAddress(observation.proxyAddress, feed.proxyAddress)) {
    problems.push("PROXY_ADDRESS_MISMATCH");
  }
  if (observation.description !== feed.pair) problems.push("FEED_DESCRIPTION_MISMATCH");
  if (observation.decimals !== feed.decimals) problems.push("DECIMALS_MISMATCH");

  // The round itself. `answer` and the round ids are carried as decimal strings because a
  // uint80 round id does not survive a double, and a silently rounded round id would make
  // the lineage unauditable in exactly the case it exists for.
  let answer: bigint | null = null;
  try {
    answer = BigInt(observation.answer);
  } catch {
    answer = null;
  }
  if (answer === null || answer <= 0n) problems.push("ANSWER_NOT_POSITIVE");
  if (!Number.isFinite(observation.updatedAt) || observation.updatedAt <= 0) {
    problems.push("UPDATED_AT_NOT_POSITIVE");
  }

  let roundId: bigint | null = null;
  try {
    roundId = BigInt(observation.roundId);
  } catch {
    roundId = null;
  }
  if (roundId === null || roundId <= 0n) problems.push("ROUND_ID_MISSING");

  // A proxy round id is the phase in the high 64 bits and the aggregator's own round in
  // the low 64. Checking the decomposition is what makes the frozen phase and aggregator
  // round evidence rather than annotation.
  if (roundId !== null && roundId > 0n) {
    const phase = Number(roundId >> 64n);
    const aggregatorRound = roundId & ((1n << 64n) - 1n);
    let recordedRound: bigint | null = null;
    try {
      recordedRound = BigInt(observation.aggregatorRoundId);
    } catch {
      recordedRound = null;
    }
    if (phase !== observation.phaseId || recordedRound !== aggregatorRound) {
      problems.push("PHASE_LINEAGE_INCONSISTENT");
    }
  }

  if (answer !== null && observation.decimals === feed.decimals) {
    const expected = Number(answer) / 10 ** observation.decimals;
    const tolerance = Math.max(Math.abs(expected) * 1e-12, Number.EPSILON);
    if (Math.abs(expected - observation.normalizedUsd) > tolerance) {
      problems.push("NORMALIZATION_DISAGREES");
    }
  }

  // Block lineage. A read that cannot name the block it was pinned to cannot be re-run.
  if (
    !Number.isInteger(observation.blockNumber) ||
    observation.blockNumber <= 0 ||
    !/^0x[0-9a-fA-F]{64}$/.test(observation.blockHash)
  ) {
    problems.push("BLOCK_LINEAGE_INCOMPLETE");
  }
  if (observation.rpcSource.trim() === "") problems.push("RPC_SOURCE_MISSING");

  // Staleness, last, so `stale` can distinguish "only old" from "old and also wrong".
  const ageSeconds = observation.retrievalTimestamp - observation.updatedAt;
  if (ageSeconds < 0) problems.push("RETRIEVAL_BEFORE_UPDATE");
  else if (ageSeconds > feed.heartbeatSeconds) problems.push("OBSERVATION_STALE");

  return {
    valid: problems.length === 0,
    problems,
    ageSeconds,
    heartbeatSeconds: feed.heartbeatSeconds,
    stale: problems.length === 1 && problems[0] === "OBSERVATION_STALE",
  };
}

/**
 * Decompose a proxy round id the way the proxy composes it. Exported because the
 * collector and the tests must agree on it, and because writing it twice is how the two
 * come to disagree.
 */
export function decomposeRoundId(roundId: string): { phaseId: number; aggregatorRoundId: string } {
  const value = BigInt(roundId);
  return {
    phaseId: Number(value >> 64n),
    aggregatorRoundId: (value & ((1n << 64n) - 1n)).toString(),
  };
}
