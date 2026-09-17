import { describe, expect, it } from "vitest";

import { hasZeroBid, isCrossedQuote, isLockedQuote, isValidQuote, quoteMid } from "@/lib/uavi/quotes";

/**
 * The valid-quote predicate is `ask > 0 && ask >= bid`, and the case worth pinning is the locked
 * market. An instruction to "reject locked and crossed markets" is common and contradicts the
 * `ask >= bid` test given alongside it; the cited constituent-volatility methodology admits locked
 * quotes and rejects only crossed ones. These tests are the record of that resolution.
 */
describe("UAVI quote validity", () => {
  it("accepts an ordinary two-sided quote and returns its midpoint", () => {
    const quote = { bid: 1.0, ask: 1.2 };
    expect(isValidQuote(quote)).toBe(true);
    expect(quoteMid(quote)).toBeCloseTo(1.1, 12);
  });

  it("accepts a LOCKED market, where ask equals bid", () => {
    // A locked market is an unusually tight quote, not a malformed one, and its midpoint equals
    // both sides -- the least ambiguous mid in the strip. Rejecting it would delete the
    // best-priced contracts in the book.
    const quote = { bid: 2.5, ask: 2.5 };
    expect(isValidQuote(quote)).toBe(true);
    expect(isLockedQuote(quote)).toBe(true);
    expect(isCrossedQuote(quote)).toBe(false);
    expect(quoteMid(quote)).toBe(2.5);
  });

  it("rejects a CROSSED market, where ask is below bid", () => {
    const quote = { bid: 2.5, ask: 2.4 };
    expect(isValidQuote(quote)).toBe(false);
    expect(isCrossedQuote(quote)).toBe(true);
    expect(quoteMid(quote)).toBeNull();
  });

  it("rejects a missing side, either side", () => {
    expect(isValidQuote({ bid: null, ask: 1.2 })).toBe(false);
    expect(isValidQuote({ bid: 1.0, ask: null })).toBe(false);
    expect(isValidQuote({ bid: null, ask: null })).toBe(false);
    expect(quoteMid({ bid: null, ask: 1.2 })).toBeNull();
  });

  it("rejects a non-positive ask", () => {
    expect(isValidQuote({ bid: 0, ask: 0 })).toBe(false);
    expect(isValidQuote({ bid: 0, ask: -1 })).toBe(false);
  });

  it("rejects a negative bid, which is not a price", () => {
    expect(isValidQuote({ bid: -0.05, ask: 1.0 })).toBe(false);
  });

  it("rejects NaN and Infinity on either side", () => {
    expect(isValidQuote({ bid: Number.NaN, ask: 1.0 })).toBe(false);
    expect(isValidQuote({ bid: 1.0, ask: Number.NaN })).toBe(false);
    expect(isValidQuote({ bid: 1.0, ask: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("treats a zero bid as VALID, and leaves its exclusion to the strip", () => {
    // This separation is load-bearing. The wing-truncation rule counts consecutive zero-bid
    // contracts, and it can only do that if a zero-bid contract is still a quote. Collapsing
    // "zero bid" into "invalid" would make the frontier uncomputable.
    const quote = { bid: 0, ask: 0.05 };
    expect(isValidQuote(quote)).toBe(true);
    expect(hasZeroBid(quote)).toBe(true);
    expect(quoteMid(quote)).toBeCloseTo(0.025, 12);
  });
});
