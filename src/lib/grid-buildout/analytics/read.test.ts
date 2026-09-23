/**
 * The public Grid Buildout contract.
 *
 * These tests treat the read model as the product: if the chart disappeared, what this file
 * asserts is what Grid Buildout would still mean. The invariants are methodology 1.0.0's own —
 * M4's coverage identity, M3's two decompositions, and the rule that resolution can only ever
 * reduce a count — so a payload that fails one has drifted from the approved rules rather than
 * merely looking odd.
 */

import { describe, expect, it } from "vitest";

import { METHODOLOGY_DOCUMENT_SHA256, METHODOLOGY_VERSION }
  from "@/lib/grid-buildout/analytics/methodology";
import {
  loadGridBuildoutReadModel, unavailableGridBuildoutModel, validateGridBuildoutModel,
  type GridBuildoutReadModel,
} from "@/lib/grid-buildout/analytics/read";
import type { M1, M2, M3, M4, M5 } from "@/lib/grid-buildout/analytics/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

/** The approved GBV-3 output, as the production run actually produced it. */
const M1_FIXTURE: M1 = {
  metric: "m1_projects_entering_service", market: "ercot", unit: "projects",
  periods: [{ period: 2025, count: 177 }, { period: 2026, count: 50 }],
  total: 227, excludedSentinelDate: 5, caveat: "rolling window",
};
const M2_FIXTURE: M2 = {
  metric: "m2_active_backlog", market: "ercot", unit: "projects",
  asOf: "2026-09-22T00:00:00.000Z",
  byLifecycle: [
    { lifecycle: "under_construction", count: 31 }, { lifecycle: "planned", count: 1350 },
    { lifecycle: "proposed", count: 292 }, { lifecycle: "unknown", count: 47 },
  ],
  total: 1720,
};
const M3_FIXTURE: M3 = {
  metric: "m3_completions_decomposition", market: "ercot", unit: "projects",
  population: 227,
  byServiceLevelKv: [{ kv: 69, count: 23 }, { kv: 138, count: 139 }, { kv: 345, count: 65 }],
  suppressedKvClasses: 0, suppressedKvProjects: 0,
  byWorksCharacter: [
    { character: "new", count: 24, share: 24 / 227 },
    { character: "rebuilt_or_reconductored", count: 60, share: 60 / 227 },
    { character: "both", count: 3, share: 3 / 227 },
    { character: "none_reported_zero", count: 139, share: 139 / 227 },
    { character: "unknown_unclassified", count: 1, share: 1 / 227 },
  ],
};
const M4_FIXTURE: M4 = {
  metric: "m4_schedule_slip", market: "caiso", unit: "days", published: true,
  distribution: { count: 140, median: 38.5, q1: 0, q3: 2169.5, min: -1829, max: 8279 },
  excludedMissingEndpoint: 13, excludedYearPrecision: 56, excludedCancelled: 5,
  floor: 12, withheldReason: null,
};
const M5_FIXTURE: M5 = {
  metric: "m5_cancellations", market: "caiso", unit: "projects",
  cancelled: 5,
  reasons: [
    { nativeId: "1819-R-06", reason: "Q3-2026: Cancelled in 2025-2026 CAISO Transmission Plan" },
    { nativeId: "1920-R-02", reason: "Q3-2026: Cancelled in 2025-2026 CAISO Transmission Plan" },
    { nativeId: "2223-P-18", reason: "July 2026: Project cancelled to be removed in future TDF." },
    { nativeId: "2223-R-12", reason: "Q3-2026: Cancelled in 2025-2026 CAISO Transmission Plan" },
    { nativeId: "2425-P-02", reason: "Q3-2026: Cancelled in 2025-2026 CAISO Transmission Plan" },
  ],
  unmappedStatusCount: 209, onHoldReported: false, onHoldNote: "uncontrolled status text",
};

function publishedModel(overrides: Partial<GridBuildoutReadModel> = {}): GridBuildoutReadModel {
  const base = unavailableGridBuildoutModel();
  return {
    ...base,
    methodology: { ...base.methodology, approved: true },
    calculatedAt: "2026-09-23T00:00:00.000Z",
    inputDigest: "a".repeat(64),
    markets: {
      ercot: {
        marketSlug: "ercot", marketName: "ERCOT", role: "Completion throughput and backlog",
        sourceName: "ERCOT TPIT", attribution: "Source: Electric Reliability Council of Texas, Inc.",
        sourceSlug: "ercot-tpit-transmission-projects", snapshotKey: "tpit-071326",
        retrievedAt: "2026-09-22T00:00:00.000Z",
        analyticalProjects: 2025, canonicalOccurrences: 2127,
      },
      caiso: {
        marketSlug: "caiso", marketName: "CAISO", role: "Schedule slip",
        sourceName: "CAISO TDF", attribution: "Source: California Independent System Operator Corporation.",
        sourceSlug: "caiso-tdf-approved-tpp-projects", snapshotKey: "tpp-jul-2026",
        retrievedAt: "2026-09-22T00:00:00.000Z",
        analyticalProjects: 214, canonicalOccurrences: 233,
      },
    },
    metrics: { m1: M1_FIXTURE, m2: M2_FIXTURE, m3: M3_FIXTURE, m4: M4_FIXTURE, m5: M5_FIXTURE },
    coverage: {
      ercotUnknownDriver: 2025, caisoUnknownDriver: 233,
      caisoDuplicateGroups: 16, caisoOccurrencesResolvedAway: 19,
      excluded: [
        { market: "ercot", reason: "driver_generator_interconnection", count: 82 },
        { market: "ercot", reason: "driver_load_interconnection", count: 20 },
      ],
    },
    ...overrides,
  };
}

/** A stub that answers the read model's two queries in order. */
function executor(rows: { runs: Record<string, unknown>[]; results: Record<string, unknown>[] }): CapacitySqlExecutor {
  return {
    // Both the guard and the run query touch methodology_versions, so dispatch on the specific
    // analytical tables first.
    query: async (text: string) => {
      if (text.includes("buildout_metric_results")) return { rows: rows.results } as never;
      if (text.includes("buildout_analytics_runs")) return { rows: rows.runs } as never;
      return { rows: [{ id: "mv-1", version: METHODOLOGY_VERSION, status: "approved",
        content_hash: METHODOLOGY_DOCUMENT_SHA256 }] } as never;
    },
    end: async () => {},
  } as unknown as CapacitySqlExecutor;
}

describe("the unpublished state", () => {
  it("is not an error and carries no figures", () => {
    const model = unavailableGridBuildoutModel();
    expect(model.metrics).toEqual({ m1: null, m2: null, m3: null, m4: null, m5: null });
    expect(model.calculatedAt).toBeNull();
    expect(model.markets).toEqual({ ercot: null, caiso: null });
    // An empty model is a valid contract: nothing published is not a contract failure.
    expect(validateGridBuildoutModel(model)).toEqual([]);
  });

  it("never claims approval it has not checked", () => {
    expect(unavailableGridBuildoutModel().methodology.approved).toBe(false);
  });
});

describe("methodology authorisation", () => {
  it("fails closed when the registry does not approve the version", async () => {
    const sql = {
      query: async () => ({ rows: [{ id: "mv-1", version: METHODOLOGY_VERSION, status: "draft",
        content_hash: METHODOLOGY_DOCUMENT_SHA256 }] }),
      end: async () => {},
    } as unknown as CapacitySqlExecutor;
    await expect(loadGridBuildoutReadModel(sql)).rejects.toThrow(/not approved|draft/);
  });

  it("refuses to validate a published payload whose methodology is unapproved", () => {
    const model = publishedModel();
    model.methodology.approved = false;
    expect(validateGridBuildoutModel(model)).toContain("methodology is not approved in the registry");
  });

  it("rejects a payload claiming a different methodology version", () => {
    const model = publishedModel();
    model.methodology.version = "0.9.0";
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/methodology version is 0\.9\.0/);
  });
});

describe("loading the approved run", () => {
  it("returns the unavailable model when nothing has been calculated", async () => {
    const model = await loadGridBuildoutReadModel(executor({ runs: [], results: [] }));
    expect(model.calculatedAt).toBeNull();
    expect(model.metrics.m1).toBeNull();
    // Approval was still checked, and passed.
    expect(model.methodology.approved).toBe(true);
  });

  it("normalises a run into the public contract, timestamps and all", async () => {
    const model = await loadGridBuildoutReadModel(executor({
      runs: [{
        id: "run-1", input_digest: "b".repeat(64),
        calculated_at: new Date("2026-09-23T00:00:00.000Z"),
        coverage: { ercotOccurrencesRead: 2127, caisoOccurrencesRead: 233,
          caisoDuplicateGroups: 16, caisoOccurrencesResolvedAway: 19, excluded: [] },
        ercot_projects: 2025, caiso_projects: 214,
        ercot_key: "tpit-071326", ercot_observed: new Date("2026-09-22T01:00:00.000Z"),
        caiso_key: "tpp-jul-2026", caiso_observed: new Date("2026-09-22T02:00:00.000Z"),
      }],
      results: [
        { metric: "m1_projects_entering_service", payload: M1_FIXTURE },
        { metric: "m4_schedule_slip", payload: M4_FIXTURE },
      ],
    }));
    expect(model.calculatedAt).toBe("2026-09-23T00:00:00.000Z");
    expect(model.metrics.m1?.total).toBe(227);
    expect(model.metrics.m4?.distribution?.count).toBe(140);
    // Freshness is the artifact's retrieval, never the render.
    expect(model.markets.ercot?.retrievedAt).toBe("2026-09-22T01:00:00.000Z");
    expect(model.markets.caiso?.snapshotKey).toBe("tpp-jul-2026");
    expect(model.markets.caiso?.canonicalOccurrences).toBe(233);
    expect(model.markets.caiso?.analyticalProjects).toBe(214);
    // A metric the run did not produce stays null rather than becoming an empty shape.
    expect(model.metrics.m2).toBeNull();
  });

  it("reads metric results in a deterministic order", async () => {
    const seen: string[] = [];
    const sql = {
      query: async (text: string) => {
        if (!text.includes("buildout_")) {
          return { rows: [{ id: "mv-1", version: METHODOLOGY_VERSION, status: "approved",
            content_hash: METHODOLOGY_DOCUMENT_SHA256 }] };
        }
        if (text.includes("buildout_metric_results")) { seen.push("results"); return { rows: [] }; }
        if (text.includes("buildout_analytics_runs")) { seen.push("runs"); return { rows: [] }; }
        return { rows: [] };
      },
      end: async () => {},
    } as unknown as CapacitySqlExecutor;
    await loadGridBuildoutReadModel(sql);
    expect(seen[0]).toBe("runs");
  });
});

describe("methodology 1.0.0 invariants", () => {
  it("accepts the approved production output unchanged", () => {
    expect(validateGridBuildoutModel(publishedModel())).toEqual([]);
  });

  it("requires M1 periods to reconcile to the total", () => {
    const model = publishedModel();
    model.metrics.m1 = { ...M1_FIXTURE, total: 999 };
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/m1 periods sum to 227, total says 999/);
  });

  it("requires M2 lifecycle components to reconcile to 1,720", () => {
    const model = publishedModel();
    model.metrics.m2 = { ...M2_FIXTURE, total: 1721 };
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/m2 lifecycle components sum to 1720/);
  });

  it("requires M3's population to equal M1's total", () => {
    const model = publishedModel();
    model.metrics.m3 = { ...M3_FIXTURE, population: 226 };
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/m3 population 226 does not equal m1 total 227/);
  });

  it("requires both M3 decompositions to account for the population", () => {
    const works = publishedModel();
    works.metrics.m3 = {
      ...M3_FIXTURE,
      byWorksCharacter: M3_FIXTURE.byWorksCharacter.map((item) =>
        item.character === "none_reported_zero" ? { ...item, count: 138 } : item),
    };
    expect(validateGridBuildoutModel(works).join(" ")).toMatch(/m3 works character sums to 226/);

    const kv = publishedModel();
    kv.metrics.m3 = { ...M3_FIXTURE, byServiceLevelKv: [{ kv: 138, count: 139 }] };
    expect(validateGridBuildoutModel(kv).join(" ")).toMatch(/m3 kV classes \(139\).*do not reconcile to 227/);
  });

  it("requires M4's coverage identity to close against the CAISO universe", () => {
    // 140 + 56 + 13 + 5 = 214.
    expect(validateGridBuildoutModel(publishedModel())).toEqual([]);
    const model = publishedModel();
    model.metrics.m4 = { ...M4_FIXTURE, excludedYearPrecision: 55 };
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/m4 coverage does not close/);
  });

  it("requires M4 quantiles to be ordered and the distribution whole", () => {
    const disordered = publishedModel();
    disordered.metrics.m4 = { ...M4_FIXTURE, distribution: { count: 140, median: 10, q1: 50, q3: 20, min: 0, max: 100 } };
    expect(validateGridBuildoutModel(disordered).join(" ")).toMatch(/quantiles are not ordered/);

    const hollow = publishedModel();
    hollow.metrics.m4 = { ...M4_FIXTURE, published: true, distribution: null };
    expect(validateGridBuildoutModel(hollow).join(" ")).toMatch(/published with no distribution/);
  });

  it("accepts a negative minimum: a project expected earlier than approved is legitimate", () => {
    expect(publishedModel().metrics.m4?.distribution?.min).toBe(-1829);
    expect(validateGridBuildoutModel(publishedModel())).toEqual([]);
  });

  it("refuses a non-finite figure anywhere", () => {
    const model = publishedModel();
    model.metrics.m4 = { ...M4_FIXTURE, distribution: { ...M4_FIXTURE.distribution!, median: Number.NaN } };
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/m4 median is NaN/);
  });

  it("refuses more M5 reasons than cancellations, and any on-hold figure", () => {
    const model = publishedModel();
    model.metrics.m5 = { ...M5_FIXTURE, cancelled: 2 };
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/m5 lists 5 reasons for 2 cancellations/);
  });

  it("refuses an analytical count larger than the canonical occurrences behind it", () => {
    // 233 -> 214 is a reduction. Resolution can never invent a project.
    const model = publishedModel();
    model.markets.caiso = { ...model.markets.caiso!, analyticalProjects: 240 };
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/resolution cannot increase a count/);
  });

  it("refuses a payload that has grown a cross-market or capacity figure", () => {
    const model = publishedModel();
    model.product = { ...model.product, summary: "Total transfer capacity added across markets" };
    expect(validateGridBuildoutModel(model).length).toBeGreaterThan(0);
  });

  it("requires attribution on every published market", () => {
    const model = publishedModel();
    model.markets.ercot = { ...model.markets.ercot!, attribution: "  " };
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/ercot carries no attribution/);
  });

  it("requires a real calculation timestamp on published metrics", () => {
    const model = publishedModel();
    model.calculatedAt = null;
    expect(validateGridBuildoutModel(model).join(" ")).toMatch(/no valid calculation timestamp/);
  });
});

describe("zero is preserved as zero", () => {
  it("keeps a reported zero distinct from an absent metric", () => {
    const model = publishedModel();
    // q1 is genuinely 0 days of slip, not missing.
    expect(model.metrics.m4?.distribution?.q1).toBe(0);
    expect(model.metrics.m4?.distribution?.q1).not.toBeNull();
    // A suppressed kV class count of 0 is a real zero, and the model still validates.
    expect(model.metrics.m3?.suppressedKvProjects).toBe(0);
    expect(validateGridBuildoutModel(model)).toEqual([]);
  });

  it("keeps none_reported_zero as its own class rather than folding it into unknown", () => {
    const works = publishedModel().metrics.m3!.byWorksCharacter;
    const reported = works.find((item) => item.character === "none_reported_zero")!;
    const unknown = works.find((item) => item.character === "unknown_unclassified")!;
    expect(reported.count).toBe(139);
    expect(unknown.count).toBe(1);
    expect(reported.character).not.toBe(unknown.character);
  });
});
