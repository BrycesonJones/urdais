import { describe, expect, it } from "vitest";

import { selectExpirations, type ExpirationCandidate } from "@/lib/uavi/expiration";

const SNAPSHOT = "2026-09-18T19:45:00.000Z";

/** An expiration exactly `days` calendar days after the snapshot instant. */
function at(days: number, isStandardExpiration = true): ExpirationCandidate {
  const ts = new Date(Date.parse(SNAPSHOT) + days * 86_400_000);
  return {
    expirationDate: ts.toISOString().slice(0, 10),
    expirationTimestamp: ts.toISOString(),
    isStandardExpiration,
  };
}

describe("expiration selection", () => {
  it("selects a near term inside [10, 30] and a next term inside (30, 120]", () => {
    const result = selectExpirations([at(24), at(52)], SNAPSHOT);
    expect(result.selected).toBe(true);
    if (!result.selected) throw new Error("unreachable");
    expect(result.near.daysToExpiration).toBeCloseTo(24, 9);
    expect(result.next.daysToExpiration).toBeCloseTo(52, 9);
    // The bracket the interpolation needs: N_1 <= N30 < N_2.
    expect(result.near.minutesToExpiration).toBeLessThanOrEqual(43_200);
    expect(result.next.minutesToExpiration).toBeGreaterThan(43_200);
  });

  it("accepts exactly 10 days as a near term and rejects 9", () => {
    expect(selectExpirations([at(10), at(45)], SNAPSHOT).selected).toBe(true);
    const nine = selectExpirations([at(9), at(45)], SNAPSHOT);
    expect(nine.selected).toBe(false);
    if (nine.selected) throw new Error("unreachable");
    expect(nine.reason).toBe("near_expiry_missing");
  });

  it("accepts exactly 30 days as a near term, not as a next term", () => {
    // 30 days is 43,200 minutes exactly: at the horizon, so it is the near term and the bracket
    // holds with equality on the near side.
    const result = selectExpirations([at(30), at(45)], SNAPSHOT);
    expect(result.selected).toBe(true);
    if (!result.selected) throw new Error("unreachable");
    expect(result.near.daysToExpiration).toBeCloseTo(30, 9);
    expect(result.near.minutesToExpiration).toBe(43_200);
  });

  it("accepts exactly 120 days as a next term and rejects 121", () => {
    expect(selectExpirations([at(20), at(120)], SNAPSHOT).selected).toBe(true);
    const beyond = selectExpirations([at(20), at(121)], SNAPSHOT);
    expect(beyond.selected).toBe(false);
    if (beyond.selected) throw new Error("unreachable");
    expect(beyond.reason).toBe("next_expiry_missing");
  });

  it("refuses to proceed on a single expiration, however close to 30 days", () => {
    // The rule most likely to be quietly relaxed when data is thin. One strip at 29.5 days looks
    // like a reasonable 30-day estimate and is that expiration's variance relabelled.
    const result = selectExpirations([at(29.5)], SNAPSHOT);
    expect(result.selected).toBe(false);
    if (result.selected) throw new Error("unreachable");
    expect(result.reason).toBe("next_expiry_missing");
  });

  it("reports a missing near term distinctly from a missing next term", () => {
    const noNear = selectExpirations([at(45), at(90)], SNAPSHOT);
    expect(noNear.selected).toBe(false);
    if (noNear.selected) throw new Error("unreachable");
    expect(noNear.reason).toBe("near_expiry_missing");

    const noNext = selectExpirations([at(15), at(20)], SNAPSHOT);
    expect(noNext.selected).toBe(false);
    if (noNext.selected) throw new Error("unreachable");
    expect(noNext.reason).toBe("next_expiry_missing");
  });

  it("prefers a standard expiration over a closer weekly one", () => {
    // A weekly at 29 days is nearer to the horizon than a standard at 25; the standard still
    // wins, because standard expirations are preferred outright rather than on distance.
    const result = selectExpirations([at(29, false), at(25, true), at(45, true)], SNAPSHOT);
    if (!result.selected) throw new Error("unreachable");
    expect(result.near.daysToExpiration).toBeCloseTo(25, 9);
    expect(result.near.isStandardExpiration).toBe(true);
  });

  it("falls back to the nearest qualifying weekly when no standard expiration fits", () => {
    const result = selectExpirations([at(29, false), at(18, false), at(45, true)], SNAPSHOT);
    if (!result.selected) throw new Error("unreachable");
    expect(result.near.isStandardExpiration).toBe(false);
    expect(result.near.daysToExpiration).toBeCloseTo(29, 9);
  });

  it("chooses the standard expiration closest to 30 days within each window", () => {
    const result = selectExpirations([at(12), at(28), at(35), at(90)], SNAPSHOT);
    if (!result.selected) throw new Error("unreachable");
    expect(result.near.daysToExpiration).toBeCloseTo(28, 9);
    expect(result.next.daysToExpiration).toBeCloseTo(35, 9);
  });

  it("ignores an expiration at or before the snapshot instant", () => {
    const result = selectExpirations([at(-1), at(20), at(45)], SNAPSHOT);
    if (!result.selected) throw new Error("unreachable");
    expect(result.near.daysToExpiration).toBeCloseTo(20, 9);
  });

  it("never extrapolates: an empty candidate set selects nothing", () => {
    expect(selectExpirations([], SNAPSHOT).selected).toBe(false);
  });

  it("measures days as fractional calendar days, so the minute bracket cannot be broken", () => {
    // An expiration 30.4 days out floors to 30 under an integer day count and would be admitted
    // as a near term, while carrying 43,776 minutes -- more than N30 -- which would put the
    // interpolation weights outside [0, 1]. Fractional days place it in the next-term window
    // where it belongs.
    const result = selectExpirations([at(20), at(30.4)], SNAPSHOT);
    if (!result.selected) throw new Error("unreachable");
    expect(result.next.daysToExpiration).toBeCloseTo(30.4, 6);
    expect(result.next.minutesToExpiration).toBeGreaterThan(43_200);
  });
});
