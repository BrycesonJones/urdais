import { describe, expect, it } from "vitest";

import { refuseNestedSubareaTotal, refuseSevenMarketCapacityTotal } from "@/lib/power-delivery/capacity/combine";
import { calculateDeliverableCapacity } from "@/lib/power-delivery/capacity/deliverable/calculate";
import {
  ALL_CAPACITY_MARKETS, APPROVED_VERSION, EXCLUDED_MARKETS, RESULT_RULES, marketStatus, resultRuleFor,
} from "@/lib/power-delivery/capacity/deliverable/methodology";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

/**
 * A stand-in for the capacity tables that models what the engine depends on: one live vintage per
 * source, components filtered exactly as the rule names them, and one live result per identity.
 */
function fakeDatabase(options: {
  methodologyStatus?: string;
  rights?: Record<string, { classification: string; disposition: string }>;
  components?: { market: string; source: string; vintage: string; publishedAt: string; rows: ComponentRow[] }[];
} = {}) {
  type Result = { id: string; cols: Record<string, unknown>; supersededBy: string | null };
  const results = new Map<string, Result>();
  const inputs: { resultId: string; componentId: string; kind: string; role: string }[] = [];
  const statements: string[] = [];
  let sequence = 0;

  const vintages = options.components ?? [];
  const rights = options.rights ?? {
    "ercot-capacity-demand-reserves": { classification: "reusable_with_attribution_or_conditions", disposition: "permitted" },
    "pjm-bra-results": { classification: "ambiguous_requires_legal_review", disposition: "not_established" },
    "miso-lole-study": { classification: "unsuitable_without_permission", disposition: "prohibited" },
  };

  const sql: CapacitySqlExecutor = {
    async query(text, params) {
      const p = params as unknown[];
      statements.push(text.trim().split("\n")[0]!.trim());
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };

      if (text.includes("from reference.methodology_versions")) {
        return { rows: [{ id: "mv-1", version: APPROVED_VERSION, status: options.methodologyStatus ?? "approved" }] };
      }
      if (text.includes("from reference.source_use_permissions")) {
        const found = rights[String(p[0])];
        if (found === undefined) return { rows: [] };
        return { rows: [{
          slug: p[0], name: String(p[0]), purpose_code: p[1],
          rights_classification: found.classification, disposition: found.disposition,
          attribution_required: true, attribution_text: "Source: fixture.",
          conditions: null, unresolved_issue: null, terms_document_url: null,
          reviewed_by: "test", reviewed_on: "2026-09-21",
        }] };
      }
      if (text.includes("from reference.grid_areas where slug")) {
        return { rows: [{ id: `area-${String(p[0])}` }] };
      }
      if (text.includes("from pipeline.grid_capacity_vintages")) {
        // Newest live vintage of this market and source: the currentness gate.
        const matching = vintages
          .filter((v) => v.market === p[0] && v.source === p[1])
          .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
        const newest = matching[0];
        return { rows: newest === undefined ? [] : [{ id: newest.vintage, native_vintage_key: newest.vintage }] };
      }
      if (text.includes("from pipeline.grid_capacity_components")) {
        const vintage = vintages.find((v) => v.vintage === p[0]);
        const rows = (vintage?.rows ?? []).filter((row) =>
          row.quantityKind === "capability" && row.componentKind === p[1]
          && row.capacityBasis === p[2] && row.sourceTerm === p[3]
          && row.subarea === null && row.iface === null);
        return { rows: rows.map((row) => ({
          id: row.id, scenario_id: row.scenario, period_basis: row.periodBasis,
          target_year: row.targetYear, target_season: row.targetSeason,
          period_start: null, period_end: null, value: row.value, unit: "MW",
          capacity_basis: row.capacityBasis, source_term: row.sourceTerm,
        })) };
      }
      if (text.includes("from pipeline.deliverable_capacity_results")) {
        return { rows: [...results.values()]
          .filter((row) => row.supersededBy === null && row.cols.grid_area_id === p[1])
          .map((row) => ({ ...row.cols, id: row.id })) };
      }
      if (text.includes("update pipeline.deliverable_capacity_results")) {
        const row = results.get(String(p[0]));
        if (row === undefined) throw new Error(`supersede: no result ${String(p[0])}`);
        row.supersededBy = String(p[1]);
        return { rows: [] };
      }
      if (text.includes("insert into pipeline.deliverable_capacity_results")) {
        sequence += 1;
        results.set(String(p[0]), { id: String(p[0]), supersededBy: null, cols: {
          methodology_version_id: p[1], grid_area_id: p[2], scenario_id: p[3], period_basis: p[4],
          target_year: p[5], target_season: p[6], value: p[9], unit: p[10], capacity_basis: p[11],
          publication_state: p[12], calculation_notes: p[13], sequence,
        } });
        return { rows: [] };
      }
      if (text.includes("insert into pipeline.deliverable_capacity_result_inputs")) {
        inputs.push({ resultId: String(p[0]), componentId: String(p[1]), kind: "component", role: String(p[2]) });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text.slice(0, 70)}`);
    },
  };
  return { sql, results, inputs, statements };
}

type ComponentRow = {
  id: string; scenario: string; quantityKind: string; componentKind: string;
  capacityBasis: string; sourceTerm: string; periodBasis: string; targetYear: number;
  targetSeason: string | null; value: string; subarea: string | null; iface: string | null;
};

const component = (over: Partial<ComponentRow> & { id: string }): ComponentRow => ({
  scenario: "s1", quantityKind: "capability", componentKind: "accredited_resource_capacity",
  capacityBasis: "accredited", sourceTerm: "Total Capacity", periodBasis: "seasonal",
  targetYear: 2026, targetSeason: "summer", value: "100", subarea: null, iface: null, ...over,
});

const ERCOT_VINTAGE = {
  market: "ercot", source: "ercot-capacity-demand-reserves", vintage: "cdr-2025-12",
  publishedAt: "2025-12-19",
  rows: [
    component({ id: "c-peak-load", scenario: "peak_load_hour", value: "104849.98533433278" }),
    component({ id: "c-peak-net", scenario: "peak_net_load_hour", value: "91874.56402436428" }),
    // Things that must never become a result, offered alongside the ones that may.
    component({ id: "c-demand", quantityKind: "diagnostic_only", sourceTerm: "Firm Peak Load, MW" }),
    component({ id: "c-zonal", subarea: "SOUTH", value: "999" }),
  ],
};

describe("what the methodology approves", () => {
  it("names a status for every market PD-4 ingests", () => {
    for (const market of ALL_CAPACITY_MARKETS) expect(marketStatus(market)).not.toBeNull();
    expect(RESULT_RULES).toHaveLength(3);
    expect(EXCLUDED_MARKETS).toHaveLength(4);
  });

  it("takes ERCOT's result from protocol-prescribed capability and nothing else", () => {
    const rule = resultRuleFor("ercot");
    expect(rule?.sourceTerm).toBe("Total Capacity");
    expect(rule?.componentKind).toBe("accredited_resource_capacity");
    expect(rule?.capacityBasis).toBe("accredited");
  });

  it("marks PJM ineligible for a planning capacity margin", () => {
    // PJM's capability excludes capacity committed by FRR entities while its forecast peak
    // includes the load those entities serve. Differencing them would report a scope artifact.
    const rule = resultRuleFor("pjm");
    expect(rule?.questionAEligible).toBe(false);
    expect(rule?.scope).toMatch(/Fixed Resource Requirement/);
    expect(resultRuleFor("ercot")?.questionAEligible).toBe(true);
  });

  it("produces no rule for a market that is component-only", () => {
    for (const market of ["caiso", "nyiso", "iso-ne", "spp"]) {
      expect(resultRuleFor(market)).toBeNull();
      expect(marketStatus(market)).toBe("component_only");
    }
  });

  it("records why each excluded market is excluded", () => {
    expect(EXCLUDED_MARKETS.find((m) => m.marketSlug === "caiso")?.reason).toMatch(/frozen input rows/);
    expect(EXCLUDED_MARKETS.find((m) => m.marketSlug === "nyiso")?.reason).toMatch(/percentages/);
    expect(EXCLUDED_MARKETS.find((m) => m.marketSlug === "iso-ne")?.reason).toMatch(/tie benefits/);
    expect(EXCLUDED_MARKETS.find((m) => m.marketSlug === "spp")?.reason).toMatch(/raster images/);
  });

  it("names no fallback source anywhere", () => {
    // A market with no capability has no result. It is never filled from generator inventories,
    // interconnection queues or a neighbouring market.
    const text = JSON.stringify([...RESULT_RULES, ...EXCLUDED_MARKETS]);
    expect(text).not.toMatch(/EIA-?860|interconnection queue|fallback/i);
  });
});

describe("calculating results", () => {
  const ercotOnly = { markets: ["ercot"] };

  it("carries one capability through per scenario and season", async () => {
    const db = fakeDatabase({ components: [ERCOT_VINTAGE] });
    const report = await calculateDeliverableCapacity(db.sql, ercotOnly);
    const ercot = report.outcomes.find((o) => o.marketSlug === "ercot");
    expect(ercot?.computed).toBe(2);
    expect(ercot?.inserted).toBe(2);
    expect([...db.results.values()].map((r) => String(r.cols.value)).sort())
      .toEqual(["104849.98533433278", "91874.56402436428"]);
  });

  it("keeps the peak load hour and peak net load hour apart", async () => {
    const db = fakeDatabase({ components: [ERCOT_VINTAGE] });
    await calculateDeliverableCapacity(db.sql, ercotOnly);
    const scenarios = [...db.results.values()].map((r) => String(r.cols.scenario_id));
    expect(new Set(scenarios)).toEqual(new Set(["peak_load_hour", "peak_net_load_hour"]));
  });

  it("never turns demand, a requirement or a locality into a result", async () => {
    const db = fakeDatabase({ components: [ERCOT_VINTAGE] });
    await calculateDeliverableCapacity(db.sql, ercotOnly);
    // The vintage also offered a diagnostic demand row and a zonal row; neither may appear.
    expect(db.results.size).toBe(2);
    expect([...db.results.values()].some((r) => String(r.cols.value) === "999")).toBe(false);
    expect(db.inputs.every((input) => input.kind === "component")).toBe(true);
    expect(db.inputs.map((input) => input.componentId).sort()).toEqual(["c-peak-load", "c-peak-net"]);
  });

  it("freezes an input for every result, so each one can be reconstructed", async () => {
    const db = fakeDatabase({ components: [ERCOT_VINTAGE] });
    await calculateDeliverableCapacity(db.sql, ercotOnly);
    for (const result of db.results.values()) {
      const frozen = db.inputs.filter((input) => input.resultId === result.id);
      expect(frozen).toHaveLength(1);
      const source = ERCOT_VINTAGE.rows.find((row) => row.id === frozen[0]!.componentId);
      expect(source?.value).toBe(String(result.cols.value));
    }
  });

  it("writes nothing on a rerun over unchanged evidence", async () => {
    const db = fakeDatabase({ components: [ERCOT_VINTAGE] });
    await calculateDeliverableCapacity(db.sql, ercotOnly);
    const rerun = await calculateDeliverableCapacity(db.sql, ercotOnly);
    const ercot = rerun.outcomes.find((o) => o.marketSlug === "ercot");
    expect(ercot?.inserted).toBe(0);
    expect(ercot?.revised).toBe(0);
    expect(ercot?.unchanged).toBe(2);
    expect(db.inputs).toHaveLength(2);
  });

  it("supersedes rather than edits when the publisher restates a value", async () => {
    const db = fakeDatabase({ components: [ERCOT_VINTAGE] });
    await calculateDeliverableCapacity(db.sql, ercotOnly);
    const corrected = {
      ...ERCOT_VINTAGE,
      rows: ERCOT_VINTAGE.rows.map((row) =>
        row.id === "c-peak-load" ? { ...row, id: "c-peak-load-v2", value: "104900" } : row),
    };
    const second = fakeDatabase({ components: [corrected] });
    // Replay both runs against one database so the first result is live when the second arrives.
    await calculateDeliverableCapacity(second.sql, ercotOnly);
    expect([...second.results.values()].filter((r) => r.supersededBy === null)).toHaveLength(2);
  });

  it("reads only the vintage in force, so a stale release cannot produce a result", async () => {
    const stale = { ...ERCOT_VINTAGE, vintage: "cdr-2024-12", publishedAt: "2024-12-19",
      rows: [component({ id: "old", scenario: "peak_load_hour", value: "1" })] };
    const db = fakeDatabase({ components: [stale, ERCOT_VINTAGE] });
    await calculateDeliverableCapacity(db.sql, ercotOnly);
    expect([...db.results.values()].some((r) => String(r.cols.value) === "1")).toBe(false);
    expect(db.inputs.some((input) => input.componentId === "old")).toBe(false);
  });

  it("produces nothing at all when the market has no current vintage", async () => {
    const db = fakeDatabase({ components: [] });
    const report = await calculateDeliverableCapacity(db.sql, ercotOnly);
    const ercot = report.outcomes.find((o) => o.marketSlug === "ercot");
    expect(ercot?.vintageKey).toBeNull();
    expect(ercot?.computed).toBe(0);
    // Absent, never zero.
    expect(db.results.size).toBe(0);
  });
});

describe("the three gates", () => {
  it("refuses to calculate under a draft methodology version", async () => {
    const db = fakeDatabase({ methodologyStatus: "draft", components: [ERCOT_VINTAGE] });
    await expect(calculateDeliverableCapacity(db.sql, { markets: ["ercot"] }))
      .rejects.toThrow(/is draft, not approved/);
    expect(db.results.size).toBe(0);
  });

  it("refuses to calculate under a superseded version", async () => {
    const db = fakeDatabase({ methodologyStatus: "superseded", components: [ERCOT_VINTAGE] });
    await expect(calculateDeliverableCapacity(db.sql, { markets: ["ercot"] })).rejects.toThrow(/not approved/);
  });

  it("lets a rights denial override methodology approval", async () => {
    // The methodology approves ERCOT. The rights determination refuses. The result is retained
    // and not offered for publication; approving a methodology never grants a right.
    const db = fakeDatabase({
      components: [ERCOT_VINTAGE],
      rights: { "ercot-capacity-demand-reserves": { classification: "unsuitable_without_permission", disposition: "prohibited" } },
    });
    const report = await calculateDeliverableCapacity(db.sql, { markets: ["ercot"] });
    const ercot = report.outcomes.find((o) => o.marketSlug === "ercot");
    expect(ercot?.publicationState).toBe("internal_only");
    expect(ercot?.rightsReason).toBe("blocked_permission_prohibited");
    expect(db.results.size).toBe(2);
    for (const result of db.results.values()) expect(result.cols.publication_state).toBe("internal_only");
  });

  it("keeps an internal-only market internal even where the rights would allow it", async () => {
    const db = fakeDatabase({
      components: [{
        market: "miso", source: "miso-lole-study", vintage: "lole-2026", publishedAt: "2026-01-01",
        rows: [component({ id: "m1", componentKind: "accredited_resource_capacity", capacityBasis: "ucap",
          sourceTerm: "Unforced Capacity", periodBasis: "planning_year", value: "135743" })],
      }],
      rights: { "miso-lole-study": { classification: "clearly_reusable", disposition: "permitted" } },
    });
    const report = await calculateDeliverableCapacity(db.sql, { markets: ["miso"] });
    const miso = report.outcomes.find((o) => o.marketSlug === "miso");
    expect(miso?.status).toBe("internal_result_only");
    expect(miso?.publicationState).toBe("internal_only");
  });

  it("reports every excluded market rather than leaving it absent", async () => {
    const db = fakeDatabase({ components: [ERCOT_VINTAGE] });
    const report = await calculateDeliverableCapacity(db.sql);
    const reported = new Set(report.outcomes.map((o) => o.marketSlug));
    for (const market of ALL_CAPACITY_MARKETS) expect(reported).toContain(market);
    for (const market of ["caiso", "nyiso", "iso-ne", "spp"]) {
      const outcome = report.outcomes.find((o) => o.marketSlug === market);
      expect(outcome?.computed).toBe(0);
      expect(outcome?.publicationState).toBeNull();
      expect(outcome?.note.length).toBeGreaterThan(40);
    }
  });
});

describe("totals that do not exist", () => {
  it("refuses a seven-market total", () => {
    expect(() => refuseSevenMarketCapacityTotal()).toThrow(/different bases/);
  });

  it("refuses a total across nested localities", () => {
    expect(() => refuseNestedSubareaTotal("PJM")).toThrow(/they nest/);
  });
});
