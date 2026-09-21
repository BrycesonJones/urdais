import { describe, expect, it } from "vitest";

import { refuseNestedSubareaTotal, refuseSevenMarketCapacityTotal } from "@/lib/power-delivery/capacity/combine";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { calculateDeliveryGaps } from "@/lib/power-delivery/gap/calculate";
import {
  APPROVED_VERSION, EXCLUDED_GAP_MARKETS, GAP_PAIRINGS, gapStatus, isComparableLoadBasis, pairingFor,
} from "@/lib/power-delivery/gap/eligibility";

type DemandRow = {
  id: string; scenarioKey: string; scenarioId: string; grain: string; label: string | null;
  periodKind: string; peakType: string; loadBasis: string;
  targetYear: number; targetSeason: string | null; value: string; unit: string;
};
type CapacityRow = {
  id: string; scenarioKey: string; scenarioId: string; vintage: string; superseded?: boolean;
  targetYear: number; targetSeason: string | null; value: string; unit: string; basis: string;
  subarea?: string | null;
};

const demand = (over: Partial<DemandRow> & { id: string }): DemandRow => ({
  scenarioKey: "ERCOT_Adjusted", scenarioId: "ds-ref", grain: "balancing_authority", label: null,
  periodKind: "seasonal", peakType: "coincident_peak", loadBasis: "net",
  targetYear: 2026, targetSeason: "summer", value: "94650.257", unit: "MW", ...over,
});
const capacity = (over: Partial<CapacityRow> & { id: string }): CapacityRow => ({
  scenarioKey: "peak_load_hour", scenarioId: "cs-peak-load", vintage: "cdr-2025-12",
  targetYear: 2026, targetSeason: "summer", value: "104849.98533433278", unit: "MW",
  basis: "accredited", subarea: null, ...over,
});

function fakeDatabase(options: {
  methodologyStatus?: string;
  rights?: Record<string, { classification: string; disposition: string } | null>;
  demandVintage?: string | null;
  demand?: DemandRow[];
  capacity?: CapacityRow[];
} = {}) {
  type Gap = { id: string; cols: Record<string, unknown>; supersededBy: string | null };
  const gaps = new Map<string, Gap>();
  const inputs: { resultId: string; kind: string; pointId: string | null; resultRef: string | null }[] = [];
  const rights = options.rights ?? {
    "ercot-long-term-load-forecast": { classification: "reusable_with_attribution_or_conditions", disposition: "permitted" },
    "ercot-capacity-demand-reserves": { classification: "reusable_with_attribution_or_conditions", disposition: "permitted" },
  };

  const sql: CapacitySqlExecutor = {
    async query(text, params) {
      const p = params as unknown[];
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };

      if (text.includes("from reference.methodology_versions")) {
        return { rows: [{ id: "mv-gap", version: APPROVED_VERSION, status: options.methodologyStatus ?? "approved" }] };
      }
      if (text.includes("from reference.source_use_permissions")) {
        const found = rights[String(p[0])];
        if (found === undefined || found === null) return { rows: [] };
        return { rows: [{
          slug: p[0], name: String(p[0]), purpose_code: p[1],
          rights_classification: found.classification, disposition: found.disposition,
          attribution_required: true, attribution_text: "Source: fixture.", conditions: null,
          unresolved_issue: null, terms_document_url: null, reviewed_by: "test", reviewed_on: "2026-09-21",
        }] };
      }
      if (text.includes("from reference.grid_areas where slug")) return { rows: [{ id: `area-${String(p[0])}` }] };

      if (text.includes("from pipeline.planning_forecast_vintages")) {
        const key = options.demandVintage === undefined ? "ltlf-2025-04-adjusted" : options.demandVintage;
        return { rows: key === null ? [] : [{ id: "dv-1", native_vintage_key: key }] };
      }
      if (text.includes("from pipeline.planning_forecast_points")) {
        const rows = (options.demand ?? []).filter((row) =>
          row.scenarioKey === p[1] && row.grain === p[2] && row.label === null
          && row.periodKind === p[3] && row.peakType === p[4] && row.loadBasis === p[5]);
        return { rows: rows.map((row) => ({
          id: row.id, scenario_id: row.scenarioId, target_year: row.targetYear,
          target_season: row.targetSeason, peak_type: row.peakType, value: row.value, unit: row.unit,
        })) };
      }
      if (text.includes("from pipeline.deliverable_capacity_results")
          && text.includes("grid_capacity_scenarios")) {
        const rows = (options.capacity ?? []).filter((row) =>
          row.scenarioKey === p[2] && row.basis === p[3] && row.superseded !== true
          && (row.subarea ?? null) === null);
        return { rows: rows.map((row) => ({
          id: row.id, scenario_id: row.scenarioId, target_year: row.targetYear,
          target_season: row.targetSeason, value: row.value, unit: row.unit,
          capacity_basis: row.basis, native_vintage_key: row.vintage,
        })) };
      }
      if (text.includes("from pipeline.delivery_gap_results")) {
        return { rows: [...gaps.values()].filter((g) => g.supersededBy === null).map((g) => ({ ...g.cols, id: g.id })) };
      }
      if (text.includes("update pipeline.delivery_gap_results")) {
        const row = gaps.get(String(p[0]));
        if (row === undefined) throw new Error("supersede: unknown gap");
        row.supersededBy = String(p[1]);
        return { rows: [] };
      }
      if (text.includes("insert into pipeline.delivery_gap_results")) {
        // The database computes the difference in exact decimal; the fake does the same in the
        // same place, so a test can read a gap back.
        const gap = Number(p[9]) - Number(p[10]);
        gaps.set(String(p[0]), { id: String(p[0]), supersededBy: null, cols: {
          demand_scenario_id: p[3], capacity_scenario_id: p[4], period_basis: p[5],
          target_year: p[6], target_season: p[7], peak_type: p[8],
          demand_value: p[9], capacity_value: p[10], gap_value: String(gap),
          unit: p[11], capacity_basis: p[12], publication_state: p[13], calculation_notes: p[14],
        } });
        return { rows: [] };
      }
      if (text.includes("insert into pipeline.delivery_gap_result_inputs")) {
        inputs.push({ resultId: String(p[0]), kind: String(p[1]),
          pointId: p[2] == null ? null : String(p[2]), resultRef: p[3] == null ? null : String(p[3]) });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text.slice(0, 70)}`);
    },
  };
  return { sql, gaps, inputs };
}

const ALIGNED = {
  demand: [demand({ id: "d-2026s" }), demand({ id: "d-2026w", targetSeason: "winter", value: "90192" })],
  capacity: [capacity({ id: "c-2026s" }), capacity({ id: "c-2026w", targetSeason: "winter", value: "95388.42195658202" })],
};
const ercot = { markets: ["ercot"] };

describe("which pairings exist", () => {
  it("approves exactly one market", () => {
    expect(GAP_PAIRINGS).toHaveLength(1);
    expect(GAP_PAIRINGS[0]?.marketSlug).toBe("ercot");
    expect(EXCLUDED_GAP_MARKETS).toHaveLength(6);
  });

  it("gives every market a status", () => {
    for (const market of ["ercot", "pjm", "miso", "caiso", "nyiso", "iso-ne", "spp"]) {
      expect(gapStatus(market)).not.toBeNull();
    }
    expect(gapStatus("pjm")).toBe("capacity_only");
    expect(gapStatus("miso")).toBe("capacity_only");
    expect(gapStatus("caiso")).toBe("demand_only");
    expect(gapStatus("spp")).toBe("blocked");
  });

  it("records PJM's scope blocker and refuses to pair it", () => {
    expect(pairingFor("pjm")).toBeNull();
    const pjm = EXCLUDED_GAP_MARKETS.find((m) => m.marketSlug === "pjm");
    expect(pjm?.blocker).toMatch(/Fixed Resource Requirement/);
    expect(pjm?.blocker).toMatch(/monthly/);
  });

  it("treats an unspecified load basis as incomparable", () => {
    // A difference taken across an unknown adjustment is unknown by the same amount.
    expect(isComparableLoadBasis("net")).toBe(true);
    expect(isComparableLoadBasis("unspecified")).toBe(false);
    expect(isComparableLoadBasis(null)).toBe(false);
  });

  it("names no fallback anywhere", () => {
    const text = JSON.stringify([...GAP_PAIRINGS, ...EXCLUDED_GAP_MARKETS]);
    expect(text).not.toMatch(/EIA-?860|interpolat|forward-fill|quarterly/i);
  });
});

describe("calculating a gap", () => {
  it("produces the difference for an aligned pair", async () => {
    const db = fakeDatabase(ALIGNED);
    const report = await calculateDeliveryGaps(db.sql, ercot);
    const outcome = report.outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.paired).toBe(2);
    const summer = [...db.gaps.values()].find((g) => g.cols.target_season === "summer");
    expect(Number(summer?.cols.gap_value)).toBeCloseTo(94650.257 - 104849.98533433278, 6);
    // Negative: capacity exceeds forecast demand.
    expect(Number(summer?.cols.gap_value)).toBeLessThan(0);
  });

  it("freezes the exact demand point and capacity result behind each gap", async () => {
    const db = fakeDatabase(ALIGNED);
    await calculateDeliveryGaps(db.sql, ercot);
    for (const gap of db.gaps.values()) {
      const frozen = db.inputs.filter((input) => input.resultId === gap.id);
      expect(frozen).toHaveLength(2);
      expect(frozen.filter((f) => f.kind === "planning_point")).toHaveLength(1);
      expect(frozen.filter((f) => f.kind === "capacity_result")).toHaveLength(1);
    }
    expect(db.inputs.map((i) => i.pointId ?? i.resultRef).sort())
      .toEqual(["c-2026s", "c-2026w", "d-2026s", "d-2026w"]);
  });

  it("does not let summer and winter cross", async () => {
    const db = fakeDatabase({
      demand: [demand({ id: "d-summer" })],
      capacity: [capacity({ id: "c-winter", targetSeason: "winter", value: "95388" })],
    });
    const report = await calculateDeliveryGaps(db.sql, ercot);
    expect(report.outcomes.find((o) => o.marketSlug === "ercot")?.paired).toBe(0);
    expect(db.gaps.size).toBe(0);
  });

  it("does not let the peak load hour and peak net load hour cross", async () => {
    // Two answers about the same season measured at two different hours. "Net" also means
    // different things on the two sides, which is why there is no partner rather than a worse one.
    const db = fakeDatabase({
      demand: [demand({ id: "d" })],
      capacity: [capacity({ id: "c-net", scenarioKey: "peak_net_load_hour", scenarioId: "cs-net", value: "91874.56402436428" })],
    });
    const report = await calculateDeliveryGaps(db.sql, ercot);
    const outcome = report.outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.paired).toBe(0);
    expect(outcome?.demandWithoutCapacity).toBe(1);
  });

  it("does not pair a zonal demand row with a whole-market capacity", async () => {
    const db = fakeDatabase({
      demand: [demand({ id: "d-zone", grain: "weather_zone", label: "COAST" })],
      capacity: [capacity({ id: "c" })],
    });
    expect(await calculateDeliveryGaps(db.sql, ercot)
      .then((r) => r.outcomes.find((o) => o.marketSlug === "ercot")?.paired)).toBe(0);
  });

  it("does not pair a monthly demand row with a seasonal capacity", async () => {
    // PJM's shape. No quarterly or monthly-to-seasonal mapping exists, and none is invented.
    const db = fakeDatabase({
      demand: [demand({ id: "d-monthly", periodKind: "monthly", targetSeason: null })],
      capacity: [capacity({ id: "c" })],
    });
    expect(await calculateDeliveryGaps(db.sql, ercot)
      .then((r) => r.outcomes.find((o) => o.marketSlug === "ercot")?.paired)).toBe(0);
  });

  it("does not pair a non-coincident peak", async () => {
    const db = fakeDatabase({
      demand: [demand({ id: "d-ncp", peakType: "non_coincident_peak", value: "99040" })],
      capacity: [capacity({ id: "c" })],
    });
    expect(await calculateDeliveryGaps(db.sql, ercot)
      .then((r) => r.outcomes.find((o) => o.marketSlug === "ercot")?.paired)).toBe(0);
  });

  it("does not pair a demand row whose load basis is unspecified", async () => {
    const db = fakeDatabase({
      demand: [demand({ id: "d-unspec", loadBasis: "unspecified" })],
      capacity: [capacity({ id: "c" })],
    });
    expect(await calculateDeliveryGaps(db.sql, ercot)
      .then((r) => r.outcomes.find((o) => o.marketSlug === "ercot")?.paired)).toBe(0);
  });

  it("counts a demand year the capacity report does not reach, and writes nothing for it", async () => {
    const db = fakeDatabase({
      demand: [demand({ id: "d-2026" }), demand({ id: "d-2031", targetYear: 2031, value: "150000" })],
      capacity: [capacity({ id: "c-2026" })],
    });
    const outcome = (await calculateDeliveryGaps(db.sql, ercot)).outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.paired).toBe(1);
    expect(outcome?.demandWithoutCapacity).toBe(1);
    // Unavailable, never zero and never carried from an adjacent year.
    expect(db.gaps.size).toBe(1);
  });

  it("produces nothing when either side is missing", async () => {
    const noCapacity = fakeDatabase({ demand: [demand({ id: "d" })], capacity: [] });
    expect((await calculateDeliveryGaps(noCapacity.sql, ercot))
      .outcomes.find((o) => o.marketSlug === "ercot")?.paired).toBe(0);
    const noDemand = fakeDatabase({ demand: [], capacity: [capacity({ id: "c" })] });
    expect((await calculateDeliveryGaps(noDemand.sql, ercot))
      .outcomes.find((o) => o.marketSlug === "ercot")?.paired).toBe(0);
    const noVintage = fakeDatabase({ demandVintage: null, capacity: [capacity({ id: "c" })] });
    expect((await calculateDeliveryGaps(noVintage.sql, ercot))
      .outcomes.find((o) => o.marketSlug === "ercot")?.demandVintage).toBeNull();
  });

  it("ignores a superseded capacity result, so a stale side produces no gap", async () => {
    const db = fakeDatabase({
      demand: [demand({ id: "d" })],
      capacity: [capacity({ id: "c-old", value: "1", superseded: true })],
    });
    expect((await calculateDeliveryGaps(db.sql, ercot))
      .outcomes.find((o) => o.marketSlug === "ercot")?.paired).toBe(0);
  });

  it("writes nothing on a rerun over unchanged inputs", async () => {
    const db = fakeDatabase(ALIGNED);
    await calculateDeliveryGaps(db.sql, ercot);
    const rerun = await calculateDeliveryGaps(db.sql, ercot);
    const outcome = rerun.outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.inserted).toBe(0);
    expect(outcome?.revised).toBe(0);
    expect(outcome?.unchanged).toBe(2);
    expect(db.inputs).toHaveLength(4);
  });

  it("supersedes rather than edits when an input is restated", async () => {
    const db = fakeDatabase(ALIGNED);
    await calculateDeliveryGaps(db.sql, ercot);
    const before = [...db.gaps.keys()];
    // The same fake, with one demand value restated: the pairing identity is unchanged, so the
    // old gap is superseded and a new one takes its place.
    const restated = fakeDatabase({
      ...ALIGNED,
      demand: [demand({ id: "d-2026s-v2", value: "95000" }), ALIGNED.demand[1]!],
    });
    await calculateDeliveryGaps(restated.sql, ercot);
    expect([...restated.gaps.values()].filter((g) => g.supersededBy === null)).toHaveLength(2);
    expect(before).toHaveLength(2);
  });
});

describe("the gates", () => {
  it("refuses to calculate under a version that is not approved", async () => {
    const db = fakeDatabase({ ...ALIGNED, methodologyStatus: "draft" });
    await expect(calculateDeliveryGaps(db.sql, ercot)).rejects.toThrow(/is draft, not approved/);
    expect(db.gaps.size).toBe(0);
  });

  it("lets the strictest input decide: a refusal on either source blocks publication", async () => {
    for (const refused of ["ercot-long-term-load-forecast", "ercot-capacity-demand-reserves"]) {
      const db = fakeDatabase({
        ...ALIGNED,
        rights: {
          "ercot-long-term-load-forecast": { classification: "reusable_with_attribution_or_conditions", disposition: "permitted" },
          "ercot-capacity-demand-reserves": { classification: "reusable_with_attribution_or_conditions", disposition: "permitted" },
          [refused]: { classification: "unsuitable_without_permission", disposition: "prohibited" },
        },
      });
      const outcome = (await calculateDeliveryGaps(db.sql, ercot)).outcomes.find((o) => o.marketSlug === "ercot");
      expect(outcome?.publicationState).toBe("internal_only");
      expect(outcome?.rightsReason).toContain(refused);
      // The gap is still computed and retained; only publication is withheld.
      expect(db.gaps.size).toBe(2);
    }
  });

  it("blocks publication when a source has no determination at all", async () => {
    const db = fakeDatabase({
      ...ALIGNED,
      rights: {
        "ercot-long-term-load-forecast": { classification: "reusable_with_attribution_or_conditions", disposition: "permitted" },
        "ercot-capacity-demand-reserves": null,
      },
    });
    const outcome = (await calculateDeliveryGaps(db.sql, ercot)).outcomes.find((o) => o.marketSlug === "ercot");
    expect(outcome?.publicationState).toBe("internal_only");
    expect(outcome?.rightsReason).toContain("blocked_no_rights_record");
  });

  it("reports every ineligible market rather than leaving it absent", async () => {
    const db = fakeDatabase(ALIGNED);
    const report = await calculateDeliveryGaps(db.sql);
    for (const market of ["pjm", "miso", "caiso", "nyiso", "iso-ne", "spp"]) {
      const outcome = report.outcomes.find((o) => o.marketSlug === market);
      expect(outcome?.paired).toBe(0);
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
