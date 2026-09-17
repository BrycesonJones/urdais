import { describe, expect, it } from "vitest";

import { aggregate, validateParentWeights, type AggregationConstituent } from "@/lib/uavi/aggregate";
import {
  MIN_COVERED_ISSUER_COUNT,
  MIN_COVERED_PARENT_WEIGHT,
  UAVI_AGGREGATION_FORM,
} from "@/lib/uavi/parameters";

/** A covered issuer with an equal share of an n-issuer universe. */
function member(issuerId: string, parentWeight: number, sigma30: number | null): AggregationConstituent {
  return { issuerId, parentWeight, sigma30 };
}

/** n equally weighted issuers, each at the same volatility, so the gates can be met. */
function universe(n: number, sigma: number | null = 0.3): AggregationConstituent[] {
  return Array.from({ length: n }, (_, i) => member(`issuer-${i}`, 1 / n, sigma));
}

describe("UAVI aggregation is the weighted ARITHMETIC mean", () => {
  it("names the form it computes", () => {
    expect(UAVI_AGGREGATION_FORM).toBe("weighted_arithmetic_mean_of_constituent_volatility");
  });

  it("computes 100 x sum(v_i x sigma_i) exactly, and NOT the root mean square", () => {
    // The fixture exists so the two forms cannot agree. Eight equally weighted issuers, half at
    // 20% volatility and half at 60%:
    //
    //   arithmetic  100 x (0.5 x 0.20 + 0.5 x 0.60)     = 40.000000
    //   RMS         100 x sqrt(0.5 x 0.04 + 0.5 x 0.36) = 44.721360
    //
    // Version 0.1.0-draft specified the second, and it is what the sole institutional analogue
    // publishes -- so a regression here is a plausible mistake with a plausible pedigree,
    // producing a four-point error on a volatility index that nothing about the output flags.
    const constituents = [
      ...Array.from({ length: 4 }, (_, i) => member(`lo-${i}`, 0.125, 0.2)),
      ...Array.from({ length: 4 }, (_, i) => member(`hi-${i}`, 0.125, 0.6)),
    ];
    const result = aggregate(constituents);
    expect(result.publishable).toBe(true);
    if (!result.publishable) throw new Error("unreachable");

    expect(result.indexLevel).toBeCloseTo(40, 12);

    const rms = 100 * Math.sqrt(0.5 * 0.2 * 0.2 + 0.5 * 0.6 * 0.6);
    expect(rms).toBeCloseTo(44.721359549995794, 12);
    expect(result.indexLevel).not.toBeCloseTo(rms, 3);
    // And the arithmetic mean is strictly the smaller of the two whenever volatilities differ.
    expect(result.indexLevel).toBeLessThan(rms);
  });

  it("decomposes exactly into constituent contributions that sum to the level over 100", () => {
    const result = aggregate(universe(10, 0.25));
    if (!result.publishable) throw new Error("unreachable");
    const sum = result.contributions.reduce((acc, c) => acc + c.weightContribution, 0);
    expect(100 * sum).toBeCloseTo(result.indexLevel, 12);
    // Each contribution is v_i x sigma_i -- volatility, first power, never squared.
    for (const c of result.contributions) {
      expect(c.weightContribution).toBeCloseTo(c.renormalizedWeight * c.sigma30, 15);
    }
  });

  it("agrees with the RMS only in the degenerate case where all volatilities are equal", () => {
    const result = aggregate(universe(8, 0.42));
    if (!result.publishable) throw new Error("unreachable");
    const rms = 100 * Math.sqrt(0.42 * 0.42);
    expect(result.indexLevel).toBeCloseTo(42, 12);
    expect(result.indexLevel).toBeCloseTo(rms, 12);
  });
});

describe("renormalization over the covered set", () => {
  it("renormalizes to one when every issuer is covered", () => {
    const result = aggregate(universe(8));
    if (!result.publishable) throw new Error("unreachable");
    const weightSum = result.contributions.reduce((a, c) => a + c.renormalizedWeight, 0);
    expect(weightSum).toBeCloseTo(1, 12);
    expect(result.coveredParentWeight).toBeCloseTo(1, 12);
    expect(result.uncoveredIssuerCount).toBe(0);
  });

  it("renormalizes over the survivors when one issuer drops out", () => {
    // Ten equal issuers at 0.1 each; one uncovered leaves nine covering 0.9, each renormalizing
    // to 1/9. The relative parent weights of the survivors are preserved exactly, which is the
    // inheritance rule -- not a redistribution of the missing weight by any other rule.
    const constituents = universe(10, 0.3);
    constituents[3] = member("issuer-3", 0.1, null);
    const result = aggregate(constituents);
    if (!result.publishable) throw new Error("unreachable");

    expect(result.coveredIssuerCount).toBe(9);
    expect(result.uncoveredIssuerCount).toBe(1);
    expect(result.coveredParentWeight).toBeCloseTo(0.9, 12);
    for (const c of result.contributions) {
      expect(c.renormalizedWeight).toBeCloseTo(1 / 9, 12);
    }
    expect(result.contributions.reduce((a, c) => a + c.renormalizedWeight, 0)).toBeCloseTo(1, 12);
    // The uncovered issuer contributes nothing and is not in the contributions at all.
    expect(result.contributions.some((c) => c.issuerId === "issuer-3")).toBe(false);
  });

  it("preserves unequal relative parent weights through renormalization", () => {
    const constituents: AggregationConstituent[] = [
      member("a", 0.5, 0.2),
      member("b", 0.3, 0.4),
      member("c", 0.2, null), // uncovered
      ...Array.from({ length: 7 }, (_, i) => member(`pad-${i}`, 0, 0.3)),
    ];
    const result = aggregate(constituents);
    if (!result.publishable) throw new Error("unreachable");
    const a = result.contributions.find((c) => c.issuerId === "a")!;
    const b = result.contributions.find((c) => c.issuerId === "b")!;
    // 0.5 : 0.3 before, and still 0.5 : 0.3 after.
    expect(a.renormalizedWeight / b.renormalizedWeight).toBeCloseTo(0.5 / 0.3, 12);
    expect(result.indexLevel).toBeCloseTo(100 * ((0.5 * 0.2 + 0.3 * 0.4) / 0.8), 12);
  });
});

describe("concentration diagnostics", () => {
  it("reports the maximum renormalized weight and the effective issuer count", () => {
    const constituents: AggregationConstituent[] = [
      member("big", 0.6, 0.3),
      ...Array.from({ length: 8 }, (_, i) => member(`small-${i}`, 0.05, 0.3)),
    ];
    const result = aggregate(constituents);
    if (!result.publishable) throw new Error("unreachable");
    expect(result.maxRenormalizedWeight).toBeCloseTo(0.6, 12);
    const expectedNeff = 1 / (0.6 * 0.6 + 8 * 0.05 * 0.05);
    expect(result.effectiveIssuerCount).toBeCloseTo(expectedNeff, 12);
  });

  it("gives an effective issuer count equal to n when weights are equal", () => {
    const result = aggregate(universe(10));
    if (!result.publishable) throw new Error("unreachable");
    expect(result.effectiveIssuerCount).toBeCloseTo(10, 10);
  });

  it("never withholds a headline on concentration: V1 has no concentration gate", () => {
    // One issuer at 92% of a covered set, which any concentration limit would refuse. It
    // publishes, because concentration is diagnostic in V1 and the figure is disclosed instead.
    const constituents: AggregationConstituent[] = [
      member("dominant", 0.92, 0.5),
      ...Array.from({ length: 8 }, (_, i) => member(`tiny-${i}`, 0.01, 0.2)),
    ];
    const result = aggregate(constituents);
    expect(result.publishable).toBe(true);
    if (!result.publishable) throw new Error("unreachable");
    expect(result.maxRenormalizedWeight).toBeCloseTo(0.92, 12);
    expect(result.effectiveIssuerCount!).toBeLessThan(2);
    expect(result.unavailableReason).toBeNull();
  });
});

describe("the two frozen publication gates", () => {
  it("publishes at exactly 80% covered parent weight", () => {
    // Boundary, inclusive. Ten equal issuers, two uncovered, leaves exactly 0.8.
    const constituents = universe(10, 0.3);
    constituents[0] = member("issuer-0", 0.1, null);
    constituents[1] = member("issuer-1", 0.1, null);
    const result = aggregate(constituents);
    expect(result.coveredParentWeight).toBeCloseTo(MIN_COVERED_PARENT_WEIGHT, 12);
    expect(result.publishable).toBe(true);
  });

  it("withholds just below 80%", () => {
    const constituents: AggregationConstituent[] = [
      ...Array.from({ length: 8 }, (_, i) => member(`c-${i}`, 0.0999, 0.3)),
      member("gap", 1 - 8 * 0.0999, null),
    ];
    const result = aggregate(constituents);
    expect(result.coveredParentWeight).toBeLessThan(MIN_COVERED_PARENT_WEIGHT);
    expect(result.publishable).toBe(false);
    expect(result.indexLevel).toBeNull();
    expect(result.unavailableReason).toBe("coverage_below_threshold");
    // The diagnostics survive the refusal. They are the explanation for it.
    expect(result.coveredIssuerCount).toBe(8);
    expect(result.maxRenormalizedWeight).not.toBeNull();
  });

  it("publishes at exactly 8 covered issuers and withholds at 7", () => {
    expect(MIN_COVERED_ISSUER_COUNT).toBe(8);

    const eight = aggregate(universe(8));
    expect(eight.publishable).toBe(true);

    // Seven covered, and coverage still above 80%, so only the count gate can be biting.
    const seven: AggregationConstituent[] = [
      ...Array.from({ length: 7 }, (_, i) => member(`c-${i}`, 0.13, 0.3)),
      member("gap", 1 - 7 * 0.13, null),
    ];
    const result = aggregate(seven);
    expect(result.coveredParentWeight).toBeGreaterThan(MIN_COVERED_PARENT_WEIGHT);
    expect(result.publishable).toBe(false);
    expect(result.unavailableReason).toBe("issuer_count_below_threshold");
  });

  it("reports the coverage gate first when both gates fail", () => {
    const constituents: AggregationConstituent[] = [
      ...Array.from({ length: 3 }, (_, i) => member(`c-${i}`, 0.1, 0.3)),
      member("gap", 0.7, null),
    ];
    const result = aggregate(constituents);
    expect(result.publishable).toBe(false);
    expect(result.unavailableReason).toBe("coverage_below_threshold");
  });

  it("does not lower a gate for the current two-issuer parent universe", () => {
    // The state UAVI is actually in. Two eligible issuers cannot reach eight, and nothing in the
    // aggregation bends to accommodate that -- the finding is that UAVI cannot publish.
    const result = aggregate([member("nvidia", 0.5, 0.45), member("palantir", 0.5, 0.6)]);
    expect(result.publishable).toBe(false);
    expect(result.unavailableReason).toBe("issuer_count_below_threshold");
    expect(result.indexLevel).toBeNull();
  });
});

describe("parent weight validation", () => {
  it("accepts a vector summing to one", () => {
    expect(validateParentWeights(universe(8))).toBeNull();
  });

  it("reports missing weights when there are no constituents at all", () => {
    // The current production state: a blocked parent snapshot with zero weightable issuers.
    expect(validateParentWeights([])).toBe("parent_weights_missing");
    const result = aggregate([]);
    expect(result.publishable).toBe(false);
    expect(result.unavailableReason).toBe("parent_weights_missing");
  });

  it("refuses a vector that does not sum to one rather than renormalizing it", () => {
    // Repairing it would produce a UAVI whose weights came from Urdais's arithmetic rather than
    // the parent's methodology, and the substitution would be invisible.
    const short = Array.from({ length: 8 }, (_, i) => member(`c-${i}`, 0.1, 0.3));
    expect(validateParentWeights(short)).toBe("parent_weights_invalid");
    expect(aggregate(short).unavailableReason).toBe("parent_weights_invalid");
  });

  it("refuses a negative weight", () => {
    const constituents = universe(8);
    constituents[0] = member("issuer-0", -0.125, 0.3);
    expect(validateParentWeights(constituents)).toBe("parent_weights_invalid");
  });

  it("refuses a repeated issuer rather than de-duplicating it", () => {
    // A repeated issuer is counted twice in the denominator and once in the numerator, so it is
    // a fault rather than something to quietly collapse.
    const constituents = [
      member("dup", 0.5, 0.3),
      member("dup", 0.5, 0.3),
    ];
    expect(validateParentWeights(constituents)).toBe("parent_weights_invalid");
  });

  it("refuses NaN and Infinity in the weight vector", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const constituents = universe(8);
      constituents[0] = member("issuer-0", bad, 0.3);
      expect(validateParentWeights(constituents)).toBe("parent_weights_invalid");
    }
  });
});

describe("missing constituent volatility", () => {
  it("never substitutes a value for an uncovered issuer", () => {
    const constituents = universe(10, 0.3);
    constituents[0] = member("issuer-0", 0.1, null);
    const result = aggregate(constituents);
    if (!result.publishable) throw new Error("unreachable");
    // The level is the average over the nine that have one, not over ten with a stand-in.
    expect(result.indexLevel).toBeCloseTo(30, 12);
    expect(result.coveredIssuerCount).toBe(9);
  });

  it("withholds entirely when no issuer is covered, without dividing by zero", () => {
    const result = aggregate(universe(10, null));
    expect(result.publishable).toBe(false);
    expect(result.unavailableReason).toBe("no_covered_constituents");
    expect(result.indexLevel).toBeNull();
    expect(result.maxRenormalizedWeight).toBeNull();
    expect(result.effectiveIssuerCount).toBeNull();
  });

  it("treats a non-finite or negative sigma as uncovered rather than as a number", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -0.1]) {
      const constituents = universe(10, 0.3);
      constituents[0] = member("issuer-0", 0.1, bad);
      const result = aggregate(constituents);
      if (!result.publishable) throw new Error("unreachable");
      expect(result.coveredIssuerCount).toBe(9);
      expect(Number.isFinite(result.indexLevel)).toBe(true);
    }
  });
});
