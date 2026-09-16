import { describe, expect, it } from "vitest";

import { deriveAll, type JoinableRow } from "@/lib/frontier/read/derive";
import { accessKey, deriveComparison, deriveVolumeShare, median, type VolumeRow } from "@/lib/open-weight/derive";

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

/**
 * Comparison fixtures are built as Model Frontier's own joinable rows and pushed through its
 * own `deriveAll`, so these tests exercise the real Pareto rule rather than a hand-marked
 * `onFrontier`. If the frontier definition ever changes, these move with it -- which is the
 * whole point of not owning a second one.
 */
const joinable = (over: Partial<JoinableRow> = {}): JoinableRow => ({
  benchmarkSlug: "gpqa-diamond",
  sourceModelIdentifier: "model",
  sourceConfiguration: null,
  score: 0.5,
  scoreMin: 0,
  scoreMax: 1,
  capabilityAsOf: "2026-09-01",
  linkState: "evidenced",
  providerModelId: "model",
  providerSlug: "vendor",
  providerName: "Vendor",
  displayName: "Model",
  inputPrice: 1,
  outputPrice: 1,
  priceAsOf: "2026-09-14",
  ...over,
});

/** One model, one configuration, one price: the shorthand most of these tests need. */
const point = (id: string, score: number, price: number, over: Partial<JoinableRow> = {}) =>
  joinable({
    providerModelId: id,
    sourceModelIdentifier: id,
    displayName: id,
    score,
    inputPrice: price,
    outputPrice: price,
    ...over,
  });

const classes = (entries: [string, string][]) =>
  new Map(entries.map(([id, accessClass]) => [accessKey("vendor", id), accessClass]));

const OPEN = "open_weights_unrestricted";
const PROP = "api_only_closed_weights";

/** Derive the gpqa-diamond comparison from raw rows, through the production frontier. */
const comparisonOf = (rows: JoinableRow[], lookup: Map<string, string>) => {
  const view = deriveAll(rows).find((candidate) => candidate.slug === "gpqa-diamond")!;
  return deriveComparison(view, lookup);
};

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

  it("separates the five reasons volume is unclassified", () => {
    // They are not the same kind of thing: one names no model, one is research debt, one can
    // never be resolved, one is evidence work, one is a settled licence finding. A single
    // Unclassified number would hide which is growing.
    const share = deriveVolumeShare(
      [
        volumeRow({ permaslug: "other", isResidual: true, tokens: 100n, providerModelId: null, linkState: "unmapped", accessClass: null }),
        volumeRow({ permaslug: "who/knows", tokens: 400n, providerModelId: null, linkState: "unmapped", accessClass: null }),
        volumeRow({ permaslug: "stealth/x", tokens: 200n, providerModelId: null, linkState: "not_applicable", accessClass: null }),
        volumeRow({ permaslug: "v/m", tokens: 300n, providerModelId: "m", accessClass: "unknown" }),
        volumeRow({ permaslug: "v/nc", tokens: 500n, providerModelId: "nc", accessClass: "open_weights_noncommercial" }),
      ],
      30,
    );
    expect(share.unclassifiedBreakdown).toEqual({
      sourceAggregated: "100",
      unmapped: "400",
      unresolvableIdentity: "200",
      undeterminedAccess: "300",
      noncommercial: "500",
    });
  });

  it("does not describe a permanent alias as research Urdais has not done", () => {
    // The distinction the split exists for: a stealth endpoint names no model to look up, so
    // it must never be counted alongside permaslugs that a day's research could resolve.
    const share = deriveVolumeShare(
      [
        volumeRow({ permaslug: "stealth/ox-alpha", tokens: 560n, providerModelId: null, linkState: "not_applicable", accessClass: null }),
        volumeRow({ permaslug: "someone/new-model", tokens: 440n, providerModelId: null, linkState: "unmapped", accessClass: null }),
      ],
      30,
    );
    expect(share.unclassifiedBreakdown.unresolvableIdentity).toBe("560");
    expect(share.unclassifiedBreakdown.unmapped).toBe("440");
  });

  it("keeps the Unclassified total unchanged by the split", () => {
    // The refinement is explanatory. If it moved a token, it would be a methodology change.
    const share = deriveVolumeShare(
      [
        volumeRow({ permaslug: "other", isResidual: true, tokens: 100n, providerModelId: null, linkState: "unmapped", accessClass: null }),
        volumeRow({ permaslug: "a", tokens: 400n, providerModelId: null, linkState: "unmapped", accessClass: null }),
        volumeRow({ permaslug: "s", tokens: 200n, providerModelId: null, linkState: "not_applicable", accessClass: null }),
        volumeRow({ permaslug: "u", tokens: 300n, providerModelId: "u", accessClass: "unknown" }),
      ],
      30,
    );
    const b = share.unclassifiedBreakdown;
    const sum = BigInt(b.sourceAggregated) + BigInt(b.unmapped) + BigInt(b.unresolvableIdentity)
      + BigInt(b.undeterminedAccess) + BigInt(b.noncommercial);
    const unclassified = share.slices.find((slice) => slice.publicClass === "unclassified")!;
    expect(sum.toString()).toBe(unclassified.tokens);
  });

  it("does not count an unmapped permaslug as an unestablished access class", () => {
    // The distinction that matters operationally: identity work not done is not the same as
    // evidence work not done, and conflating them would misdirect the next hour of research.
    const share = deriveVolumeShare([volumeRow({ providerModelId: null, linkState: "unmapped", accessClass: null })], 30);
    expect(share.unclassifiedBreakdown.unmapped).toBe("1000");
    expect(share.unclassifiedBreakdown.undeterminedAccess).toBe("0");
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
    const comparison = comparisonOf(
      [point("open-lo", 0.6, 1), point("open-hi", 0.8, 2), point("prop", 0.9, 10)],
      classes([["open-lo", OPEN], ["open-hi", OPEN], ["prop", PROP]]),
    );
    expect(comparison.capabilityGap.openWeight?.label).toBe("open-hi");
    expect(comparison.capabilityGap.proprietary?.label).toBe("prop");
    expect(comparison.capabilityGap.gap).toBeCloseTo(0.1, 10);
  });

  it("reports a negative gap when open-weight leads", () => {
    const comparison = comparisonOf(
      [point("o", 0.9, 1), point("p", 0.7, 10)],
      classes([["o", OPEN], ["p", PROP]]),
    );
    expect(comparison.capabilityGap.gap).toBeLessThan(0);
  });

  it("does not report a gap against an absent class", () => {
    // A gap measured against nothing would be an artefact of coverage, not a finding.
    const comparison = comparisonOf([point("o", 0.8, 1)], classes([["o", OPEN]]));
    expect(comparison.capabilityGap.proprietary).toBeNull();
    expect(comparison.capabilityGap.gap).toBeNull();
  });

  it("breaks ties deterministically rather than on row order", () => {
    const rows = [point("zeta", 0.7, 1), point("alpha", 0.7, 1)];
    const lookup = classes([["zeta", OPEN], ["alpha", OPEN]]);
    expect(comparisonOf(rows, lookup).capabilityGap.openWeight?.label).toBe("alpha");
    expect(comparisonOf([...rows].reverse(), lookup).capabilityGap.openWeight?.label).toBe("alpha");
  });

  it("carries the best configuration's price, as the companion metric beside the ratio", () => {
    const comparison = comparisonOf(
      [point("o", 0.8, 2), point("p", 0.9, 10)],
      classes([["o", OPEN], ["p", PROP]]),
    );
    expect(comparison.capabilityGap.proprietary?.blendedUsdPer1m).toBe(10);
    expect(comparison.capabilityGap.openWeight?.blendedUsdPer1m).toBe(2);
  });
});

describe("price gap", () => {
  /** Three efficient configurations per class: the smallest publishable shape. */
  const publishable = () => {
    const rows = [
      point("o1", 0.50, 1), point("o2", 0.60, 2), point("o3", 0.70, 3),
      point("p1", 0.75, 10), point("p2", 0.85, 20), point("p3", 0.95, 30),
    ];
    const lookup = classes([
      ["o1", OPEN], ["o2", OPEN], ["o3", OPEN],
      ["p1", PROP], ["p2", PROP], ["p3", PROP],
    ]);
    return comparisonOf(rows, lookup);
  };

  it("takes its population from the Pareto frontier, with no capability threshold", () => {
    const comparison = publishable();
    // Every point here is efficient: each costs more and scores more than the last.
    expect(comparison.frontierConfigurations.open_weight).toBe(3);
    expect(comparison.frontierConfigurations.proprietary).toBe(3);
    expect(comparison.priceGap.openWeight?.medianBlendedUsdPer1m).toBe(2);
    expect(comparison.priceGap.proprietary?.medianBlendedUsdPer1m).toBe(20);
    expect(comparison.priceGap.ratio).toBe(10);
    expect(comparison.priceGap.ratioPublishable).toBe(true);
  });

  it("excludes dominated configurations, because the frontier already did", () => {
    // `o-bad` is more expensive and less capable than `o2`, so it is off the frontier and
    // must not drag the median. Nothing in this module filters it: markFrontier did.
    const rows = [
      point("o1", 0.50, 1), point("o2", 0.60, 2), point("o3", 0.70, 3), point("o-bad", 0.55, 9),
      point("p1", 0.75, 10), point("p2", 0.85, 20), point("p3", 0.95, 30),
    ];
    const lookup = classes([
      ["o1", OPEN], ["o2", OPEN], ["o3", OPEN], ["o-bad", OPEN],
      ["p1", PROP], ["p2", PROP], ["p3", PROP],
    ]);
    const comparison = comparisonOf(rows, lookup);
    expect(comparison.configurations.open_weight).toBe(4);
    expect(comparison.frontierConfigurations.open_weight).toBe(3);
    expect(comparison.priceGap.openWeight?.configurationCount).toBe(3);
    expect(comparison.priceGap.openWeight?.medianBlendedUsdPer1m).toBe(2);
  });

  it("counts configurations, not models, and never collapses them first", () => {
    // One model at three efforts, all efficient, is three members of the frontier. Collapsing
    // it to one price would change the population the median describes.
    const rows = [
      point("o", 0.50, 1, { sourceConfiguration: "low", sourceModelIdentifier: "o_low" }),
      point("o", 0.60, 1, { sourceConfiguration: "med", sourceModelIdentifier: "o_med" }),
      point("o", 0.70, 1, { sourceConfiguration: "high", sourceModelIdentifier: "o_high" }),
      point("p1", 0.75, 10), point("p2", 0.85, 20), point("p3", 0.95, 30),
    ];
    const lookup = classes([["o", OPEN], ["p1", PROP], ["p2", PROP], ["p3", PROP]]);
    const comparison = comparisonOf(rows, lookup);
    // Same price, rising score: only the best is undominated at that x.
    expect(comparison.frontierConfigurations.open_weight).toBe(1);
    expect(comparison.priceGap.openWeight?.configurationCount).toBe(1);
    expect(comparison.priceGap.ratioPublishable).toBe(false);
  });

  it("keeps every efficient configuration of one model when each is undominated", () => {
    const rows = [
      point("o", 0.50, 1, { sourceConfiguration: "low", sourceModelIdentifier: "o_low" }),
      point("o2", 0.60, 2), point("o3", 0.70, 3),
      point("p1", 0.75, 10), point("p2", 0.85, 20), point("p3", 0.95, 30),
    ];
    const lookup = classes([["o", OPEN], ["o2", OPEN], ["o3", OPEN], ["p1", PROP], ["p2", PROP], ["p3", PROP]]);
    expect(comparisonOf(rows, lookup).priceGap.openWeight?.configurationCount).toBe(3);
  });

  it("publishes no ratio below three efficient configurations in either class", () => {
    const rows = [
      point("o1", 0.50, 1), point("o2", 0.60, 2),
      point("p1", 0.75, 10), point("p2", 0.85, 20), point("p3", 0.95, 30),
    ];
    const lookup = classes([["o1", OPEN], ["o2", OPEN], ["p1", PROP], ["p2", PROP], ["p3", PROP]]);
    const comparison = comparisonOf(rows, lookup);
    expect(comparison.priceGap.openWeight?.configurationCount).toBe(2);
    expect(comparison.priceGap.ratioPublishable).toBe(false);
    // Not merely hidden: never computed, so no careless render can surface it.
    expect(comparison.priceGap.ratio).toBeNull();
  });

  it("still reports each class's sample and median when the ratio is withheld", () => {
    const rows = [
      point("o1", 0.50, 1), point("o2", 0.60, 2),
      point("p1", 0.75, 10), point("p2", 0.85, 20), point("p3", 0.95, 30),
    ];
    const lookup = classes([["o1", OPEN], ["o2", OPEN], ["p1", PROP], ["p2", PROP], ["p3", PROP]]);
    const comparison = comparisonOf(rows, lookup);
    expect(comparison.priceGap.openWeight?.medianBlendedUsdPer1m).toBe(1.5);
    expect(comparison.priceGap.proprietary?.configurationCount).toBe(3);
  });

  it("does not compare against a class with no efficient configuration at all", () => {
    const rows = [point("o1", 0.50, 1), point("o2", 0.60, 2), point("o3", 0.70, 3)];
    const comparison = comparisonOf(rows, classes([["o1", OPEN], ["o2", OPEN], ["o3", OPEN]]));
    expect(comparison.priceGap.proprietary).toBeNull();
    expect(comparison.priceGap.ratio).toBeNull();
    expect(comparison.priceGap.ratioPublishable).toBe(false);
  });

  it("counts unclassified configurations without letting them into either side", () => {
    const rows = [
      point("o1", 0.50, 1), point("o2", 0.60, 2), point("o3", 0.70, 3),
      point("p1", 0.75, 10), point("p2", 0.85, 20), point("p3", 0.95, 30),
      point("nc", 0.99, 40), point("mystery", 0.40, 0.5),
    ];
    const lookup = classes([
      ["o1", OPEN], ["o2", OPEN], ["o3", OPEN],
      ["p1", PROP], ["p2", PROP], ["p3", PROP],
      ["nc", "open_weights_noncommercial"],
      // `mystery` is deliberately absent from the lookup: no row at all.
    ]);
    const comparison = comparisonOf(rows, lookup);
    expect(comparison.configurations.unclassified).toBe(2);
    expect(comparison.priceGap.openWeight?.configurationCount).toBe(3);
    expect(comparison.priceGap.proprietary?.configurationCount).toBe(3);
    // The non-commercial model is the most capable thing on the benchmark and still does not
    // become the open-weight frontier.
    expect(comparison.capabilityGap.openWeight?.label).toBe("o3");
  });

  it("reports the newest price date the frontier used", () => {
    const comparison = comparisonOf([point("o", 0.5, 1)], classes([["o", OPEN]]));
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

  it("does not count non-commercial weights as open-weight volume", () => {
    // Downloadable, and not usable for the commercial inference this section measures.
    const share = deriveVolumeShare(
      [
        volumeRow({ permaslug: "a", providerModelId: "a", tokens: 400n }),
        volumeRow({ permaslug: "nc", providerModelId: "nc", tokens: 600n, accessClass: "open_weights_noncommercial" }),
      ],
      30,
    );
    const by = Object.fromEntries(share.slices.map((slice) => [slice.publicClass, slice.sharePercent]));
    expect(by.open_weight).toBe(40);
    expect(by.unclassified).toBe(60);
    // Separated from `undetermined`, because it is a finding rather than missing work.
    expect(share.unclassifiedBreakdown.noncommercial).toBe("600");
    expect(share.unclassifiedBreakdown.undeterminedAccess).toBe("0");
  });
});
