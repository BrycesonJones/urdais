/**
 * Chainlink price-leg tests.
 *
 * Every fixture here is a frozen copy of a round actually read from Ethereum mainnet on
 * 15 September 2026 through two independent public RPC endpoints, and nothing in this
 * file touches the network. That is deliberate and is the point: a validator whose tests
 * need a live chain cannot be run in CI, and a validator that is not run in CI is not a
 * gate. The live read belongs in the research record and in the collector, not here.
 */
import { describe, expect, it } from "vitest";

import {
  CHAINLINK_BTC_USD_FEED,
  CHAINLINK_SOURCE_INTERFACE,
  decomposeRoundId,
  validateChainlinkObservation,
  type ChainlinkPriceObservation,
} from "./chainlink";
import { REFERENCE_BTC_OBSERVATION, checkNumerator } from "./numerator";
import {
  effectiveRightsStatus,
  mayPublishNumeratorFrom,
  sourceInterface,
  type UbwiSourceInterface,
} from "./rights";
import { checkTermsArtifactShape } from "./terms-integrity";

/**
 * Proxy round 129127208515966885593 on Ethereum mainnet: phase 7, aggregator round 24281,
 * answer 7777948460264 at 8 decimals, read at 2026-09-15T03:10:39Z. Byte-identical
 * through ethereum-rpc.publicnode.com and eth.drpc.org.
 */
const LIVE_ROUND: ChainlinkPriceObservation = REFERENCE_BTC_OBSERVATION.chainlink!;

const withRound = (patch: Partial<ChainlinkPriceObservation>): ChainlinkPriceObservation => ({
  ...LIVE_ROUND,
  ...patch,
});

const problemsFor = (patch: Partial<ChainlinkPriceObservation>) =>
  validateChainlinkObservation(withRound(patch)).problems;

describe("the approved BTC/USD feed", () => {
  it("pins Ethereum mainnet, the proxy, the pair and the decimals", () => {
    expect(CHAINLINK_BTC_USD_FEED.chainId).toBe(1);
    expect(CHAINLINK_BTC_USD_FEED.proxyAddress).toBe(
      "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    );
    expect(CHAINLINK_BTC_USD_FEED.pair).toBe("BTC / USD");
    expect(CHAINLINK_BTC_USD_FEED.decimals).toBe(8);
  });

  it("uses the documented 3600-second heartbeat with no invented grace period", () => {
    expect(CHAINLINK_BTC_USD_FEED.heartbeatSeconds).toBe(3600);
    const validation = validateChainlinkObservation(
      withRound({ retrievalTimestamp: LIVE_ROUND.updatedAt + 3600 }),
    );
    expect(validation.valid).toBe(true);
    expect(validateChainlinkObservation(
      withRound({ retrievalTimestamp: LIVE_ROUND.updatedAt + 3601 }),
    ).valid).toBe(false);
  });

  it("is a push-based Data Feed reference price, not Data Streams and not SVR", () => {
    expect(CHAINLINK_BTC_USD_FEED.productType).toBe("data_feed_reference_price");
    // Chainlink's own product code: DF is the Data Feed delivery channel, RefPrice the
    // product type. A Data Streams feed would read DS, and neither is Smart Value Recapture.
    expect(CHAINLINK_BTC_USD_FEED.clicProductName).toBe("BTC/USD-RefPrice-DF-Ethereum-001");
  });
});

describe("the frozen production round", () => {
  it("validates", () => {
    const validation = validateChainlinkObservation(LIVE_ROUND);
    expect(validation.problems).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("was inside the documented heartbeat at retrieval", () => {
    // Asserted as the property that decides validity rather than as the exact age, which
    // is a circumstance of one retrieval and changes whenever the round is re-observed.
    // The bound itself is pinned; a grace period added here would be an invented tolerance.
    const validation = validateChainlinkObservation(LIVE_ROUND);
    expect(validation.ageSeconds).toBeGreaterThan(0);
    expect(validation.ageSeconds).toBeLessThanOrEqual(CHAINLINK_BTC_USD_FEED.heartbeatSeconds);
    expect(CHAINLINK_BTC_USD_FEED.heartbeatSeconds).toBe(3600);
    expect(validation.stale).toBe(false);
  });

  it("carries the whole lineage a later audit needs", () => {
    // Part 6 of the amendment, as a list the test enforces rather than a paragraph.
    expect(LIVE_ROUND.chainId).toBe(1);
    expect(LIVE_ROUND.proxyAddress).toBe(CHAINLINK_BTC_USD_FEED.proxyAddress);
    expect(LIVE_ROUND.aggregatorAddress).toBe("0x4a3411ac2948b33c69666b35cc6d055b27ea84f1");
    expect(LIVE_ROUND.aggregatorTypeAndVersion).toBe("AccessControlledOCR2Aggregator 1.0.0");
    expect(LIVE_ROUND.roundId).toBe("129127208515966885594");
    expect(LIVE_ROUND.phaseId).toBe(7);
    expect(LIVE_ROUND.aggregatorRoundId).toBe("24282");
    expect(LIVE_ROUND.answer).toBe("7772301327859");
    expect(LIVE_ROUND.decimals).toBe(8);
    expect(LIVE_ROUND.normalizedUsd).toBe(77_723.013_278_59);
    // The proxy round id is the phase in the high 64 bits and the aggregator round in the
    // low 64. Recomposed here rather than restated, so the three fields cannot drift apart.
    expect(
      (BigInt(LIVE_ROUND.phaseId) << 64n) | BigInt(LIVE_ROUND.aggregatorRoundId),
    ).toBe(BigInt(LIVE_ROUND.roundId));
    // The normalized price is the integer answer scaled by the contract's own decimals.
    expect(Number(LIVE_ROUND.answer) / 10 ** LIVE_ROUND.decimals).toBe(LIVE_ROUND.normalizedUsd);
    expect(LIVE_ROUND.startedAt).toBeGreaterThan(0);
    expect(LIVE_ROUND.updatedAt).toBeGreaterThan(0);
    expect(LIVE_ROUND.retrievalTimestamp).toBeGreaterThan(LIVE_ROUND.updatedAt);
    // The block the read was pinned to. A circumstance of the retrieval, so its shape is
    // asserted rather than its exact value: it must be a real, post-merge mainnet height.
    expect(Number.isInteger(LIVE_ROUND.blockNumber)).toBe(true);
    expect(LIVE_ROUND.blockNumber).toBeGreaterThan(15_537_394);
    expect(LIVE_ROUND.blockHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(LIVE_ROUND.rpcSource).toBe("https://ethereum-rpc.publicnode.com");
    expect(LIVE_ROUND.rpcCrossCheckSource).toBe("https://eth.drpc.org");
  });

  it("names no secret in its RPC identity", () => {
    for (const url of [LIVE_ROUND.rpcSource, LIVE_ROUND.rpcCrossCheckSource ?? ""]) {
      expect(url).not.toMatch(/[?&](key|apikey|token|secret)=/i);
      // A key-in-path endpoint looks like /v2/<32+ hex or base58>. Neither of ours does.
      expect(url).not.toMatch(/\/[0-9a-zA-Z]{24,}$/);
    }
  });

  it("decomposes its round id the way the proxy composes it", () => {
    expect(decomposeRoundId(LIVE_ROUND.roundId)).toEqual({
      phaseId: LIVE_ROUND.phaseId,
      aggregatorRoundId: LIVE_ROUND.aggregatorRoundId,
    });
  });

  it("keeps the round id exact rather than passing it through a double", () => {
    // 129127208515966885593 is beyond Number.MAX_SAFE_INTEGER. A round id that has been
    // through a float is a round id that no longer identifies a round.
    expect(BigInt(LIVE_ROUND.roundId)).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(BigInt(LIVE_ROUND.roundId).toString()).toBe(LIVE_ROUND.roundId);
  });
});

describe("the validator fails closed", () => {
  it("refuses the wrong chain", () => {
    expect(problemsFor({ chainId: 137 })).toContain("CHAIN_ID_MISMATCH");
    expect(problemsFor({ chainId: 11_155_111 })).toContain("CHAIN_ID_MISMATCH");
  });

  it("refuses a different proxy, and does not silently follow one", () => {
    expect(problemsFor({ proxyAddress: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" })).toContain(
      "PROXY_ADDRESS_MISMATCH",
    );
  });

  it("accepts the approved proxy in any checksum casing", () => {
    // EIP-55 casing is presentation. Refusing a lowercase spelling of the same address
    // would be a fail-closed check failing on the wrong thing.
    expect(
      problemsFor({ proxyAddress: CHAINLINK_BTC_USD_FEED.proxyAddress.toLowerCase() }),
    ).not.toContain("PROXY_ADDRESS_MISMATCH");
  });

  it("refuses a feed whose identity no longer matches", () => {
    expect(problemsFor({ description: "ETH / USD" })).toContain("FEED_DESCRIPTION_MISMATCH");
    expect(problemsFor({ description: "BTC/USD" })).toContain("FEED_DESCRIPTION_MISMATCH");
    expect(problemsFor({ decimals: 18 })).toContain("DECIMALS_MISMATCH");
  });

  it("refuses a non-positive answer, including a deprecated feed returning zero", () => {
    expect(problemsFor({ answer: "0", normalizedUsd: 0 })).toContain("ANSWER_NOT_POSITIVE");
    expect(problemsFor({ answer: "-1", normalizedUsd: -1e-8 })).toContain("ANSWER_NOT_POSITIVE");
  });

  it("refuses a round with no update timestamp", () => {
    expect(problemsFor({ updatedAt: 0 })).toContain("UPDATED_AT_NOT_POSITIVE");
  });

  it("refuses a stale round and says it is only stale", () => {
    const validation = validateChainlinkObservation(
      withRound({ retrievalTimestamp: LIVE_ROUND.updatedAt + 7200 }),
    );
    expect(validation.valid).toBe(false);
    expect(validation.problems).toEqual(["OBSERVATION_STALE"]);
    expect(validation.stale).toBe(true);
    expect(validation.ageSeconds).toBe(7200);
  });

  it("refuses a retrieval that predates the round it claims to have read", () => {
    const validation = validateChainlinkObservation(
      withRound({ retrievalTimestamp: LIVE_ROUND.updatedAt - 60 }),
    );
    expect(validation.problems).toContain("RETRIEVAL_BEFORE_UPDATE");
    // A clock inconsistency is not staleness, and calling it staleness would send the
    // operator to look at the oracle network instead of at their own clock.
    expect(validation.stale).toBe(false);
  });

  it("refuses a round whose frozen phase disagrees with its round id", () => {
    expect(problemsFor({ phaseId: 6 })).toContain("PHASE_LINEAGE_INCONSISTENT");
    expect(problemsFor({ aggregatorRoundId: "24280" })).toContain("PHASE_LINEAGE_INCONSISTENT");
  });

  it("refuses a normalized value that disagrees with the raw answer", () => {
    expect(problemsFor({ normalizedUsd: 77_000 })).toContain("NORMALIZATION_DISAGREES");
  });

  it("refuses an observation that cannot name the block it was read at", () => {
    expect(problemsFor({ blockNumber: 0 })).toContain("BLOCK_LINEAGE_INCOMPLETE");
    expect(problemsFor({ blockHash: "0xdeadbeef" })).toContain("BLOCK_LINEAGE_INCOMPLETE");
  });

  it("refuses an observation with no RPC identity, which is what an RPC failure leaves", () => {
    expect(problemsFor({ rpcSource: "" })).toContain("RPC_SOURCE_MISSING");
  });

  it("does not read the deprecated answeredInRound as a validity condition", () => {
    // The old `answeredInRound >= roundId` idiom is a test on a field Chainlink's API
    // reference now marks deprecated. Freezing it is right; gating on it is not.
    expect(problemsFor({ answeredInRound: "1" })).toEqual([]);
    expect(problemsFor({ answeredInRound: null })).toEqual([]);
  });

  it("carries every failure through to the numerator check", () => {
    const stale = {
      ...REFERENCE_BTC_OBSERVATION,
      chainlink: withRound({ retrievalTimestamp: LIVE_ROUND.updatedAt + 4000 }),
    };
    expect(checkNumerator(stale)).toContain("CHAINLINK_OBSERVATION_STALE");
    const wrongChain = { ...REFERENCE_BTC_OBSERVATION, chainlink: withRound({ chainId: 8453 }) };
    expect(checkNumerator(wrongChain)).toContain("CHAINLINK_CHAIN_ID_MISMATCH");
  });

  it("lets an aggregator upgrade behind the approved proxy pass", () => {
    // The distinction the amendment turns on: the proxy is the methodology pin and the
    // aggregator is observation lineage. An ordinary upgrade must not look like a
    // methodology break, or every upgrade becomes an outage.
    expect(
      problemsFor({
        aggregatorAddress: "0x1111111111111111111111111111111111111111",
        aggregatorTypeAndVersion: "AccessControlledOCR3Aggregator 1.0.0",
      }),
    ).toEqual([]);
  });

  it("fails closed when a new phase's lineage is not recorded consistently", () => {
    // A phase change is legitimate, but it must be recorded coherently: phase 8 round 1
    // is round id (8 << 64) + 1. A phase change with a stale phase field is a lineage bug
    // and must not pass.
    const nextPhase = (8n << 64n) + 1n;
    expect(
      validateChainlinkObservation(
        withRound({ roundId: nextPhase.toString(), phaseId: 8, aggregatorRoundId: "1" }),
      ).problems,
    ).toEqual([]);
    expect(problemsFor({ roundId: nextPhase.toString() })).toContain(
      "PHASE_LINEAGE_INCONSISTENT",
    );
  });
});

describe("Chainlink rights: inferred, and said so", () => {
  const iface = sourceInterface(CHAINLINK_SOURCE_INTERFACE)!;

  it("is registered", () => {
    expect(iface).toBeDefined();
    expect(iface.providerName).toBe("Chainlink");
  });

  it("reads inferred_permitted, and never cleared", () => {
    expect(effectiveRightsStatus(iface)).toBe("inferred_permitted");
    expect(effectiveRightsStatus(iface)).not.toBe("cleared");
    expect(iface.dataUseTermsState).not.toBe("permitted");
  });

  it("may publish a numerator, and may not supply a denominator", () => {
    expect(mayPublishNumeratorFrom("inferred_permitted")).toBe(true);
    expect(mayPublishNumeratorFrom("under_review")).toBe(false);
    expect(mayPublishNumeratorFrom("blocked")).toBe(false);
    // The denominator's rule is a literal comparison against "cleared", so an inference
    // cannot reach it. Stated here because it is the thing a later edit would loosen.
    expect(effectiveRightsStatus(iface) === "cleared").toBe(false);
  });

  it("records what was found, what was not found, and what it does not cover", () => {
    const decision = iface.inferredPermission!;
    expect(decision).toBeDefined();
    expect(decision.decisionId).toBe("ubwi-chainlink-inferred-2026-09-15");
    expect(decision.basis.length).toBeGreaterThan(0);
    expect(decision.notFound.length).toBeGreaterThan(0);
    expect(decision.limits.length).toBeGreaterThan(0);
    // The three claims the amendment requires be made and be honest.
    expect(decision.basis.join(" ")).toContain("documented public interface");
    expect(decision.basis.join(" ")).toContain("not reselling or redistributing");
    expect(decision.notFound.join(" ")).toContain("No explicit prohibition");
    expect(decision.notFound.join(" ")).toContain("No explicit affirmative grant");
    expect(decision.limits.join(" ")).toContain("not a licence");
    expect(decision.limits.join(" ")).toContain("undisclosed");
  });

  it("claims no grant it does not have", () => {
    const words = `${iface.note} ${JSON.stringify(iface.inferredPermission)}`.toLowerCase();
    for (const forbidden of [
      "expressly granted",
      "licensed by chainlink",
      "confirmed by chainlink",
      "chainlink has granted urdais permission",
    ]) {
      expect(words, `the record must not claim "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("rests the inference on a retained, hashed document", () => {
    const artifact = iface.termsArtifact!;
    expect(artifact).not.toBeNull();
    expect(artifact.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.httpStatus).toBe(200);
    expect(artifact.byteLength).toBeGreaterThan(0);
    expect(artifact.url).toBe("https://docs.chain.link/data-feeds");
  });

  it("refuses an inference with nothing behind it", () => {
    const problems = (patch: Record<string, unknown>) =>
      checkTermsArtifactShape([{ ...iface, ...patch } as UbwiSourceInterface]).map((f) => f.problem);
    expect(problems({ termsArtifact: null })).toContain("INFERRED_WITHOUT_ARTIFACT");
    expect(problems({ inferredPermission: { ...iface.inferredPermission!, basis: [] } })).toContain(
      "INFERRED_WITHOUT_BASIS",
    );
    expect(
      problems({ inferredPermission: { ...iface.inferredPermission!, limits: [] } }),
    ).toContain("INFERRED_WITHOUT_LIMITS");
  });

  it("refuses an inference recorded over an express refusal", () => {
    // Kraken's terms say no. No product decision may infer its way past that, and the
    // structural check says so independently of `effectiveRightsStatus`.
    const kraken = sourceInterface("kraken-ticker")!;
    const pretended = { ...kraken, inferredPermission: iface.inferredPermission };
    const problems = checkTermsArtifactShape([pretended]).map((f) => f.problem);
    expect(problems).toContain("INFERRED_OVER_A_REFUSAL");
    expect(effectiveRightsStatus(pretended)).toBe("blocked");
  });

  it("refuses an inference recorded over an express grant", () => {
    const fed = sourceInterface("federal-reserve-z1")!;
    const understated = { ...fed, inferredPermission: iface.inferredPermission };
    expect(checkTermsArtifactShape([understated]).map((f) => f.problem)).toContain(
      "INFERRED_OVER_AN_EXPRESS_GRANT",
    );
    // And the grant still wins: evidence that exists is not downgraded by a decision.
    expect(effectiveRightsStatus(understated)).toBe("cleared");
  });
});
