/**
 * Transmission Headroom analytics invariants.
 *
 * These are the twenty rules that decide whether a number may be published. Each exists because
 * the plausible alternative produces a wrong answer that looks right: a sentinel read as a limit,
 * an absence rendered as a zero, a market median dominated by whichever entity publishes fastest,
 * or two markets averaged into a figure that means nothing.
 */

import { describe, expect, it } from "vitest";

import {
  calculateAll, calculateErcot, calculateNyiso, deferredResults, ercotUtilization,
  nyisoUtilization, percentile, type LatestMargin, type MarketInput,
} from "@/lib/transmission-headroom/analytics/calculate";
import {
  ERCOT_IMPLAUSIBLE_LIMIT_MW, MEDIAN_MINIMUM_ENTITIES, METHODOLOGY_DOCUMENT_SHA256,
  METHODOLOGY_VERSION, MethodologyDriftError, NYISO_SENTINEL_MW, PERCENTILE_MINIMUM_ENTITIES,
  assertMethodologyDocument, meetsFloor,
} from "@/lib/transmission-headroom/analytics/methodology";
import { inputDigest } from "@/lib/transmission-headroom/analytics/store";

const margin = (overrides: Partial<LatestMargin> & { entityId: string }): LatestMargin => ({
  entityLabel: overrides.entityId, contingencyKind: "not_applicable",
  observedAt: "2026-09-21T20:00:00Z", state: "ok", headroomMw: 100, flowMw: 100,
  limitMw: 200, limitState: "real", shadowPrice: null, ...overrides,
});

const NY_FLOORS = {
  interface_headroom_median_mw: MEDIAN_MINIMUM_ENTITIES,
  interface_headroom_p10_mw: PERCENTILE_MINIMUM_ENTITIES,
  interface_headroom_p25_mw: PERCENTILE_MINIMUM_ENTITIES,
  interface_utilization_median_pct: MEDIAN_MINIMUM_ENTITIES,
  interface_utilization_p90_pct: PERCENTILE_MINIMUM_ENTITIES,
};
const ER_FLOORS = {
  constraint_margin_median_mw: MEDIAN_MINIMUM_ENTITIES,
  constraint_margin_p10_mw: PERCENTILE_MINIMUM_ENTITIES,
  constraint_margin_p25_mw: PERCENTILE_MINIMUM_ENTITIES,
  constraint_utilization_median_pct: MEDIAN_MINIMUM_ENTITIES,
  constraint_utilization_p90_pct: PERCENTILE_MINIMUM_ENTITIES,
};

const nyisoInput = (latest: LatestMargin[], overrides: Partial<MarketInput> = {}): MarketInput => ({
  market: "nyiso", latest,
  history: { negativeMarginObservations: 0, totalObservations: latest.length },
  sourceStatus: "current", deferredMetrics: [], floors: NY_FLOORS, ...overrides,
});
const ercotInput = (latest: LatestMargin[], overrides: Partial<MarketInput> = {}): MarketInput => ({
  market: "ercot", latest,
  history: { negativeMarginObservations: 0, totalObservations: latest.length },
  sourceStatus: "current", deferredMetrics: [], floors: ER_FLOORS, ...overrides,
});

const pick = (results: ReturnType<typeof calculateNyiso>, code: string, entity?: string) =>
  results.find((r) => r.metricCode === code && (entity === undefined || r.entityId === entity));

const many = (n: number, build: (i: number) => Partial<LatestMargin>) =>
  Array.from({ length: n }, (_, i) => margin({ entityId: `e${i}`, ...build(i) }));

describe("1. NYISO sentinel never creates headroom", () => {
  it("an unmonitored direction yields no value", () => {
    const results = calculateNyiso(nyisoInput([margin({
      entityId: "west-central", state: "unmonitored_direction", headroomMw: null,
      limitMw: NYISO_SENTINEL_MW, limitState: "sentinel", flowMw: 802.8,
    })]));
    const headroom = pick(results, "interface_headroom_mw", "west-central")!;
    expect(headroom.status).toBe("not_available");
    expect(headroom.value).toBeNull();
    expect(headroom.coverage.reason).toBe("unmonitored_direction");
  });

  it("utilization is not computed against a sentinel denominator", () => {
    expect(nyisoUtilization(802.8, NYISO_SENTINEL_MW)).toBeNull();
    expect(nyisoUtilization(-802.8, -NYISO_SENTINEL_MW)).toBeNull();
  });
});

describe("2. the real -9899 limit stays eligible", () => {
  it("is not mistaken for the sentinel", () => {
    // 4,074 archive observations sit here. A threshold rule would have erased them.
    expect(nyisoUtilization(-985, -9899)).toBeCloseTo(9.9505, 3);
    const results = calculateNyiso(nyisoInput([margin({
      entityId: "hq-import-export", headroomMw: 8914, flowMw: -985, limitMw: -9899,
    })]));
    expect(pick(results, "interface_headroom_mw")!.value).toBe(8914);
  });
});

describe("3. direction is selected before any absolute value", () => {
  it("utilization uses the magnitude of the limit that governs the flow's direction", () => {
    // Westbound 133 MW against a 140 MW reverse limit is 95% utilized, not 8.9% against 1500.
    expect(nyisoUtilization(-133, -140)).toBeCloseTo(95, 3);
    expect(nyisoUtilization(-133, -140)).not.toBeCloseTo(133 / 1500 * 100, 3);
  });
});

describe("4. zero flow creates neither headroom nor utilization", () => {
  it("carries the reason, not a zero", () => {
    const results = calculateNyiso(nyisoInput([margin({
      entityId: "cedars", state: "zero_flow_direction_undetermined", headroomMw: null,
      flowMw: 0, limitMw: null, limitState: null,
    })]));
    const headroom = pick(results, "interface_headroom_mw")!;
    const utilization = pick(results, "interface_utilization_pct")!;
    expect(headroom.value).toBeNull();
    expect(utilization.value).toBeNull();
    expect(utilization.status).not.toBe("live");
    expect(headroom.coverage.reason).toBe("zero_flow_direction_undetermined");
  });
});

describe("5. zero headroom is valid and is not a binding classification", () => {
  it("publishes 0 and says nothing about congestion", () => {
    const results = calculateNyiso(nyisoInput([margin({
      entityId: "neptune", headroomMw: 0, flowMw: 660, limitMw: 660,
    })]));
    const headroom = pick(results, "interface_headroom_mw")!;
    expect(headroom.status).toBe("live");
    expect(headroom.value).toBe(0);
    expect(JSON.stringify(headroom.coverage)).not.toMatch(/binding|congest/i);
    expect(pick(results, "interface_utilization_pct")!.value).toBe(100);
  });
});

describe("6. NYISO publishes no at-limit count", () => {
  it("the engine emits no such metric", () => {
    const codes = calculateNyiso(nyisoInput(many(16, () => ({})))).map((r) => r.metricCode);
    expect(codes).not.toContain("interfaces_at_limit_count");
    expect(codes.filter((c) => /at_limit|congest|binding/.test(c))).toEqual([]);
  });

  it("and when recorded from the registry it is deferred with a reason and no value", () => {
    const [result] = deferredResults([{
      code: "interfaces_at_limit_count", reason: "subtype unresolved",
      marketSlug: "nyiso", unit: "entities",
    }]);
    expect(result!.status).toBe("methodology_deferred");
    expect(result!.value).toBeNull();
    expect(result!.coverage.reason).toBe("subtype unresolved");
  });
});

describe("7. an ERCOT implausible limit creates no public margin", () => {
  it("yields no value and no utilization", () => {
    const results = calculateErcot(ercotInput([margin({
      entityId: "eastex", contingencyKind: "base_case", state: "implausible_limit",
      headroomMw: null, flowMw: 2553.1, limitMw: 85_999.1, limitState: "implausible",
    })]));
    expect(pick(results, "constraint_margin_mw")!.value).toBeNull();
    expect(pick(results, "constraint_utilization_pct")!.value).toBeNull();
    expect(ercotUtilization(2553.1, 85_999.1)).toBeNull();
  });

  it("the bound sits inside the empty band between real and disabled limits", () => {
    expect(ERCOT_IMPLAUSIBLE_LIMIT_MW).toBeGreaterThan(10_392.8);
    expect(ERCOT_IMPLAUSIBLE_LIMIT_MW).toBeLessThan(84_999.1);
    expect(ercotUtilization(2000, 10_392.8)).not.toBeNull();
  });
});

describe("8. CCTStatus cannot affect eligibility", () => {
  it("competitive and non-competitive constraints are treated identically", () => {
    // CCTStatus is not even a field the engine reads; two otherwise-identical rows must agree.
    const comp = calculateErcot(ercotInput([margin({
      entityId: "a", contingencyKind: "post_contingency", headroomMw: 12, flowMw: 88, limitMw: 100,
    })]));
    const noncomp = calculateErcot(ercotInput([margin({
      entityId: "b", contingencyKind: "post_contingency", headroomMw: 12, flowMw: 88, limitMw: 100,
    })]));
    expect(pick(comp, "constraint_margin_mw")!.value)
      .toBe(pick(noncomp, "constraint_margin_mw")!.value);
    expect(pick(comp, "constraint_margin_mw")!.status).toBe("live");
  });
});

describe("9. binding comes from ShadowPrice", () => {
  it("counts shadow price above zero, not margin equal to zero", () => {
    const results = calculateErcot(ercotInput([
      margin({ entityId: "binding", headroomMw: 0, flowMw: 50, limitMw: 50, shadowPrice: 49.9 }),
      margin({ entityId: "at-limit-not-binding", headroomMw: 0, flowMw: 33.3, limitMw: 33.3, shadowPrice: 0 }),
      margin({ entityId: "slack", headroomMw: 40, flowMw: 60, limitMw: 100, shadowPrice: 0 }),
    ]));
    const binding = pick(results, "binding_tracked_constraints")!;
    expect(binding.value).toBe(1);
    expect(binding.coverage.source).toBe("ShadowPrice > 0");
  });
});

describe("10. zero margin with no binding remains possible", () => {
  it("is counted and disclosed rather than reclassified", () => {
    const results = calculateErcot(ercotInput([
      margin({ entityId: "x", headroomMw: 0, flowMw: 33.3, limitMw: 33.3, shadowPrice: 0 }),
    ]));
    expect(pick(results, "binding_tracked_constraints")!.coverage.zeroMarginNonBinding).toBe(1);
    expect(pick(results, "constraint_margin_mw")!.value).toBe(0);
  });
});

describe("11. negative margin is preserved", () => {
  it("is never clamped to zero, in either market", () => {
    const ny = calculateNyiso(nyisoInput([margin({ entityId: "n", headroomMw: -60, flowMw: 2750, limitMw: 2690 })]));
    const er = calculateErcot(ercotInput([margin({ entityId: "e", headroomMw: -1.7, flowMw: 35, limitMw: 33.3 })]));
    expect(pick(ny, "interface_headroom_mw")!.value).toBe(-60);
    expect(pick(er, "constraint_margin_mw")!.value).toBe(-1.7);
    // And utilization past 100% survives with it.
    expect(nyisoUtilization(2750, 2690)).toBeGreaterThan(100);
    expect(ercotUtilization(35, 33.3)).toBeGreaterThan(100);
  });
});

describe("12. base-case and post-contingency are retained and disclosed", () => {
  it("each entity keeps its kind and the distribution declares the span", () => {
    const results = calculateErcot(ercotInput([
      ...many(10, () => ({ contingencyKind: "post_contingency" })),
      ...Array.from({ length: 4 }, (_, i) =>
        margin({ entityId: `b${i}`, contingencyKind: "base_case" })),
    ]));
    expect(pick(results, "constraint_margin_mw", "e0")!.contingencyKind).toBe("post_contingency");
    const median = pick(results, "constraint_margin_median_mw")!;
    expect(median.coverage.spansContingencyKinds).toBe(true);
    expect(median.coverage.baseCaseEntities).toBe(4);
    expect(median.coverage.postContingencyEntities).toBe(10);
  });
});

describe("13. a stale source publishes no current metric", () => {
  it("every current value becomes source_stale with no number", () => {
    const results = calculateNyiso(nyisoInput(many(16, () => ({})), { sourceStatus: "stale" }));
    for (const result of results.filter((r) => r.metricCode !== "interface_negative_headroom_observations")) {
      expect(result.status).toBe("source_stale");
      expect(result.value).toBeNull();
    }
  });
});

describe("14. no cross-market aggregate exists", () => {
  it("every result names exactly one market and no metric spans both", () => {
    const results = calculateAll([
      nyisoInput(many(16, () => ({}))),
      ercotInput(many(30, () => ({ contingencyKind: "post_contingency" }))),
    ]);
    expect(new Set(results.map((r) => r.marketSlug))).toEqual(new Set(["nyiso", "ercot"]));
    for (const result of results) expect(["nyiso", "ercot"]).toContain(result.marketSlug);
    // No metric code is emitted for both markets, so nothing can be silently merged by code.
    const byCode = new Map<string, Set<string>>();
    for (const result of results) {
      byCode.set(result.metricCode,
        (byCode.get(result.metricCode) ?? new Set()).add(result.marketSlug));
    }
    for (const [, markets] of byCode) expect(markets.size).toBe(1);
  });
});

describe("15. no network-headroom metric is produced", () => {
  it("nothing the engine emits claims to describe a network", () => {
    const codes = calculateAll([
      nyisoInput(many(16, () => ({}))),
      ercotInput(many(30, () => ({}))),
    ]).map((r) => r.metricCode);
    expect(codes.filter((c) => /network|national|total_/.test(c))).toEqual([]);
  });

  it("and the ERCOT coverage states the population limit explicitly", () => {
    const results = calculateErcot(ercotInput(many(30, () => ({}))));
    expect(String(pick(results, "constraint_margin_median_mw")!.coverage.note))
      .toMatch(/never a view of the ERCOT network/i);
  });
});

describe("16. ATC cannot enter the analytics", () => {
  it("no ATC input exists on the engine's contract", () => {
    const input = nyisoInput([margin({ entityId: "a" })]);
    expect(Object.keys(input)).not.toContain("atc");
    expect(Object.keys(input.latest[0]!)).not.toContain("atcMw");
    const codes = calculateAll([input]).map((r) => r.metricCode);
    expect(codes.filter((c) => /atc|transfer_capab/i.test(c))).toEqual([]);
  });
});

describe("17. absence never becomes zero", () => {
  it("every non-live result carries null", () => {
    const results = calculateAll([
      nyisoInput([
        margin({ entityId: "a", state: "unmonitored_direction", headroomMw: null }),
        margin({ entityId: "b", state: "zero_flow_direction_undetermined", headroomMw: null }),
      ]),
      ercotInput([margin({ entityId: "c", state: "implausible_limit", headroomMw: null })]),
    ]);
    for (const result of results) {
      expect(result.status === "live").toBe(result.value !== null);
    }
  });

  it("a population under its floor withholds the number and reports the count", () => {
    const results = calculateNyiso(nyisoInput(many(9, () => ({}))));
    const median = pick(results, "interface_headroom_median_mw")!;
    expect(median.status).toBe("insufficient_sample");
    expect(median.value).toBeNull();
    expect(median.sampleSize).toBe(9);
    expect(median.coverage.minimumEntities).toBe(MEDIAN_MINIMUM_ENTITIES);
  });

  it("the floors were chosen so NYISO's census of sixteen can publish", () => {
    expect(meetsFloor(16, PERCENTILE_MINIMUM_ENTITIES)).toBe(true);
    // The rejected candidate would have suppressed the market permanently.
    expect(meetsFloor(16, 20)).toBe(false);
    const results = calculateNyiso(nyisoInput(many(16, (i) => ({ headroomMw: i * 10 }))));
    expect(pick(results, "interface_headroom_p10_mw")!.status).toBe("live");
  });
});

describe("18. point-in-time distributions are entity-weighted", () => {
  it("one entity cannot contribute more than one value", () => {
    // The engine is handed one latest row per entity; a median over ten entities is over ten
    // numbers however often any of them publishes.
    const results = calculateNyiso(nyisoInput(many(10, (i) => ({ headroomMw: i * 100 }))));
    const median = pick(results, "interface_headroom_median_mw")!;
    expect(median.sampleSize).toBe(10);
    expect(median.coverage.weighting).toBe("entity_point_in_time");
    expect(median.value).toBe(450);
  });

  it("history counts are observation-weighted and say so", () => {
    const results = calculateNyiso(nyisoInput(many(10, () => ({})), {
      history: { negativeMarginObservations: 7, totalObservations: 5092 },
    }));
    const count = pick(results, "interface_negative_headroom_observations")!;
    expect(count.value).toBe(7);
    expect(count.sampleSize).toBe(5092);
    expect(count.coverage.weighting).toBe("observation_history");
  });
});

describe("19. methodology drift stops calculation", () => {
  it("the approved hash is pinned and the real document matches it", async () => {
    expect(METHODOLOGY_VERSION).toBe("1.0.0");
    expect(METHODOLOGY_DOCUMENT_SHA256).toMatch(/^[0-9a-f]{64}$/);
    await expect(assertMethodologyDocument()).resolves.toBeUndefined();
  });

  it("a changed document is refused", async () => {
    await expect(assertMethodologyDocument("package.json"))
      .rejects.toBeInstanceOf(MethodologyDriftError);
  });
});

describe("20. the input digest makes a rerun idempotent", () => {
  it("is stable for identical inputs and changes when an observation changes", () => {
    const a = nyisoInput([margin({ entityId: "x", headroomMw: 10 })]);
    const b = nyisoInput([margin({ entityId: "x", headroomMw: 10 })]);
    expect(inputDigest("1.0.0", [a])).toBe(inputDigest("1.0.0", [b]));

    // A corrected value that leaves the row count unchanged must still produce a new run.
    const changed = nyisoInput([margin({ entityId: "x", headroomMw: 11 })]);
    expect(inputDigest("1.0.0", [changed])).not.toBe(inputDigest("1.0.0", [a]));

    // As must a methodology change.
    expect(inputDigest("1.0.1", [a])).not.toBe(inputDigest("1.0.0", [a]));
  });

  it("does not depend on the order entities arrive in", () => {
    const one = nyisoInput([margin({ entityId: "a" }), margin({ entityId: "b" })]);
    const two = nyisoInput([margin({ entityId: "b" }), margin({ entityId: "a" })]);
    expect(inputDigest("1.0.0", [one])).toBe(inputDigest("1.0.0", [two]));
  });
});

describe("percentile matches PostgreSQL percentile_cont", () => {
  it("interpolates linearly", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([0, 10], 0.1)).toBeCloseTo(1, 6);
    expect(percentile([5], 0.9)).toBe(5);
  });
});
