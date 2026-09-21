import { describe, expect, it } from "vitest";

import { caisoCapacityAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/caiso";
import { ercotCapacityAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/ercot";
import { isoneCapacityAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/isone";
import { CapacitySourceFormatError, type CapacityAdapter } from "@/lib/power-delivery/capacity/ingest/types";
import { sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { buildFixtureWorkbook, sheetFromGrid, type FixtureCell } from "@/lib/power-delivery/planning/xlsx/fixture-workbook";

function artifact(adapter: CapacityAdapter, body: Buffer): RetrievedArtifact {
  const spec = adapter.artifacts[0]!;
  return {
    label: spec.label, url: spec.url, retrievedAt: "2026-09-21T00:00:00.000Z",
    status: 200, contentType: null, byteLength: body.byteLength, sha256: sha256(body), body,
  };
}

const parse = (adapter: CapacityAdapter, body: Buffer) =>
  adapter.parse(new Map([[adapter.artifacts[0]!.label, artifact(adapter, body)]]));

// ------------------------------------------------------------------------------------- ERCOT
//
// Reproduces what the real CDR does that a naive reader gets wrong: labels indent by moving
// column, each season spans three columns of which the third is a difference, and the two
// retained roles are a peak load hour and a peak net load hour.

const ercotSeasonal = (overrides: Record<number, Record<string, FixtureCell>> = {}) =>
  buildFixtureWorkbook([
    sheetFromGrid("Seasonal Summary", {
      2: { D: "Summer", S: "Winter" },
      3: { D: 2026, E: 2026, F: 2026, S: "2026/2027", T: "2026/2027", U: "2026/2027" },
      4: {
        D: "Peak Load Hour:", E: "Peak Net Load Hour:", F: "Difference",
        S: "Peak Load Hour:", T: "Peak Net Load Hour:", U: "Difference",
      },
      17: { C: "Firm Peak Load, MW", D: 84_000, E: 80_000, F: 4_000, S: 70_000, T: 68_000, U: 2_000 },
      56: { B: "Total Capacity", D: 104_849.985, E: 91_874.564, F: 12_975.421, S: 95_388.421, T: 90_000, U: 5_388.421 },
      58: { C: "Reserve Margin ", D: 0.248, E: 0.148, F: 0.1, S: 0.362, T: 0.323, U: 0.039 },
      ...overrides,
    }),
  ]);

describe("ERCOT capacity adapter", () => {
  const extraction = parse(ercotCapacityAdapter, ercotSeasonal());

  it("reads Total Capacity from whichever column the label was indented into", () => {
    // The label sits in B at row 56 and in C at row 17. A reader that looked only in C would
    // find the demand row and silently lose every capacity figure.
    const totals = extraction.records.filter((record) => record.nativeTerm === "Total Capacity");
    expect(totals.map((record) => record.nativeValue)).toEqual(
      ["104849.985", "91874.564", "95388.421", "90000"],
    );
  });

  it("keeps the peak load hour and the peak net load hour as separate scenarios", () => {
    expect(extraction.scenarios.map((scenario) => scenario.nativeScenarioKey).sort())
      .toEqual(["peak_load_hour", "peak_net_load_hour"]);
    expect(extraction.scenarios.filter((scenario) => scenario.isReference))
      .toHaveLength(1);
  });

  it("classifies capacity as capability and demand as diagnostic, never as capability", () => {
    const kinds = new Map<string, string>();
    for (const record of extraction.records) {
      if (record.target.kind !== "component") continue;
      kinds.set(record.nativeTerm, record.target.quantityKind);
    }
    expect(kinds.get("Total Capacity")).toBe("capability");
    expect(kinds.get("Firm Peak Load, MW")).toBe("diagnostic_only");
  });

  it("refuses to turn a reserve margin into a megawatt quantity", () => {
    const margins = extraction.records.filter((record) => record.nativeTerm === "Reserve Margin");
    expect(margins.length).toBeGreaterThan(0);
    for (const margin of margins) {
      expect(margin.target.kind).toBe("evidence_only");
      expect(margin.nativeUnit).toBe("ratio");
    }
  });

  it("drops the difference column rather than storing arithmetic as a third statement", () => {
    for (const record of extraction.records) {
      expect(record.nativeScenario).not.toBe("Difference");
    }
  });

  it("dates the release from the path ERCOT filed it under, not from a literal", () => {
    expect(extraction.vintage.publishedAt).toBe("2025-12-19T00:00:00Z");
    expect(extraction.vintage.nativeVintageKey).toBe("cdr-2025-12");
  });

  it("fails closed when the capacity row is gone instead of reporting fewer rows", () => {
    const withoutTotal = ercotSeasonal({ 56: { B: "Total Resources", D: 104_849.985 } });
    expect(() => parse(ercotCapacityAdapter, withoutTotal)).toThrow(CapacitySourceFormatError);
  });
});

// ------------------------------------------------------------------------------------- CAISO

const caisoWorkbook = (rows: Record<number, Record<string, FixtureCell>>, areaList?: string) =>
  buildFixtureWorkbook([
    sheetFromGrid("Header Descriptions", {
      1: { A: "Header Name", B: "Information Description", C: "Value Description" },
      4: { A: "Local Area", B: "Resource Local Capacity Area", C: areaList ?? "CAISO System, Kern, SanDiego-IV" },
    }),
    sheetFromGrid("2026 NQC List", {
      1: {
        A: "Resource ID", B: "Local Area", C: "Generator Name",
        D: "JAN", E: "FEB", F: "MAR", G: "APR", H: "MAY", I: "JUN",
        J: "JUL", K: "AUG", L: "SEP", M: "OCT", N: "NOV", O: "DEC",
        P: "Dispatchable", Q: "Path Designation", R: "Deliverability Status",
      },
      ...rows,
    }),
  ], [], "2026-09-10T14:32:26Z");

const caisoRows = {
  2: { A: "KERN_1_SOLAR", B: "Kern", C: "Kern Solar", D: 1.5, I: 11.34, R: "FC", Q: "North" },
  3: { A: "EO_1_SOLAR", B: "Fresno", C: "Energy Only Solar", D: 0, I: 0, R: "EO", Q: "North" },
  4: { A: "SYS_1_BESS", B: "CAISO System", C: "System Battery", D: 20, I: 20, R: "ID", Q: "South" },
  5: { A: "SD_1_GAS", B: "San Diego-IV", C: "San Diego Gas", D: 300, I: 300, R: "PD", Q: "South" },
};

describe("CAISO capacity adapter", () => {
  // "Fresno" is in the data but not in this fixture's header enumeration, so it must be rejected.
  const extraction = parse(caisoCapacityAdapter, caisoWorkbook(
    { 2: caisoRows[2], 4: caisoRows[4], 5: caisoRows[5] },
  ));

  it("creates no capability component, because CAISO publishes no total", () => {
    expect(extraction.records.every((record) => record.target.kind === "evidence_only")).toBe(true);
    expect(extraction.records.length).toBeGreaterThan(0);
  });

  it("says in the data why no component follows, not only in a comment", () => {
    const reasons = new Set(extraction.records.map((record) =>
      record.target.kind === "evidence_only" ? record.target.reason : ""));
    expect(reasons.size).toBe(1);
    expect([...reasons][0]).toMatch(/publishes no system or local-area total/);
  });

  it("keeps each resource's deliverability status with its value", () => {
    const statuses = extraction.records.map((record) => record.rawPayload.deliverabilityStatus);
    expect(new Set(statuses)).toEqual(new Set(["FC", "ID", "PD"]));
  });

  it("treats CAISO System as no local area rather than as a locality", () => {
    expect(extraction.subareas.map((subarea) => subarea.nativeKey).sort()).toEqual(["Kern", "SanDiego-IV"]);
    const system = extraction.records.find((record) => record.rawPayload.resourceId === "SYS_1_BESS");
    expect(system?.nativeGeography).toBe("CAISO System");
  });

  it("reconciles the two spellings of one place to the publisher's own enumeration", () => {
    // The data writes "San Diego-IV"; the header list writes "SanDiego-IV".
    const sanDiego = extraction.records.find((record) => record.rawPayload.resourceId === "SD_1_GAS");
    expect(sanDiego?.nativeGeography).toBe("SanDiego-IV");
    expect(sanDiego?.rawPayload.localArea).toBe("San Diego-IV");
  });

  it("fails closed on a local area the publisher never enumerated", () => {
    expect(() => parse(caisoCapacityAdapter, caisoWorkbook(caisoRows)))
      .toThrow(/names local area "Fresno"/);
  });

  it("fails closed when a monthly column has moved", () => {
    const moved = buildFixtureWorkbook([
      sheetFromGrid("Header Descriptions", { 4: { A: "Local Area", C: "Kern" } }),
      sheetFromGrid("2026 NQC List", {
        1: { A: "Resource ID", B: "Local Area", C: "Generator Name", D: "Q1", E: "FEB" },
        2: { A: "KERN_1_SOLAR", B: "Kern", D: 1.5 },
      }),
    ], [], "2026-09-10T14:32:26Z");
    expect(() => parse(caisoCapacityAdapter, moved)).toThrow(/column D is "Q1", not JAN/);
  });
});

// ------------------------------------------------------------------------------------ ISO-NE
//
// Two header rows carry the meaning: row 4 names the metric family, row 5 the zone or interface
// it applies to. Row 18's blank SENE columns are real -- the zone stops being stated.

const isoneWorkbook = (overrides: Record<number, Record<string, FixtureCell>> = {}) =>
  buildFixtureWorkbook([
    sheetFromGrid("FCA14-FCA18 (2023-2027) ", {
      4: {
        G: "LSR", H: "LRA", I: "TSA", J: "MCL", L: "TTC", S: "Tie Benefits",
        X: "CTL (TTC - Tie Benefits)", AB: "Load Forecast",
      },
      5: {
        B: "CCP", C: "ICR", D: "Net ICR", E: "CONE ($/kw-month)", F: "Net CONE ($/kw-month)",
        G: "SENE", H: "SENE", I: "SENE", J: "NNE", K: "ME (Nested Zone)",
        L: "SENE Import", M: "North-South", N: "ME-NH", O: "Mari-times", P: "New York",
        Q: "HQ Phase II", R: "Highgate", S: "Total", T: "Mari-times", U: "New York",
        V: "HQ Phase II (HQICCs)", W: "Highgate", X: "Mari-times", Y: "New York",
        Z: "HQ Phase II", AA: "Highgate", AB: "50-50 Summer Peak Frcst",
        AC: "Year of CELT Load Forecast", AD: "ICAP",
      },
      6: {
        B: "2023 FCA14", C: 33_431, D: 32_490, E: 11.472, F: 8.187,
        G: 9_757, H: 9_525, I: 9_757, J: 8_445, K: 4_020,
        L: 5_700, M: 2_725, N: 1_900, O: 700, P: 1_400, Q: 1_400, R: 200,
        S: 1_940, T: 501, U: 362, V: 941, W: 136,
        X: 199, Y: 1_038, Z: 459, AA: 64, AB: 28_838, AC: 2_019, AD: 34_637,
      },
      7: { B: "2026 3rd ARA", C: 31_059, D: 30_050, J: 8_595, K: 4_230, V: 1_009 },
      ...overrides,
    }, ["J4:K4", "S4:W4", "L4:R4", "X4:AA4", "AB4:AC4"]),
  ], [], "2025-12-16T15:32:28Z");

describe("ISO-NE capacity adapter", () => {
  const extraction = parse(isoneCapacityAdapter, isoneWorkbook());
  const find = (term: string, period: string) =>
    extraction.records.find((record) => record.nativeTerm === term && record.nativePeriod === period);

  it("makes each auction a scenario of the commitment period it restates", () => {
    expect(extraction.scenarios.map((scenario) => scenario.nativeScenarioKey).sort())
      .toEqual(["3rd_ara", "fca14"]);
    const icr = find("ICR", "2026 3rd ARA");
    expect(icr?.target.kind === "component" && icr.target.period.targetYear).toBe(2026);
    expect(icr?.target.kind === "component" && icr.target.period.periodBasis)
      .toBe("capacity_commitment_period");
  });

  it("keeps a gross requirement and a net one as different quantities", () => {
    // Under one component kind these collide on the live-row index, and the second silently
    // supersedes the first. They differ by exactly the credits under dispute.
    const icr = find("ICR", "2023 FCA14");
    const net = find("Net ICR", "2023 FCA14");
    expect(icr?.target.kind === "component" && icr.target.componentKind).toBe("reserve_requirement");
    expect(net?.target.kind === "component" && net.target.componentKind).toBe("net_reserve_requirement");
  });

  it("keeps the three SENE studies apart", () => {
    const kinds = ["LSR", "LRA", "TSA"].map((term) => {
      const record = find(term, "2023 FCA14");
      return record?.target.kind === "component" ? record.target.componentKind : null;
    });
    expect(new Set(kinds).size).toBe(3);
    expect(kinds).not.toContain(null);
  });

  it("records HQICC as a tie benefit and never as accredited capability", () => {
    const hqicc = find("Tie Benefits, HQ Phase II (HQICCs)", "2026 3rd ARA");
    expect(hqicc?.nativeValue).toBe("1009");
    expect(hqicc?.target.kind === "component" && hqicc.target.componentKind).toBe("tie_benefit");
    expect(hqicc?.target.kind === "component" && hqicc.target.quantityKind).toBe("capability");
    expect(hqicc?.target.kind === "component" && hqicc.target.interfaceNativeKey).toBe("HQ-PHASE-II");
    for (const record of extraction.records) {
      if (record.target.kind !== "component") continue;
      expect(record.target.componentKind).not.toBe("accredited_resource_capacity");
    }
  });

  it("puts network limits in the constraint layer, not among the components", () => {
    const mcl = find("MCL", "2026 3rd ARA");
    expect(mcl?.target.kind).toBe("constraint");
    expect(mcl?.target.kind === "constraint" && mcl.target.constraintKind).toBe("mcl");
    expect(mcl?.target.kind === "constraint" && mcl.target.direction).toBe("export");
  });

  it("names a counterparty for a tie that leaves New England", () => {
    const hq = extraction.interfaces.find((iface) => iface.nativeKey === "HQ-PHASE-II");
    expect(hq?.interfaceKind).toBe("external_tie");
    expect(hq?.externalCounterparty).toBe("Hydro-Quebec");
    expect(hq?.fromSubareaNativeKey).toBeNull();
  });

  it("declines to classify a column the workbook never defines", () => {
    const icap = find("ICAP", "2023 FCA14");
    expect(icap?.target.kind).toBe("evidence_only");
    expect(icap?.target.kind === "evidence_only" && icap.target.reason).toMatch(/defines no term/);
  });

  it("keeps a price out of the capacity tables", () => {
    const cone = find("CONE ($/kw-month)", "2023 FCA14");
    expect(cone?.target.kind).toBe("evidence_only");
  });

  it("stores nothing for a zone the release stopped stating", () => {
    expect(find("LSR", "2026 3rd ARA")).toBeUndefined();
  });

  it("dates the release from the workbook rather than assuming one", () => {
    expect(extraction.vintage.nativeVintageKey).toBe("icr-summary-2025-12-16");
    expect(extraction.vintage.publishedAt).toBe("2025-12-16T00:00:00Z");
  });

  it("fails closed when the tie benefit block moves", () => {
    expect(() => parse(isoneCapacityAdapter, isoneWorkbook({ 4: { J: "MCL", S: "Tie Benefit" } })))
      .toThrow(/tie benefit block has moved/);
  });
});
