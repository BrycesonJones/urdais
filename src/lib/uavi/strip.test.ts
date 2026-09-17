import { describe, expect, it } from "vitest";

import { computeStrip, deltaKs, type StripInput } from "@/lib/uavi/strip";
import type { NormalizedOptionQuote, ResolvedRate, SeriesState } from "@/lib/uavi/types";

const SNAPSHOT = "2026-09-18T19:45:00.000Z";
/** Exactly 15 calendar days later: 21,600 minutes. */
const EXPIRY = "2026-10-03T19:45:00.000Z";
const MINUTES = 21_600;

const ZERO_RATE: ResolvedRate = {
  continuousRate: 0,
  curveFamily: "fixture",
  isExtrapolated: false,
};

type Leg = { bid: number | null; ask: number | null } | null;

function quote(
  strike: number,
  right: "call" | "put",
  leg: NonNullable<Leg>,
  seriesState: SeriesState = "standard",
): NormalizedOptionQuote {
  return {
    contractSymbol: `ZZ${right === "call" ? "C" : "P"}${strike}`,
    underlyingSecurityId: "sec-1",
    sessionDate: "2026-09-18",
    quoteTimestamp: SNAPSHOT,
    expirationTimestamp: EXPIRY,
    expirationDate: "2026-10-03",
    right,
    strike,
    bid: leg.bid,
    ask: leg.ask,
    seriesState,
    contractMultiplier: 100,
    expirationSeries: "standard_monthly",
    isStandardExpiration: true,
  };
}

/** Build a chain from per-strike legs. A null leg means the contract is simply not listed. */
function chain(rows: readonly { k: number; call?: Leg; put?: Leg }[]): NormalizedOptionQuote[] {
  const out: NormalizedOptionQuote[] = [];
  for (const row of rows) {
    if (row.call) out.push(quote(row.k, "call", row.call));
    if (row.put) out.push(quote(row.k, "put", row.put));
  }
  return out;
}

function input(quotes: readonly NormalizedOptionQuote[], rate: ResolvedRate | null = ZERO_RATE): StripInput {
  return {
    expirationDate: "2026-10-03",
    expirationTimestamp: EXPIRY,
    snapshotTimestamp: SNAPSHOT,
    quotes,
    rate,
  };
}

/** A one-dollar mid on both sides. */
const ONE: Leg = { bid: 0.9, ask: 1.1 };
const ZERO_BID: Leg = { bid: 0, ask: 0.05 };
const NO_BID: Leg = { bid: null, ask: 0.4 };

/**
 * The canonical valid strip: three out-of-the-money puts, three calls, both legs at K0 = 100.
 * Only strike 100 carries both legs, so the parity search cannot land anywhere else.
 */
const VALID_ROWS = [
  { k: 85, put: ONE },
  { k: 90, put: ONE },
  { k: 95, put: ONE },
  { k: 100, call: ONE, put: ONE },
  { k: 105, call: ONE },
  { k: 110, call: ONE },
  { k: 115, call: ONE },
];

describe("delta-K over a surviving strike set", () => {
  it("uses half the span of the neighbours at an interior strike", () => {
    expect(deltaKs([90, 95, 100, 105, 110])).toEqual([5, 5, 5, 5, 5]);
    // Uneven spacing: the interior width is the half-span, not either neighbour's distance.
    expect(deltaKs([90, 100, 120])).toEqual([10, 15, 20]);
  });

  it("uses the one-sided interval at the lower edge", () => {
    expect(deltaKs([90, 100, 120])[0]).toBe(10);
  });

  it("uses the one-sided interval at the upper edge", () => {
    const widths = deltaKs([90, 100, 120]);
    expect(widths[widths.length - 1]).toBe(20);
  });

  it("returns nothing for a single strike, rather than inventing a width", () => {
    expect(deltaKs([100])).toEqual([]);
    expect(deltaKs([])).toEqual([]);
  });
});

describe("a valid strip", () => {
  it("computes the term variance from the methodology's formula", () => {
    const result = computeStrip(input(chain(VALID_ROWS)));
    expect(result.valid).toBe(true);
    expect(result.failureReason).toBeNull();

    // With a zero rate and equal call and put mids at 100, the implied forward is exactly 100,
    // K0 is 100, and the correction term (F/K0 - 1)^2 vanishes. Every delta-K is 5.
    expect(result.forward).toBeCloseTo(100, 12);
    expect(result.k0).toBe(100);
    expect(result.parityStrike).toBe(100);
    expect(result.otmPutCount).toBe(3);
    expect(result.otmCallCount).toBe(3);
    expect(result.includedStrikeCount).toBe(7);
    expect(result.minutesToExpiration).toBe(MINUTES);

    const t = MINUTES / 525_600;
    // Written out independently of the module.
    const sum =
      5 * (1 / 85 ** 2 + 1 / 90 ** 2 + 1 / 95 ** 2 + 1 / 100 ** 2 + 1 / 105 ** 2 + 1 / 110 ** 2 + 1 / 115 ** 2);
    expect(result.termVariance).toBeCloseTo((2 / t) * sum, 12);
  });

  it("uses the average of the call and put mids at K0, and a single leg elsewhere", () => {
    const result = computeStrip(input(chain(VALID_ROWS)));
    const atm = result.components.find((c) => c.strike === 100)!;
    expect(atm.leg).toBe("atm_average");
    expect(atm.quoteMid).toBeCloseTo(1, 12);
    expect(result.components.find((c) => c.strike === 85)!.leg).toBe("put");
    expect(result.components.find((c) => c.strike === 115)!.leg).toBe("call");
  });

  it("reassembles exactly from its own recorded components", () => {
    // The reproducibility claim, checked rather than asserted: the variance must come back out of
    // the stored strike set, delta-Ks and mids.
    const result = computeStrip(input(chain(VALID_ROWS)));
    const t = result.timeToExpiration;
    const discount = Math.exp(result.continuousRate! * t);
    let sum = 0;
    for (const c of result.components) {
      expect(c.contribution).toBeCloseTo((c.deltaK / c.strike ** 2) * discount * c.quoteMid, 15);
      sum += c.contribution;
    }
    const correction = result.forward! / result.k0! - 1;
    expect(result.termVariance).toBeCloseTo((2 / t) * sum - (1 / t) * correction ** 2, 12);
  });

  it("derives the forward from put-call parity and not from any spot price", () => {
    // Call rich by 2 at the parity strike: F = 100 + e^0 x (3 - 1) = 102, and K0 falls to the
    // greatest listed strike at or below it, which is 100. A spot substitution would give a
    // different forward and could move K0 to a different strike entirely.
    const rows = [...VALID_ROWS];
    rows[3] = { k: 100, call: { bid: 2.9, ask: 3.1 }, put: ONE };
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(true);
    expect(result.forward).toBeCloseTo(102, 12);
    expect(result.k0).toBe(100);
    expect(result.parityCallMid).toBeCloseTo(3, 12);
    expect(result.parityPutMid).toBeCloseTo(1, 12);
  });

  it("discounts by e^(rT) with a non-zero rate", () => {
    const rate: ResolvedRate = { continuousRate: 0.05, curveFamily: "fixture", isExtrapolated: false };
    const result = computeStrip(input(chain(VALID_ROWS), rate));
    expect(result.valid).toBe(true);
    const t = MINUTES / 525_600;
    // Equal mids at the parity strike keep C - P at zero, so the forward stays at 100 whatever
    // the rate -- but every contribution is scaled by the discount factor.
    expect(result.forward).toBeCloseTo(100, 12);
    const sum =
      5 * (1 / 85 ** 2 + 1 / 90 ** 2 + 1 / 95 ** 2 + 1 / 100 ** 2 + 1 / 105 ** 2 + 1 / 110 ** 2 + 1 / 115 ** 2);
    expect(result.termVariance).toBeCloseTo((2 / t) * Math.exp(0.05 * t) * sum, 12);
  });

  it("admits a locked quote into the strip", () => {
    const rows = [...VALID_ROWS];
    rows[0] = { k: 85, put: { bid: 1.0, ask: 1.0 } };
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(true);
    expect(result.otmPutCount).toBe(3);
    expect(result.components.find((c) => c.strike === 85)!.quoteMid).toBe(1.0);
  });
});

describe("wing traversal and the zero-bid frontier", () => {
  it("terminates a wing at two consecutive zero bids and ignores everything beyond", () => {
    // Walking outward from K0 = 100: 95, 90, 85 live; 80 zero; 75 live, which RESETS the run;
    // 70 zero; 65 zero, which is the second consecutive and terminates the wing. Strike 60 has a
    // healthy bid and is discarded anyway -- that clause is what makes this a frontier rather
    // than a filter.
    const rows = [
      { k: 60, put: { bid: 1.5, ask: 1.7 } },
      { k: 65, put: ZERO_BID },
      { k: 70, put: ZERO_BID },
      { k: 75, put: ONE },
      { k: 80, put: ZERO_BID },
      { k: 85, put: ONE },
      { k: 90, put: ONE },
      { k: 95, put: ONE },
      { k: 100, call: ONE, put: ONE },
      { k: 105, call: ONE },
      { k: 110, call: ONE },
      { k: 115, call: ONE },
    ];
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(true);
    const putStrikes = result.components.filter((c) => c.leg === "put").map((c) => c.strike);
    expect(putStrikes).toEqual([75, 85, 90, 95]);
    // The live quote past the frontier is gone, and so are both zero-bid strikes.
    expect(putStrikes).not.toContain(60);
    expect(putStrikes).not.toContain(65);
    expect(putStrikes).not.toContain(80);
  });

  it("lets an invalid quote INTERRUPT the zero-bid run rather than continue it", () => {
    // 80 zero; 75 has no bid at all, which is not a zero bid and so restarts the count; 70 zero;
    // 65 live and therefore still admitted. The methodology's step 1 counts contracts that "have
    // zero bids", and a contract with no usable bid is not one of them.
    const rows = [
      { k: 65, put: ONE },
      { k: 70, put: ZERO_BID },
      { k: 75, put: NO_BID },
      { k: 80, put: ZERO_BID },
      { k: 85, put: ONE },
      { k: 90, put: ONE },
      { k: 95, put: ONE },
      { k: 100, call: ONE, put: ONE },
      { k: 105, call: ONE },
      { k: 110, call: ONE },
      { k: 115, call: ONE },
    ];
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(true);
    const putStrikes = result.components.filter((c) => c.leg === "put").map((c) => c.strike);
    expect(putStrikes).toEqual([65, 85, 90, 95]);
  });

  it("truncates each wing independently: exhausting one does not end the other", () => {
    const rows = [
      { k: 85, put: ONE },
      { k: 90, put: ONE },
      { k: 95, put: ONE },
      { k: 100, call: ONE, put: ONE },
      { k: 105, call: ONE },
      { k: 110, call: ONE },
      { k: 115, call: ONE },
      { k: 120, call: ZERO_BID },
      { k: 125, call: ZERO_BID },
      { k: 130, call: { bid: 0.8, ask: 0.9 } },
    ];
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(true);
    expect(result.components.filter((c) => c.leg === "put").map((c) => c.strike)).toEqual([85, 90, 95]);
    expect(result.components.filter((c) => c.leg === "call").map((c) => c.strike)).toEqual([105, 110, 115]);
  });

  it("excludes a surviving zero-bid contract that never triggered a termination", () => {
    const rows = [
      { k: 80, put: ONE },
      { k: 85, put: ONE },
      { k: 90, put: ZERO_BID }, // single zero bid: no termination, but still excluded
      { k: 95, put: ONE },
      { k: 100, call: ONE, put: ONE },
      { k: 105, call: ONE },
      { k: 110, call: ONE },
      { k: 115, call: ONE },
    ];
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(true);
    expect(result.components.filter((c) => c.leg === "put").map((c) => c.strike)).toEqual([80, 85, 95]);
  });
});

describe("strip validity", () => {
  it("refuses fewer than three out-of-the-money puts", () => {
    const rows = VALID_ROWS.filter((r) => r.k !== 85);
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("insufficient_puts");
    expect(result.otmPutCount).toBe(2);
    // It fails closed: no variance, and no at-the-money fallback.
    expect(result.termVariance).toBeNull();
  });

  it("refuses fewer than three out-of-the-money calls", () => {
    const rows = VALID_ROWS.filter((r) => r.k !== 115);
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("insufficient_calls");
    expect(result.otmCallCount).toBe(2);
  });

  it("refuses a strip with no strike carrying both legs, so no forward can be implied", () => {
    const rows = VALID_ROWS.map((r) => (r.k === 100 ? { k: 100, put: ONE } : r));
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("invalid_forward");
    expect(result.forward).toBeNull();
  });

  it("refuses a forward below every listed strike, so no K0 exists", () => {
    // A put worth 40 against a call worth 0.1 at the lowest strike drives the forward to 30.1,
    // and nothing is listed at or below it.
    const rows = [
      { k: 70, call: { bid: 0.05, ask: 0.15 }, put: { bid: 39.9, ask: 40.1 } },
      { k: 85, put: ONE },
      { k: 90, put: ONE },
      { k: 95, put: ONE },
      { k: 105, call: ONE },
      { k: 110, call: ONE },
      { k: 115, call: ONE },
    ];
    const result = computeStrip(input(chain(rows)));
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("invalid_k0");
    expect(result.forward).toBeLessThan(70);
    expect(result.k0).toBeNull();
  });

  it("refuses a K0 missing one of its two legs", () => {
    // Parity is solved at 90, where a call worth 5 against a put worth 1 implies a forward of 94.
    // K0 is then the greatest listed strike at or below it, which is 92 -- and 92 lists only a
    // call. Q(K0) is the average of the two mids, and an average of one number is not it, so the
    // strip is refused rather than silently using the call alone.
    const rows = [
      { k: 80, put: ONE },
      { k: 84, put: ONE },
      { k: 88, put: ONE },
      { k: 90, call: { bid: 4.9, ask: 5.1 }, put: ONE },
      { k: 92, call: ONE },
      { k: 96, call: ONE },
      { k: 100, call: ONE },
      { k: 104, call: ONE },
    ];
    const result = computeStrip(input(chain(rows)));
    expect(result.forward).toBeCloseTo(94, 12);
    expect(result.k0).toBe(92);
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("invalid_atm_quotes");
  });

  it("refuses a strip whose only contracts are adjusted series", () => {
    const adjusted = chain(VALID_ROWS).map((q) => ({ ...q, seriesState: "adjusted" as SeriesState }));
    const result = computeStrip(input(adjusted));
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("adjusted_contract_only");
  });

  it("ignores adjusted contracts while standard ones remain", () => {
    const extra = quote(100, "call", { bid: 99, ask: 101 }, "adjusted");
    const result = computeStrip(input([...chain(VALID_ROWS), { ...extra, contractSymbol: "ADJ" }]));
    // The adjusted duplicate at strike 100 is filtered out before indexing, so it neither
    // collides with the standard contract nor distorts the forward.
    expect(result.valid).toBe(true);
    expect(result.forward).toBeCloseTo(100, 12);
  });

  it("refuses a duplicated contract rather than choosing between the copies", () => {
    // A duplicated strike would contribute its term twice and inflate the variance by an amount
    // nothing about the result would look wrong.
    const duplicated = [...chain(VALID_ROWS), quote(105, "call", ONE)];
    const result = computeStrip(input(duplicated));
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("reference_data_conflict");
  });

  it("refuses when no rate is available", () => {
    const result = computeStrip(input(chain(VALID_ROWS), null));
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("rate_missing");
    expect(result.continuousRate).toBeNull();
  });

  it("refuses a non-finite rate", () => {
    const bad: ResolvedRate = { continuousRate: Number.NaN, curveFamily: "x", isExtrapolated: false };
    expect(computeStrip(input(chain(VALID_ROWS), bad)).failureReason).toBe("rate_missing");
  });

  it("refuses an expiration at or before the snapshot instant", () => {
    // A negative time to expiration divides the whole formula and would flip the variance's sign.
    const expired = { ...input(chain(VALID_ROWS)), expirationTimestamp: "2026-09-17T19:45:00.000Z" };
    const result = computeStrip(expired);
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe("option_data_missing");
    expect(result.minutesToExpiration).toBeLessThan(0);
  });

  it("refuses an empty chain", () => {
    expect(computeStrip(input([])).failureReason).toBe("option_data_missing");
  });

  it("refuses a non-positive strike", () => {
    const bad = [...chain(VALID_ROWS), quote(0, "call", ONE)];
    expect(computeStrip(input(bad)).failureReason).toBe("reference_data_conflict");
  });

  it("returns diagnostics on every failure, not a bare null", () => {
    const result = computeStrip(input(chain(VALID_ROWS.filter((r) => r.k !== 85))));
    expect(result.expirationDate).toBe("2026-10-03");
    expect(result.minutesToExpiration).toBe(MINUTES);
    expect(result.forward).not.toBeNull();
    expect(result.k0).not.toBeNull();
    expect(result.failureReason).not.toBeNull();
  });
});
