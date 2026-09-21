import { describe, expect, it } from "vitest";

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { EXCLUDED_GAP_MARKETS } from "@/lib/power-delivery/gap/eligibility";
import {
  GAP_MARKET, loadDeliveryGapReadModel, unconfiguredDeliveryGapReadModel, validatePublicDeliveryGap,
  type DeliveryGapReadModel,
} from "@/lib/power-delivery/gap/read";

type GapRow = {
  year: number; season: string; demand: number; capacity: number;
  publicationState?: string; pointId?: string; resultId?: string;
};

const row = (over: Partial<GapRow> & { year: number; season: string }): GapRow => ({
  demand: 94_650.257, capacity: 104_849.98533433278, publicationState: "publication_candidate",
  pointId: `d-${over.year}-${over.season}`, resultId: `c-${over.year}-${over.season}`, ...over,
});

const TEN: GapRow[] = [2026, 2027, 2028, 2029, 2030].flatMap((year) => [
  row({ year, season: "summer", demand: 90_000 + year, capacity: 100_000 }),
  row({ year, season: "winter", demand: 110_000 + year, capacity: 95_000 }),
]);

/** A stand-in for the gap tables and the current pairing the read model checks against. */
function fakeDatabase(options: {
  gaps?: GapRow[];
  /** What the approved pairing would currently use. Defaults to exactly what the gaps froze. */
  currentPairs?: { pointId: string; resultId: string }[] | null;
  attribution?: string | null;
} = {}) {
  const gaps = options.gaps ?? TEN;
  const sql: CapacitySqlExecutor = {
    async query(text, params) {
      const p = params as unknown[];
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };

      if (text.includes("from pipeline.delivery_gap_results")) {
        return { rows: gaps.map((gap) => ({
          target_year: gap.year, target_season: gap.season,
          demand_value: gap.demand, capacity_value: gap.capacity,
          gap_value: gap.demand - gap.capacity,
          unit: "MW", capacity_basis: "accredited",
          publication_state: gap.publicationState, created_at: "2026-09-21T04:00:00.000Z",
          demand_scenario: "ERCOT Adjusted", capacity_scenario: "Peak load hour",
          demand_vintage: "ltlf-2025-04-adjusted", demand_published: "2025-04-08T00:00:00.000Z",
          capacity_vintage: "cdr-2025-12", capacity_published: "2025-12-19T00:00:00.000Z",
          market_name: "ERCOT", input_count: 2,
          planning_point_id: gap.pointId, capacity_result_id: gap.resultId,
        })) };
      }
      if (text.includes("from reference.source_interfaces")) {
        return { rows: [{
          slug: p[0], name: String(p[0]).includes("load-forecast")
            ? "ERCOT Long-Term Demand and Energy Forecast"
            : "ERCOT Capacity, Demand and Reserves Report",
          attribution: options.attribution === undefined ? "Source: ERCOT. Gap calculated by Urdais." : options.attribution,
        }] };
      }
      // currentEligiblePairs reaches through to the calculator's own queries.
      if (text.includes("from pipeline.planning_forecast_vintages")) {
        return { rows: options.currentPairs === null ? [] : [{ id: "dv", native_vintage_key: "ltlf-2025-04-adjusted" }] };
      }
      if (text.includes("from pipeline.planning_forecast_points")) {
        const pairs = options.currentPairs ?? gaps.map((gap) => ({ pointId: gap.pointId!, resultId: gap.resultId! }));
        return { rows: pairs.map((pair, index) => ({
          id: pair.pointId, scenario_id: "ds", target_year: 2026 + Math.floor(index / 2),
          target_season: index % 2 === 0 ? "summer" : "winter",
          peak_type: "coincident_peak", value: "1", unit: "MW",
        })) };
      }
      if (text.includes("from pipeline.deliverable_capacity_results")) {
        const pairs = options.currentPairs ?? gaps.map((gap) => ({ pointId: gap.pointId!, resultId: gap.resultId! }));
        return { rows: pairs.map((pair, index) => ({
          id: pair.resultId, scenario_id: "cs", target_year: 2026 + Math.floor(index / 2),
          target_season: index % 2 === 0 ? "summer" : "winter",
          value: "1", unit: "MW", capacity_basis: "accredited", native_vintage_key: "cdr-2025-12",
        })) };
      }
      if (text.includes("from reference.methodology_versions")) {
        return { rows: [{ id: "mv", version: "1.0.0", status: "approved" }] };
      }
      if (text.includes("from reference.grid_areas where slug")) return { rows: [{ id: "area" }] };
      if (text.includes("from reference.source_use_permissions")) return { rows: [] };
      throw new Error(`unexpected query: ${text.slice(0, 60)}`);
    },
  };
  return { sql };
}

const load = (options: Parameters<typeof fakeDatabase>[0] = {}) =>
  loadDeliveryGapReadModel(fakeDatabase(options).sql);

describe("the delivery gap read model", () => {
  it("serves the ten approved points in deterministic order", async () => {
    const model = await load();
    expect(model.lifecycle).toBe("live");
    expect(model.series).toHaveLength(10);
    expect(model.series.map((point) => `${point.targetYear}-${point.season}`)).toEqual([
      "2026-summer", "2026-winter", "2027-summer", "2027-winter", "2028-summer",
      "2028-winter", "2029-summer", "2029-winter", "2030-summer", "2030-winter",
    ]);
    expect(validatePublicDeliveryGap(JSON.parse(JSON.stringify(model)))).toEqual([]);
  });

  it("preserves both signs and never clips at zero", async () => {
    const model = await load({
      gaps: [
        row({ year: 2026, season: "summer", demand: 94_650.257, capacity: 104_849.98533433278 }),
        row({ year: 2030, season: "winter", demand: 161_916, capacity: 99_707.41478285944 }),
      ],
    });
    expect(model.series[0]!.gapMw).toBeLessThan(0);
    expect(model.series[1]!.gapMw).toBeGreaterThan(0);
    expect(model.series[0]!.gapMw).toBeCloseTo(-10_199.728, 3);
  });

  it("keeps each point's own subtraction true", async () => {
    const model = await load();
    for (const point of model.series) {
      expect(point.demandMw - point.capacityMw).toBeCloseTo(point.gapMw, 6);
    }
  });

  it("names both sources, their vintages and their attribution", async () => {
    const model = await load();
    expect(model.demandSource?.vintageKey).toBe("ltlf-2025-04-adjusted");
    expect(model.capacitySource?.vintageKey).toBe("cdr-2025-12");
    expect(model.demandSource?.publishedAt).toBe("2025-04-08T00:00:00.000Z");
    expect(model.demandSource?.attribution).toMatch(/Gap calculated by Urdais/);
    expect(model.attributionNote).toBe("Gap calculated by Urdais.");
  });

  it("uses the calculation time as freshness, not a deploy time", async () => {
    const model = await load();
    expect(model.calculatedAt).toBe("2026-09-21T04:00:00.000Z");
  });

  it("carries the methodology version and the mandatory disclosure", async () => {
    const model = await load();
    expect(model.methodology.version).toBe("1.0.0");
    expect(model.methodology.slug).toBe("power-delivery-gap");
    expect(model.disclosure).toMatch(/not ERCOT's published reserve margin/);
    expect(model.disclosure).toMatch(/firm peak load/);
  });

  it("names all six markets that produce nothing", async () => {
    const model = await load();
    expect(model.otherMarkets).toHaveLength(EXCLUDED_GAP_MARKETS.length);
    expect(model.otherMarkets.map((market) => market.marketSlug).sort())
      .toEqual(["caiso", "iso-ne", "miso", "nyiso", "pjm", "spp"]);
    // Short enough for a surface, and never empty.
    for (const market of model.otherMarkets) {
      expect(market.blocker.length).toBeGreaterThan(20);
      expect(market.blocker.length).toBeLessThan(200);
    }
    // No fabricated series for any of them.
    expect(model.series.every((point) => point.targetYear >= 2026)).toBe(true);
  });
});

describe("lifecycle", () => {
  it("is not_initialized when nothing has been calculated", async () => {
    const model = await load({ gaps: [] });
    expect(model.lifecycle).toBe("not_initialized");
    expect(model.series).toEqual([]);
    expect(model.reason).toMatch(/No delivery gap has been calculated/);
    expect(validatePublicDeliveryGap(JSON.parse(JSON.stringify(model)))).toEqual([]);
  });

  it("is not_initialized, not an error, when no database is configured", () => {
    const model = unconfiguredDeliveryGapReadModel();
    expect(model.lifecycle).toBe("not_initialized");
    expect(model.series).toEqual([]);
    expect(model.otherMarkets).toHaveLength(EXCLUDED_GAP_MARKETS.length);
    expect(validatePublicDeliveryGap(JSON.parse(JSON.stringify(model)))).toEqual([]);
  });

  it("is blocked when the rights determination withheld every point", async () => {
    const model = await load({ gaps: TEN.map((gap) => ({ ...gap, publicationState: "internal_only" })) });
    expect(model.lifecycle).toBe("blocked");
    expect(model.series).toEqual([]);
    expect(model.reason).toMatch(/withholds public display/);
    // The values still exist in the database; they are simply not served.
    expect(validatePublicDeliveryGap(JSON.parse(JSON.stringify(model)))).toEqual([]);
  });

  it("is stale when a newer source release has been ingested since the calculation", async () => {
    // The gaps froze one pair of rows; the approved pairing would now use different ones.
    const model = await load({
      gaps: TEN,
      currentPairs: TEN.map((gap) => ({ pointId: `${gap.pointId}-v2`, resultId: gap.resultId! })),
    });
    expect(model.lifecycle).toBe("stale");
    expect(model.reason).toMatch(/newer source release/);
    // Stale keeps its values: they are history, not nothing.
    expect(model.series).toHaveLength(10);
    expect(validatePublicDeliveryGap(JSON.parse(JSON.stringify(model)))).toEqual([]);
  });

  it("is stale when the current pairing covers fewer periods than were frozen", async () => {
    const model = await load({ gaps: TEN, currentPairs: [{ pointId: TEN[0]!.pointId!, resultId: TEN[0]!.resultId! }] });
    expect(model.lifecycle).toBe("stale");
  });

  it("always gives a reason, whatever the lifecycle", async () => {
    for (const model of [await load(), await load({ gaps: [] }), unconfiguredDeliveryGapReadModel()]) {
      expect(model.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("the response contract", () => {
  const good = async () => JSON.parse(JSON.stringify(await load())) as DeliveryGapReadModel;

  it("passes for a well-formed model", async () => {
    expect(validatePublicDeliveryGap(await good())).toEqual([]);
  });

  it("rejects a missing disclosure", async () => {
    expect(validatePublicDeliveryGap({ ...(await good()), disclosure: "" }))
      .toContain("the ERCOT disclosure is missing");
  });

  it("rejects a gap that is not its own demand minus capacity", async () => {
    // The guard that stops a surface rounding one side and not the other.
    const model = await good();
    model.series[0]!.gapMw = 0;
    expect(validatePublicDeliveryGap(model).join(" ")).toMatch(/is not its own demand minus capacity/);
  });

  it("rejects a live lifecycle with an empty series", async () => {
    expect(validatePublicDeliveryGap({ ...(await good()), series: [] }))
      .toContain("lifecycle is live with an empty series");
  });

  it("rejects a blocked lifecycle that still carries a series", async () => {
    expect(validatePublicDeliveryGap({ ...(await good()), lifecycle: "blocked" }).join(" "))
      .toMatch(/lifecycle is blocked with a non-empty series/);
  });

  it("rejects the wrong market or the wrong methodology version", async () => {
    expect(validatePublicDeliveryGap({ ...(await good()), marketSlug: "pjm" }).join(" ")).toMatch(/market is pjm/);
    const model = await good();
    model.methodology.version = "0.9.0";
    expect(validatePublicDeliveryGap(model)).toContain("methodology version is missing or not the approved one");
  });

  it("rejects a served series with no sources", async () => {
    expect(validatePublicDeliveryGap({ ...(await good()), demandSource: null }))
      .toContain("a served series must name both of its sources");
  });

  it("rejects a response that drops an ineligible market", async () => {
    const model = await good();
    model.otherMarkets = model.otherMarkets.slice(1);
    expect(validatePublicDeliveryGap(model)).toContain("the ineligible markets are not all accounted for");
  });

  it("covers the one market the methodology approves", async () => {
    expect((await good()).marketSlug).toBe(GAP_MARKET);
  });
});
