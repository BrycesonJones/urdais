import { describe, expect, it } from "vitest";

import {
  CalculationError,
  UGAI_BASE_LEVEL,
  adjustedDivisor,
  baseDivisor,
  indexLevel,
  marketValue,
  resetIndexShares,
  type ConstituentInput,
} from "@/lib/ugai/calculation/index-level";

function c(over: Partial<ConstituentInput> & { securityId: string }): ConstituentInput {
  return {
    indexShares: "1000000",
    localPrice: "100",
    fxRate: "1",
    priceInputState: "observed",
    ...over,
  };
}

describe("base initialization", () => {
  it("derives the base divisor so the level is exactly 1000", () => {
    // MV = 5,000,000,000 at a base of 1000 gives D = 5,000,000.
    const d = baseDivisor("5000000000");
    expect(d).toBe("5000000");
    expect(indexLevel("5000000000", d)).toBe("1000");
  });

  it("fixes the base level at 1000 with no way to ask for another", () => {
    expect(UGAI_BASE_LEVEL).toBe("1000");
    // baseDivisor takes only a market value: no date, no level. The methodology fixes both, and
    // a parameter for either would be an invitation.
    expect(baseDivisor.length).toBe(1);
  });

  it("refuses a non-positive base market value rather than producing an infinity", () => {
    expect(() => baseDivisor("0")).toThrow(/not positive/);
  });
});

describe("daily calculation", () => {
  it("computes MV as the sum of q x P x X", () => {
    const out = marketValue([
      c({ securityId: "a", indexShares: "1000000", localPrice: "100", fxRate: "1" }),
      c({ securityId: "b", indexShares: "2000000", localPrice: "50", fxRate: "1" }),
    ]);
    expect(out.computable).toBe(true);
    if (!out.computable) return;
    expect(out.marketValueUsd).toBe("200000000");
    expect(out.contributions.map((x) => x.contributionUsd)).toEqual(["100000000", "100000000"]);
    expect(out.contributions.map((x) => x.asOfWeight)).toEqual(["0.5", "0.5"]);
  });

  it("moves the index with price, without touching the divisor", () => {
    const base = marketValue([c({ securityId: "a" })]);
    if (!base.computable) throw new Error("setup");
    const d = baseDivisor(base.marketValueUsd);
    expect(indexLevel(base.marketValueUsd, d)).toBe("1000");

    // A 10% rise in aggregate market value with no maintenance event is a 10% rise in the index.
    const later = marketValue([c({ securityId: "a", localPrice: "110" })]);
    if (!later.computable) throw new Error("setup");
    expect(indexLevel(later.marketValueUsd, d)).toBe("1100");
  });

  it("moves the index with the exchange rate", () => {
    const base = marketValue([c({ securityId: "a", localPrice: "1000", fxRate: "0.03" })]);
    if (!base.computable) throw new Error("setup");
    const d = baseDivisor(base.marketValueUsd);
    const weaker = marketValue([c({ securityId: "a", localPrice: "1000", fxRate: "0.027" })]);
    if (!weaker.computable) throw new Error("setup");
    // A 10% depreciation of the price currency is a 10% fall in the USD index.
    expect(indexLevel(weaker.marketValueUsd, d)).toBe("900");
  });

  it("lets weights drift rather than resetting them daily", () => {
    const day1 = marketValue([c({ securityId: "a" }), c({ securityId: "b" })]);
    if (!day1.computable) throw new Error("setup");
    expect(day1.contributions[0]!.asOfWeight).toBe("0.5");

    // a doubles; its as-of weight becomes 2/3 and stays there. No re-weighting occurs, because
    // forcing weights back to target would embed a trading rule.
    const day2 = marketValue([c({ securityId: "a", localPrice: "200" }), c({ securityId: "b" })]);
    if (!day2.computable) throw new Error("setup");
    expect(Number(day2.contributions[0]!.asOfWeight)).toBeCloseTo(2 / 3, 12);
  });

  it("is deterministic and order-independent", () => {
    const forward = marketValue([c({ securityId: "a" }), c({ securityId: "b", localPrice: "37.5" })]);
    const reversed = marketValue([c({ securityId: "b", localPrice: "37.5" }), c({ securityId: "a" })]);
    if (!forward.computable || !reversed.computable) throw new Error("setup");
    expect(reversed.marketValueUsd).toBe(forward.marketValueUsd);
    expect(marketValue([c({ securityId: "a" })])).toEqual(marketValue([c({ securityId: "a" })]));
  });
});

describe("missing inputs", () => {
  it("blocks on a missing price instead of dropping the constituent", () => {
    // Dropping it and renormalising would silently change every other weight -- the same
    // imputation the methodology forbids, by another route.
    const out = marketValue([
      c({ securityId: "a" }),
      c({ securityId: "b", localPrice: null, priceInputState: "missing" }),
    ]);
    expect(out.computable).toBe(false);
    if (out.computable) return;
    expect(out.blockingSecurities).toEqual(["b"]);
    expect(out.reason).toMatch(/renormalising would silently change/);
  });

  it("blocks on a missing exchange rate", () => {
    const out = marketValue([c({ securityId: "a", fxRate: null })]);
    expect(out.computable).toBe(false);
  });

  it("blocks on a reference-data conflict rather than guessing which source is right", () => {
    const out = marketValue([c({ securityId: "a", priceInputState: "reference_data_conflict", localPrice: null })]);
    expect(out.computable).toBe(false);
  });

  it("accepts a carried close, which the methodology permits and flags", () => {
    // A market holiday is explicitly not an error: carry the last official close and mark it.
    const out = marketValue([c({ securityId: "a", priceInputState: "valid_prior_close" })]);
    expect(out.computable).toBe(true);
  });

  it("refuses an empty basket", () => {
    const out = marketValue([]);
    expect(out.computable).toBe(false);
  });
});

describe("divisor continuity", () => {
  it("leaves the index unchanged across a value-neutral maintenance event", () => {
    const before = "200000000";
    const after = "250000000";
    const d0 = baseDivisor(before);
    const d1 = adjustedDivisor(d0, before, after);
    // The whole point: the level at the implementation close is identical either side.
    expect(indexLevel(after, d1)).toBe(indexLevel(before, d0));
  });

  it("leaves a split alone entirely", () => {
    // Price halves, shares double, market value is unchanged -- so the divisor must not move and
    // the index must not move. The methodology says "no divisor change" in those words.
    const pre = marketValue([c({ securityId: "a", indexShares: "1000000", localPrice: "100" })]);
    const post = marketValue([c({ securityId: "a", indexShares: "2000000", localPrice: "50" })]);
    if (!pre.computable || !post.computable) throw new Error("setup");
    expect(post.marketValueUsd).toBe(pre.marketValueUsd);
    const d = baseDivisor(pre.marketValueUsd);
    expect(indexLevel(post.marketValueUsd, d)).toBe(indexLevel(pre.marketValueUsd, d));
  });

  it("preserves the level when a constituent is added", () => {
    const before = marketValue([c({ securityId: "a" })]);
    if (!before.computable) throw new Error("setup");
    const d0 = baseDivisor(before.marketValueUsd);
    const after = marketValue([c({ securityId: "a" }), c({ securityId: "b" })]);
    if (!after.computable) throw new Error("setup");
    const d1 = adjustedDivisor(d0, before.marketValueUsd, after.marketValueUsd);
    expect(indexLevel(after.marketValueUsd, d1)).toBe("1000");
    // And the divisor doubled, because the basket did.
    expect(d1).toBe(render2(Number(d0) * 2));
  });

  it("preserves the level when a constituent is removed", () => {
    const before = marketValue([c({ securityId: "a" }), c({ securityId: "b" })]);
    if (!before.computable) throw new Error("setup");
    const d0 = baseDivisor(before.marketValueUsd);
    const after = marketValue([c({ securityId: "a" })]);
    if (!after.computable) throw new Error("setup");
    const d1 = adjustedDivisor(d0, before.marketValueUsd, after.marketValueUsd);
    // A membership change is not an investment return.
    expect(indexLevel(after.marketValueUsd, d1)).toBe("1000");
  });

  it("preserves the level across a reconstitution into a differently sized basket", () => {
    const before = marketValue([c({ securityId: "a" }), c({ securityId: "b" })]);
    if (!before.computable) throw new Error("setup");
    const d0 = adjustedDivisor(baseDivisor(before.marketValueUsd), before.marketValueUsd, before.marketValueUsd);
    const levelBefore = indexLevel(before.marketValueUsd, d0);

    // An entirely different basket at the implementation close.
    const after = marketValue([
      c({ securityId: "c", indexShares: "500000", localPrice: "700" }),
      c({ securityId: "d", indexShares: "3000000", localPrice: "20" }),
    ]);
    if (!after.computable) throw new Error("setup");
    const d1 = adjustedDivisor(d0, before.marketValueUsd, after.marketValueUsd);
    expect(indexLevel(after.marketValueUsd, d1)).toBe(levelBefore);
    // And emphatically not a reset to 1000 unless that is where it already was.
    expect(indexLevel(after.marketValueUsd, d1)).toBe("1000");
  });

  it("carries subsequent performance on the new basket", () => {
    const before = marketValue([c({ securityId: "a" })]);
    if (!before.computable) throw new Error("setup");
    const d0 = baseDivisor(before.marketValueUsd);
    const after = marketValue([c({ securityId: "b", indexShares: "4000000", localPrice: "50" })]);
    if (!after.computable) throw new Error("setup");
    const d1 = adjustedDivisor(d0, before.marketValueUsd, after.marketValueUsd);
    expect(indexLevel(after.marketValueUsd, d1)).toBe("1000");

    const next = marketValue([c({ securityId: "b", indexShares: "4000000", localPrice: "55" })]);
    if (!next.computable) throw new Error("setup");
    expect(indexLevel(next.marketValueUsd, d1)).toBe("1100");
  });

  it("refuses a non-positive market value on either side", () => {
    expect(() => adjustedDivisor("100", "0", "100")).toThrow(CalculationError);
    expect(() => adjustedDivisor("100", "100", "0")).toThrow(/not positive/);
  });
});

describe("index shares at a reset", () => {
  it("reproduces the parent base weight at the implementation close", () => {
    // w = 8% of MV = 200,000,000 at a price of 100 gives 160,000 shares.
    const q = resetIndexShares("0.08", "200000000", "100", "1");
    expect(q).toBe("160000");
    const out = marketValue([c({ securityId: "a", indexShares: q })]);
    if (!out.computable) throw new Error("setup");
    expect(out.contributions[0]!.contributionUsd).toBe("16000000");
  });

  it("gives an entering security zero shares at zero weight, without a special case", () => {
    expect(resetIndexShares("0", "200000000", "100", "1")).toBe("0");
  });

  it("refuses a reset without a positive price and rate", () => {
    expect(() => resetIndexShares("0.08", "200000000", "0", "1")).toThrow(/positive price and rate/);
  });
});

/** Render a number the way the engine renders scaled decimals, for comparison in one test. */
function render2(n: number): string {
  return String(n);
}
