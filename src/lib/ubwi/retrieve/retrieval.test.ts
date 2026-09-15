/**
 * The retrieval boundary: what a live numerator read must accept, and everything it must
 * refuse.
 *
 * The whole point of the boundary is that the failures are testable. A real endpoint will
 * not return a negative price, disagree with its peer, or hand back half a round on
 * request, so the transport is injected and the chain is a fixture. Every test below is a
 * shape the production path can actually meet on a bad day.
 *
 * The refusals matter more than the acceptance. A retrieval that fails open publishes a
 * number nobody observed, under today's date, into a series whose entire claim is that
 * every point is a real observation.
 */
import { describe, expect, it } from "vitest";

import { CHAINLINK_BTC_USD_FEED } from "../chainlink";
import { calculateUbwi } from "../calculate";
import { REFERENCE_BTC_OBSERVATION, checkNumerator } from "../numerator";
import { AbiDecodeError, decodeLatestRoundData, decodeString, decodeUint } from "./abi";
import { BLOCK_HEIGHT_SOURCES, readBlockHeight } from "./block-height";
import { FEED_SELECTORS, readChainlinkObservation } from "./chainlink-feed";
import { NumeratorRetrievalError } from "./problems";
import { retrieveBtcNumerator } from "./numerator-provider";
import {
  DEFAULT_UBWI_RPC_ENDPOINTS,
  type RpcTransport,
  parseJsonRpcResponse,
  resolveUbwiRpcEndpoints,
} from "./rpc";

// --------------------------------------------------------------------------- ABI fixtures

function word(value: bigint | number): string {
  const v = typeof value === "bigint" ? value : BigInt(value);
  const unsigned = v < 0n ? (1n << 256n) + v : v;
  return unsigned.toString(16).padStart(64, "0");
}

function encodeString(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let body = "";
  for (const b of bytes) body += b.toString(16).padStart(2, "0");
  const padded = body.padEnd(Math.ceil(bytes.length / 32) * 64, "0");
  return `0x${word(32)}${word(bytes.length)}${padded}`;
}

type Round = {
  roundId: bigint;
  answer: bigint;
  startedAt: number;
  updatedAt: number;
  answeredInRound: bigint;
};

function encodeRound(round: Round): string {
  return `0x${word(round.roundId)}${word(round.answer)}${word(round.startedAt)}${word(
    round.updatedAt,
  )}${word(round.answeredInRound)}`;
}

// A real round, read live from the proxy on 15 September 2026: phase 7, aggregator round
// 24298, answer 7581648519588 at 8 decimals.
const PHASE = 7;
const AGGREGATOR_ROUND = 24_298n;
const ROUND_ID = (BigInt(PHASE) << 64n) | AGGREGATOR_ROUND;
const UPDATED_AT = 1_789_483_211;
const NOW_UNIX = UPDATED_AT + 190;
const BLOCK_NUMBER = 25_983_534;
const BLOCK_HASH = `0x${"e1196f78662fba912ea980e8b44e6a658c730189cf801b8426a2dd6fbe9f4f1d"}`;
const AGGREGATOR = "0x4a3411ac2948b33c69666b35cc6d055b27ea84f1";
const HEIGHT = 967_135;

type ChainState = {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  round: Round;
  description: string;
  decimals: number;
  version: number;
  phaseId: number;
  aggregator: string;
  typeAndVersion: string | null;
  /** When set, eth_call at any block other than this one fails, as a lagging node would. */
  servesOnlyBlock?: number;
};

function chainState(overrides: Partial<ChainState> = {}): ChainState {
  return {
    chainId: 1,
    blockNumber: BLOCK_NUMBER,
    blockHash: BLOCK_HASH,
    round: {
      roundId: ROUND_ID,
      answer: 7_581_648_519_588n,
      startedAt: UPDATED_AT - 13,
      updatedAt: UPDATED_AT,
      answeredInRound: ROUND_ID,
    },
    description: "BTC / USD",
    decimals: 8,
    version: 6,
    phaseId: PHASE,
    aggregator: AGGREGATOR,
    typeAndVersion: "AccessControlledOCR2Aggregator 1.0.0",
    ...overrides,
  };
}

const PRIMARY = "https://primary.example";
const SECONDARY = "https://secondary.example";

/** A transport over one fixed chain state per endpoint. */
function transportFor(states: Record<string, ChainState>): RpcTransport {
  return async (endpoint, method, params) => {
    const state = states[endpoint];
    if (state === undefined) throw new Error(`no fixture for ${endpoint}`);
    if (method === "eth_chainId") return `0x${state.chainId.toString(16)}`;
    if (method === "eth_blockNumber") return `0x${state.blockNumber.toString(16)}`;
    if (method === "eth_getBlockByNumber") return { hash: state.blockHash };
    if (method === "eth_call") {
      const call = params[0] as { to: string; data: string };
      const blockTag = params[1] as string;
      if (state.servesOnlyBlock !== undefined && BigInt(blockTag) !== BigInt(state.servesOnlyBlock)) {
        // What a pruning or lagging node answers, and the reason the cross-check has a
        // fallback at all.
        return Promise.reject(
          Object.assign(new Error("missing trie node"), { name: "RpcError" }),
        );
      }
      if (call.to.toLowerCase() === state.aggregator.toLowerCase()) {
        if (state.typeAndVersion === null) return "0x";
        return encodeString(state.typeAndVersion);
      }
      switch (call.data) {
        case FEED_SELECTORS.latestRoundData:
          return encodeRound(state.round);
        case FEED_SELECTORS.description:
          return encodeString(state.description);
        case FEED_SELECTORS.decimals:
          return `0x${word(state.decimals)}`;
        case FEED_SELECTORS.version:
          return `0x${word(state.version)}`;
        case FEED_SELECTORS.phaseId:
          return `0x${word(state.phaseId)}`;
        case FEED_SELECTORS.aggregator:
          return `0x${word(BigInt(state.aggregator))}`;
        default:
          return "0x";
      }
    }
    throw new Error(`unexpected method ${method}`);
  };
}

function bothEndpoints(state: ChainState, second: ChainState = state): Record<string, ChainState> {
  return { [PRIMARY]: state, [SECONDARY]: second };
}

const at = (unix: number) => () => new Date(unix * 1000);

function heightFetcher(values: Record<string, string>) {
  return async (url: string): Promise<string> => {
    const value = values[url];
    if (value === undefined) throw new Error(`refused: ${url}`);
    return value;
  };
}

const AGREEING_HEIGHTS = heightFetcher({
  [BLOCK_HEIGHT_SOURCES[0].url]: `${HEIGHT}\n`,
  [BLOCK_HEIGHT_SOURCES[1].url]: `${HEIGHT}`,
});

async function refusal(run: () => Promise<unknown>): Promise<NumeratorRetrievalError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof NumeratorRetrievalError) return error;
    throw error;
  }
  throw new Error("expected a fail-closed refusal, but the retrieval succeeded");
}

// ------------------------------------------------------------------------------- decoding

describe("ABI decoding", () => {
  it("decodes a round, keeping uint80 ids as decimal strings", () => {
    const decoded = decodeLatestRoundData(encodeRound(chainState().round));
    expect(decoded.roundId).toBe(ROUND_ID.toString());
    expect(decoded.answer).toBe("7581648519588");
    expect(decoded.updatedAt).toBe(UPDATED_AT);
    // The id is larger than Number.MAX_SAFE_INTEGER; a decoder that used a double here
    // would round it and make the round unidentifiable.
    expect(Number(decoded.roundId)).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
  });

  it("decodes answer as int256, so a negative price stays negative", () => {
    const decoded = decodeLatestRoundData(
      encodeRound({ ...chainState().round, answer: -7_581_648_519_588n }),
    );
    expect(decoded.answer).toBe("-7581648519588");
    // Decoded as unsigned this would be ~1.16e77 and would pass every "price > 0" test
    // ever written.
    expect(BigInt(decoded.answer)).toBeLessThan(0n);
  });

  it("refuses empty return data, which is what a wrong selector produces", () => {
    expect(() => decodeLatestRoundData("0x")).toThrow(AbiDecodeError);
    expect(() => decodeUint("0x", "decimals()")).toThrow(/returned no data/);
  });

  it("refuses a truncated round rather than filling in the missing words", () => {
    const truncated = encodeRound(chainState().round).slice(0, 2 + 64 * 3);
    expect(() => decodeLatestRoundData(truncated)).toThrow(/expected 5 words/);
  });

  it("refuses a response that is not a whole number of words", () => {
    expect(() => decodeUint("0x1234", "decimals()")).toThrow(/whole number of 32-byte words/);
  });

  it("honours the string offset instead of assuming it", () => {
    expect(decodeString(encodeString("BTC / USD"), "description()")).toBe("BTC / USD");
    const badOffset = `0x${word(31)}${word(9)}${"00".repeat(32)}`;
    expect(() => decodeString(badOffset, "description()")).toThrow(/word boundary/);
  });
});

describe("JSON-RPC envelopes", () => {
  it("surfaces a JSON-RPC error carried by a 200 response", () => {
    expect(() => parseJsonRpcResponse(PRIMARY, "eth_call", '{"error":{"code":-32000,"message":"header not found"}}')).toThrow(
      /header not found/,
    );
  });

  it("refuses a body that is not JSON, and one with neither result nor error", () => {
    expect(() => parseJsonRpcResponse(PRIMARY, "eth_call", "<html>502</html>")).toThrow(/not JSON/);
    expect(() => parseJsonRpcResponse(PRIMARY, "eth_call", "{}")).toThrow(/neither a result nor an error/);
  });
});

describe("RPC endpoint configuration", () => {
  it("defaults to the two documented keyless endpoints", () => {
    expect(resolveUbwiRpcEndpoints({})).toEqual([...DEFAULT_UBWI_RPC_ENDPOINTS]);
    expect(resolveUbwiRpcEndpoints({ UBWI_ETH_RPC_URLS: "   " })).toEqual([
      ...DEFAULT_UBWI_RPC_ENDPOINTS,
    ]);
  });

  it("takes an operator's list when one is configured", () => {
    expect(resolveUbwiRpcEndpoints({ UBWI_ETH_RPC_URLS: `${PRIMARY}, ${SECONDARY}` })).toEqual([
      PRIMARY,
      SECONDARY,
    ]);
  });

  it("carries no credential: the default endpoints are bare origins", () => {
    for (const endpoint of DEFAULT_UBWI_RPC_ENDPOINTS) {
      expect(endpoint).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    }
  });
});

// ------------------------------------------------------------------------ the Chainlink leg

describe("reading the Chainlink round", () => {
  it("normalizes a valid current round", async () => {
    const { observation, crossCheckMode, ageSeconds } = await readChainlinkObservation({
      endpoints: [PRIMARY, SECONDARY],
      transport: transportFor(bothEndpoints(chainState())),
      now: at(NOW_UNIX),
    });

    expect(observation.description).toBe("BTC / USD");
    expect(observation.decimals).toBe(8);
    expect(observation.chainId).toBe(1);
    expect(observation.proxyAddress).toBe(CHAINLINK_BTC_USD_FEED.proxyAddress);
    expect(observation.roundId).toBe(ROUND_ID.toString());
    expect(observation.phaseId).toBe(PHASE);
    expect(observation.aggregatorRoundId).toBe(AGGREGATOR_ROUND.toString());
    expect(observation.answer).toBe("7581648519588");
    expect(observation.normalizedUsd).toBe(75_816.485_195_88);
    expect(observation.updatedAt).toBe(UPDATED_AT);
    expect(observation.retrievalTimestamp).toBe(NOW_UNIX);
    expect(observation.blockNumber).toBe(BLOCK_NUMBER);
    expect(observation.blockHash).toBe(BLOCK_HASH);
    expect(observation.aggregatorAddress).toBe(AGGREGATOR);
    expect(observation.aggregatorTypeAndVersion).toBe("AccessControlledOCR2Aggregator 1.0.0");
    expect(observation.rpcSource).toBe(PRIMARY);
    expect(observation.rpcCrossCheckSource).toBe(SECONDARY);
    expect(crossCheckMode).toBe("same_block");
    expect(ageSeconds).toBe(190);
  });

  it("accepts a round at the heartbeat boundary and refuses the second past it", async () => {
    const transport = transportFor(bothEndpoints(chainState()));
    const atBoundary = await readChainlinkObservation({
      endpoints: [PRIMARY, SECONDARY],
      transport,
      now: at(UPDATED_AT + CHAINLINK_BTC_USD_FEED.heartbeatSeconds),
    });
    expect(atBoundary.ageSeconds).toBe(3600);

    const past = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport,
        now: at(UPDATED_AT + CHAINLINK_BTC_USD_FEED.heartbeatSeconds + 1),
      }),
    );
    expect(past.problem).toBe("FEED_OBSERVATION_STALE");
    expect(past.message).toContain("3601 s old");
  });

  it("refuses a zero, negative or absurd price", async () => {
    for (const answer of [0n, -1n, -7_581_648_519_588n]) {
      const error = await refusal(() =>
        readChainlinkObservation({
          endpoints: [PRIMARY, SECONDARY],
          transport: transportFor(bothEndpoints(chainState({ round: { ...chainState().round, answer } }))),
          now: at(NOW_UNIX),
        }),
      );
      expect(error.problem).toBe("FEED_OBSERVATION_INVALID");
      expect(error.message).toContain("ANSWER_NOT_POSITIVE");
    }
  });

  it("refuses a feed that is not BTC / USD, or reports other decimals", async () => {
    const wrongPair = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport: transportFor(bothEndpoints(chainState({ description: "ETH / USD" }))),
        now: at(NOW_UNIX),
      }),
    );
    expect(wrongPair.message).toContain("FEED_DESCRIPTION_MISMATCH");

    const wrongDecimals = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport: transportFor(bothEndpoints(chainState({ decimals: 18 }))),
        now: at(NOW_UNIX),
      }),
    );
    expect(wrongDecimals.message).toContain("DECIMALS_MISMATCH");
  });

  it("refuses the wrong network", async () => {
    const error = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport: transportFor(bothEndpoints(chainState({ chainId: 8453 }))),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.message).toContain("CHAIN_ID_MISMATCH");
  });

  it("refuses a round whose id disagrees with the contract's own phase", async () => {
    const error = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport: transportFor(bothEndpoints(chainState({ phaseId: 6 }))),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.problem).toBe("FEED_PHASE_DISAGREES");
  });

  it("refuses a round with a missing timestamp", async () => {
    const error = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport: transportFor(
          bothEndpoints(chainState({ round: { ...chainState().round, updatedAt: 0 } })),
        ),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.message).toContain("UPDATED_AT_NOT_POSITIVE");
  });

  it("refuses when the second endpoint returns a different round", async () => {
    const disagreeing = chainState({
      round: { ...chainState().round, roundId: ROUND_ID + 1n, answer: 7_600_000_000_000n },
    });
    const error = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport: transportFor(bothEndpoints(chainState(), disagreeing)),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.problem).toBe("FEED_CROSS_CHECK_DISAGREES");
  });

  it("refuses when the second endpoint is on another chain", async () => {
    const error = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport: transportFor(bothEndpoints(chainState(), chainState({ chainId: 137 }))),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.problem).toBe("FEED_CROSS_CHECK_DISAGREES");
  });

  it("falls back to the second endpoint's own head when it cannot serve the pinned block", async () => {
    // A node two blocks behind. It still holds the same round, so the observation stands --
    // but the weaker cross-check is reported rather than passed off as the strong one.
    const lagging = chainState({ blockNumber: BLOCK_NUMBER - 2, servesOnlyBlock: BLOCK_NUMBER - 2 });
    const result = await readChainlinkObservation({
      endpoints: [PRIMARY, SECONDARY],
      transport: transportFor(bothEndpoints(chainState(), lagging)),
      now: at(NOW_UNIX),
    });
    expect(result.crossCheckMode).toBe("own_head");
    expect(result.observation.blockNumber).toBe(BLOCK_NUMBER);
  });

  it("refuses to read at all with fewer than two endpoints", async () => {
    const error = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY],
        transport: transportFor(bothEndpoints(chainState())),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.problem).toBe("RPC_ENDPOINTS_INSUFFICIENT");
  });

  it("reports a network failure as unavailable, not as a bad price", async () => {
    const error = await refusal(() =>
      readChainlinkObservation({
        endpoints: [PRIMARY, SECONDARY],
        transport: async () => {
          throw Object.assign(new Error("connect ETIMEDOUT"), { name: "RpcError" });
        },
        now: at(NOW_UNIX),
      }),
    );
    expect(error.problem).toBe("RPC_UNAVAILABLE");
  });

  it("reports a malformed response as malformed", async () => {
    const transport: RpcTransport = async (endpoint, method, params) => {
      if (method === "eth_call" && (params[0] as { data: string }).data === FEED_SELECTORS.latestRoundData) {
        return "0xdeadbeef";
      }
      return transportFor(bothEndpoints(chainState()))(endpoint, method, params);
    };
    const error = await refusal(() =>
      readChainlinkObservation({ endpoints: [PRIMARY, SECONDARY], transport, now: at(NOW_UNIX) }),
    );
    expect(error.problem).toBe("RPC_MALFORMED_RESPONSE");
  });

  it("keeps the round when the aggregator does not implement typeAndVersion()", async () => {
    const { observation } = await readChainlinkObservation({
      endpoints: [PRIMARY, SECONDARY],
      transport: transportFor(bothEndpoints(chainState({ typeAndVersion: null }))),
      now: at(NOW_UNIX),
    });
    // Lineage, not a validity condition: the observation type says "null where it does not".
    expect(observation.aggregatorTypeAndVersion).toBeNull();
  });
});

// --------------------------------------------------------------------------- the height leg

describe("reading the chain tip", () => {
  it("accepts two sources that agree exactly, keeping the raw bodies", async () => {
    const result = await readBlockHeight({ fetchText: AGREEING_HEIGHTS, now: at(NOW_UNIX) });
    expect(result.blockHeight).toBe(HEIGHT);
    expect(result.observations).toHaveLength(2);
    expect(result.observations[0]!.rawValue).toBe(String(HEIGHT));
    expect(result.heightSources).toEqual([
      "mempool.space/api/blocks/tip/height",
      "blockchain.info/q/getblockcount",
    ]);
    // The provenance is frozen onto the point and states why one integer may be read here.
    expect(result.observations[1]!.provenance).toContain("not grant");
  });

  it("refuses a one-block disagreement rather than choosing a height", async () => {
    const error = await refusal(() =>
      readBlockHeight({
        fetchText: heightFetcher({
          [BLOCK_HEIGHT_SOURCES[0].url]: `${HEIGHT}`,
          [BLOCK_HEIGHT_SOURCES[1].url]: `${HEIGHT - 1}`,
        }),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.problem).toBe("HEIGHT_SOURCES_DISAGREE");
    // No averaging, no "take the higher": the run ends.
    expect(error.message).toContain("no height is assumed");
  });

  it("refuses an unreachable source", async () => {
    const error = await refusal(() =>
      readBlockHeight({
        fetchText: heightFetcher({ [BLOCK_HEIGHT_SOURCES[0].url]: `${HEIGHT}` }),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.problem).toBe("HEIGHT_SOURCE_UNAVAILABLE");
  });

  it("refuses an HTML error page where an integer was expected, without echoing it", async () => {
    const error = await refusal(() =>
      readBlockHeight({
        fetchText: heightFetcher({
          [BLOCK_HEIGHT_SOURCES[0].url]: "<html><body>502 Bad Gateway</body></html>",
          [BLOCK_HEIGHT_SOURCES[1].url]: `${HEIGHT}`,
        }),
        now: at(NOW_UNIX),
      }),
    );
    expect(error.problem).toBe("HEIGHT_SOURCE_UNAVAILABLE");
    expect(error.message).not.toContain("<html>");
  });
});

// ------------------------------------------------------------------- the assembled numerator

describe("retrieving the numerator", () => {
  const goodOptions = () => ({
    endpoints: [PRIMARY, SECONDARY],
    transport: transportFor(bothEndpoints(chainState())),
    fetchText: AGREEING_HEIGHTS,
    now: at(NOW_UNIX),
  });

  it("assembles an observation that passes every numerator check", async () => {
    const { observation, observationWindowSeconds } = await retrieveBtcNumerator(goodOptions());

    expect(checkNumerator(observation)).toEqual([]);
    expect(observation.priceRule).toBe("chainlink_reference_feed");
    expect(observation.supplyConstruction).toBe("protocol_scheduled");
    expect(observation.blockHeight).toBe(HEIGHT);
    expect(observation.priceUsd).toBe(75_816.485_195_88);
    expect(observation.observedAt).toBe(new Date(NOW_UNIX * 1000).toISOString());
    expect(observation.marketCapUsd).toBe(observation.supplyBtc * observation.priceUsd);
    expect(observationWindowSeconds).toBe(0);

    // The supply is derived, not retrieved: naming an interface would invent the dependency
    // methodology 1.2.0 removed.
    expect(observation.supplySourceInterface).toBeUndefined();
    expect(observation.supplyDerivation?.rightsBasis).toBe("derived_from_protocol");
    expect(observation.supplyDerivation?.halvingEra).toBe(4);
    expect(observation.venues).toBeUndefined();
  });

  it("carries the full provenance the committed observation carried", async () => {
    const { observation } = await retrieveBtcNumerator(goodOptions());
    const live = observation.chainlink!;
    const reference = REFERENCE_BTC_OBSERVATION.chainlink!;

    // Not one field fewer than the hand-captured observation. This is the test that would
    // fail if a future change quietly reduced the numerator to a price and a timestamp.
    for (const key of Object.keys(reference) as (keyof typeof reference)[]) {
      expect(live[key], `chainlink.${key}`).not.toBeUndefined();
    }
    expect(Object.keys(live).sort()).toEqual(Object.keys(reference).sort());
    expect(observation.heightObservations).toHaveLength(2);
    expect(observation.heightSources).toEqual(REFERENCE_BTC_OBSERVATION.heightSources);
  });

  it("produces the same UBWI as the equivalent deterministic fixture", async () => {
    const { observation } = await retrieveBtcNumerator(goodOptions());
    const retrieved = calculateUbwi({ calculatedAt: "2026-09-15T14:43:21Z", numerator: observation });
    // The same observation handed in as a plain fixture must calculate identically: the
    // calculator cannot tell where an observation came from, and must not be able to.
    const fixture = calculateUbwi({
      calculatedAt: "2026-09-15T14:43:21Z",
      numerator: structuredClone(observation),
    });
    expect(retrieved.ubwiPercent).toBe(fixture.ubwiPercent);
    expect(retrieved.totalGlobalWealthUsd).toBe(fixture.totalGlobalWealthUsd);
    expect(retrieved.ubwiPercent).toBeGreaterThan(0);
  });

  it("refuses when the two legs were read too far apart to be one instant", async () => {
    let call = 0;
    const drifting = () => {
      // The height reads happen first, then a long stall, then the price read.
      call += 1;
      return new Date((call <= 2 ? NOW_UNIX - 600 : NOW_UNIX) * 1000);
    };
    const error = await refusal(() =>
      retrieveBtcNumerator({ ...goodOptions(), now: drifting }),
    );
    expect(error.problem).toBe("OBSERVATION_WINDOW_EXCEEDED");
  });

  it("fails closed on a height failure without ever reading the feed", async () => {
    let rpcCalls = 0;
    const error = await refusal(() =>
      retrieveBtcNumerator({
        ...goodOptions(),
        transport: async (endpoint, method, params) => {
          rpcCalls += 1;
          return transportFor(bothEndpoints(chainState()))(endpoint, method, params);
        },
        fetchText: heightFetcher({}),
      }),
    );
    expect(error.problem).toBe("HEIGHT_SOURCE_UNAVAILABLE");
    expect(rpcCalls).toBe(0);
  });

  it("propagates a stale feed as the stale problem, not as a generic failure", async () => {
    const error = await refusal(() =>
      retrieveBtcNumerator({ ...goodOptions(), now: at(UPDATED_AT + 4000) }),
    );
    expect(error.problem).toBe("FEED_OBSERVATION_STALE");
  });
});
