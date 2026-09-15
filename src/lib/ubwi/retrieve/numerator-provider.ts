/**
 * The live BTC numerator: retrieve both legs, derive the supply, assemble one observation,
 * and refuse unless it passes every check a stored observation would have to pass.
 *
 *   two chain-tip reads  ->  protocol-scheduled supply  \
 *                                                        >-  BtcMarketObservation
 *   two Chainlink reads  ->  validated round            /
 *
 * This module is the whole of the retrieval boundary. Above it, `calculateUbwi` receives an
 * ordinary `BtcMarketObservation` and cannot tell -- and must not be able to tell -- whether
 * it was read from the chain a second ago or written into a test. Below it, nothing knows
 * what UBWI is. That separation is what keeps the calculator a pure function with no network
 * in it, and it is why the retrieval layer is the only place that can be wrong about the
 * network without the arithmetic also being wrong.
 *
 * ## It re-checks its own work
 *
 * `checkBlockHeight`, `checkSupplyDerivation` and `checkNumerator` are run here against the
 * assembled observation before it is handed to anybody. They are the same functions the
 * publication gate runs. This is not belt-and-braces: assembling an observation that the
 * gate would refuse, and discovering that three database round-trips later, is how a
 * pipeline ends up with a recorded calculation it can never publish. Refusing at the
 * boundary means a failed retrieval writes nothing at all.
 *
 * ## One instant, not two
 *
 * A market capitalization is a product of a supply and a price, and it is a quantity *at an
 * instant* only if both legs were observed close together. The two legs are therefore read
 * back-to-back and the elapsed window is bounded; a run whose legs drifted apart is refused
 * rather than published as a mixture of two moments.
 */

import { CHAINLINK_SOURCE_INTERFACE } from "../chainlink";
import { checkBlockHeight, checkNumerator, checkSupplyDerivation } from "../numerator";
import {
  PROTOCOL_SUPPLY_DERIVATION,
  SUPPLY_DERIVATION_VERSION,
  SupplyDerivationError,
  deriveScheduledSupply,
  satsToBtc,
} from "../supply";
import type { BtcMarketObservation } from "../types";
import {
  type BlockHeightRetrieval,
  type TextFetcher,
  fetchTextSource,
  readBlockHeight,
} from "./block-height";
import { type ChainlinkRetrieval, readChainlinkObservation } from "./chainlink-feed";
import { NumeratorRetrievalError } from "./problems";
import { type RpcTransport, fetchRpcTransport, resolveUbwiRpcEndpoints } from "./rpc";

/**
 * How far apart the two legs may be read and still be called one observation.
 *
 * The first production observation captured both inside 5.5 seconds. Ninety seconds is
 * several times that and still far inside the feed's 3,600-second heartbeat, so it
 * tolerates an unhappy network without ever tolerating a run that stalled between its legs.
 */
export const OBSERVATION_WINDOW_SECONDS = 90;

export type NumeratorRetrieval = {
  observation: BtcMarketObservation;
  chainlink: ChainlinkRetrieval;
  height: BlockHeightRetrieval;
  /** Seconds between the first height read and the price read. */
  observationWindowSeconds: number;
};

/**
 * What the publication pipeline depends on. A function of no arguments returning a fresh,
 * fully checked numerator -- which is exactly as much as the pipeline is allowed to know
 * about where numerators come from.
 */
export type NumeratorProvider = () => Promise<NumeratorRetrieval>;

export type RetrieveNumeratorOptions = {
  endpoints: readonly string[];
  transport: RpcTransport;
  fetchText: TextFetcher;
  now?: () => Date;
  windowSeconds?: number;
};

export async function retrieveBtcNumerator(
  options: RetrieveNumeratorOptions,
): Promise<NumeratorRetrieval> {
  const clock = options.now ?? (() => new Date());
  const windowSeconds = options.windowSeconds ?? OBSERVATION_WINDOW_SECONDS;

  // The height leg first, because it is the cheaper read and because a height failure
  // should not spend a Chainlink round's worth of freshness discovering itself.
  const height = await readBlockHeight({ fetchText: options.fetchText, now: clock });

  const chainlink = await readChainlinkObservation({
    endpoints: options.endpoints,
    transport: options.transport,
    now: clock,
  });

  const firstHeightReadAt = Math.floor(
    new Date(height.observations[0]!.retrievedAt).getTime() / 1000,
  );
  const observationWindowSeconds = chainlink.observation.retrievalTimestamp - firstHeightReadAt;
  if (Math.abs(observationWindowSeconds) > windowSeconds) {
    throw new NumeratorRetrievalError(
      "OBSERVATION_WINDOW_EXCEEDED",
      `the height and the price were read ${observationWindowSeconds} s apart, past the ` +
        `${windowSeconds} s window; the product would be a mixture of two instants`,
    );
  }

  let supply: ReturnType<typeof deriveScheduledSupply>;
  try {
    supply = deriveScheduledSupply(height.blockHeight);
  } catch (error) {
    throw new NumeratorRetrievalError(
      "SUPPLY_DERIVATION_FAILED",
      error instanceof SupplyDerivationError
        ? `${error.problem} at height ${height.blockHeight}: ${error.message}`
        : `height ${height.blockHeight}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const supplyBtc = satsToBtc(BigInt(supply.scheduledSupplySats));
  const priceUsd = chainlink.observation.normalizedUsd;

  const observation: BtcMarketObservation = {
    // The observation instant is the price read. The height readings are moments earlier
    // and are timestamped individually, so nothing is rounded into a single claimed time
    // that no read actually happened at.
    observedAt: new Date(chainlink.observation.retrievalTimestamp * 1000).toISOString(),
    blockHeight: height.blockHeight,
    heightSources: height.heightSources,
    heightObservations: height.observations,
    supplyBtc,
    // No `supplySourceInterface`. Under `protocol_scheduled` nobody supplies the quantity,
    // and naming an interface would assert a dependency methodology 1.2.0 removed.
    supplyConstruction: "protocol_scheduled",
    supplyDerivation: {
      derivation: PROTOCOL_SUPPLY_DERIVATION,
      derivationVersion: SUPPLY_DERIVATION_VERSION,
      rightsBasis: "derived_from_protocol",
      halvingEra: supply.halvingEra,
      blockSubsidySats: supply.blockSubsidySats,
      scheduledSupplySats: supply.scheduledSupplySats,
      excludesTransactionFees: true,
      excludesLostCoinAdjustment: true,
    },
    priceRule: "chainlink_reference_feed",
    priceSourceInterface: CHAINLINK_SOURCE_INTERFACE,
    priceUsd,
    chainlink: chainlink.observation,
    marketCapUsd: supplyBtc * priceUsd,
  };

  const problems = [
    ...checkBlockHeight(observation),
    ...checkSupplyDerivation(observation),
    ...checkNumerator(observation),
  ];
  if (problems.length > 0) {
    throw new NumeratorRetrievalError(
      "NUMERATOR_INVALID",
      `the assembled observation failed its own checks: ${problems.join(", ")}`,
    );
  }

  return { observation, chainlink, height, observationWindowSeconds };
}

/**
 * The provider the production pipeline uses.
 *
 * Everything it needs is either a public keyless endpoint or the platform's own `fetch`, so
 * a deployment needs no new secret to publish UBWI. `UBWI_ETH_RPC_URLS` overrides the RPC
 * endpoints where an operator wants to; absent, the documented defaults apply.
 */
export function liveNumeratorProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
): NumeratorProvider {
  return () =>
    retrieveBtcNumerator({
      endpoints: resolveUbwiRpcEndpoints(env),
      transport: fetchRpcTransport(),
      fetchText: fetchTextSource(),
    });
}
