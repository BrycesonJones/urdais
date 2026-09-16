import { describe, expect, it } from "vitest";

import { deriveComparison, deriveVolumeShare, median, type ComparisonRow, type VolumeRow } from "@/lib/open-weight/derive";

const volumeRow = (over: Partial<VolumeRow> = {}): VolumeRow => ({
  date: "2026-09-16",
  permaslug: "vendor/model-20260101",
  isResidual: false,
  tokens: 1000n,
  linkState: "evidenced",
  accessClass: "open_weights_unrestricted",
  providerModelId: "model",
  ...over,
});

const comparisonRow = (over: Partial<ComparisonRow> = {}): ComparisonRow => ({
  benchmarkSlug: "gpqa-diamond",
  benchmarkLabel: "GPQA Diamond",
  score: 0.5,
  configuration: null,
  capabilityAsOf: "2026-09-01",
  providerModelId: "model",
  displayName: "Model",
  accessClass: "open_weights_unrestricted",
  blendedUsdPer1m: 1,
  priceAsOf: "2026-09-14",
  ...over,
});

describe("volume share", () => {
  it("divides by every observed token, including the ones it cannot classify", () => {
    const share = deriveVolumeShare(
      [
        volumeRow({ permaslug: "a", providerModelId: "a", tokens: 500n }),
        volumeRow({ permaslug: "b", providerModelId: "b", tokens: 300n, accessClass: "api_only_closed_weights" }),
        volumeRow({ permaslug: "other", isResidual: true, tokens: 200n, providerModelId: null, linkState: "unmapped", accessClass: null }),
      ],
      30,
    );
    expect(share.totalObservedTokens).toBe("1000");
    const by = Object.fromEntries(share.slices.map((slice) => [slice.publicClass, slice.sharePercent]));
    expect(by.open_weight).toBe(50);
    expect(by.proprietary).toBe(30);
    expect(by.unclassified).toBe(20);
  });

  it("reconciles to 100 %, so nothing is quietly dropped", () => {
    const share = deriveVolumeShare(
      [
        volumeRow({ permaslug: "a", providerModelId: "a", tokens: 3_333_333_333_333n }),
        volumeRow({ permaslug: "b", providerModelId: "b", tokens: 3_333_333_333_333n, accessClass: "open_weights_restricted" }),
        volumeRow({ permaslug: "c", providerModelId: "c", tokens: 3_333_333_333_334n, accessClass: "api_only_closed_weights" }),
      ],
      30,
    );
    const sum = share.slices.reduce((total, slice) => total + slice.sharePercent, 0);
    // Truncating integer division can fall a few units in the last place short of 100.
    expect(Math.abs(sum - 100)).toBeLessThan(0.001);
  });

  it("keeps token counts exact beyond what a double holds", () => {
    const huge = 9_007_199_254_740_993n; // Number.MAX_SAFE_INTEGER + 2
    const share = deriveVolumeShare([volumeRow({ tokens: huge })], 30);
    expect(share.totalObservedTokens).toBe(huge.toString());
  });

  it("separates the three reasons volume is unclassified", () => {
    // They are different work: one can never be resolved, one is identity work, one is
    // evidence work. A single Unclassified number would hide which is growing.
    const share = deriveVolumeShare(
      [
        volumeRow({ permaslug: "other", isResidual: true, tokens: 100n, providerModelId: null, linkState: "unmapped", accessClass: null }),
        volumeRow({ permaslug: "stealth/x", tokens: 200n, providerModelId: null, linkState: "not_applicable", accessClass: null }),
        volumeRow({ permaslug: "v/m", tokens: 300n, providerModelId: "m", accessClass: "unknown" }),
      ],
      30,
    );
    expect(share.unclassifiedBreakdown).toEqual({
      sourceAggregated: "100",
      unlinked: "200",
      undetermined: "300",
    });
  });

  it("does not count an unlinked permaslug as an unestablished class", () => {
    // The distinction that matters operationally: identity work not done is not the same as
    // evidence work not done, and conflating them would misdirect the next hour of research.
    const share = deriveVolumeShare([volumeRow({ providerModelId: null, linkState: "unmapped", accessClass: null })], 30);
    expect(share.unclassifiedBreakdown.unlinked).toBe("1000");
    expect(share.unclassifiedBreakdown.undetermined).toBe("0");
  });

  it("counts distinct models per class, not observations", () => {
    const share = deriveVolumeShare(
      [
        volumeRow({ date: "2026-09-15", providerModelId: "m" }),
        volumeRow({ date: "2026-09-16", providerModelId: "m" }),
      ],
      30,
    );
    expect(share.modelCounts.open_weight).toBe(1);
  });

  it("reports the window it actually found, not the one it asked for", () => {
    const share = deriveVolumeShare(
      [volumeRow({ date: "2026-09-10" }), volumeRow({ date: "2026-09-16", permaslug: "b" })],
      30,
    );
    expect(share.firstDate).toBe("2026-09-10");
    expect(share.lastDate).toBe("2026-09-16");
  });

  it("refuses an empty window rather than publishing a zero", () => {
    expect(() => deriveVolumeShare([], 30)).toThrow(/no observations/);
  });

  it("refuses a negative token count", () => {
    expect(() => deriveVolumeShare([volumeRow({ tokens: -1n })], 30)).toThrow(/negative tokens/);
  });
});

describe("the median", () => {
  it("averages the two middle values on an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("takes the middle value on an odd count, whatever the input order", () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it("refuses an empty set", () => {
    expect(() => median([])).toThrow();
  });
});

describe("capability gap", () => {
  it("names the best-scoring configuration in each class", () => {
    const comparison = deriveComparison("gpqa-diamond", "GPQA Diamond", [
      comparisonRow({ providerModelId: "open-lo", displayName: "Open Low", score: 0.6 }),
      comparisonRow({ providerModelId: "open-hi", displayName: "Open High", score: 0.8 }),
      comparisonRow({ providerModelId: "prop", displayName: "Prop", score: 0.9, accessClass: "api_only_closed_weights" }),
    ]);
    expect(comparison.capabilityGap.openWeight?.label).toBe("Open High");
    expect(comparison.capabilityGap.proprietary?.label).toBe("Prop");
    expect(comparison.capabilityGap.gap).toBeCloseTo(0.1, 10);
  });

  it("reports a negative gap when open-weight leads", () => {
    const comparison = deriveComparison("b", "B", [
      comparisonRow({ providerModelId: "o", score: 0.9 }),
      comparisonRow({ providerModelId: "p", score: 0.7, accessClass: "api_only_closed_weights" }),
    ]);
    expect(comparison.capabilityGap.gap).toBeLessThan(0);
  });

  it("does not report a gap against an absent class", () => {
    // A gap measured against nothing would be an artefact of coverage, not a finding.
    const comparison = deriveComparison("b", "B", [comparisonRow()]);
    expect(comparison.capabilityGap.proprietary).toBeNull();
    expect(comparison.capabilityGap.gap).toBeNull();
  });

  it("breaks ties deterministically rather than on row order", () => {
    const rows = [
      comparisonRow({ providerModelId: "zeta", displayName: "Zeta", score: 0.7 }),
      comparisonRow({ providerModelId: "alpha", displayName: "Alpha", score: 0.7 }),
    ];
    expect(deriveComparison("b", "B", rows).capabilityGap.openWeight?.label).toBe("Alpha");
    expect(deriveComparison("b", "B", [...rows].reverse()).capabilityGap.openWeight?.label).toBe("Alpha");
  });
});

describe("price gap", () => {
  it("takes the threshold from the weaker of the two class frontiers", () => {
    const comparison = deriveComparison("b", "B", [
      comparisonRow({ providerModelId: "o", score: 0.7, blendedUsdPer1m: 1 }),
      comparisonRow({ providerModelId: "p", score: 0.9, blendedUsdPer1m: 10, accessClass: "api_only_closed_weights" }),
    ]);
    expect(comparison.priceGap.capabilityThreshold).toBe(0.7);
  });

  it("guarantees both sides are non-empty, because each class clears its own best", () => {
    const comparison = deriveComparison("b", "B", [
      comparisonRow({ providerModelId: "o", score: 0.2, blendedUsdPer1m: 1 }),
      comparisonRow({ providerModelId: "p", score: 0.95, blendedUsdPer1m: 20, accessClass: "api_only_closed_weights" }),
    ]);
    expect(comparison.priceGap.openWeight?.modelCount).toBe(1);
    expect(comparison.priceGap.proprietary?.modelCount).toBe(1);
    expect(comparison.priceGap.ratio).toBe(20);
  });

  it("excludes models below the band rather than letting a cheap tail set the median", () => {
    const comparison = deriveComparison("b", "B", [
      comparisonRow({ providerModelId: "cheap-weak", score: 0.1, blendedUsdPer1m: 0.01 }),
      comparisonRow({ providerModelId: "open-best", score: 0.8, blendedUsdPer1m: 2 }),
      comparisonRow({ providerModelId: "prop", score: 0.85, blendedUsdPer1m: 10, accessClass: "api_only_closed_weights" }),
    ]);
    expect(comparison.priceGap.capabilityThreshold).toBe(0.8);
    expect(comparison.priceGap.openWeight?.modelCount).toBe(1);
    expect(comparison.priceGap.openWeight?.medianBlendedUsdPer1m).toBe(2);
  });

  it("counts one model once, however many configurations it was evaluated at", () => {
    // Otherwise the median is weighted by how thoroughly the source happened to evaluate a
    // model, which is a property of the evaluator rather than of the market.
    const comparison = deriveComparison("b", "B", [
      comparisonRow({ providerModelId: "o", configuration: "low", score: 0.8, blendedUsdPer1m: 2 }),
      comparisonRow({ providerModelId: "o", configuration: "high", score: 0.9, blendedUsdPer1m: 2 }),
      comparisonRow({ providerModelId: "o2", score: 0.85, blendedUsdPer1m: 6 }),
      comparisonRow({ providerModelId: "p", score: 0.8, blendedUsdPer1m: 10, accessClass: "api_only_closed_weights" }),
    ]);
    expect(comparison.priceGap.openWeight?.modelCount).toBe(2);
    expect(comparison.priceGap.openWeight?.medianBlendedUsdPer1m).toBe(4);
  });

  it("does not compare against a class with no priced model in the band", () => {
    const comparison = deriveComparison("b", "B", [
      comparisonRow({ providerModelId: "o", score: 0.8, blendedUsdPer1m: 2 }),
      comparisonRow({ providerModelId: "p", score: 0.9, blendedUsdPer1m: null, accessClass: "api_only_closed_weights" }),
    ]);
    expect(comparison.priceGap.proprietary).toBeNull();
    expect(comparison.priceGap.ratio).toBeNull();
  });

  it("reports the newest price date it used", () => {
    const comparison = deriveComparison("b", "B", [
      comparisonRow({ priceAsOf: "2026-09-01" }),
      comparisonRow({ providerModelId: "p", priceAsOf: "2026-09-14", accessClass: "api_only_closed_weights" }),
    ]);
    expect(comparison.priceAsOf).toBe("2026-09-14");
  });
});

describe("what the derivation never does", () => {
  it("does not renormalise the known classes when much is unclassified", () => {
    // The whole failure mode in one test: with 80 % unclassified, open-weight is 10 %, not 50 %.
    const share = deriveVolumeShare(
      [
        volumeRow({ permaslug: "a", providerModelId: "a", tokens: 100n }),
        volumeRow({ permaslug: "b", providerModelId: "b", tokens: 100n, accessClass: "api_only_closed_weights" }),
        volumeRow({ permaslug: "other", isResidual: true, tokens: 800n, providerModelId: null, linkState: "unmapped", accessClass: null }),
      ],
      30,
    );
    const by = Object.fromEntries(share.slices.map((slice) => [slice.publicClass, slice.sharePercent]));
    expect(by.open_weight).toBe(10);
    expect(by.unclassified).toBe(80);
  });

  it("does not let an unevidenced link carry a model into a class", () => {
    const share = deriveVolumeShare(
      [volumeRow({ linkState: "ambiguous", providerModelId: "m", accessClass: "open_weights_unrestricted" })],
      30,
    );
    const by = Object.fromEntries(share.slices.map((slice) => [slice.publicClass, slice.sharePercent]));
    expect(by.open_weight).toBe(0);
    expect(by.unclassified).toBe(100);
  });
});
