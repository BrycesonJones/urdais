import { describe, expect, it, vi } from "vitest";

import * as aggregate from "@/lib/power-delivery/aggregate";
import * as read from "@/lib/power-delivery/planning/read";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

const VINTAGE = {
  id: "v1", native_vintage_key: "ltlf-2025-04-adjusted", native_report_id: null,
  report_title: "2025 Long-Term Load Forecast", published_at: "2025-04-15T00:00:00Z",
  published_at_precision: "day", retrieved_at: "2026-09-20T09:00:00Z",
  source_methodology_name: null, source_methodology_version: null,
  rights_classification: "reusable_with_attribution_or_conditions",
  publication_state: "published", quality_status: "accepted",
  superseded_by_id: null, superseded_at: null, supersession_reason: null, supersession_kind: null,
  grid_area_id: "area-ercot", market_slug: "ercot", market_name: "ERCOT", eia_ba_code: "ERCO",
  source_slug: "ercot-long-term-load-forecast", source_name: "ERCOT Long-Term Demand and Energy Forecast",
  rights_in_force: "reusable_with_attribution_or_conditions", disposition: "permitted",
  attribution_required: true, attribution_text: "Source: Electric Reliability Council of Texas, Inc.",
  conditions: "Credit ERCOT as the source.", unresolved_issue: null,
  terms_document_url: "https://www.ercot.com/help/terms", reviewed_by: "Urdais research",
  reviewed_on: "2026-09-19",
};

const BLOCKED = {
  ...VINTAGE, id: "v-spp", market_slug: "spp", market_name: "SPP", eia_ba_code: "SWPP",
  source_slug: "spp-resource-adequacy-report", source_name: "SPP Seasonal Resource Adequacy Report",
  rights_classification: "unsuitable_without_permission",
  rights_in_force: "unsuitable_without_permission", disposition: "prohibited",
  attribution_required: false, attribution_text: null,
};

const SCENARIO = {
  id: "s1", vintage_id: "v1", native_scenario_key: "ERCOT_Adjusted",
  native_scenario_label: "ERCOT Adjusted Forecast", canonical_class: "reference", is_reference: true,
  weather_basis: "p50", load_basis: "net", large_load_policy: "included_probability_weighted",
  assumptions: {}, assumptions_text: null,
};

const POINT = {
  id: "p1", vintage_id: "v1", scenario_id: "s1", grid_area_id: "area-ercot", raw_record_id: "r1",
  geographic_grain: "balancing_authority", native_geography_label: null,
  target_period_kind: "seasonal", target_year: 2031, target_season: "summer", target_timestamp: null,
  value: 144522, unit: "MW", peak_type: "non_coincident_peak", weather_basis: "p50",
  load_basis: "net", large_load_policy: "included_probability_weighted",
  source_methodology_name: null, source_methodology_version: null,
  quality_status: "accepted", superseded_by_id: null,
};

/** Routes on the table each query reads, so the read functions exercise their real SQL shape. */
function executor(vintageRow: Record<string, unknown> | null): PlanningSqlExecutor & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async query(text: string) {
      queries.push(text);
      if (text.includes("from pipeline.planning_forecast_vintages v")) {
        return { rows: vintageRow ? [vintageRow] : [] };
      }
      if (text.includes("from pipeline.planning_forecast_scenarios")) return { rows: [SCENARIO] };
      if (text.includes("from pipeline.planning_forecast_points")) return { rows: [POINT] };
      if (text.includes("from reference.source_use_permissions")) {
        return { rows: vintageRow ? [{ ...vintageRow, purpose_code: "public_raw_planning_value_display" }] : [] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

/**
 * Every public read, with the arguments it needs. The first test asserts this table is the whole
 * public family: a new `publishable*` export that forgot the policy fails here rather than in
 * production.
 */
const PUBLIC_READS: Record<string, (sql: PlanningSqlExecutor) => Promise<unknown>> = {
  publishableLatestVintageByMarket: (sql) => read.publishableLatestVintageByMarket(sql),
  publishableVintageById: (sql) => read.publishableVintageById(sql, "v1"),
  publishableVintageByKey: (sql) => read.publishableVintageByKey(sql, "ercot", "ltlf-2025-04-adjusted"),
  publishableVintagesForTargetYear: (sql) => read.publishableVintagesForTargetYear(sql, "ercot", 2031),
  publishableScenariosForVintage: (sql) => read.publishableScenariosForVintage(sql, "v1"),
  publishablePointsForScenario: (sql) => read.publishablePointsForScenario(sql, "v1", "s1"),
  publishablePlanningRights: (sql) => read.publishablePlanningRights(sql, "v1"),
};

const empty = (result: unknown) => result === null || (Array.isArray(result) && result.length === 0);

describe("planning read surface", () => {
  it("names every public read in the gating table", () => {
    const exported = Object.keys(read).filter((key) => key.startsWith("publishable")).sort();
    expect(exported).toEqual(Object.keys(PUBLIC_READS).sort());
  });

  it("returns nothing from any public read for a source the policy blocks", async () => {
    for (const [name, call] of Object.entries(PUBLIC_READS)) {
      const result = await call(executor(BLOCKED));
      expect(empty(result), `${name} leaked a blocked source`).toBe(true);
    }
  });

  it("returns nothing from any public read for an internal-only vintage", async () => {
    for (const [name, call] of Object.entries(PUBLIC_READS)) {
      const result = await call(executor({ ...VINTAGE, publication_state: "internal_only" }));
      expect(empty(result), `${name} leaked an internal-only vintage`).toBe(true);
    }
  });

  it("returns a permitted vintage with the decision that let it through", async () => {
    const [entry] = await read.publishableLatestVintageByMarket(executor(VINTAGE));
    expect(entry!.vintage.marketSlug).toBe("ercot");
    expect(entry!.publication).toMatchObject({
      allowed: true,
      reasonCode: "allowed_with_attribution_or_conditions",
      rightsClassification: "reusable_with_attribution_or_conditions",
      attributionText: "Source: Electric Reliability Council of Texas, Inc.",
    });
  });

  it("publishes an ambiguous source and keeps the unresolved issue attached to the value", async () => {
    const sql = executor({
      ...VINTAGE, market_slug: "pjm", source_slug: "pjm-load-forecast-report",
      rights_classification: "ambiguous_requires_legal_review",
      rights_in_force: "ambiguous_requires_legal_review", disposition: "not_established",
      attribution_text: "Source: PJM Interconnection, L.L.C.",
      unresolved_issue: "Does pjm.com copyright bar numeric tables in a commercial product?",
    });
    const entry = await read.publishableVintageById(sql, "v1");
    expect(entry!.publication.reasonCode).toBe("allowed_under_founder_accepted_legal_risk");
    expect(entry!.publication.rightsClassification).toBe("ambiguous_requires_legal_review");
    expect(entry!.publication.unresolvedIssue).toMatch(/copyright/);
    expect(await read.publishablePointsForScenario(sql, "v1", "s1")).toHaveLength(1);
  });

  it("lets internal reads see what the public surface may not", async () => {
    const blocked = await read.vintageByIdInternal(executor(BLOCKED), "v-spp");
    expect(blocked!.rights!.rightsClassification).toBe("unsuitable_without_permission");
    expect(blocked!.marketSlug).toBe("spp");
    const internalOnly = await read.latestVintageByMarketInternal(executor({ ...VINTAGE, publication_state: "internal_only" }));
    expect(internalOnly).toHaveLength(1);
  });

  it("reads the determination in force for the purpose it was asked about", async () => {
    const sql = executor(VINTAGE);
    await read.publishableLatestVintageByMarket(sql, "public_derived_planning_value_display");
    expect(sql.queries[0]).toContain("sup.purpose_code = $1");
  });

  it("never reaches the operational coincident aggregator", async () => {
    const spy = vi.spyOn(aggregate, "aggregateCoincidentActualLoad");
    const peak = vi.spyOn(aggregate, "peakOfCoincidentSeries");
    for (const call of Object.values(PUBLIC_READS)) await call(executor(VINTAGE));
    expect(spy).not.toHaveBeenCalled();
    expect(peak).not.toHaveBeenCalled();
    spy.mockRestore();
    peak.mockRestore();
  });

  it("offers no planning aggregation of its own", () => {
    const aggregating = Object.keys(read).filter((key) => /aggregate|total|sum|coincident/i.test(key));
    expect(aggregating).toEqual([]);
  });
});
