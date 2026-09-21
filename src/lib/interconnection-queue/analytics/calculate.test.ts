import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { calculateQueueAnalytics, type MetricResult } from "@/lib/interconnection-queue/analytics/calculate";
import {
  assertMethodologyDocument, countsAsOperated, disappearanceCountsAsExit,
  MethodologyDriftError, METHODOLOGY_DOCUMENT_PATH, METHODOLOGY_DOCUMENT_SHA256,
  METHODOLOGY_VERSION, mayBeSummedIntoProjectMw, mayPublishMarketMetric,
} from "@/lib/interconnection-queue/analytics/methodology";
import {
  loadQueueAnalytics, unavailableQueueAnalytics, validatePublicQueueAnalytics,
  type QueueAnalyticsReadModel,
} from "@/lib/interconnection-queue/analytics/read";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

const ROOT = resolve(__dirname, "../../../..");

/**
 * A database that answers the engine's questions from a small fixture, so the rules are exercised
 * rather than the SQL. Each market is described by the facts the methodology cares about.
 */
type Market = {
  slug: string;
  active: number; population: number; unknownStage?: number; excludedSubtype?: number; load?: number;
  technologies?: { technology: string; n: number }[];
  mw?: { total: number; n: number };
  age?: { n: number; p50: number; p75: number; p90 : number };
  t2o?: { n: number; p50: number; p75: number; p90: number };
  cohorts?: { cohort: number; entrants: number; operated: number; unresolved: number }[];
  entries?: { period: number; n: number }[];
  withdrawals?: { total: number; dated: number };
  ai?: { n: number; mw: number | null };
};

function database(markets: Market[]): CapacitySqlExecutor {
  const find = (params: unknown[]) => markets.find((market) => market.slug === params[0]);
  return {
    async query(text, params) {
      const p = (params ?? []) as unknown[];
      if (text.includes("from pipeline.interconnection_queue_snapshots q")
          && text.includes("snapshot_ids")) {
        return { rows: [{ snapshots: 1, requests: 10, observations: 10,
          latest_observation: "2026-09-21", snapshot_ids: ["00000000-0000-4000-8000-000000000001"] }] };
      }
      const market = find(p);
      if (market === undefined) return { rows: [] };
      if (text.includes("as active,")) {
        return { rows: [{ active: market.active, population: market.population,
          unknown_stage: market.unknownStage ?? 0, excluded_subtype: market.excludedSubtype ?? 0,
          load_requests: market.load ?? 0 }] };
      }
      if (text.includes("from pipeline.interconnection_request_resources rs")) {
        return { rows: market.technologies ?? [] };
      }
      if (text.includes("sum(qt.value)::numeric as total")) {
        return { rows: [{ total: market.mw?.total ?? null, n: market.mw?.n ?? 0 }] };
      }
      if (text.includes("$2::date - o.requested_on")) {
        const age = market.age;
        return { rows: [{ n: age?.n ?? 0, p50: age === undefined ? null : age.p50 * 365.25,
          p75: age === undefined ? null : age.p75 * 365.25,
          p90: age === undefined ? null : age.p90 * 365.25 }] };
      }
      if (text.includes("o.actual_in_service_on - o.requested_on")) {
        const t2o = market.t2o;
        return { rows: [{ n: t2o?.n ?? 0, p50: t2o === undefined ? null : t2o.p50 * 365.25,
          p75: t2o === undefined ? null : t2o.p75 * 365.25,
          p90: t2o === undefined ? null : t2o.p90 * 365.25 }] };
      }
      if (text.includes("as cohort,")) return { rows: market.cohorts ?? [] };
      if (text.includes("min(qs.report_period)") || text.includes("extract(year from o.requested_on)::int as period")) {
        return { rows: market.entries ?? [] };
      }
      if (text.includes("as total,") && text.includes("'withdrawn'")) {
        return { rows: [{ total: market.withdrawals?.total ?? 0, dated: market.withdrawals?.dated ?? 0 }] };
      }
      if (text.includes("extract(year from o.withdrawn_on)")) return { rows: [] };
      if (text.includes("o.load_end_use = $2")) {
        return { rows: [{ n: market.ai?.n ?? 0, mw: market.ai?.mw ?? null }] };
      }
      return { rows: [] };
    },
  };
}

const market = (over: Partial<Market> & { slug: string }): Market =>
  ({ active: 100, population: 200, ...over });

const pick = (results: MetricResult[], metric: string, slug: string, dimension?: string) =>
  results.find((result) => result.metricCode === metric && result.marketSlug === slug
    && (dimension === undefined ? result.dimensionKind === null : result.dimensionValue === dimension))!;

const ALL = ["pjm", "miso", "caiso", "ercot", "nyiso", "iso-ne", "spp"];
const baseline = () => ALL.map((slug) => market({ slug }));

describe("1. project completion uses the eligible cohort denominator", () => {
  it("divides operated by cohort entrants, not by the active queue", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "pjm"),
      market({ slug: "pjm", active: 2641,
        t2o: { n: 1242, p50: 2.79, p75: 4.72, p90: 6.45 },
        cohorts: [{ cohort: 2012, entrants: 400, operated: 100, unresolved: 4 }] }),
    ]), { asOf: "2026-09-21" });
    const pooled = pick(run.results, "project_completion_rate", "pjm");
    expect(pooled.status).toBe("live");
    expect(pooled.value).toBeCloseTo(100 / 400, 6);
    // The denominator is the cohort, and the active count (2,641) is nowhere in it.
    expect(pooled.sampleSize).toBe(400);
  });
});

describe("2. an immature cohort is blocked", () => {
  it("refuses a cohort inside the market's own p90 window", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "pjm"),
      market({ slug: "pjm", t2o: { n: 1242, p50: 2.79, p75: 4.72, p90: 6.45 },
        cohorts: [{ cohort: 2023, entrants: 1328, operated: 0, unresolved: 1058 }] }),
    ]), { asOf: "2026-09-21" });
    const cohort = pick(run.results, "project_completion_rate", "pjm", "2023");
    expect(cohort.status).toBe("insufficient_maturity");
    expect(cohort.value).toBeNull();
  });
});

describe("3. an unresolved share above the threshold blocks completion", () => {
  it("refuses a cohort old enough but not resolved enough", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "pjm"),
      market({ slug: "pjm", t2o: { n: 1242, p50: 2.79, p75: 4.72, p90: 6.45 },
        // Window is 9.2 years against a p90 of 6.45, but 20% is still unresolved.
        cohorts: [{ cohort: 2017, entrants: 500, operated: 70, unresolved: 100 }] }),
    ]), { asOf: "2026-09-21" });
    const cohort = pick(run.results, "project_completion_rate", "pjm", "2017");
    expect(cohort.status).toBe("insufficient_maturity");
    expect((cohort.coverage as { unresolvedShare: number }).unresolvedShare).toBeCloseTo(0.2, 6);
  });
});

describe("4-7. operation requires explicit evidence", () => {
  it("never counts a proposed COD, a MISO done date or a plant on test", () => {
    expect(countsAsOperated({ stage: "study", actualInServiceOn: null, proposedInServiceOn: "2020-01-01" })).toBe(false);
    expect(countsAsOperated({ stage: "under_construction", actualInServiceOn: null, misoDoneDate: "2021-10-12" })).toBe(false);
    expect(countsAsOperated({ stage: "operational", actualInServiceOn: null, nativeStatusDescription: "In Service for Test" })).toBe(false);
    expect(countsAsOperated({ stage: "operational", actualInServiceOn: null, nativeStatusDescription: "In Service Commercial" })).toBe(true);
  });

  it("gives a market with no actual operation date no completion and no time to operation", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "miso"),
      // MISO publishes operational status but no date, so it has no p90 and no yardstick.
      market({ slug: "miso", cohorts: [{ cohort: 2012, entrants: 400, operated: 100, unresolved: 4 }] }),
    ]), { asOf: "2026-09-21" });
    expect(pick(run.results, "project_completion_rate", "miso").status).toBe("not_available");
    expect(pick(run.results, "time_to_operation_years", "miso", "median").status).toBe("not_available");
  });

  it("never lets a disappearance become an exit", () => {
    expect(disappearanceCountsAsExit()).toBe(false);
  });
});

describe("8. MW completion is always deferred", () => {
  it("emits the metric for every market, with no value and a deferred status", async () => {
    const run = await calculateQueueAnalytics(database(baseline()), { asOf: "2026-09-21" });
    const deferred = run.results.filter((result) => result.metricCode === "mw_completion_rate");
    expect(deferred).toHaveLength(ALL.length);
    for (const result of deferred) {
      expect(result.status).toBe("methodology_deferred");
      expect(result.value).toBeNull();
    }
  });
});

describe("9. no seven-market MW total can be produced", () => {
  it("gives PJM and ERCOT no MW at all, and marks every MW metric market-specific", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => !["pjm", "ercot"].includes(entry.slug)),
      market({ slug: "pjm", mw: { total: 999, n: 10 } }),
      market({ slug: "ercot", mw: { total: 999, n: 10 } }),
    ]), { asOf: "2026-09-21" });
    expect(pick(run.results, "active_mw", "pjm").status).toBe("methodology_deferred");
    expect(pick(run.results, "active_mw", "ercot").status).toBe("methodology_deferred");
    expect(pick(run.results, "active_mw", "pjm").value).toBeNull();
  });

  it("refuses a read model that claims MW comparability beyond market-specific", () => {
    const model: QueueAnalyticsReadModel = {
      ...unavailableQueueAnalytics(),
      deferredMetrics: [{ metric: "mw_completion_rate", label: "x", reason: "y" }],
      markets: [{ marketSlug: "pjm", marketName: "PJM", sourceName: "s", attribution: null,
        metrics: [{ metric: "active_mw", label: "Active capacity", family: "stock",
          comparability: "A", dimension: null, status: "live", value: 1, unit: "MW",
          nativeField: "x", basis: null, sampleSize: 1, populationSize: 1, coverage: {} }] }],
    };
    expect(validatePublicQueueAnalytics(model).join(" ")).toMatch(/claims MW comparability/);
  });
});

describe("10-11. load and capacity rights stay out of generation metrics", () => {
  it("counts neither in the active stock, and reports both as coverage", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "iso-ne"),
      market({ slug: "iso-ne", active: 28, population: 1509, excludedSubtype: 814, load: 0 }),
    ]), { asOf: "2026-09-21" });
    const stock = pick(run.results, "active_request_count", "iso-ne");
    expect(stock.value).toBe(28);
    // What was left out is stated rather than absorbed.
    expect((stock.coverage as { excludedSubtype: number }).excludedSubtype).toBe(814);
    expect(stock.excludedCount).toBe(1509 - 28);
  });

  it("reports an AI load metric only where a load queue exists", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "nyiso"),
      market({ slug: "nyiso", load: 74, ai: { n: 12, mw: 2500 } }),
    ]), { asOf: "2026-09-21" });
    expect(pick(run.results, "explicit_ai_data_center_load", "nyiso").value).toBe(12);
    // A market with no load queue has an unknown AI load, never a zero one.
    const pjm = pick(run.results, "explicit_ai_data_center_load", "pjm");
    expect(pjm.status).toBe("not_available");
    expect(pjm.value).toBeNull();
  });
});

describe("12. SPP is blocked from every public output", () => {
  it("strips its values and marks it internal, whatever it computed", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "spp"),
      market({ slug: "spp", active: 536, mw: { total: 189765, n: 536 },
        t2o: { n: 279, p50: 4.22, p75: 5.98, p90: 8.22 },
        cohorts: [{ cohort: 2012, entrants: 400, operated: 100, unresolved: 4 }] }),
    ]), { asOf: "2026-09-21" });
    const spp = run.results.filter((result) => result.marketSlug === "spp");
    expect(spp.length).toBeGreaterThan(0);
    for (const result of spp) {
      expect(result.publicationState).toBe("internal_only");
      expect(result.value).toBeNull();
      expect(result.status).not.toBe("live");
    }
    expect(mayPublishMarketMetric("spp")).toBe(false);
  });

  it("never reaches the read model, and the contract refuses it if it did", () => {
    const model: QueueAnalyticsReadModel = {
      ...unavailableQueueAnalytics(),
      deferredMetrics: [{ metric: "mw_completion_rate", label: "x", reason: "y" }],
      markets: [{ marketSlug: "spp", marketName: "SPP", sourceName: "s", attribution: null, metrics: [] }],
    };
    expect(validatePublicQueueAnalytics(model).join(" ")).toMatch(/blocked from publication reached/);
  });
});

describe("13-14. hybrids and components", () => {
  it("counts a hybrid once while tagging it with each technology", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "caiso"),
      market({ slug: "caiso", active: 262,
        technologies: [{ technology: "solar", n: 200 }, { technology: "battery_storage", n: 180 }] }),
    ]), { asOf: "2026-09-21" });
    const solar = pick(run.results, "active_request_count_by_technology", "caiso", "solar");
    const battery = pick(run.results, "active_request_count_by_technology", "caiso", "battery_storage");
    // 200 + 180 exceeds the 262 active projects, because a co-located project is in both.
    expect(solar.value! + battery.value!).toBeGreaterThan(pick(run.results, "active_request_count", "caiso").value!);
    expect(solar.populationSize).toBe(262);
    expect((solar.coverage as { multiLabel: boolean }).multiLabel).toBe(true);
  });

  it("never sums CAISO components into a project figure", () => {
    expect(mayBeSummedIntoProjectMw("component_mw")).toBe(false);
    expect(mayBeSummedIntoProjectMw("net_mw_to_grid")).toBe(true);
  });
});

describe("15-16. excluded lifecycle and sample gates", () => {
  it("reports unknown-stage requests as coverage rather than counting them", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "miso"),
      market({ slug: "miso", active: 1336, population: 3850, unknownStage: 74 }),
    ]), { asOf: "2026-09-21" });
    const stock = pick(run.results, "active_request_count", "miso");
    expect((stock.coverage as { unknownStage: number }).unknownStage).toBe(74);
    expect(stock.value).toBe(1336);
  });

  it("withholds a statistic below its sample floor instead of publishing it", async () => {
    const run = await calculateQueueAnalytics(database([
      ...baseline().filter((entry) => entry.slug !== "iso-ne"),
      // ISO-NE's 28 active requests are below the median floor of 30.
      market({ slug: "iso-ne", active: 28, age: { n: 28, p50: 5.64, p75: 7.06, p90: 8.25 } }),
    ]), { asOf: "2026-09-21" });
    const median = pick(run.results, "queue_age_years", "iso-ne", "median");
    expect(median.status).toBe("insufficient_sample");
    expect(median.value).toBeNull();
    expect(median.sampleSize).toBe(28);
  });

  it("gives a market with no request date no queue age at all", async () => {
    const run = await calculateQueueAnalytics(database(baseline()), { asOf: "2026-09-21" });
    const ercot = pick(run.results, "queue_age_years", "ercot", "median");
    expect(ercot.status).toBe("not_available");
    expect(ercot.value).toBeNull();
  });
});

describe("17. rights status propagates to the read model", () => {
  it("names an excluded market rather than dropping it silently", async () => {
    const rows = [
      { market_slug: "pjm", market_name: "PJM", source_name: "PJM Planning Queues",
        metric: "active_request_count", label: "Active projects", family: "stock", comparability: "A",
        dimension_kind: null, dimension_value: null, status: "live", value: "2781",
        unit: "requests", native_field: null, basis: null, sample_size: 2781, population_size: 9200,
        coverage: {}, attribution: "Source: PJM." },
    ];
    const sql: CapacitySqlExecutor = {
      async query(text) {
        if (text.includes("from pipeline.interconnection_analytics_runs r")) {
          return { rows: [{ id: "run", calculated_at: "2026-09-21T00:00:00Z", input_digest: "d",
            snapshots: 105, version: METHODOLOGY_VERSION, slug: "interconnection-queue-analytics",
            name: "Urdais Interconnection Queue Analytics", document_path: "x" }] };
        }
        if (text.includes("publication_state = 'publishable'")) return { rows };
        if (text.includes("publication_state = 'internal_only'")) {
          return { rows: [{ slug: "spp", display_name: "SPP",
            rights_reason: "the source terms exclude commercial publication" }] };
        }
        if (text.includes("interconnection_metric_definitions")) {
          return { rows: [{ code: "mw_completion_rate", label: "Capacity completion rate",
            deferred_reason: "deferred for every market" }] };
        }
        return { rows: [] };
      },
    };
    const model = await loadQueueAnalytics(sql);
    expect(model.markets.map((market) => market.marketSlug)).toEqual(["pjm"]);
    expect(model.excludedMarkets).toEqual([{ marketSlug: "spp", marketName: "SPP",
      reason: "the source terms exclude commercial publication" }]);
    expect(model.deferredMetrics[0]!.metric).toBe("mw_completion_rate");
    expect(validatePublicQueueAnalytics(model)).toEqual([]);
  });
});

describe("18. the methodology hash guard", () => {
  it("accepts the document the approved version was hashed against", () => {
    const document = readFileSync(resolve(ROOT, METHODOLOGY_DOCUMENT_PATH));
    expect(() => assertMethodologyDocument(document)).not.toThrow();
  });

  it("refuses a document that has moved since approval", () => {
    expect(() => assertMethodologyDocument("something else entirely")).toThrow(MethodologyDriftError);
    expect(() => assertMethodologyDocument("something else entirely"))
      .toThrow(/never edited in place; supersede it/);
  });

  it("binds the version and the digest together", () => {
    expect(METHODOLOGY_VERSION).toBe("1.0.0");
    expect(METHODOLOGY_DOCUMENT_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("19-20. no fabricated values reach a caller", () => {
  it("never pairs a non-live status with a number, in any market or metric", async () => {
    const run = await calculateQueueAnalytics(database(baseline()), { asOf: "2026-09-21" });
    for (const result of run.results) {
      expect(result.status === "live").toBe(result.value !== null);
    }
  });

  it("serves an unavailable model rather than inventing one when nothing is calculated", async () => {
    const empty: CapacitySqlExecutor = { async query() { return { rows: [] }; } };
    const model = await loadQueueAnalytics(empty);
    expect(model.markets).toEqual([]);
    expect(model.calculatedAt).toBeNull();
    // And the contract passes, because an unactivated surface is not a broken one.
    expect(validatePublicQueueAnalytics(model)).toEqual([]);
  });

  it("keeps the cross-market MW warning on every response", () => {
    expect(unavailableQueueAnalytics().notes[0]).toMatch(/never added together/);
  });
});
