/**
 * Read the Chainlink BTC/USD round live, through two independent endpoints.
 *
 * This is the module that makes methodology 1.2.0's price rule executable rather than
 * transcribed. The rule is not "the BTC price" and it is not "whatever a price API
 * returned": it is *the latest valid round of one named reference feed on one named
 * network*, and everything below exists to make the round identifiable, checkable and
 * re-readable by someone who has only the published record.
 *
 * ## The read is pinned to a block
 *
 * `eth_blockNumber` first, then every `eth_call` at that explicit block. Nothing is read at
 * `latest`. Two reasons, both of which have burned somebody:
 *
 *   - A set of calls at `latest` can straddle a round boundary or an aggregator upgrade and
 *     assemble an observation that never existed at any single instant -- a price from one
 *     round wearing another round's identity.
 *   - An observation whose block is "whatever the node had" cannot be re-run. The frozen
 *     `blockNumber`/`blockHash` are what let an auditor issue the same calls years later
 *     and get the same answer.
 *
 * ## The cross-check is a second opinion, not a second try
 *
 * `ChainlinkPriceObservation` has carried `rpcCrossCheckSource` since the shape was
 * designed, because the first production observation was captured by hand through two
 * endpoints that returned byte-identical rounds. A single-endpoint read would be weaker
 * than the shape already promises, so two endpoints are required and a disagreement fails
 * closed rather than picking a winner.
 *
 * The cross-check asks the second endpoint about **the same block**, which removes the
 * race a "read each node's own head" comparison would have: two nodes one block apart are
 * ordinary and would produce a spurious refusal roughly whenever a round lands between the
 * calls. Where the second endpoint cannot serve that block -- it lags, or it prunes -- the
 * check falls back once to that endpoint's own head and requires the identical round
 * tuple. Which of the two happened is reported, never silently chosen.
 *
 * ## Identity is checked, not assumed
 *
 * `description()` must be `BTC / USD` and `decimals()` must be 8, read from the contract
 * at the pinned block and compared against the methodology pin by
 * `validateChainlinkObservation`. A feed that answers a different pair, or reports
 * different decimals, is not this methodology's feed however correct its price may be.
 *
 * Every selector is computed from Keccak-256 in ./keccak.ts. None is written by hand.
 */

import {
  CHAINLINK_BTC_USD_FEED,
  type ChainlinkPriceObservation,
  decomposeRoundId,
  validateChainlinkObservation,
} from "../chainlink";
import {
  AbiDecodeError,
  decodeAddress,
  decodeLatestRoundData,
  decodeString,
  decodeUint,
  type LatestRoundData,
} from "./abi";
import { functionSelector } from "./keccak";
import { NumeratorRetrievalError } from "./problems";
import { EthereumEndpoint, RpcError, type RpcTransport } from "./rpc";

/**
 * The selectors, computed. `description()` is the one an earlier phase wrote from memory as
 * `0x7284e260`; the computed value is `0x7284e416`, and ./keccak.test.ts pins all of them.
 */
export const FEED_SELECTORS = {
  latestRoundData: functionSelector("latestRoundData()"),
  description: functionSelector("description()"),
  decimals: functionSelector("decimals()"),
  version: functionSelector("version()"),
  aggregator: functionSelector("aggregator()"),
  phaseId: functionSelector("phaseId()"),
  typeAndVersion: functionSelector("typeAndVersion()"),
} as const;

/** How the second endpoint was consulted. Reported so the weaker path is never silent. */
export type CrossCheckMode =
  /** The second endpoint answered about the same pinned block. The strong form. */
  | "same_block"
  /** The second endpoint could not serve that block; it answered at its own head instead. */
  | "own_head";

export type ChainlinkRetrieval = {
  observation: ChainlinkPriceObservation;
  crossCheckMode: CrossCheckMode;
  /** Age of the round at the moment it was read, in seconds. */
  ageSeconds: number;
};

export type ChainlinkReadOptions = {
  /** At least two endpoints. The first is the primary read, the second the cross-check. */
  endpoints: readonly string[];
  transport: RpcTransport;
  /** Injected so a test can place the read at any distance from the round. */
  now?: () => Date;
  feed?: typeof CHAINLINK_BTC_USD_FEED;
};

/**
 * Wrap RPC and decode failures in the retrieval vocabulary, losing no detail.
 *
 * Anything that is not a decode failure is reported as `RPC_UNAVAILABLE`, including errors
 * the transport did not wrap in `RpcError`. That is deliberate: the default transport wraps
 * everything, but a transport is an injected interface, and a publication path must fail
 * closed on an unrecognised error rather than let it escape as an unexpected crash. The
 * original message is carried through, so an error that was really a bug is still legible
 * in the log rather than disguised.
 */
async function guarded<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NumeratorRetrievalError) throw error;
    if (error instanceof AbiDecodeError) {
      throw new NumeratorRetrievalError("RPC_MALFORMED_RESPONSE", `${what}: ${error.message}`);
    }
    const detail =
      error instanceof RpcError
        ? error.message
        : error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
    throw new NumeratorRetrievalError("RPC_UNAVAILABLE", `${what}: ${detail}`);
  }
}

function sameRound(a: LatestRoundData, b: LatestRoundData): boolean {
  return (
    a.roundId === b.roundId &&
    a.answer === b.answer &&
    a.startedAt === b.startedAt &&
    a.updatedAt === b.updatedAt
  );
}

/**
 * Read the latest round and assemble a validated observation, or refuse.
 *
 * Nothing partial is ever returned: the observation this resolves with has already passed
 * `validateChainlinkObservation`, which is the same validator the gate and the stored-point
 * checks run. There is deliberately no second implementation of freshness here -- staleness
 * is reported by that validator's own `stale` flag, so the 3,600-second boundary exists in
 * exactly one place.
 */
export async function readChainlinkObservation(
  options: ChainlinkReadOptions,
): Promise<ChainlinkRetrieval> {
  const feed = options.feed ?? CHAINLINK_BTC_USD_FEED;
  const clock = options.now ?? (() => new Date());

  if (options.endpoints.length < 2) {
    throw new NumeratorRetrievalError(
      "RPC_ENDPOINTS_INSUFFICIENT",
      `the observation shape requires an independent cross-check, but ${options.endpoints.length} ` +
        "endpoint(s) are configured",
    );
  }
  const primary = new EthereumEndpoint(options.endpoints[0]!, options.transport);
  const secondary = new EthereumEndpoint(options.endpoints[1]!, options.transport);
  const proxy = feed.proxyAddress;

  // Identity of the network itself, before anything is read from it. A correct BTC/USD feed
  // on the wrong chain is the failure this catches; `validateChainlinkObservation` refuses
  // the recorded chain id too, so the check exists on both sides of the record.
  const chainId = await guarded("chain id", () => primary.chainId());

  // Pin the read. Everything below is at this block and no other.
  const blockNumber = await guarded("block number", () => primary.blockNumber());
  const blockHash = await guarded("block hash", () => primary.blockHash(blockNumber));

  const round = await guarded("latestRoundData()", async () =>
    decodeLatestRoundData(await primary.call(proxy, FEED_SELECTORS.latestRoundData, blockNumber)),
  );
  const description = await guarded("description()", async () =>
    decodeString(await primary.call(proxy, FEED_SELECTORS.description, blockNumber), "description()"),
  );
  const decimals = await guarded("decimals()", async () =>
    decodeUint(await primary.call(proxy, FEED_SELECTORS.decimals, blockNumber), "decimals()"),
  );
  const proxyVersion = await guarded("version()", async () =>
    decodeUint(await primary.call(proxy, FEED_SELECTORS.version, blockNumber), "version()"),
  );
  const contractPhaseId = await guarded("phaseId()", async () =>
    decodeUint(await primary.call(proxy, FEED_SELECTORS.phaseId, blockNumber), "phaseId()"),
  );
  const aggregatorAddress = await guarded("aggregator()", async () =>
    decodeAddress(await primary.call(proxy, FEED_SELECTORS.aggregator, blockNumber), "aggregator()"),
  );

  // Lineage, not a validity condition. `typeAndVersion()` is not part of
  // `AggregatorV3Interface`, and the observation type says so: "null where it does not
  // answer". An aggregator that does not implement it is not a reason to refuse a round.
  let aggregatorTypeAndVersion: string | null = null;
  try {
    aggregatorTypeAndVersion = decodeString(
      await primary.call(aggregatorAddress, FEED_SELECTORS.typeAndVersion, blockNumber),
      "typeAndVersion()",
    );
  } catch {
    aggregatorTypeAndVersion = null;
  }

  const { phaseId, aggregatorRoundId } = decomposeRoundId(round.roundId);
  if (contractPhaseId !== phaseId) {
    throw new NumeratorRetrievalError(
      "FEED_PHASE_DISAGREES",
      `the proxy reports phaseId() ${contractPhaseId} but round ${round.roundId} encodes phase ${phaseId}`,
    );
  }

  const crossCheckMode = await crossCheckRound({
    secondary,
    proxy,
    blockNumber,
    round,
    expectedChainId: chainId,
  });

  const retrievalTimestamp = Math.floor(clock().getTime() / 1000);
  const observation: ChainlinkPriceObservation = {
    chainId,
    proxyAddress: proxy,
    aggregatorAddress,
    aggregatorTypeAndVersion,
    description,
    decimals,
    proxyVersion,
    roundId: round.roundId,
    phaseId,
    aggregatorRoundId,
    answer: round.answer,
    // Recomputed from the raw answer rather than taken from anywhere else, and then checked
    // again by the validator, which recomputes it a second time and compares.
    normalizedUsd: Number(round.answer) / 10 ** decimals,
    startedAt: round.startedAt,
    updatedAt: round.updatedAt,
    answeredInRound: round.answeredInRound,
    retrievalTimestamp,
    blockNumber,
    blockHash,
    rpcSource: primary.url,
    rpcCrossCheckSource: secondary.url,
  };

  // One validator, shared with the gate and the stored-point checks. A round that would be
  // refused once recorded is refused here, before it can become a numerator.
  const validation = validateChainlinkObservation(observation, feed);
  if (!validation.valid) {
    throw new NumeratorRetrievalError(
      validation.stale ? "FEED_OBSERVATION_STALE" : "FEED_OBSERVATION_INVALID",
      validation.stale
        ? `round ${observation.roundId} was already ${validation.ageSeconds} s old when it was ` +
          `read, past the ${validation.heartbeatSeconds} s heartbeat`
        : `round ${observation.roundId} failed validation: ${validation.problems.join(", ")}`,
    );
  }

  return { observation, crossCheckMode, ageSeconds: validation.ageSeconds };
}

/**
 * Ask the second endpoint about the same round, and refuse if it disagrees.
 *
 * The same-block form is the one that means something: two independent nodes asked about
 * one block either return the same round or one of them is wrong. The `own_head` fallback
 * is weaker -- it can legitimately differ if a round lands between the two calls -- so it is
 * used only when the second endpoint cannot serve the pinned block, and it is reported
 * rather than folded into the successful case.
 */
async function crossCheckRound(input: {
  secondary: EthereumEndpoint;
  proxy: string;
  blockNumber: number;
  round: LatestRoundData;
  expectedChainId: number;
}): Promise<CrossCheckMode> {
  const { secondary, proxy, blockNumber, round } = input;

  const secondChainId = await guarded("cross-check chain id", () => secondary.chainId());
  if (secondChainId !== input.expectedChainId) {
    throw new NumeratorRetrievalError(
      "FEED_CROSS_CHECK_DISAGREES",
      `${secondary.url} reports chain id ${secondChainId}, not ${input.expectedChainId}`,
    );
  }

  let mode: CrossCheckMode = "same_block";
  let confirmation: LatestRoundData;
  try {
    confirmation = decodeLatestRoundData(
      await secondary.call(proxy, FEED_SELECTORS.latestRoundData, blockNumber),
    );
  } catch (error) {
    if (error instanceof AbiDecodeError) {
      throw new NumeratorRetrievalError(
        "RPC_MALFORMED_RESPONSE",
        `cross-check latestRoundData(): ${error.message}`,
      );
    }
    // The endpoint could not serve that block. Almost always a node a block or two behind.
    // A genuinely unreachable endpoint fails again on the fallback read below and is
    // reported there, so nothing is swallowed by treating this as the lagging case.
    mode = "own_head";
    const ownHead = await guarded("cross-check block number", () => secondary.blockNumber());
    confirmation = await guarded("cross-check latestRoundData()", async () =>
      decodeLatestRoundData(await secondary.call(proxy, FEED_SELECTORS.latestRoundData, ownHead)),
    );
  }

  if (!sameRound(round, confirmation)) {
    throw new NumeratorRetrievalError(
      "FEED_CROSS_CHECK_DISAGREES",
      `${secondary.url} returned round ${confirmation.roundId} (answer ${confirmation.answer}, ` +
        `updatedAt ${confirmation.updatedAt}) where ${input.proxy} at block ${blockNumber} gave ` +
        `round ${round.roundId} (answer ${round.answer}, updatedAt ${round.updatedAt})`,
    );
  }
  return mode;
}
