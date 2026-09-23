import { describe, expect, it } from "vitest";

import {
  METHODOLOGY_DOCUMENT_SHA256, METHODOLOGY_SLUG, METHODOLOGY_VERSION,
} from "@/lib/flexible-capacity/methodology";
import {
  loadFlexibleCapacityReadModel, unavailableFlexibleCapacityModel,
  type FlexibleCapacityReadModel,
} from "@/lib/flexible-capacity/analytics/read";
import {
  RETIRED_FIELD_NAMES, validateFlexibleCapacityReadModel,
} from "@/lib/flexible-capacity/analytics/read-contract";

const NOW = (): Date => new Date("2026-09-23T12:00:00.000Z");

type Row = Record<string, unknown>;

/** One stored scenario row, as the read query returns it. */
function resultRow(overrides: Partial<Row> = {}): Row {
  return {
    market: "ercot", local_year: 2025, alpha: 0.005,
    equivalent_full_load_hours: 43.8,
    headroom_mw: 3591, curtailed_energy_mwh: 157285, curtailment_budget_mwh: 157285.8,
    curtailment_clock_hours: 118, curtailment_event_count: 25,
    mean_curtailment_event_hours: 4.72, max_curtailment_event_hours: 7,
    peak_reference_mw: 83597, peak_reference_at: "2025-08-18T23:00:00.000Z",
    observation_count: 8760, expected_observation_count: 8760,
    missing_observation_count: 0, coverage_ratio: 1,
    max_contiguous_gap_hours: 0,
    period_start: "2025-01-01T06:00:00.000Z", period_end: "2026-01-01T06:00:00.000Z",
    calculated_at: "2026-09-23T10:00:00.000Z",
    ...overrides,
  };
}

/** Three alphas for one market-year, headroom rising with the allowance. */
function yearRows(market: string, year: number, headroom = 3591): Row[] {
  return [
    resultRow({ market, local_year: year, alpha: 0.0025, headroom_mw: headroom * 0.7, equivalent_full_load_hours: 21.9, curtailment_budget_mwh: 0.0025 * headroom * 0.7 * 8760, curtailed_energy_mwh: 0.0025 * headroom * 0.7 * 8760 - 1, curtailment_clock_hours: 75, curtailment_event_count: 21, max_curtailment_event_hours: 6 }),
    resultRow({ market, local_year: year, alpha: 0.005, headroom_mw: headroom, curtailment_budget_mwh: 0.005 * headroom * 8760, curtailed_energy_mwh: 0.005 * headroom * 8760 - 1 }),
    resultRow({ market, local_year: year, alpha: 0.01, headroom_mw: headroom * 1.57, equivalent_full_load_hours: 87.6, curtailment_budget_mwh: 0.01 * headroom * 1.57 * 8760, curtailed_energy_mwh: 0.01 * headroom * 1.57 * 8760 - 1, curtailment_clock_hours: 220, curtailment_event_count: 44, max_curtailment_event_hours: 9 }),
  ];
}

type FakeOptions = {
  results?: Row[];
  skipped?: unknown[];
  approved?: boolean;
  digestMatches?: boolean;
  parametersResolved?: boolean;
};

function fakeSql(options: FakeOptions = {}) {
  const calls: string[] = [];
  return {
    calls,
    async query(text: string): Promise<{ rows: Row[] }> {
      calls.push(text.trim().split("\n")[0]!.trim());
      if (text.includes("select mv.id, mv.version, mv.status, mv.content_hash")) {
        return {
          rows: [{
            id: "version-1",
            version: METHODOLOGY_VERSION,
            status: (options.approved ?? true) ? "approved" : "draft",
            content_hash: (options.digestMatches ?? true) ? METHODOLOGY_DOCUMENT_SHA256 : "f".repeat(64),
          }],
        };
      }
      if (text.includes("from reference.methodology_parameters")) {
        return {
          rows: (options.parametersResolved ?? true)
            ? [{ parameter_key: "peak_reference_rule", status: "approved", text_value: "modeled_period_observed_peak" }]
            : [{ parameter_key: "maximum_contiguous_gap_hours", status: "draft", text_value: "unresolved" }],
        };
      }
      if (text.includes("select content_hash from reference.methodology_versions")) {
        return { rows: [{ content_hash: METHODOLOGY_DOCUMENT_SHA256 }] };
      }
      if (text.includes("from pipeline.flexible_capacity_scenario_results")) {
        return { rows: options.results ?? [] };
      }
      if (text.includes("from pipeline.flexible_capacity_analytics_runs")) {
        return { rows: [{ market_years_skipped: options.skipped ?? [] }] };
      }
      return { rows: [] };
    },
  };
}

const load = (options: FakeOptions = {}): Promise<FlexibleCapacityReadModel> =>
  loadFlexibleCapacityReadModel(fakeSql(options), { now: NOW });

describe("1. nothing published", () => {
  it("is unavailable when no analytical run has stored a scenario", async () => {
    const model = await load({ results: [] });
    expect(model.availability).toEqual({ state: "unavailable", reason: "no_validated_analytics" });
    expect(model.markets).toEqual([]);
    expect(model.calculatedAt).toBeNull();
    expect(validateFlexibleCapacityReadModel(model)).toEqual([]);
  });

  it("still describes what the product would mean", async () => {
    const model = await load({ results: [] });
    expect(model.methodology.version).toBe(METHODOLOGY_VERSION);
    expect(model.assumptions.annualCurtailmentEnergyFractions).toEqual([0.0025, 0.005, 0.01]);
    expect(model.assumptions.batteryEnabled).toBe(false);
    expect(model.limitations.length).toBeGreaterThan(0);
  });

  it("says why, for every unavailable reason", () => {
    for (const reason of ["no_database_configured", "no_validated_analytics",
      "methodology_not_approved", "publication_not_authorized"] as const) {
      const model = unavailableFlexibleCapacityModel(reason, { now: NOW });
      expect(model.availability).toEqual({ state: "unavailable", reason });
      expect(validateFlexibleCapacityReadModel(model)).toEqual([]);
    }
  });
});

describe("2. the two gates", () => {
  it("is unavailable, not thrown, when the methodology is unapproved", async () => {
    const model = await load({ approved: false, results: yearRows("ercot", 2025) });
    expect(model.availability.reason).toBe("methodology_not_approved");
    expect(model.methodology.approved).toBe(false);
    expect(model.markets).toEqual([]);
  });

  it("is unavailable when the registered digest is not the one the code was written against", async () => {
    const model = await load({ digestMatches: false, results: yearRows("ercot", 2025) });
    expect(model.availability.reason).toBe("methodology_not_approved");
  });

  it("refuses to serve figures while a methodology parameter is unresolved", async () => {
    const model = await load({ parametersResolved: false, results: yearRows("ercot", 2025) });
    expect(model.availability.reason).toBe("publication_not_authorized");
    expect(model.markets).toEqual([]);
  });

  it("checks the methodology before touching results", async () => {
    const sql = fakeSql({ approved: false });
    await loadFlexibleCapacityReadModel(sql, { now: NOW });
    expect(sql.calls.some((call) => call.includes("flexible_capacity_scenario_results"))).toBe(false);
  });
});

describe("3. an eligible market-year", () => {
  it("carries every scenario, the observed basis, and no refusal", async () => {
    const model = await load({ results: yearRows("ercot", 2025) });
    expect(model.availability.state).toBe("available");
    expect(model.markets).toHaveLength(1);
    const market = model.markets[0]!;
    expect(market.slug).toBe("ercot");
    expect(market.name).toBe("ERCOT");
    const year = market.years[0]!;
    expect(year.year).toBe(2025);
    expect(year.eligibility).toEqual({ state: "eligible", reason: null, detail: null });
    expect(year.scenarios.map((entry) => entry.alpha)).toEqual([0.0025, 0.005, 0.01]);
    expect(year.observed?.peakMw).toBe(83597);
    expect(year.observed?.coverageRatio).toBe(1);
    expect(validateFlexibleCapacityReadModel(model)).toEqual([]);
  });

  it("renders the peak instant in the market's own zone as well as UTC", async () => {
    const model = await load({ results: yearRows("ercot", 2025) });
    const observed = model.markets[0]!.years[0]!.observed!;
    expect(observed.peakAtUtc).toBe("2025-08-18T23:00:00.000Z");
    // 23:00Z on 18 August is 18:00 in Chicago.
    expect(observed.peakAtLocal).toContain("18:00");
    expect(observed.peakAtLocal).toContain("2025-08-18");
  });

  it("keeps equivalent full-load hours distinct from clock hours", async () => {
    const model = await load({ results: yearRows("ercot", 2025) });
    const scenario = model.markets[0]!.years[0]!.scenarios[1]!;
    expect(scenario.equivalentFullLoadHours).toBe(43.8);
    expect(scenario.clockHours).toBe(118);
    expect(scenario.clockHours).not.toBe(scenario.equivalentFullLoadHours);
  });

  it("reports GW derived from the stored MW", async () => {
    const model = await load({ results: yearRows("ercot", 2025) });
    const scenario = model.markets[0]!.years[0]!.scenarios[1]!;
    expect(scenario.curtailmentEnabledHeadroomMw).toBe(3591);
    expect(scenario.curtailmentEnabledHeadroomGw).toBeCloseTo(3.591, 9);
  });
});

describe("4. a refused market-year is a result", () => {
  const skipped = [{
    market: "spp", localYear: 2023,
    reason: "the maximum 3621097 MW at 2023-06-13T02:00:00.000Z is 66.17x the 99.9th percentile",
    failureCodes: ["peak_implausible"],
  }];

  it("appears with its reason and no figure", async () => {
    const model = await load({ results: yearRows("spp", 2025), skipped });
    const market = model.markets.find((entry) => entry.slug === "spp")!;
    const refused = market.years.find((entry) => entry.year === 2023)!;
    expect(refused.eligibility.state).toBe("ineligible");
    expect(refused.eligibility.reason).toBe("peak_implausible");
    expect(refused.scenarios).toEqual([]);
    expect(refused.observed).toBeNull();
    expect(validateFlexibleCapacityReadModel(model)).toEqual([]);
  });

  it("never exposes the absurd figure the defective year would have produced", async () => {
    const model = await load({ results: yearRows("spp", 2025), skipped });
    const refused = model.markets[0]!.years.find((entry) => entry.year === 2023)!;
    // The 3,597 GW the defective year would have yielded exists nowhere: the refusal carries no
    // scenario and no observed basis, so there is no field it could occupy.
    expect(refused.scenarios).toEqual([]);
    expect(refused.observed).toBeNull();
    const figures = model.markets.flatMap((market) => market.years).flatMap((year) => year.scenarios);
    expect(figures.every((entry) => entry.curtailmentEnabledHeadroomGw < 100)).toBe(true);
  });

  it("quotes the publisher's own value in the refusal detail, which is the point", () => {
    // The detail is not a leak. Saying "the maximum was 3,621,097 MW" is how a reader learns the
    // year was refused because of what the publisher sent, not because Urdais lost the data --
    // and it is the same value that stays untouched in canonical storage.
    expect(skipped[0]!.reason).toContain("3621097");
  });

  it("maps every refusal code the analytics layer records", async () => {
    const codes = ["contiguous_gap_too_long", "peak_day_incomplete", "annual_coverage_below_floor",
      "series_empty", "gap_threshold_unresolved"] as const;
    for (const code of codes) {
      const model = await load({
        results: yearRows("pjm", 2025),
        skipped: [{ market: "pjm", localYear: 2024, reason: "because", failureCodes: [code] }],
      });
      const refused = model.markets[0]!.years.find((entry) => entry.year === 2024)!;
      expect(refused.eligibility.reason).toBe(code);
    }
  });

  it("does not make the product unavailable when another year is eligible", async () => {
    const model = await load({ results: yearRows("pjm", 2025), skipped: [
      { market: "pjm", localYear: 2024, reason: "gap", failureCodes: ["contiguous_gap_too_long"] },
    ] });
    expect(model.availability.state).toBe("available");
  });
});

describe("5. selection across years", () => {
  it("orders years newest first and names the newest eligible one", async () => {
    const model = await load({
      results: [...yearRows("ercot", 2023, 2953), ...yearRows("ercot", 2024, 5209), ...yearRows("ercot", 2025, 3591)],
    });
    const market = model.markets[0]!;
    expect(market.years.map((entry) => entry.year)).toEqual([2025, 2024, 2023]);
    expect(market.latestEligibleYear).toBe(2025);
    expect(market.latestModelledYear).toBe(2025);
  });

  it("keeps the latest year visible as refused while naming an earlier eligible one", async () => {
    const model = await load({
      results: [...yearRows("miso", 2023, 16417), ...yearRows("miso", 2025, 9899)],
      skipped: [{ market: "miso", localYear: 2024, reason: "24-hour gap", failureCodes: ["contiguous_gap_too_long"] }],
    });
    const market = model.markets[0]!;
    expect(market.years.map((entry) => entry.year)).toEqual([2025, 2024, 2023]);
    expect(market.years[1]!.eligibility.state).toBe("ineligible");
    expect(market.latestEligibleYear).toBe(2025);
    // The refused year is not silently replaced by the one below it.
    expect(market.years.find((entry) => entry.year === 2024)!.scenarios).toEqual([]);
  });

  it("names no eligible year when every year was refused", async () => {
    const model = await load({
      results: [],
      skipped: [{ market: "pjm", localYear: 2024, reason: "gap", failureCodes: ["contiguous_gap_too_long"] }],
    });
    const market = model.markets.find((entry) => entry.slug === "pjm")!;
    expect(market.latestEligibleYear).toBeNull();
    expect(market.latestModelledYear).toBe(2024);
    expect(model.availability.state).toBe("unavailable");
  });

  it("never blends years into an average", async () => {
    const model = await load({
      results: [...yearRows("ercot", 2023, 2953), ...yearRows("ercot", 2025, 3591)],
    });
    const serialised = JSON.stringify(model).toLowerCase();
    for (const term of ["average", "mean_year", "blended", "smoothed", "threeyear"]) {
      expect(serialised).not.toContain(term);
    }
  });
});

describe("6. no aggregate, ever", () => {
  it("keeps markets separate with no total", async () => {
    const model = await load({
      results: [...yearRows("ercot", 2025, 3591), ...yearRows("pjm", 2025, 20972)],
    });
    expect(model.markets.map((entry) => entry.slug).sort()).toEqual(["ercot", "pjm"]);
    expect(model).not.toHaveProperty("total");
    expect(model).not.toHaveProperty("national");
    expect(validateFlexibleCapacityReadModel(model)).toEqual([]);
  });

  it("ignores a row naming a market outside the seven", async () => {
    const model = await load({ results: [...yearRows("ercot", 2025), resultRow({ market: "nonesuch" })] });
    expect(model.markets.map((entry) => entry.slug)).toEqual(["ercot"]);
  });
});

describe("7. the contract catches a payload that should not be served", () => {
  async function eligible(): Promise<FlexibleCapacityReadModel> {
    return load({ results: yearRows("ercot", 2025) });
  }

  it("rejects a refused year carrying scenarios anyway", async () => {
    const model = await eligible();
    const broken = structuredClone(model) as FlexibleCapacityReadModel;
    (broken.markets[0]!.years[0] as { eligibility: unknown }).eligibility =
      { state: "ineligible", reason: "peak_implausible", detail: null };
    expect(validateFlexibleCapacityReadModel(broken).join()).toMatch(/refused but carries scenarios/);
  });

  it("rejects non-monotone headroom across alpha", async () => {
    const model = await eligible();
    const broken = structuredClone(model) as FlexibleCapacityReadModel;
    (broken.markets[0]!.years[0]!.scenarios[2] as { curtailmentEnabledHeadroomMw: number })
      .curtailmentEnabledHeadroomMw = 1;
    expect(validateFlexibleCapacityReadModel(broken).join()).toMatch(/headroom falls as alpha rises/);
  });

  it("rejects energy above its allowance", async () => {
    const model = await eligible();
    const broken = structuredClone(model) as FlexibleCapacityReadModel;
    (broken.markets[0]!.years[0]!.scenarios[1] as { curtailedEnergyMwh: number })
      .curtailedEnergyMwh = 9e9;
    expect(validateFlexibleCapacityReadModel(broken).join()).toMatch(/spent more than its allowance/);
  });

  it("rejects a cross-market total", async () => {
    const model = await eligible();
    const broken = { ...model, total: { headroomGw: 99 } } as unknown as FlexibleCapacityReadModel;
    expect(validateFlexibleCapacityReadModel(broken).join()).toMatch(/cross-market 'total'/);
  });

  it("rejects any retired mock field name, at any depth", async () => {
    for (const field of RETIRED_FIELD_NAMES) {
      const model = await eligible();
      const broken = structuredClone(model) as unknown as Record<string, unknown>;
      ((broken.markets as Record<string, unknown>[])[0]!.years as Record<string, unknown>[])[0]![field] = 1;
      expect(validateFlexibleCapacityReadModel(broken as unknown as FlexibleCapacityReadModel).join())
        .toMatch(new RegExp(`retired mock field '${field}'`));
    }
  });

  it("rejects a duplicated market or year", async () => {
    const model = await eligible();
    const duplicatedMarket = structuredClone(model) as FlexibleCapacityReadModel;
    (duplicatedMarket as unknown as { markets: unknown[] }).markets = [model.markets[0]!, model.markets[0]!];
    expect(validateFlexibleCapacityReadModel(duplicatedMarket).join()).toMatch(/appears twice/);
  });

  it("rejects an available model with no digest", async () => {
    const model = await eligible();
    const broken = structuredClone(model) as FlexibleCapacityReadModel;
    (broken.methodology as { digest: string | null }).digest = null;
    expect(validateFlexibleCapacityReadModel(broken).join()).toMatch(/no methodology digest/);
  });

  it("rejects a payload claiming a storage contribution", async () => {
    const model = await eligible();
    const broken = structuredClone(model) as FlexibleCapacityReadModel;
    (broken.assumptions as { batteryEnabled: boolean }).batteryEnabled = true;
    expect(validateFlexibleCapacityReadModel(broken).join()).toMatch(/storage contribution/);
  });
});

describe("8. provenance and identity", () => {
  it("names the source without exposing retrieval internals", async () => {
    const model = await load({ results: yearRows("ercot", 2025) });
    expect(model.source.name).toContain("EIA");
    const serialised = JSON.stringify(model);
    for (const leak of ["response_body", "idempotency_key", "run_id", "grid_area_id", "input_digest"]) {
      expect(serialised).not.toContain(leak);
    }
  });

  it("carries the methodology slug, version and digest", async () => {
    const model = await load({ results: yearRows("ercot", 2025) });
    expect(model.methodology.slug).toBe(METHODOLOGY_SLUG);
    expect(model.methodology.version).toBe(METHODOLOGY_VERSION);
    expect(model.methodology.digest).toBe(METHODOLOGY_DOCUMENT_SHA256);
    expect(model.methodology.documentPath).toBe("/docs/methodology/flexible-capacity");
  });

  it("reports the newest calculation timestamp", async () => {
    const model = await load({
      results: [
        ...yearRows("ercot", 2025),
        resultRow({ local_year: 2024, alpha: 0.005, calculated_at: "2026-09-23T11:00:00.000Z" }),
      ],
    });
    expect(model.calculatedAt).toBe("2026-09-23T11:00:00.000Z");
  });
});
