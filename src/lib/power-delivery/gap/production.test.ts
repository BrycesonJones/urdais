import { describe, expect, it } from "vitest";

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { calculateDeliveryGaps } from "@/lib/power-delivery/gap/calculate";

/**
 * The production calculation path against one database that persists between runs, so that
 * supersession is exercised rather than simulated. The PD-5A tests prove which pairs are eligible;
 * these prove what happens to the rows when a source moves underneath them.
 */
type Row = { year: number; season: string; demand: string; capacity: string; pointId: string; resultId: string };

const TEN: Row[] = [2026, 2027, 2028, 2029, 2030].flatMap((year) => [
  { year, season: "summer", demand: `${90_000 + year}`, capacity: "100000", pointId: `d-${year}s`, resultId: `c-${year}s` },
  { year, season: "winter", demand: `${110_000 + year}`, capacity: "95000", pointId: `d-${year}w`, resultId: `c-${year}w` },
]);

function persistentDatabase(initial: Row[]) {
  let inputs = [...initial];
  type Gap = { id: string; cols: Record<string, unknown>; supersededBy: string | null };
  const gaps = new Map<string, Gap>();
  const frozen: { resultId: string; kind: string; rowId: string }[] = [];
  let statements = 0;

  const sql: CapacitySqlExecutor = {
    async query(text, params) {
      const p = params as unknown[];
      statements += 1;
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };
      if (text.includes("from reference.methodology_versions")) {
        return { rows: [{ id: "mv", version: "1.0.0", status: "approved" }] };
      }
      if (text.includes("from reference.source_use_permissions")) {
        return { rows: [{
          slug: p[0], name: String(p[0]), purpose_code: p[1],
          rights_classification: "reusable_with_attribution_or_conditions", disposition: "permitted",
          attribution_required: true, attribution_text: "Source: ERCOT.", conditions: null,
          unresolved_issue: null, terms_document_url: null, reviewed_by: "t", reviewed_on: "2026-09-21",
        }] };
      }
      if (text.includes("from reference.grid_areas where slug")) return { rows: [{ id: "area-ercot" }] };
      if (text.includes("from pipeline.planning_forecast_vintages")) {
        return { rows: [{ id: "dv", native_vintage_key: "ltlf-2025-04-adjusted" }] };
      }
      if (text.includes("from pipeline.planning_forecast_points")) {
        return { rows: inputs.map((row) => ({
          id: row.pointId, scenario_id: "ds", target_year: row.year, target_season: row.season,
          peak_type: "coincident_peak", value: row.demand, unit: "MW",
        })) };
      }
      if (text.includes("from pipeline.deliverable_capacity_results") && text.includes("grid_capacity_scenarios")) {
        return { rows: inputs.map((row) => ({
          id: row.resultId, scenario_id: "cs", target_year: row.year, target_season: row.season,
          value: row.capacity, unit: "MW", capacity_basis: "accredited", native_vintage_key: "cdr-2025-12",
        })) };
      }
      if (text.includes("from pipeline.delivery_gap_results")) {
        return { rows: [...gaps.values()].filter((gap) => gap.supersededBy === null)
          .map((gap) => ({ ...gap.cols, id: gap.id })) };
      }
      if (text.includes("update pipeline.delivery_gap_results")) {
        const gap = gaps.get(String(p[0]));
        if (gap === undefined) throw new Error("supersede: unknown gap");
        gap.supersededBy = String(p[1]);
        return { rows: [] };
      }
      if (text.includes("insert into pipeline.delivery_gap_results")) {
        gaps.set(String(p[0]), { id: String(p[0]), supersededBy: null, cols: {
          demand_scenario_id: p[3], capacity_scenario_id: p[4], period_basis: p[5],
          target_year: p[6], target_season: p[7], peak_type: p[8],
          demand_value: p[9], capacity_value: p[10],
          gap_value: String(Number(p[9]) - Number(p[10])),
          unit: p[11], capacity_basis: p[12], publication_state: p[13],
        } });
        return { rows: [] };
      }
      if (text.includes("insert into pipeline.delivery_gap_result_inputs")) {
        frozen.push({ resultId: String(p[0]), kind: String(p[1]), rowId: String(p[2] ?? p[3]) });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text.slice(0, 60)}`);
    },
  };

  return {
    sql, gaps, frozen,
    live: () => [...gaps.values()].filter((gap) => gap.supersededBy === null),
    superseded: () => [...gaps.values()].filter((gap) => gap.supersededBy !== null),
    restateDemand: (year: number, season: string, demand: string) => {
      inputs = inputs.map((row) => row.year === year && row.season === season
        ? { ...row, demand, pointId: `${row.pointId}-v2` } : row);
    },
    restateCapacity: (year: number, season: string, capacity: string) => {
      inputs = inputs.map((row) => row.year === year && row.season === season
        ? { ...row, capacity, resultId: `${row.resultId}-v2` } : row);
    },
    statementCount: () => statements,
    resetStatements: () => { statements = 0; },
  };
}

const ercot = { markets: ["ercot"] };

describe("the production calculation path", () => {
  it("inserts ten on a first calculation", async () => {
    const db = persistentDatabase(TEN);
    const report = await calculateDeliveryGaps(db.sql, ercot);
    const outcome = report.outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.paired).toBe(10);
    expect(outcome?.inserted).toBe(10);
    expect(outcome?.revised).toBe(0);
    expect(db.live()).toHaveLength(10);
    // Two frozen rows behind each gap.
    expect(db.frozen).toHaveLength(20);
  });

  it("writes nothing on an exact rerun", async () => {
    const db = persistentDatabase(TEN);
    await calculateDeliveryGaps(db.sql, ercot);
    const rerun = await calculateDeliveryGaps(db.sql, ercot);
    const outcome = rerun.outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.inserted).toBe(0);
    expect(outcome?.revised).toBe(0);
    expect(outcome?.unchanged).toBe(10);
    expect(db.live()).toHaveLength(10);
    expect(db.frozen).toHaveLength(20);
  });

  it("revises only the gaps a restated demand point touches", async () => {
    const db = persistentDatabase(TEN);
    await calculateDeliveryGaps(db.sql, ercot);
    db.restateDemand(2028, "summer", "125000");
    const second = await calculateDeliveryGaps(db.sql, ercot);
    const outcome = second.outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.revised).toBe(1);
    expect(outcome?.inserted).toBe(0);
    expect(outcome?.unchanged).toBe(9);
    expect(db.live()).toHaveLength(10);
    // The old row is kept, superseded rather than edited.
    expect(db.superseded()).toHaveLength(1);
  });

  it("revises only the gaps a restated capacity result touches", async () => {
    const db = persistentDatabase(TEN);
    await calculateDeliveryGaps(db.sql, ercot);
    db.restateCapacity(2030, "winter", "101000");
    const outcome = (await calculateDeliveryGaps(db.sql, ercot)).outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.revised).toBe(1);
    expect(outcome?.unchanged).toBe(9);
    expect(db.superseded()).toHaveLength(1);
  });

  it("keeps a superseded gap reconstructible from the rows it froze", async () => {
    const db = persistentDatabase(TEN);
    await calculateDeliveryGaps(db.sql, ercot);
    const before = db.live().find((gap) => gap.cols.target_year === 2028 && gap.cols.target_season === "summer")!;
    db.restateDemand(2028, "summer", "125000");
    await calculateDeliveryGaps(db.sql, ercot);

    const old = db.superseded()[0]!;
    expect(old.id).toBe(before.id);
    // Its own numbers are unchanged, and its frozen inputs still name the rows it used.
    expect(old.cols.demand_value).toBe(before.cols.demand_value);
    expect(Number(old.cols.gap_value))
      .toBeCloseTo(Number(old.cols.demand_value) - Number(old.cols.capacity_value), 6);
    const inputs = db.frozen.filter((input) => input.resultId === old.id);
    expect(inputs).toHaveLength(2);
    expect(inputs.map((input) => input.rowId).sort()).toEqual(["c-2028s", "d-2028s"]);
  });

  it("points every frozen input at a demand row and a capacity row, never at neither", async () => {
    const db = persistentDatabase(TEN);
    await calculateDeliveryGaps(db.sql, ercot);
    for (const gap of db.live()) {
      const inputs = db.frozen.filter((input) => input.resultId === gap.id);
      expect(inputs.map((input) => input.kind).sort()).toEqual(["capacity_result", "planning_point"]);
      for (const input of inputs) expect(input.rowId).not.toBe("null");
    }
  });

  it("costs a handful of statements, not one per row", async () => {
    // Ten gaps: a methodology lookup, two rights lookups, an area lookup, a vintage lookup, two
    // input queries, one live-gap query, then two writes per gap. No N+1 over the series.
    const db = persistentDatabase(TEN);
    db.resetStatements();
    await calculateDeliveryGaps(db.sql, ercot);
    expect(db.statementCount()).toBeLessThan(45);

    db.resetStatements();
    await calculateDeliveryGaps(db.sql, ercot);
    // A rerun that writes nothing issues only the reads.
    expect(db.statementCount()).toBeLessThan(15);
  });
});

describe("rights and currentness in production", () => {
  it("withholds publication when either source's permission is removed", async () => {
    for (const refused of ["ercot-long-term-load-forecast", "ercot-capacity-demand-reserves"]) {
      const db = persistentDatabase(TEN);
      const inner = db.sql.query.bind(db.sql);
      const sql: CapacitySqlExecutor = {
        async query(text, params) {
          if (text.includes("from reference.source_use_permissions") && (params as unknown[])[0] === refused) {
            return { rows: [] };
          }
          return inner(text, params);
        },
      };
      const outcome = (await calculateDeliveryGaps(sql, ercot)).outcomes.find((o) => o.marketSlug === "ercot");
      expect(outcome?.publicationState).toBe("internal_only");
      expect(outcome?.rightsReason).toContain(refused);
      // Computed and retained; only publication is withheld.
      expect(db.live()).toHaveLength(10);
    }
  });

  it("revises the stored rows when publication eligibility changes", async () => {
    const db = persistentDatabase(TEN);
    await calculateDeliveryGaps(db.sql, ercot);
    expect(db.live().every((gap) => gap.cols.publication_state === "publication_candidate")).toBe(true);

    const inner = db.sql.query.bind(db.sql);
    const withdrawn: CapacitySqlExecutor = {
      async query(text, params) {
        if (text.includes("from reference.source_use_permissions")) return { rows: [] };
        return inner(text, params);
      },
    };
    const outcome = (await calculateDeliveryGaps(withdrawn, ercot)).outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.revised).toBe(10);
    expect(db.live().every((gap) => gap.cols.publication_state === "internal_only")).toBe(true);
    // The publishable versions are kept as history rather than deleted.
    expect(db.superseded()).toHaveLength(10);
  });
});
