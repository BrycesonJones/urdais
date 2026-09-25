import { describe, expect, it } from "vitest";

import {
  absoluteChangeOf, changeBetween, changeUnavailable, directionOf, isPercentagePublishable,
  percentageOf,
} from "@/lib/market-change";

/**
 * The truth table of UEPI specification 1.0.0 §D, case by case.
 *
 * Every row asserts four things rather than one: whether a percentage was published, what the
 * absolute change is, which direction the move was, and -- where the percentage was withheld --
 * why. Testing only for `null` would pass an implementation that suppressed everything, and would
 * miss the case these rules exist for: rows 8 and 9, where the direction is the only correct
 * statement about a negative-to-negative move.
 */
describe("1. the §D truth table", () => {
  it("row 1: positive to higher positive publishes a percentage", () => {
    const change = changeBetween(30, 33);
    expect(change.kind).toBe("percentage");
    expect(percentageOf(change)).toBeCloseTo(10, 10);
    expect(absoluteChangeOf(change)).toBeCloseTo(3, 10);
    expect(change.kind !== "unavailable" && change.direction).toBe("up");
  });

  it("row 2: positive to lower positive publishes a negative percentage", () => {
    const change = changeBetween(30, 27);
    expect(percentageOf(change)).toBeCloseTo(-10, 10);
    expect(absoluteChangeOf(change)).toBeCloseTo(-3, 10);
    expect(change.kind !== "unavailable" && change.direction).toBe("down");
  });

  it("row 3: positive to zero withholds the percentage and keeps the dollar change", () => {
    const change = changeBetween(30, 0);
    expect(change.kind).toBe("absolute");
    expect(percentageOf(change)).toBeNull();
    expect(absoluteChangeOf(change)).toBe(-30);
    expect(change.kind === "absolute" && change.reason).toBe("new_not_positive");
    expect(change.kind === "absolute" && change.direction).toBe("down");
  });

  it("row 4: a zero crossing downwards is never a percentage", () => {
    const change = changeBetween(30, -5);
    expect(change.kind).toBe("absolute");
    expect(absoluteChangeOf(change)).toBe(-35);
    expect(change.kind === "absolute" && change.reason).toBe("new_not_positive");
  });

  it("row 5: a zero base withholds the percentage", () => {
    const change = changeBetween(0, 12);
    expect(change.kind).toBe("absolute");
    expect(absoluteChangeOf(change)).toBe(12);
    expect(change.kind === "absolute" && change.reason).toBe("base_zero");
    expect(change.kind === "absolute" && change.direction).toBe("up");
  });

  it("row 6: zero to zero is a flat dollar change and no percentage", () => {
    const change = changeBetween(0, 0);
    expect(change.kind).toBe("absolute");
    expect(absoluteChangeOf(change)).toBe(0);
    expect(change.kind === "absolute" && change.reason).toBe("base_zero");
    expect(change.kind === "absolute" && change.direction).toBe("flat");
  });

  it("row 7: zero to negative", () => {
    const change = changeBetween(0, -4);
    expect(change.kind === "absolute" && change.reason).toBe("base_zero");
    expect(absoluteChangeOf(change)).toBe(-4);
    expect(change.kind === "absolute" && change.direction).toBe("down");
  });

  it("row 8: negative to less negative is UP, and reports no percentage", () => {
    // The case the old formula got wrong: -10 -> -5 returned -50% for a price that rose by $5.
    const change = changeBetween(-10, -5);
    expect(change.kind).toBe("absolute");
    expect(percentageOf(change)).toBeNull();
    expect(absoluteChangeOf(change)).toBe(5);
    expect(change.kind === "absolute" && change.direction).toBe("up");
    expect(change.kind === "absolute" && change.reason).toBe("base_negative");
  });

  it("row 9: negative to more negative is DOWN", () => {
    const change = changeBetween(-5, -10);
    expect(absoluteChangeOf(change)).toBe(-5);
    expect(change.kind === "absolute" && change.direction).toBe("down");
    expect(change.kind === "absolute" && change.reason).toBe("base_negative");
  });

  it("row 10: negative to zero", () => {
    const change = changeBetween(-8, 0);
    expect(absoluteChangeOf(change)).toBe(8);
    expect(change.kind === "absolute" && change.direction).toBe("up");
    expect(change.kind === "absolute" && change.reason).toBe("base_negative");
  });

  it("row 11: a zero crossing upwards is never a percentage either", () => {
    const change = changeBetween(-8, 4);
    expect(change.kind).toBe("absolute");
    expect(absoluteChangeOf(change)).toBe(12);
    expect(change.kind === "absolute" && change.reason).toBe("base_negative");
  });

  it("row 12: two equal positive values publish 0.00 %, which is a real statement", () => {
    const change = changeBetween(30, 30);
    expect(change.kind).toBe("percentage");
    expect(percentageOf(change)).toBe(0);
    expect(change.kind !== "unavailable" && change.direction).toBe("flat");
  });

  it("row 12b: two equal negative values are flat, with no percentage", () => {
    const change = changeBetween(-30, -30);
    expect(change.kind).toBe("absolute");
    expect(absoluteChangeOf(change)).toBe(0);
    expect(change.kind === "absolute" && change.direction).toBe("flat");
  });

  it("row 13: no base observation is unavailable, not a suppressed percentage", () => {
    const change = changeUnavailable("no_base_observation");
    expect(change.kind).toBe("unavailable");
    expect(absoluteChangeOf(change)).toBeNull();
    expect(percentageOf(change)).toBeNull();
  });

  it("row 14: a methodology break is unavailable and names itself", () => {
    const change = changeUnavailable("methodology_version_break");
    expect(change).toEqual({ kind: "unavailable", reason: "methodology_version_break" });
  });
});

describe("2. the unavailable cases stay distinguishable from the suppressed ones", () => {
  it("separates insufficient history from a non-positive endpoint", () => {
    expect(changeUnavailable("insufficient_history").kind).toBe("unavailable");
    expect(changeBetween(-1, -2).kind).toBe("absolute");
  });

  it("treats a non-finite endpoint as unavailable rather than as a change of NaN", () => {
    expect(changeBetween(Number.NaN, 5)).toEqual({ kind: "unavailable", reason: "missing_value" });
    expect(changeBetween(5, Number.POSITIVE_INFINITY)).toEqual({ kind: "unavailable", reason: "missing_value" });
  });
});

describe("3. endpoints travel with the change", () => {
  it("carries the base and latest timestamps so a surface can state the comparison date", () => {
    const change = changeBetween(30, 33, { baseTime: 1_700_000_000, latestTime: 1_700_086_400 });
    expect(change.kind !== "unavailable" && change.baseTime).toBe(1_700_000_000);
    expect(change.kind !== "unavailable" && change.latestTime).toBe(1_700_086_400);
    expect(change.kind !== "unavailable" && change.baseValue).toBe(30);
  });

  it("defaults the timestamps to null rather than inventing them", () => {
    const change = changeBetween(30, 33);
    expect(change.kind !== "unavailable" && change.baseTime).toBeNull();
  });
});

describe("4. the primitives agree with the rule", () => {
  it("permits a percentage only between two strictly positive values", () => {
    expect(isPercentagePublishable(1, 1)).toBe(true);
    expect(isPercentagePublishable(0, 1)).toBe(false);
    expect(isPercentagePublishable(1, 0)).toBe(false);
    expect(isPercentagePublishable(-1, 1)).toBe(false);
    expect(isPercentagePublishable(1, -1)).toBe(false);
  });

  it("derives direction from the sign of the change and nothing else", () => {
    expect(directionOf(0.0001)).toBe("up");
    expect(directionOf(-0.0001)).toBe("down");
    expect(directionOf(0)).toBe("flat");
    expect(directionOf(-0)).toBe("flat");
  });
});
