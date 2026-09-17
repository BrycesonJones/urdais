import { describe, expect, it } from "vitest";

import { interpolate30Day } from "@/lib/uavi/interpolate";
import { N30, N365 } from "@/lib/uavi/parameters";

describe("the constant 30-day interpolation", () => {
  it("uses the frozen minute constants", () => {
    expect(N30).toBe(43_200);
    expect(N365).toBe(525_600);
    expect(N30).toBe(30 * 24 * 60);
    expect(N365).toBe(365 * 24 * 60);
  });

  it("returns the common variance where both terms carry it", () => {
    // With equal term variances the time weights collapse and the 30-day figure is that variance
    // exactly, whatever the two maturities are. A closed-form case that pins the whole expression.
    const result = interpolate30Day({
      nearVariance: 0.04,
      nextVariance: 0.04,
      nearMinutes: 20_000,
      nextMinutes: 60_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.variance30).toBeCloseTo(0.04, 12);
    expect(result.sigma30).toBeCloseTo(0.2, 12);
  });

  it("matches a hand-computed asymmetric example", () => {
    const nearVariance = 0.0225; // sigma 15%
    const nextVariance = 0.0625; // sigma 25%
    const nearMinutes = 20_000;
    const nextMinutes = 60_000;

    // Written out independently of the module, from the methodology's formula.
    const w1 = (nextMinutes - N30) / (nextMinutes - nearMinutes);
    const w2 = (N30 - nearMinutes) / (nextMinutes - nearMinutes);
    const expected =
      ((nearMinutes / N365) * nearVariance * w1 + (nextMinutes / N365) * nextVariance * w2) *
      (N365 / N30);

    const result = interpolate30Day({ nearVariance, nextVariance, nearMinutes, nextMinutes });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.variance30).toBeCloseTo(expected, 15);
    expect(result.sigma30).toBeCloseTo(Math.sqrt(expected), 15);
    expect(result.nearWeight).toBeCloseTo(w1, 15);
    expect(result.nextWeight).toBeCloseTo(w2, 15);
    expect(w1 + w2).toBeCloseTo(1, 15);
  });

  it("interpolates in VARIANCE space, not in volatility", () => {
    // The whole point, in one assertion. Interpolating the two volatilities directly gives a
    // different and slightly smaller number, close enough to pass a casual eye and wrong enough
    // never to reproduce. The methodology forbids it in as many words.
    const nearVariance = 0.0225;
    const nextVariance = 0.0625;
    const nearMinutes = 20_000;
    const nextMinutes = 60_000;

    const result = interpolate30Day({ nearVariance, nextVariance, nearMinutes, nextMinutes });
    if (!result.ok) throw new Error("unreachable");

    const directVolBlend =
      Math.sqrt(nearVariance) * result.nearWeight + Math.sqrt(nextVariance) * result.nextWeight;
    expect(result.sigma30).not.toBeCloseTo(directVolBlend, 4);
  });

  it("refuses two terms that do not bracket the 30-day horizon", () => {
    // Both below: the weights leave [0, 1] and the expression becomes an extrapolation wearing
    // the interpolation's formula.
    expect(interpolate30Day({
      nearVariance: 0.04, nextVariance: 0.04, nearMinutes: 20_000, nextMinutes: 40_000,
    })).toEqual({ ok: false, reason: "invalid_variance" });
    // Both above.
    expect(interpolate30Day({
      nearVariance: 0.04, nextVariance: 0.04, nearMinutes: 50_000, nextMinutes: 70_000,
    })).toEqual({ ok: false, reason: "invalid_variance" });
  });

  it("accepts a near term sitting exactly on the horizon", () => {
    // N_1 <= N30 < N_2, with equality permitted on the near side.
    const result = interpolate30Day({
      nearVariance: 0.04, nextVariance: 0.09, nearMinutes: N30, nextMinutes: 60_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // At exactly 30 days the near term carries all the weight.
    expect(result.nearWeight).toBeCloseTo(1, 12);
    expect(result.variance30).toBeCloseTo(0.04, 12);
  });

  it("refuses an equal minute count, which is a zero denominator", () => {
    expect(interpolate30Day({
      nearVariance: 0.04, nextVariance: 0.04, nearMinutes: 43_200, nextMinutes: 43_200,
    })).toEqual({ ok: false, reason: "invalid_variance" });
  });

  it("refuses a negative term variance rather than flooring it at zero", () => {
    // Flooring would turn a data fault into a plausible reading of "no volatility".
    expect(interpolate30Day({
      nearVariance: -0.01, nextVariance: 0.04, nearMinutes: 20_000, nextMinutes: 60_000,
    })).toEqual({ ok: false, reason: "invalid_variance" });
  });

  it("refuses NaN and Infinity anywhere in its inputs", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(interpolate30Day({
        nearVariance: bad, nextVariance: 0.04, nearMinutes: 20_000, nextMinutes: 60_000,
      }).ok).toBe(false);
      expect(interpolate30Day({
        nearVariance: 0.04, nextVariance: 0.04, nearMinutes: bad, nextMinutes: 60_000,
      }).ok).toBe(false);
    }
  });
});
