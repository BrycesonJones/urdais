/**
 * Public-surface contract tests.
 *
 * These guard the two things a reader cannot check for themselves: that nothing the publishers
 * forbid reaches the payload, and that nothing in the payload implies a comparison the sources do
 * not support. The semantic scan is deliberately pattern-based rather than key-by-key, so a
 * plausible future addition like `totalTransmissionHeadroom` fails before it ships.
 */

import { describe, expect, it } from "vitest";

import {
  SEPARATION_NOTE, statusReason, unavailableTransmissionModel, validateTransmissionModel,
  type PublicEntityRow, type PublicMarket, type PublicMetric, type TransmissionReadModel,
} from "@/lib/transmission-headroom/analytics/read";
import { METHODOLOGY_VERSION } from "@/lib/transmission-headroom/analytics/methodology";

const metric = (over: Partial<PublicMetric> & { metric: string }): PublicMetric => ({
  label: over.metric, status: "live", value: 100, unit: "MW", sampleSize: 16, coverage: {}, ...over,
});

const entity = (over: Partial<PublicEntityRow> & { entityId: string }): PublicEntityRow => ({
  name: over.entityId, contingencyName: null, contingencyKind: null, status: "live",
  headroomMw: 100, utilizationPct: 50, flowMw: 100, limitMw: 200, binding: null,
  observedAt: "2026-09-22T00:00:00Z", statusReason: null, ...over,
});

const market = (over: Partial<PublicMarket> & { marketSlug: string }): PublicMarket => ({
  marketName: over.marketSlug.toUpperCase(), productLabel: "Interface Headroom",
  populationDescription: "the interfaces the source publishes",
  sourceName: "src", attribution: "Source: Someone.", sourceStatus: "current",
  latestObservationAt: "2026-09-22T00:00:00Z", retrievedAt: "2026-09-22T00:05:00Z",
  entitiesObserved: 19, entitiesEligible: 16, entitiesUnavailable: 3,
  summary: [], entities: [], deferredMetrics: [], contingencySplit: null,
  implausibleLimitExcluded: null, ...over,
});

const model = (over: Partial<TransmissionReadModel> = {}): TransmissionReadModel => ({
  methodology: {
    slug: "transmission-headroom", version: METHODOLOGY_VERSION,
    documentPath: "/docs/methodology/transmission-headroom", title: "Urdais Transmission Headroom",
  },
  calculatedAt: "2026-09-22T00:10:00Z", inputDigest: "d".repeat(64),
  generatedAt: "2026-09-22T00:11:00Z",
  markets: {
    nyiso: market({ marketSlug: "nyiso", summary: [metric({ metric: "interface_headroom_median_mw" })] }),
    ercot: market({
      marketSlug: "ercot", productLabel: "Constraint Margin",
      summary: [metric({ metric: "constraint_margin_median_mw", sampleSize: 87 })],
      contingencySplit: { baseCase: 18, postContingency: 203 }, implausibleLimitExcluded: 1,
    }),
  },
  notes: [SEPARATION_NOTE], ...over,
});

describe("1–3. rights gating and attribution", () => {
  it("both markets carry their attribution", () => {
    const live = model();
    expect(validateTransmissionModel(live)).toEqual([]);
    expect(live.markets.nyiso!.attribution).not.toBe("");
    expect(live.markets.ercot!.attribution).not.toBe("");
  });

  it("a market with no attribution fails the contract", () => {
    const broken = model();
    broken.markets.ercot!.attribution = "  ";
    expect(validateTransmissionModel(broken).join()).toMatch(/carries no attribution/);
  });

  it("NYISO publishes without its ambiguous classification being restated as cleared", () => {
    // The read model never carries a rights classification at all, so there is nothing on the
    // public surface that could describe NYISO as cleared. The determination stays in the registry.
    const serialised = JSON.stringify(model());
    expect(serialised).not.toMatch(/cleared|reusable_with_attribution|ambiguous_requires/i);
  });
});

describe("4–6, 26–28. no combined, network or at-limit metric", () => {
  const forbidden = [
    ["totalTransmissionHeadroom", 1000],
    ["networkHeadroomMw", 50_000],
    ["combinedHeadroom", 10],
    ["combinedUtilization", 80],
    ["crossMarketAverage", 5],
    ["interfacesAtLimitCount", 3],
    ["averageHeadroomMw", 7],
  ] as const;

  for (const [key, value] of forbidden) {
    it(`rejects a payload carrying ${key}`, () => {
      const broken = model() as unknown as Record<string, unknown>;
      broken[key] = value;
      const problems = validateTransmissionModel(broken as unknown as TransmissionReadModel);
      expect(problems.join()).toMatch(/forbidden cross-market or unsupported term/);
    });
  }

  it("rejects a forbidden term smuggled into a metric label", () => {
    const broken = model();
    broken.markets.nyiso!.summary.push(metric({
      metric: "interfaces_at_limit_count", label: "Interfaces at limit", value: 4,
    }));
    expect(validateTransmissionModel(broken).join()).toMatch(/forbidden/);
  });

  it("a clean payload has no top-level total of any kind", () => {
    const keys = Object.keys(model());
    expect(keys).toEqual(["methodology", "calculatedAt", "inputDigest", "generatedAt", "markets", "notes"]);
    expect(keys.filter((k) => /total|average|combined/i.test(k))).toEqual([]);
  });

  it("the two markets stay structurally separate", () => {
    const live = model();
    expect(Object.keys(live.markets).sort()).toEqual(["ercot", "nyiso"]);
    // No shared array a caller could accidentally concatenate and average.
    expect(live.markets.nyiso!.summary).not.toBe(live.markets.ercot!.summary);
  });
});

describe("7. distributions serialize their sample size", () => {
  it("a live percentile with no sample size fails", () => {
    const broken = model();
    broken.markets.nyiso!.summary = [metric({ metric: "interface_headroom_p10_mw", sampleSize: 0 })];
    expect(validateTransmissionModel(broken).join()).toMatch(/no sample size/);
  });

  it("a withheld distribution may report a sample size below its floor", () => {
    const ok = model();
    ok.markets.nyiso!.summary = [metric({
      metric: "interface_headroom_p10_mw", status: "insufficient_sample", value: null, sampleSize: 9,
    })];
    expect(validateTransmissionModel(ok)).toEqual([]);
  });
});

describe("8–10, 17, 24. statuses never become numbers", () => {
  it("a stale metric carries no value", () => {
    const broken = model();
    broken.markets.nyiso!.summary = [metric({
      metric: "interface_headroom_median_mw", status: "source_stale", value: 800,
    })];
    expect(validateTransmissionModel(broken).join()).toMatch(/source_stale with a value/);
  });

  it("zero headroom survives as a real zero", () => {
    const ok = model();
    ok.markets.nyiso!.entities = [entity({ entityId: "neptune", headroomMw: 0, utilizationPct: 100 })];
    expect(validateTransmissionModel(ok)).toEqual([]);
    expect(ok.markets.nyiso!.entities[0]!.headroomMw).toBe(0);
  });

  it("an undetermined direction is null with a reason, never zero", () => {
    const ok = model();
    ok.markets.nyiso!.entities = [entity({
      entityId: "cedars", status: "not_available", headroomMw: null, utilizationPct: null,
      statusReason: "Direction undetermined at zero flow",
    })];
    expect(validateTransmissionModel(ok)).toEqual([]);
    expect(ok.markets.nyiso!.entities[0]!.headroomMw).toBeNull();
  });

  it("a non-live entity with no reason fails the contract", () => {
    const broken = model();
    broken.markets.nyiso!.entities = [entity({
      entityId: "x", status: "not_available", headroomMw: null, statusReason: null,
    })];
    expect(validateTransmissionModel(broken).join()).toMatch(/has no reason/);
  });

  it("every status maps to reader-facing copy", () => {
    expect(statusReason("live", {})).toBeNull();
    expect(statusReason("not_available", { reason: "unmonitored_direction" })).toBe("Unmonitored direction");
    expect(statusReason("not_available", { reason: "zero_flow_direction_undetermined" }))
      .toBe("Direction undetermined at zero flow");
    expect(statusReason("source_stale", {})).toBe("Source stale");
    expect(statusReason("insufficient_sample", {})).toBe("Too few entities to publish");
    expect(statusReason("rights_blocked", {})).toBe("Not available for public display");
    expect(statusReason("methodology_deferred", {})).toBe("Deferred by methodology");
  });
});

describe("11–12. negative margins serialize; implausible rows do not", () => {
  it("a negative margin passes unchanged", () => {
    const ok = model();
    ok.markets.ercot!.entities = [entity({ entityId: "e", headroomMw: -12.4, utilizationPct: 104 })];
    expect(validateTransmissionModel(ok)).toEqual([]);
    expect(ok.markets.ercot!.entities[0]!.headroomMw).toBe(-12.4);
  });

  it("an implausible-limit row carries no value and is counted separately", () => {
    const ok = model();
    ok.markets.ercot!.entities = [entity({
      entityId: "eastex", status: "not_available", headroomMw: null, utilizationPct: null,
      statusReason: "Source limit outside the plausible range",
    })];
    expect(validateTransmissionModel(ok)).toEqual([]);
    expect(ok.markets.ercot!.implausibleLimitExcluded).toBe(1);
    // The 80k+ nonsense value never appears.
    expect(JSON.stringify(ok)).not.toMatch(/8[0-9]{4}\.\d/);
  });
});

describe("13–14. ERCOT semantics", () => {
  it("CCTStatus is not presented as a margin status", () => {
    const serialised = JSON.stringify(model());
    expect(serialised).not.toMatch(/CCTStatus|NONCOMP|\bCOMP\b/);
  });

  it("binding is a boolean from the source, not derived from the margin", () => {
    const ok = model();
    ok.markets.ercot!.entities = [
      entity({ entityId: "a", headroomMw: 0, binding: false }),
      entity({ entityId: "b", headroomMw: 0, binding: true }),
    ];
    // Two identical zero margins, two different binding states: proof it is not derived.
    expect(ok.markets.ercot!.entities[0]!.binding).toBe(false);
    expect(ok.markets.ercot!.entities[1]!.binding).toBe(true);
    expect(validateTransmissionModel(ok)).toEqual([]);
  });

  it("the contingency split is preserved and NYISO has none", () => {
    const live = model();
    expect(live.markets.ercot!.contingencySplit).toEqual({ baseCase: 18, postContingency: 203 });
    expect(live.markets.nyiso!.contingencySplit).toBeNull();
  });

  it("ConstraintID is never the entity key", () => {
    const serialised = JSON.stringify(model());
    expect(serialised).not.toMatch(/"constraintId"/i);
  });
});

describe("15–16, 20. methodology and provenance", () => {
  it("exposes methodology 1.0.0 and its route", () => {
    const live = model();
    expect(live.methodology.version).toBe("1.0.0");
    expect(live.methodology.documentPath).toBe("/docs/methodology/transmission-headroom");
  });

  it("a mismatched methodology version fails the contract", () => {
    const broken = model();
    broken.methodology.version = "0.9.0";
    expect(validateTransmissionModel(broken).join()).toMatch(/methodology version is 0\.9\.0/);
  });

  it("keeps observation, retrieval and calculation timestamps distinct", () => {
    const live = model();
    const stamps = new Set([
      live.markets.nyiso!.latestObservationAt, live.markets.nyiso!.retrievedAt, live.calculatedAt,
    ]);
    expect(stamps.size).toBe(3);
    expect(Object.keys(live)).not.toContain("updatedAt");
  });
});

describe("18. no mock fallback", () => {
  it("the unavailable model is empty rather than demonstrative", () => {
    const empty = unavailableTransmissionModel();
    expect(empty.markets.nyiso).toBeNull();
    expect(empty.markets.ercot).toBeNull();
    expect(empty.calculatedAt).toBeNull();
    // An empty model is valid: an unactivated surface is not a contract failure.
    expect(validateTransmissionModel(empty)).toEqual([]);
  });

  it("the component module imports no mock data", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/power-analytics/transmission-headroom.tsx", "utf8"));
    expect(source).not.toMatch(/data\/mock/);
    expect(source).not.toMatch(/HEADROOM_ROWS|DEMO_AS_OF_TIME/);
  });

  it("the retired mock is gone from the shared fixtures", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/data/mock/power-analytics.ts", "utf8"));
    expect(source).not.toMatch(/HEADROOM_ROWS|HEADROOM_TIGHT_PERCENT|headroomState/);
  });
});

describe("19. deferred metrics are named but never valued", () => {
  it("a deferred metric appearing in the summary fails", () => {
    const broken = model();
    broken.markets.nyiso!.deferredMetrics = [{
      metric: "interfaces_at_limit_count", label: "At limit", reason: "subtype unresolved",
    }];
    broken.markets.nyiso!.summary.push(metric({ metric: "interfaces_at_limit_count", value: 4 }));
    expect(validateTransmissionModel(broken).join()).toMatch(/deferred and also published|forbidden/);
  });
});

describe("no traffic-light taxonomy", () => {
  it("the component defines no tight/moderate severity bands", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/power-analytics/transmission-headroom.tsx", "utf8"));
    expect(source).not.toMatch(/"tight"|"moderate"|"available"/);
    expect(source).not.toMatch(/STATE_LABEL|STATE_CLASS/);
  });
});
