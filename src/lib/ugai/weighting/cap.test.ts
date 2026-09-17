import { describe, expect, it } from "vitest";

import { WeightingError, applyIssuerCap, sumWeights } from "@/lib/ugai/weighting/cap";

const caps = (...m: string[]) => m.map((marketCapUsd, i) => ({ issuerId: `i${i}`, marketCapUsd }));

describe("uncapped weighting", () => {
  it("weights in proportion to capitalization and sums to exactly one", () => {
    const out = applyIssuerCap(caps("500", "300", "200"), "1");
    expect(out.feasible).toBe(true);
    expect(out.weights.map((w) => w.cappedWeight)).toEqual(["0.5", "0.3", "0.2"]);
    expect(sumWeights(out.weights)).toBe("1");
    expect(out.weights.every((w) => !w.capBound)).toBe(true);
  });

  it("sums to exactly one even when the proportions do not terminate", () => {
    // Thirds. Under floating point the parts would not sum to 1; here the residual is allocated
    // deterministically rather than left for someone to dump on the largest constituent.
    const out = applyIssuerCap(caps("1", "1", "1"), "1");
    expect(sumWeights(out.weights)).toBe("1");
  });
});

describe("issuer cap", () => {
  it("caps a single overweight issuer and redistributes the excess proportionally", () => {
    // 60/25/15 with c = 0.4: one issuer binds, and the remaining 0.6 splits 25:15.
    const out = applyIssuerCap(caps("60", "25", "15"), "0.4");
    expect(out.weights[0]).toMatchObject({ cappedWeight: "0.4", capBound: true });
    expect(out.weights[1]!.cappedWeight).toBe("0.375");
    expect(out.weights[2]!.cappedWeight).toBe("0.225");
    expect(sumWeights(out.weights)).toBe("1");
  });

  it("redistributes recursively when the excess pushes another issuer over the cap", () => {
    // The case one-pass capping gets wrong. 70/28/1/1 at c = 0.4: capping the first lifts the
    // second to 0.6 × 28/30 = 0.56, which is itself over the cap and must bind in turn.
    const out = applyIssuerCap(caps("70", "28", "1", "1"), "0.4");
    expect(out.weights[0]!.capBound).toBe(true);
    expect(out.weights[1]!.capBound).toBe(true);
    expect(out.iterations).toBeGreaterThan(1);
    expect(out.weights.every((w) => Number(w.cappedWeight) <= 0.4 + 1e-24)).toBe(true);
    expect(sumWeights(out.weights)).toBe("1");
  });

  it("binds several issuers in one pass where several already exceed the cap", () => {
    const out = applyIssuerCap(caps("40", "40", "10", "10"), "0.3");
    expect(out.weights.filter((w) => w.capBound)).toHaveLength(2);
    expect(out.weights[2]!.cappedWeight).toBe("0.2");
    expect(sumWeights(out.weights)).toBe("1");
  });

  it("never lets a final weight exceed the cap", () => {
    const out = applyIssuerCap(caps("1000", "500", "250", "125", "60", "30", "15", "8", "4", "2"), "0.15");
    for (const w of out.weights) expect(Number(w.cappedWeight)).toBeLessThanOrEqual(0.15);
    expect(sumWeights(out.weights)).toBe("1");
  });

  it("handles the boundary where every issuer is capped", () => {
    // n × c = 1 exactly, which the methodology names as a valid feasible case.
    const out = applyIssuerCap(caps("70", "20", "5", "5"), "0.25");
    expect(out.feasible).toBe(true);
    expect(out.weights.every((w) => w.cappedWeight === "0.25")).toBe(true);
    expect(sumWeights(out.weights)).toBe("1");
  });

  it("preserves the uncapped weight beside the capped one", () => {
    const out = applyIssuerCap(caps("60", "25", "15"), "0.4");
    expect(out.weights[0]!.uncappedWeight).toBe("0.6");
    expect(out.weights[0]!.cappedWeight).toBe("0.4");
  });

  it("does not depend on input order", () => {
    const forward = applyIssuerCap(caps("70", "28", "1", "1"), "0.4");
    const reversed = applyIssuerCap(
      [...caps("70", "28", "1", "1")].reverse(),
      "0.4",
    );
    const byIssuer = (o: typeof forward) =>
      Object.fromEntries(o.weights.map((w) => [w.issuerId, w.cappedWeight]));
    expect(byIssuer(reversed)).toEqual(byIssuer(forward));
  });
});

describe("feasibility", () => {
  it("refuses when n × c < 1 instead of producing weights that sum below one", () => {
    // Three issuers at a 10% cap can carry at most 30% of an allocation.
    const out = applyIssuerCap(caps("100", "100", "100"), "0.1");
    expect(out.feasible).toBe(false);
    expect(out.weights).toEqual([]);
    expect(out.reason).toMatch(/can carry at most 0\.3/);
    expect(out.reason).toMatch(/do not relax the cap/);
  });

  it("refuses an empty universe", () => {
    const out = applyIssuerCap([], "0.1");
    expect(out.feasible).toBe(false);
    expect(out.reason).toMatch(/empty/);
  });

  it("accepts exactly at the feasibility boundary", () => {
    expect(applyIssuerCap(caps("1", "1", "1", "1", "1", "1", "1", "1", "1", "1"), "0.1").feasible).toBe(true);
  });

  it("rejects a non-positive capitalization rather than weighting it", () => {
    expect(() => applyIssuerCap(caps("100", "0"), "0.5")).toThrow(/non-positive capitalization/);
    expect(() => applyIssuerCap([{ issuerId: "a", marketCapUsd: "-5" }], "0.5")).toThrow(WeightingError);
  });

  it("rejects an out-of-range cap", () => {
    expect(() => applyIssuerCap(caps("1"), "0")).toThrow(/0 < c <= 1/);
    expect(() => applyIssuerCap(caps("1"), "1.5")).toThrow(/0 < c <= 1/);
  });
});

describe("issuer identity", () => {
  it("refuses the same issuer twice rather than summing it", () => {
    // A duplicate here means a dual listing became two memberships upstream. Summing them would
    // hide exactly the failure the one-issuer-one-membership rule exists to prevent.
    expect(() =>
      applyIssuerCap(
        [
          { issuerId: "alibaba", marketCapUsd: "100" },
          { issuerId: "alibaba", marketCapUsd: "80" },
        ],
        "0.5",
      ),
    ).toThrow(/appears twice in one weighting/);
  });

  it("gives one weight per issuer", () => {
    const out = applyIssuerCap(caps("60", "25", "15"), "0.4");
    expect(new Set(out.weights.map((w) => w.issuerId)).size).toBe(out.weights.length);
  });
});
