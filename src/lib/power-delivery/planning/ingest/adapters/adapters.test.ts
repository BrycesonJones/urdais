import { describe, expect, it } from "vitest";

import { buildFixtureWorkbook, sheetFromGrid, type FixtureCell } from "@/lib/power-delivery/planning/xlsx/fixture-workbook";
import { sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import { cecAdapter } from "@/lib/power-delivery/planning/ingest/adapters/cec";
import { ercotAdapter } from "@/lib/power-delivery/planning/ingest/adapters/ercot";
import { isoneAdapter } from "@/lib/power-delivery/planning/ingest/adapters/isone";
import { pjmAdapter } from "@/lib/power-delivery/planning/ingest/adapters/pjm";
import { PlanningSourceFormatError, type PlanningAdapter, type RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

function artifact(label: string, body: Buffer): RetrievedArtifact {
  return {
    label, url: `https://example.invalid/${label}`, retrievedAt: "2026-09-21T00:00:00.000Z",
    status: 200, contentType: null, byteLength: body.byteLength, sha256: sha256(body), body,
  };
}

const parse = (adapter: PlanningAdapter, files: Record<string, Buffer>) =>
  adapter.parse(new Map(Object.entries(files).map(([label, body]) => [label, artifact(label, body)])));

// ------------------------------------------------------------------------------------- ERCOT
// Reproduces the real layout: a merged block title, a header row opening with a self-closing
// empty cell, eight weather zones plus the ERCOT total, and two blocks side by side.
const ZONES = ["COAST", "EAST", "FWEST", "NCENT", "NORTH", "SCENT", "SOUTH", "WEST", "ERCOT"];
const zoneHeader = (start: string): Record<string, FixtureCell> => {
  const cells: Record<string, FixtureCell> = { [start]: null };
  ZONES.forEach((zone, index) => { cells[String.fromCharCode(start.charCodeAt(0) + index + 1)] = zone; });
  return cells;
};
const zoneValues = (start: string, period: FixtureCell, base: number): Record<string, FixtureCell> => {
  const cells: Record<string, FixtureCell> = { [start]: period };
  ZONES.forEach((zone, index) => { cells[String.fromCharCode(start.charCodeAt(0) + index + 1)] = base + index; });
  return cells;
};

const ercotPeaks = () => buildFixtureWorkbook([
  sheetFromGrid("Summer", {
    1: { A: "Summer Net Coincident Peak Forecast 2025-2031 ERCOT Adjusted Forecast", P: "Summer Net Non-Coincident Peak Forecast 2025-2031 ERCOT Adjusted Forecast" },
    2: { ...zoneHeader("A"), ...zoneHeader("P") },
    3: { ...zoneValues("A", 2025, 100), ...zoneValues("P", 2025, 200) },
    4: { ...zoneValues("A", 2026, 110), ...zoneValues("P", 2026, 210) },
  }, ["A1:J1", "P1:Y1"]),
  sheetFromGrid("Winter", {
    1: { A: "Winter Net Coincident Peak Forecast 2025-2031 TSP Provided Forecast" },
    2: zoneHeader("A"),
    3: zoneValues("A", "2025-2026", 300),
  }, ["A1:J1"]),
]);
const ercotMonthly = () => buildFixtureWorkbook([sheetFromGrid("Sheet1", {
  1: { A: "ERCOT Adjusted Forecast" },
  2: { A: "year", B: "month", C: "Monthly Peaks", D: "Annual Energy" },
  3: { A: 2025, B: 1, C: 70716.52, D: 38585578.5 },
  4: { A: 2025, B: 2, C: 69131.27, D: 34466946.6 },
}, ["A1:D1"])]);
const ercotScenarios = () => buildFixtureWorkbook([
  sheetFromGrid("ERCOT Adjusted", { 6: { A: "year", B: 2008, C: "ercot_90th" }, 7: { A: 2025, B: 83648.38, C: 90000 } }),
  sheetFromGrid("TSP Provided", { 6: { A: "year", B: 2008, C: "ercot_90th" }, 7: { A: 2025, B: 91544.99, C: 98000 } }),
]);
const ercotFiles = () => ({
  "summer-and-winter-peaks": ercotPeaks(),
  "monthly-peak-and-energy": ercotMonthly(),
  "peak-demand-scenarios": ercotScenarios(),
});

describe("ERCOT adapter", () => {
  it("reads seasonal peaks at both geographic grains and keeps the cell each came from", () => {
    const extraction = parse(ercotAdapter, ercotFiles());
    const total = extraction.records.find((record) =>
      record.point.targetPeriodKind === "seasonal" && record.point.targetSeason === "summer"
      && record.point.targetYear === 2025 && record.point.geographicGrain === "balancing_authority"
      && record.point.peakType === "coincident_peak")!;
    expect(total.point.value).toBe(108);
    expect(total.locator).toMatchObject({ extractionMethod: "workbook_cell", workbookSheet: "Summer", workbookCell: "J3" });
    expect(total.point.nativeGeographyLabel).toBeNull();

    const zone = extraction.records.find((record) =>
      record.point.geographicGrain === "weather_zone" && record.point.nativeGeographyLabel === "COAST"
      && record.point.targetYear === 2025 && record.point.peakType === "coincident_peak")!;
    expect(zone.point.value).toBe(100);
    expect(zone.locator.workbookCell).toBe("B3");
  });

  it("does not let a weather zone masquerade as the whole market", () => {
    const extraction = parse(ercotAdapter, ercotFiles());
    for (const record of extraction.records) {
      const whole = record.point.geographicGrain === "balancing_authority";
      expect(whole ? record.nativeGeography : record.point.nativeGeographyLabel).not.toBeNull();
      if (!whole) expect(record.point.nativeGeographyLabel).not.toBe("ERCOT");
    }
  });

  it("labels a winter season by the year it starts in and keeps the native label", () => {
    const winter = parse(ercotAdapter, ercotFiles()).records.find((record) => record.point.targetSeason === "winter")!;
    expect(winter.point.targetYear).toBe(2025);
    expect(winter.nativePeriod).toBe("2025-2026");
  });

  it("carries the Adjusted and TSP large-load treatments separately", () => {
    const extraction = parse(ercotAdapter, ercotFiles());
    const adjusted = extraction.scenarios.find((s) => s.nativeScenarioKey === "ERCOT_Adjusted")!;
    const tsp = extraction.scenarios.find((s) => s.nativeScenarioKey === "TSP_Provided")!;
    expect(adjusted.largeLoadPolicy).toBe("included_probability_weighted");
    expect(tsp.largeLoadPolicy).toBe("included_all");
    expect(adjusted.isReference).toBe(true);
    expect(extraction.scenarios.filter((s) => s.isReference)).toHaveLength(1);
  });

  it("keeps each weather year as its own scenario rather than averaging them", () => {
    const extraction = parse(ercotAdapter, ercotFiles());
    expect(extraction.scenarios.map((s) => s.nativeScenarioKey)).toEqual(expect.arrayContaining([
      "ERCOT_Adjusted_WY2008", "ERCOT_Adjusted_P90", "TSP_Provided_WY2008", "TSP_Provided_P90",
    ]));
    expect(extraction.scenarios.find((s) => s.nativeScenarioKey === "ERCOT_Adjusted_P90")!.weatherBasis).toBe("p90");
    expect(extraction.scenarios.find((s) => s.nativeScenarioKey === "ERCOT_Adjusted_WY2008")!.assumptions)
      .toMatchObject({ historical_weather_year: 2008 });
  });

  it("ingests monthly peaks at monthly grain and does not turn them into an annual peak", () => {
    const monthly = parse(ercotAdapter, ercotFiles()).records.filter((r) => r.point.targetPeriodKind === "monthly");
    expect(monthly).toHaveLength(2);
    expect(monthly[0]!.point).toMatchObject({ targetYear: 2025, targetMonth: 1, targetSeason: null, unit: "MW" });
    // The workbook's energy column is headed "Annual Energy" on a monthly row; it is not ingested.
    expect(parse(ercotAdapter, ercotFiles()).records.some((r) => r.nativeUnit === "MWh")).toBe(false);
  });

  it("names one immutable vintage for the April 2025 Adjusted release", () => {
    expect(parse(ercotAdapter, ercotFiles()).vintage).toMatchObject({
      nativeVintageKey: "ltlf-2025-04-adjusted", publishedAt: "2025-04-08T00:00:00Z", publicationState: "published",
    });
  });

  describe("malformed sources fail closed", () => {
    it("refuses a workbook whose zone header has moved", () => {
      const broken = buildFixtureWorkbook([sheetFromGrid("Summer", {
        1: { A: "Summer Net Coincident Peak Forecast 2025-2031 ERCOT Adjusted Forecast" },
        2: { A: null, B: "GULF", C: "EAST" },
        3: zoneValues("A", 2025, 100),
      }), sheetFromGrid("Winter", { 1: { A: "x" } })]);
      expect(() => parse(ercotAdapter, { ...ercotFiles(), "summer-and-winter-peaks": broken }))
        .toThrow(/expected "COAST" at B2/);
    });

    it("refuses a monthly workbook whose headers were renamed", () => {
      const broken = buildFixtureWorkbook([sheetFromGrid("Sheet1", {
        1: { A: "ERCOT Adjusted Forecast" }, 2: { A: "year", B: "month", C: "Peak MW" }, 3: { A: 2025, B: 1, C: 1 },
      })]);
      expect(() => parse(ercotAdapter, { ...ercotFiles(), "monthly-peak-and-energy": broken }))
        .toThrow(/expected "Monthly Peaks"/);
    });

    it("refuses a month outside the calendar", () => {
      const broken = buildFixtureWorkbook([sheetFromGrid("Sheet1", {
        1: { A: "ERCOT Adjusted Forecast" }, 2: { A: "year", B: "month", C: "Monthly Peaks" }, 3: { A: 2025, B: 13, C: 1 },
      })]);
      expect(() => parse(ercotAdapter, { ...ercotFiles(), "monthly-peak-and-energy": broken })).toThrow(/is not a calendar month/);
    });

    it("refuses a scenarios sheet with an unrecognised case column", () => {
      const broken = buildFixtureWorkbook([
        sheetFromGrid("ERCOT Adjusted", { 6: { A: "year", B: "mystery_case" }, 7: { A: 2025, B: 1 } }),
        sheetFromGrid("TSP Provided", { 6: { A: "year", B: 2008 }, 7: { A: 2025, B: 1 } }),
      ]);
      expect(() => parse(ercotAdapter, { ...ercotFiles(), "peak-demand-scenarios": broken })).toThrow(/unrecognised scenario column/);
    });

    it("refuses an artifact that was not retrieved", () => {
      const files = ercotFiles();
      delete (files as Record<string, Buffer>)["peak-demand-scenarios"];
      expect(() => parse(ercotAdapter, files)).toThrow(PlanningSourceFormatError);
    });
  });
});

// --------------------------------------------------------------------------------------- PJM
const pjmSheet = (name: string, zone: string) => sheetFromGrid(name, {
  1: { A: "ZONE_NAME", B: "YEAR", C: "MONTH", D: "PEAK_MW", E: "ENERGY_GWH" },
  2: { A: zone, B: 2026, C: 1, D: 1587, E: 842 },
  3: { A: zone, B: 2026, C: 7, D: 2321, E: 872 },
});
const pjmFiles = () => ({
  "2026-load-report-data": buildFixtureWorkbook([
    pjmSheet("PJM_RTO", "PJM_RTO"), pjmSheet("AE", "AE"),
    // PJM names this sheet after a grouping, while its rows are labelled with the zone.
    pjmSheet("JCPL_FE_EAST", "JCPL"), pjmSheet("PJM_MA", "PJM_MA"),
  ]),
});

describe("PJM adapter", () => {
  it("maps only the RTO sheet to the balancing authority", () => {
    const records = parse(pjmAdapter, pjmFiles()).records;
    const whole = records.filter((r) => r.point.geographicGrain === "balancing_authority");
    expect(new Set(whole.map((r) => r.nativeGeography))).toEqual(new Set(["PJM_RTO"]));
    expect(whole.every((r) => r.point.nativeGeographyLabel === null)).toBe(true);
    expect(records.some((r) => r.nativeGeography === "AE" && r.point.geographicGrain === "zone")).toBe(true);
    expect(records.some((r) => r.nativeGeography === "PJM_MA" && r.point.geographicGrain === "sub_region")).toBe(true);
  });

  it("accepts a sheet whose name differs from the zone it carries", () => {
    const jcpl = parse(pjmAdapter, pjmFiles()).records.filter((r) => r.nativeGeography === "JCPL");
    expect(jcpl.length).toBeGreaterThan(0);
    expect(jcpl[0]!.locator.workbookSheet).toBe("JCPL_FE_EAST");
  });

  it("keeps peak and energy as separate measures at monthly grain", () => {
    const records = parse(pjmAdapter, pjmFiles()).records.filter((r) => r.nativeGeography === "PJM_RTO");
    expect(records.filter((r) => r.point.unit === "MW")).toHaveLength(2);
    const energy = records.filter((r) => r.point.unit === "GWh");
    expect(energy).toHaveLength(2);
    expect(energy[0]!.point).toMatchObject({ peakType: "period_energy", targetPeriodKind: "monthly", targetMonth: 1 });
  });

  it("publishes one native staff forecast and invents no high or low case", () => {
    const extraction = parse(pjmAdapter, pjmFiles());
    expect(extraction.scenarios).toHaveLength(1);
    expect(extraction.scenarios[0]!.nativeScenarioKey).toBe("PJM_Staff_Forecast");
    expect(extraction.scenarios[0]!.assumptions).toMatchObject({ large_load_screen: "PJM Manual 19 Attachment B" });
  });

  it("refuses a renamed column, a missing RTO sheet, and a sheet mixing two areas", () => {
    const renamed = buildFixtureWorkbook([sheetFromGrid("PJM_RTO", {
      1: { A: "ZONE_NAME", B: "YEAR", C: "MONTH", D: "PEAK", E: "ENERGY_GWH" }, 2: { A: "PJM_RTO", B: 2026, C: 1, D: 1, E: 1 },
    })]);
    expect(() => parse(pjmAdapter, { "2026-load-report-data": renamed })).toThrow(/expected column D to be PEAK_MW/);

    const noRto = buildFixtureWorkbook([pjmSheet("AE", "AE")]);
    expect(() => parse(pjmAdapter, { "2026-load-report-data": noRto })).toThrow(/no PJM_RTO sheet/);

    const mixed = buildFixtureWorkbook([pjmSheet("PJM_RTO", "PJM_RTO"), sheetFromGrid("AE", {
      1: { A: "ZONE_NAME", B: "YEAR", C: "MONTH", D: "PEAK_MW", E: "ENERGY_GWH" },
      2: { A: "AE", B: 2026, C: 1, D: 1, E: 1 },
      3: { A: "DPL", B: 2026, C: 2, D: 1, E: 1 },
    })]);
    expect(() => parse(pjmAdapter, { "2026-load-report-data": mixed })).toThrow(/mixes areas AE and DPL/);
  });
});

// --------------------------------------------------------------------------------------- CEC
const CEC_HEADER = {
  A: "COINCIDENT", B: "TAC", C: "SCENARIO", D: "YEAR", E: "MONTH", F: "DAY", G: "HOUR",
  H: "UNADJUSTED_CONSUMPTION", I: "PUMPING", J: "CLIMATE_CHANGE", K: "LIGHT_EV", L: "MEDIUM_HEAVY_EV",
  M: "DATA_CENTER", N: "OTHER_ADJUSTMENTS", O: "BASELINE_CONSUMPTION", P: "BTM_PV",
  Q: "BTM_STORAGE_RES", R: "BTM_STORAGE_NONRES", S: "BASELINE_NET_LOAD", T: "AAEE", U: "AAFS",
  V: "AATE_LDV", W: "AATE_MDHD", X: "MANAGED_NET_LOAD",
} satisfies Record<string, FixtureCell>;
const cecRow = (coincident: boolean, tac: string, scenario: string, year: number, managed: number, dataCentre: number) => ({
  ...CEC_HEADER, A: coincident, B: tac, C: scenario, D: year, E: 9, F: 3, G: 17,
  H: 49561, I: 634, J: 51, K: 124, L: 8, M: dataCentre, N: 1, O: 50502, P: -3941, Q: -75, R: -6,
  S: 46481, T: 0, U: 0, V: 0, W: 0, X: managed,
});
const cecFiles = () => ({
  "ced-2025-peak-forecast": buildFixtureWorkbook([sheetFromGrid("annual_peaks", {
    1: CEC_HEADER,
    2: cecRow(true, "CAISO", "Planning_Scenario", 2031, 49398, 5000),
    3: cecRow(false, "CAISO", "Planning_Scenario", 2031, 48000, 5000),
    4: cecRow(true, "CAISO", "Local_Reliability_plusKnown", 2031, 52122, 5000),
    5: cecRow(true, "PGE", "Planning_Scenario", 2031, 20000, 900),
  })]),
});

describe("CEC/CAISO adapter", () => {
  it("ingests the CAISO balancing authority area and not California statewide demand", () => {
    const records = parse(cecAdapter, cecFiles()).records;
    expect(new Set(records.map((r) => r.nativeGeography))).toEqual(new Set(["CAISO"]));
    expect(records.every((r) => r.point.geographicGrain === "balancing_authority")).toBe(true);
    expect(records).toHaveLength(3);
  });

  it("reads the boolean coincidence flag the CEC actually publishes", () => {
    const records = parse(cecAdapter, cecFiles()).records;
    expect(records.filter((r) => r.point.peakType === "coincident_peak")).toHaveLength(2);
    expect(records.filter((r) => r.point.peakType === "non_coincident_peak")).toHaveLength(1);
  });

  it("keeps Planning, Local Reliability and Known Loads apart", () => {
    const extraction = parse(cecAdapter, cecFiles());
    expect(extraction.scenarios.map((s) => s.nativeScenarioKey).sort())
      .toEqual(["Local_Reliability_plusKnown", "Planning_Scenario"]);
    const known = extraction.scenarios.find((s) => s.nativeScenarioKey === "Local_Reliability_plusKnown")!;
    expect(known.assumptions).toMatchObject({ known_loads_included: true });
    expect(known.largeLoadPolicy).toBe("included_all");
    expect(extraction.scenarios.find((s) => s.nativeScenarioKey === "Planning_Scenario")!.assumptions)
      .toMatchObject({ known_loads_included: false });
  });

  it("retains every published component alongside the canonical managed net peak", () => {
    const record = parse(cecAdapter, cecFiles()).records[0]!;
    expect(record.point.value).toBe(49398);
    expect(record.rawPayload).toMatchObject({ DATA_CENTER: "5000", BASELINE_NET_LOAD: "46481", BTM_PV: "-3941" });
  });

  it("refuses an unknown scenario and a renamed column", () => {
    const unknown = buildFixtureWorkbook([sheetFromGrid("annual_peaks", {
      1: CEC_HEADER, 2: cecRow(true, "CAISO", "Mystery_Case", 2031, 1, 1),
    })]);
    expect(() => parse(cecAdapter, { "ced-2025-peak-forecast": unknown })).toThrow(/unknown scenario "Mystery_Case"/);

    const renamed = buildFixtureWorkbook([sheetFromGrid("annual_peaks", {
      1: { ...CEC_HEADER, X: "NET_LOAD" }, 2: cecRow(true, "CAISO", "Planning_Scenario", 2031, 1, 1),
    })]);
    expect(() => parse(cecAdapter, { "ced-2025-peak-forecast": renamed })).toThrow(/expected MANAGED_NET_LOAD at X1/);
  });

  it("refuses a workbook with no CAISO geography rather than falling back to a utility", () => {
    const noCaiso = buildFixtureWorkbook([sheetFromGrid("annual_peaks", {
      1: CEC_HEADER, 2: cecRow(true, "PGE", "Planning_Scenario", 2031, 1, 1),
    })]);
    expect(() => parse(cecAdapter, { "ced-2025-peak-forecast": noCaiso })).toThrow(/produced no CAISO rows/);
  });
});

// ------------------------------------------------------------------------------------ ISO-NE
const isoneFiles = (probabilities: Record<string, FixtureCell> = { D: 0.9, E: 0.5, F: 0.1 }) => ({
  "celt-2026": buildFixtureWorkbook([sheetFromGrid("1.6 Forecast Distributions", {
    8: { B: "      Probability of Forecast Being Exceeded", ...probabilities },
    9: { B: "Summer (MW)", C: 2026, D: 23796, E: 25228, F: 26473 },
    10: { C: 2027, D: 23858, E: 25290, F: 26503 },
    20: { B: "      Probability of Forecast Being Exceeded", ...probabilities },
    21: { B: "Winter (MW)", C: " 2026/2027 ", D: 19643, E: 20483, F: 21457 },
  })]),
});

describe("ISO-NE adapter", () => {
  it("takes 50/50 and 90/10 by the printed probability, not by column position", () => {
    const records = parse(isoneAdapter, isoneFiles()).records;
    const summer5050 = records.find((r) => r.point.targetSeason === "summer" && r.point.targetYear === 2026 && r.point.scenarioKey === "CELT_50_50")!;
    expect(summer5050.point.value).toBe(25228);
    expect(summer5050.locator.workbookCell).toBe("E9");
    // Move the probabilities one column right and the adapter follows the header rather than
    // continuing to read the column that used to hold 50/50.
    const shifted = parse(isoneAdapter, isoneFiles({ E: 0.9, F: 0.5, G: 0.1 }));
    const shifted5050 = shifted.records.find((r) => r.point.targetYear === 2026 && r.point.targetSeason === "summer" && r.point.scenarioKey === "CELT_50_50")!;
    expect(shifted5050.locator.workbookCell).toBe("F9");
    expect(shifted5050.point.value).toBe(26473);
  });

  it("labels a winter season by its start year and keeps the native label", () => {
    const winter = parse(isoneAdapter, isoneFiles()).records.find((r) => r.point.targetSeason === "winter")!;
    expect(winter.point.targetYear).toBe(2026);
    expect(winter.nativePeriod).toBe("2026/2027");
  });

  it("ingests only the two cases ISO-NE plans against", () => {
    const extraction = parse(isoneAdapter, isoneFiles());
    expect(extraction.scenarios.map((s) => s.nativeScenarioKey)).toEqual(["CELT_50_50", "CELT_90_10"]);
    expect(extraction.records.every((r) => ["CELT_50_50", "CELT_90_10"].includes(r.point.scenarioKey))).toBe(true);
    expect(extraction.records.every((r) => r.point.targetPeriodKind === "seasonal")).toBe(true);
  });

  it("refuses a distribution that names a probability twice or not at all", () => {
    expect(() => parse(isoneAdapter, isoneFiles({ D: 0.5, E: 0.5, F: 0.1 })))
      .toThrow(/names 2 columns at exceedance probability 0.5/);
    expect(() => parse(isoneAdapter, isoneFiles({ D: 0.9, E: 0.5, F: 0.2 })))
      .toThrow(/names 0 columns at exceedance probability 0.1/);
  });
});
