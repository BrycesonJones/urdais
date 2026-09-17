import { describe, expect, it } from "vitest";

import { calculateSession, type SessionInput } from "@/lib/uavi/engine";
import type { VolatilityInstrumentMapping } from "@/lib/uavi/instrument";
import type { NormalizedOptionQuote, OptionChainSnapshot, ResolvedRate } from "@/lib/uavi/types";

const SNAPSHOT = "2026-09-18T19:45:00.000Z";
const NEAR = new Date(Date.parse(SNAPSHOT) + 20 * 86_400_000).toISOString();
const NEXT = new Date(Date.parse(SNAPSHOT) + 50 * 86_400_000).toISOString();

const RATE: ResolvedRate = { continuousRate: 0, curveFamily: "fixture", isExtrapolated: false };
const rates = () => RATE;
const noRates = () => null;

function quote(
  securityId: string,
  expiration: string,
  strike: number,
  right: "call" | "put",
  bid: number | null,
  ask: number | null,
): NormalizedOptionQuote {
  return {
    contractSymbol: `${securityId}-${expiration}-${right}-${strike}`,
    underlyingSecurityId: securityId,
    sessionDate: "2026-09-18",
    quoteTimestamp: SNAPSHOT,
    expirationTimestamp: expiration,
    expirationDate: expiration.slice(0, 10),
    right,
    strike,
    bid,
    ask,
    seriesState: "standard",
    contractMultiplier: 100,
    expirationSeries: "standard_monthly",
    isStandardExpiration: true,
  };
}

/** A complete, valid chain on one underlying: three puts, three calls, both legs at 100. */
function chainFor(securityId: string, mid = 1.0): OptionChainSnapshot {
  const quotes: NormalizedOptionQuote[] = [];
  for (const expiration of [NEAR, NEXT]) {
    for (const k of [85, 90, 95]) quotes.push(quote(securityId, expiration, k, "put", mid - 0.1, mid + 0.1));
    quotes.push(quote(securityId, expiration, 100, "put", mid - 0.1, mid + 0.1));
    quotes.push(quote(securityId, expiration, 100, "call", mid - 0.1, mid + 0.1));
    for (const k of [105, 110, 115]) quotes.push(quote(securityId, expiration, k, "call", mid - 0.1, mid + 0.1));
  }
  return { underlyingSecurityId: securityId, sessionDate: "2026-09-18", snapshotTimestamp: SNAPSHOT, quotes };
}

function mapping(issuerId: string, securityId: string): VolatilityInstrumentMapping {
  return {
    id: `vi-${issuerId}`,
    issuerId,
    volatilitySecurityId: securityId,
    mappingType: "representative",
    preferenceRank: 1,
    mappingState: "verified",
    isSponsored: null,
    receiptRatioNumerator: null,
    receiptRatioDenominator: null,
  };
}

/** Ten equally weighted issuers, each with a full chain, so the gates can be met. */
function universe(n: number): SessionInput {
  const parentConstituents = Array.from({ length: n }, (_, i) => ({
    issuerId: `iss-${i}`,
    parentWeight: 1 / n,
  }));
  const mappings = parentConstituents.map((c) => mapping(c.issuerId, `sec-${c.issuerId}`));
  const chains = new Map<string, OptionChainSnapshot>(
    mappings.map((m) => [m.volatilitySecurityId, chainFor(m.volatilitySecurityId)]),
  );
  return { sessionDate: "2026-09-18", snapshotTimestamp: SNAPSHOT, parentConstituents, mappings, chains, rates };
}

describe("a UAVI session, end to end", () => {
  it("covers every issuer with a complete chain and publishes", () => {
    const result = calculateSession(universe(10));
    expect(result.constituents.every((c) => c.covered)).toBe(true);
    expect(result.aggregation.publishable).toBe(true);
    if (!result.aggregation.publishable) throw new Error("unreachable");
    expect(result.aggregation.coveredIssuerCount).toBe(10);
    expect(result.aggregation.indexLevel).toBeGreaterThan(0);
    // The headline decomposes into the constituents exactly.
    const sum = result.aggregation.contributions.reduce((a, c) => a + c.weightContribution, 0);
    expect(100 * sum).toBeCloseTo(result.aggregation.indexLevel, 10);
  });

  it("is deterministic: the same inputs give the same result", () => {
    // The whole of the idempotency requirement, expressed as a property of the function. No clock
    // is read and nothing is fetched, so a rerun cannot differ.
    const input = universe(10);
    const a = calculateSession(input);
    const b = calculateSession(input);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("leaves an issuer with no chain uncovered, and never fills its volatility", () => {
    const input = universe(10);
    const chains = new Map(input.chains);
    chains.delete("sec-iss-3");
    const result = calculateSession({ ...input, chains });

    const missing = result.constituents.find((c) => c.issuerId === "iss-3")!;
    expect(missing.covered).toBe(false);
    expect(missing.sigma30).toBeNull();
    expect(missing.uncoveredReason).toBe("option_data_missing");
    // Nine cover 0.9 of parent weight, which clears both gates, so it still publishes.
    expect(result.aggregation.coveredIssuerCount).toBe(9);
    expect(result.aggregation.coveredParentWeight).toBeCloseTo(0.9, 12);
    expect(result.aggregation.publishable).toBe(true);
  });

  it("never carries a constituent volatility from a prior session", () => {
    // Session one covers everyone. Session two loses an issuer's chain entirely. The engine holds
    // no state between the two -- it is a pure function of its inputs -- so there is nothing to
    // carry, which is the strongest form the no-carry rule can take.
    const input = universe(10);
    const first = calculateSession(input);
    expect(first.constituents.find((c) => c.issuerId === "iss-3")!.sigma30).toBeGreaterThan(0);

    const chains = new Map(input.chains);
    chains.delete("sec-iss-3");
    const second = calculateSession({ ...input, sessionDate: "2026-09-21", chains });
    const dropped = second.constituents.find((c) => c.issuerId === "iss-3")!;
    expect(dropped.sigma30).toBeNull();
    expect(dropped.covered).toBe(false);
    // And the issuer is absent from the contributions rather than present at its old value.
    expect(second.aggregation.contributions.some((c) => c.issuerId === "iss-3")).toBe(false);
  });

  it("leaves an issuer uncovered when only one expiration bracket is available", () => {
    const input = universe(10);
    const chains = new Map(input.chains);
    const full = chains.get("sec-iss-2")!;
    chains.set("sec-iss-2", {
      ...full,
      quotes: full.quotes.filter((q) => q.expirationTimestamp === NEAR),
    });
    const result = calculateSession({ ...input, chains });
    const partial = result.constituents.find((c) => c.issuerId === "iss-2")!;
    expect(partial.covered).toBe(false);
    expect(partial.uncoveredReason).toBe("option_data_missing");
    expect(partial.sigma30).toBeNull();
  });

  it("leaves every issuer uncovered when no rate can be resolved", () => {
    const result = calculateSession({ ...universe(10), rates: noRates });
    expect(result.constituents.every((c) => !c.covered)).toBe(true);
    expect(result.constituents.every((c) => c.uncoveredReason === "rate_missing")).toBe(true);
    expect(result.aggregation.publishable).toBe(false);
    expect(result.aggregation.unavailableReason).toBe("no_covered_constituents");
    expect(result.aggregation.indexLevel).toBeNull();
  });

  it("reports an issuer with no mapping distinctly from one whose data is missing", () => {
    const input = universe(10);
    const result = calculateSession({
      ...input,
      mappings: input.mappings.filter((m) => m.issuerId !== "iss-5"),
    });
    expect(result.constituents.find((c) => c.issuerId === "iss-5")!.uncoveredReason).toBe(
      "no_volatility_instrument",
    );
  });

  it("retains both strips as diagnostics for a covered issuer", () => {
    const result = calculateSession(universe(10));
    const one = result.constituents[0]!;
    expect(one.nearStrip!.valid).toBe(true);
    expect(one.nextStrip!.valid).toBe(true);
    expect(one.nearStrip!.minutesToExpiration).toBeLessThanOrEqual(43_200);
    expect(one.nextStrip!.minutesToExpiration).toBeGreaterThan(43_200);
    expect(one.nearStrip!.components.length).toBe(7);
  });

  it("retains the failing strip's diagnostics for an uncovered issuer", () => {
    const input = universe(10);
    const chains = new Map(input.chains);
    const full = chains.get("sec-iss-4")!;
    // Remove a put so the near strip falls below the three-per-side minimum.
    chains.set("sec-iss-4", {
      ...full,
      quotes: full.quotes.filter((q) => !(q.expirationTimestamp === NEAR && q.strike === 85)),
    });
    const result = calculateSession({ ...input, chains });
    const failed = result.constituents.find((c) => c.issuerId === "iss-4")!;
    expect(failed.covered).toBe(false);
    expect(failed.uncoveredReason).toBe("insufficient_puts");
    expect(failed.nearStrip!.otmPutCount).toBe(2);
    expect(failed.nextStrip!.valid).toBe(true);
  });

  it("withholds the headline on the current two-issuer parent universe", () => {
    // The production state. Both issuers cover fully and the index still does not publish,
    // because two issuers cannot reach the frozen minimum of eight.
    const result = calculateSession(universe(2));
    expect(result.constituents.every((c) => c.covered)).toBe(true);
    expect(result.aggregation.coveredParentWeight).toBeCloseTo(1, 12);
    expect(result.aggregation.publishable).toBe(false);
    expect(result.aggregation.unavailableReason).toBe("issuer_count_below_threshold");
    expect(result.aggregation.indexLevel).toBeNull();
  });

  it("withholds the headline when the parent supplies no weights at all", () => {
    const result = calculateSession({
      sessionDate: "2026-09-18",
      snapshotTimestamp: SNAPSHOT,
      parentConstituents: [],
      mappings: [],
      chains: new Map(),
      rates,
    });
    expect(result.aggregation.publishable).toBe(false);
    expect(result.aggregation.unavailableReason).toBe("parent_weights_missing");
  });

  it("withholds the headline when the parent weight vector does not sum to one", () => {
    const input = universe(10);
    const result = calculateSession({
      ...input,
      parentConstituents: input.parentConstituents.map((c) => ({ ...c, parentWeight: 0.05 })),
    });
    expect(result.aggregation.publishable).toBe(false);
    expect(result.aggregation.unavailableReason).toBe("parent_weights_invalid");
    // The constituents were still assessed: their variances do not depend on weights, and the
    // methodology says they may be recorded even when the aggregate is withheld.
    expect(result.constituents.every((c) => c.covered)).toBe(true);
  });
});

describe("look-ahead and cross-session leakage", () => {
  it("refuses a chain carrying another session's date", () => {
    // The strip arithmetic does not know what day it is, so a stale chain produces an entirely
    // plausible variance from the wrong day's market and nothing downstream notices.
    const input = universe(10);
    const chains = new Map(input.chains);
    const stale = chains.get("sec-iss-1")!;
    chains.set("sec-iss-1", { ...stale, sessionDate: "2026-09-17" });
    const result = calculateSession({ ...input, chains });
    const leaked = result.constituents.find((c) => c.issuerId === "iss-1")!;
    expect(leaked.covered).toBe(false);
    expect(leaked.uncoveredReason).toBe("reference_data_conflict");
  });

  it("refuses a chain taken at a different snapshot instant", () => {
    const input = universe(10);
    const chains = new Map(input.chains);
    const other = chains.get("sec-iss-1")!;
    chains.set("sec-iss-1", { ...other, snapshotTimestamp: "2026-09-18T20:45:00.000Z" });
    const result = calculateSession({ ...input, chains });
    expect(result.constituents.find((c) => c.issuerId === "iss-1")!.uncoveredReason).toBe(
      "reference_data_conflict",
    );
  });

  it("refuses a strip containing a quote timestamped after the official instant", () => {
    // Look-ahead within the session: the quote did not exist at the instant UAVI measures.
    const input = universe(10);
    const chains = new Map(input.chains);
    const chain = chains.get("sec-iss-6")!;
    chains.set("sec-iss-6", {
      ...chain,
      quotes: chain.quotes.map((q, i) =>
        i === 0 ? { ...q, quoteTimestamp: "2026-09-18T19:46:00.000Z" } : q,
      ),
    });
    const result = calculateSession({ ...input, chains });
    const ahead = result.constituents.find((c) => c.issuerId === "iss-6")!;
    expect(ahead.covered).toBe(false);
    expect(ahead.uncoveredReason).toBe("reference_data_conflict");
  });
});
