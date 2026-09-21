import { describe, expect, it } from "vitest";

import { nyisoCapacityAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/nyiso";
import { pjmBraAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/pjm-bra";
import { pjmParametersAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/pjm-parameters";
import { CapacitySourceFormatError, type CapacityAdapter } from "@/lib/power-delivery/capacity/ingest/types";
import { buildFixturePdf, showText, type FixtureFont } from "@/lib/power-delivery/pdf/fixture-pdf";
import { sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { buildFixtureWorkbook, sheetFromGrid, type FixtureCell } from "@/lib/power-delivery/planning/xlsx/fixture-workbook";

function parse(adapter: CapacityAdapter, body: Buffer) {
  const spec = adapter.artifacts[0]!;
  const artifact: RetrievedArtifact = {
    label: spec.label, url: spec.url, retrievedAt: "2026-09-21T00:00:00.000Z",
    status: 200, contentType: null, byteLength: body.byteLength, sha256: sha256(body), body,
  };
  return adapter.parse(new Map([[spec.label, artifact]]));
}

const componentsOf = (extraction: ReturnType<typeof parse>) =>
  extraction.records.filter((record) => record.target.kind === "component");

function find(extraction: ReturnType<typeof parse>, term: string, geography?: string) {
  return extraction.records.find((record) =>
    record.nativeTerm === term && (geography === undefined || record.nativeGeography === geography));
}

// ------------------------------------------------------------------------ PJM parameters
//
// Reproduces what the real workbook does that a naive reader gets wrong: a scalar block keyed by
// label, a matrix of modelled areas, and a second table covering every area whose transfer limits
// are sometimes printed as bounds and whose area names are spelled differently from the matrix.

const pjmParameters = (overrides: Record<number, Record<string, FixtureCell>> = {}) =>
  buildFixtureWorkbook([
    sheetFromGrid("Planning Parameters", {
      1: { A: "2026/2027 RPM Base Residual Auction Planning Parameters" },
      4: { A: "Installed Reserve Margin (IRM) ", B: 0.191 },
      5: { A: "Pool-Wide Accredited UCAP Factor", B: 0.7699 },
      6: { A: "Reference Resource AUCAP Factor", B: 0.78 },
      7: { A: "Forecast Pool Requirement (FPR)", B: 0.917 },
      8: { A: "Preliminary Forecast Peak Load", B: 159_329.1 },
      12: { A: " ", B: "RTO", C: "MAAC", D: "PS NORTH", E: "PL" },
      15: { A: "Reliability Requirement", B: 146_104.8, C: 52_587.1, D: 5_390.4, E: 9_521.8 },
      17: { A: "Preliminary FRR Obligation", B: 11_585.3, C: 0, D: 0, E: 0 },
      18: { A: "Reliability Requirement adjusted for FRR", B: 134_519.5, C: 52_587.1, D: 5_390.4, E: 9_521.8 },
      50: { A: "LDA CETO/CETL Data; Zonal Peak Loads, Base Zonal FRR Scaling Factors, and FRR load." },
      51: {
        A: "LDA/Zone", B: "CETO (Capacity Emergency Transfer Objective)",
        C: "CETL (Capacity Emergency Transfer Limit)", D: "CETL to CETO Ratio %",
        I: "Preliminary Zonal Peak Load Forecast",
      },
      52: { A: "RTO", B: "NA", C: "NA", D: "NA", I: 159_329.1 },
      53: { A: "MAAC", B: 590, C: 2_715, D: "*", I: 56_081 },
      54: { A: "PSNORTH", B: 3_017, C: 4_425, D: 1.4666, I: 5_006.493 },
      55: { A: "PL (incl. UGI)", B: 1_144, C: 3_205, D: 2.8015, I: 7_656 },
      56: { A: "AE", B: 2_007, C: ">2,308.1", D: ">115%", I: 2_361 },
      57: { A: "* LDA has adequate internal resources to meet the reliability criterion." },
      60: { A: "5/30/2025 - Added FRR data" },
      ...overrides,
    }),
  ]);

describe("PJM planning parameters adapter", () => {
  const extraction = parse(pjmParametersAdapter, pjmParameters());

  it("stores a reserve margin as the rate the publisher states, not as megawatts", () => {
    const irm = find(extraction, "Installed Reserve Margin (IRM)");
    expect(irm?.nativeValue).toBe("0.191");
    expect(irm?.target.kind === "component" && irm.target.value).toBe(19.1);
    expect(irm?.target.kind === "component" && irm.target.unit).toBe("percent");
    expect(irm?.target.kind === "component" && irm.target.quantityKind).toBe("requirement");
  });

  it("tells the reserve margin and the pool requirement apart by basis, not by name", () => {
    // They are one obligation stated twice: FPR is (1 + IRM) times an accreditation factor.
    const irm = find(extraction, "Installed Reserve Margin (IRM)");
    const fpr = find(extraction, "Forecast Pool Requirement (FPR)");
    expect(irm?.target.kind === "component" && irm.target.componentKind).toBe("reserve_requirement");
    expect(fpr?.target.kind === "component" && fpr.target.componentKind).toBe("reserve_requirement");
    expect(irm?.target.kind === "component" && irm.target.capacityBasis).toBe("icap");
    expect(fpr?.target.kind === "component" && fpr.target.capacityBasis).toBe("ucap");
  });

  it("keeps a reliability requirement a requirement and never a capability", () => {
    for (const record of componentsOf(extraction)) {
      if (!record.nativeTerm.startsWith("Reliability Requirement")) continue;
      expect(record.target.kind === "component" && record.target.quantityKind).toBe("requirement");
    }
    expect(componentsOf(extraction).some((record) =>
      record.target.kind === "component" && record.target.quantityKind === "capability")).toBe(false);
  });

  it("puts the transfer objective and the transfer limit in different layers", () => {
    // CETO is what an area must be able to import; CETL is what the network permits. The whole
    // locational test is a comparison between them, which is only a question because they differ.
    const ceto = find(extraction, "CETO", "MAAC");
    const cetl = find(extraction, "CETL", "MAAC");
    expect(ceto?.target.kind).toBe("component");
    expect(ceto?.target.kind === "component" && ceto.target.componentKind).toBe("capacity_transfer_requirement");
    expect(ceto?.target.kind === "component" && ceto.target.quantityKind).toBe("requirement");
    expect(cetl?.target.kind).toBe("constraint");
    expect(cetl?.target.kind === "constraint" && cetl.target.constraintKind).toBe("cetl");
  });

  it("keeps a transfer limit printed as a bound out of the constraint layer", () => {
    const bounded = find(extraction, "CETL", "AE");
    expect(bounded?.nativeValue).toBe(">2,308.1");
    expect(bounded?.target.kind).toBe("evidence_only");
    expect(bounded?.target.kind === "evidence_only" && bounded.target.reason).toMatch(/bound rather than a value/);
  });

  it("reconciles the several ways PJM spells one area", () => {
    // The matrix says "PS NORTH" and "PL"; the area table says "PSNORTH" and "PL (incl. UGI)".
    const keys = extraction.subareas.map((subarea) => subarea.nativeKey).sort();
    expect(keys).toEqual(["AE", "MAAC", "PL", "PSNORTH"]);
    const requirement = find(extraction, "Reliability Requirement", "PSNORTH");
    const ceto = find(extraction, "CETO", "PSNORTH");
    expect(requirement).toBeDefined();
    expect(ceto).toBeDefined();
  });

  it("says in the locality's own notes that areas nest and are never totalled", () => {
    expect(extraction.subareas[0]?.notes).toMatch(/nest/);
    expect(extraction.subareas.every((subarea) => subarea.subareaKind === "lda")).toBe(true);
  });

  it("states the whole-RTO figures without a locality rather than as one", () => {
    const rto = find(extraction, "Reliability Requirement", "RTO");
    expect(rto?.target.kind === "component" && rto.target.subareaNativeKey).toBeNull();
  });

  it("stores the RTO peak forecast once, though the sheet states it twice", () => {
    const peaks = extraction.records.filter((record) => record.nativeGeography === "RTO"
      && record.nativeTerm.includes("Peak Load"));
    expect(peaks).toHaveLength(1);
  });

  it("refuses an artifact for a different delivery year", () => {
    const other = pjmParameters({ 1: { A: "2028/2029 RPM Base Residual Auction Planning Parameters" } });
    expect(() => parse(pjmParametersAdapter, other)).toThrow(/is for delivery year 2028\/2029/);
  });

  it("fails closed when the transfer table moves", () => {
    const moved = pjmParameters({ 51: { A: "LDA/Zone", B: "Something else", C: "Another thing" } });
    expect(() => parse(pjmParametersAdapter, moved)).toThrow(CapacitySourceFormatError);
  });
});

// ----------------------------------------------------------------------------- PJM results

const pjmResults = (overrides: Record<number, Record<string, FixtureCell>> = {}) =>
  buildFixtureWorkbook([
    sheetFromGrid("Summary", {
      1: { A: "2026/2027 BRA Summary of Auction Results" },
      3: { A: "Resource Clearing Prices [$/MW-day]" },
      4: { A: "LDA", B: "Base Residual Auction" },
      5: { A: "RTO", B: 329.17 },
      6: { A: "MAAC", B: 329.17 },
      23: { A: "Participant Buy Bids/Sell Offers Cleared" },
      24: { A: "LDA", B: "Base Residual Auction" },
      25: { B: "Participant Sell Offers Cleared" },
      26: { A: "RTO", B: 134_205.3 },
      27: { A: "MAAC", B: 51_551.8 },
      28: { A: "PSNORTH", B: 2_361.5 },
      ...overrides,
    }),
  ]);

describe("PJM auction results adapter", () => {
  const extraction = parse(pjmBraAdapter, pjmResults());

  it("stores what cleared as capability in unforced terms", () => {
    const rto = find(extraction, "Participant Sell Offers Cleared", "RTO");
    expect(rto?.target.kind === "component" && rto.target.quantityKind).toBe("capability");
    expect(rto?.target.kind === "component" && rto.target.capacityBasis).toBe("ucap");
    expect(rto?.target.kind === "component" && rto.target.value).toBe(134_205.3);
    expect(rto?.target.kind === "component" && rto.target.subareaNativeKey).toBeNull();
  });

  it("does not add the areas together, nor add the RTO to them", () => {
    // Areas nest: MAAC's cleared capacity already counts everything inside it. The adapter states
    // each figure and never a total, and no record claims to be one.
    const cleared = extraction.records.filter((record) => record.nativeTerm === "Participant Sell Offers Cleared");
    expect(cleared).toHaveLength(3);
    const total = cleared.reduce((sum, record) =>
      sum + (record.target.kind === "component" ? record.target.value : 0), 0);
    expect(cleared.some((record) => record.target.kind === "component" && record.target.value === total)).toBe(false);
  });

  it("keeps a clearing price out of the capacity tables", () => {
    const price = find(extraction, "Resource Clearing Price", "RTO");
    expect(price?.target.kind).toBe("evidence_only");
    expect(price?.nativeUnit).toBe("$/MW-day");
  });

  it("uses the same area keys as the planning parameters do", () => {
    expect(extraction.subareas.map((subarea) => subarea.nativeKey).sort()).toEqual(["MAAC", "PSNORTH"]);
  });

  it("refuses an artifact for a different delivery year", () => {
    const other = pjmResults({ 1: { A: "2027/2028 BRA Summary of Auction Results" } });
    expect(() => parse(pjmBraAdapter, other)).toThrow(/is for delivery year 2027\/2028/);
  });
});

// --------------------------------------------------------------------------------- NYISO

function asciiFont(resource: string): FixtureFont {
  const toUnicode = new Map<number, string>();
  for (let code = 0x20; code <= 0x7e; code += 1) toUnicode.set(code, String.fromCharCode(code));
  return { resource, toUnicode, declaredCodespaceBytes: 2 };
}

const RECOMMENDATION =
  "for the 2026-2027 Capability Year beginning May 1, 2026. The NYSRC approved a New York Control "
  + "Area (NYCA) Installed Reserve Margin (IRM) value of 24.5% for the 2026-2027 Capability Year.";
const FLOORS = "the binding TSL floor values for Load Zone J are 86.4% (CHPE-In) and 82.6% (CHPE-Out).";
const SUMMARY =
  "For the CHPE-In case, the LCRs are 86.4% for New York City, 110.3% for Long Island, and 82.5% "
  + "for the G-J Locality. For the CHPE-Out case, the LCRs are 82.6% for New York City, 110.3% for "
  + "Long Island, and 82.5% for the G-J Locality.";

const nyisoStudy = (summary = SUMMARY, floors = FLOORS, recommendation = RECOMMENDATION) =>
  buildFixturePdf([
    { content: showText("F1", recommendation), fonts: [asciiFont("F1")] },
    { content: showText("F1", floors), fonts: [asciiFont("F1")] },
    { content: showText("F1", summary), fonts: [asciiFont("F1")] },
  ], { compress: true });

describe("NYISO LCR study adapter", () => {
  const extraction = parse(nyisoCapacityAdapter, nyisoStudy());

  it("keeps the two triggering-resource cases as separate scenarios", () => {
    // They are two answers, not a range: which one applies is settled by the tariff.
    expect(extraction.scenarios.map((scenario) => scenario.nativeScenarioKey)).toEqual(["chpe_in", "chpe_out"]);
    expect(extraction.scenarios.every((scenario) => !scenario.isReference)).toBe(true);
  });

  it("reads each locality's requirement under each case", () => {
    const requirements = extraction.records.filter((record) =>
      record.nativeTerm === "Locational Minimum Installed Capacity Requirement");
    const byKey = new Map(requirements.map((record) =>
      [`${record.nativeScenario}/${record.nativeGeography}`, Number(record.nativeValue)]));
    expect(byKey.get("chpe_in/NYC")).toBe(86.4);
    expect(byKey.get("chpe_out/NYC")).toBe(82.6);
    expect(byKey.get("chpe_in/LONG-ISLAND")).toBe(110.3);
    expect(byKey.get("chpe_in/G-J")).toBe(82.5);
    expect(requirements).toHaveLength(6);
  });

  it("stores requirements as percentages and produces no megawatt anywhere", () => {
    for (const record of extraction.records) {
      expect(record.nativeUnit).toBe("percent");
      if (record.target.kind === "evidence_only") continue;
      expect(record.target.unit).toBe("percent");
    }
  });

  it("never turns a requirement into a capability", () => {
    for (const record of componentsOf(extraction)) {
      expect(record.target.kind === "component" && record.target.quantityKind).toBe("requirement");
    }
  });

  it("puts the transmission security floor in the constraint layer", () => {
    const floors = extraction.records.filter((record) => record.nativeTerm.startsWith("Transmission Security Limit"));
    expect(floors).toHaveLength(2);
    for (const floor of floors) {
      expect(floor.target.kind).toBe("constraint");
      expect(floor.target.kind === "constraint" && floor.target.constraintKind).toBe("tsl");
    }
  });

  it("records the reserve margin against both cases, because it governs both", () => {
    const margins = extraction.records.filter((record) => record.nativeTerm.includes("Installed Reserve Margin"));
    expect(margins).toHaveLength(2);
    expect(new Set(margins.map((record) => record.nativeValue))).toEqual(new Set(["24.5"]));
  });

  it("reads the capability year from the study rather than assuming one", () => {
    const first = componentsOf(extraction)[0];
    expect(first?.target.kind === "component" && first.target.period.periodBasis).toBe("capability_year");
    expect(first?.target.kind === "component" && first.target.period.targetYear).toBe(2026);
    expect(first?.target.kind === "component" && first.target.period.periodStart).toBe("2026-05-01");
  });

  it("cites the page each value was read from", () => {
    for (const record of extraction.records) {
      expect(record.locator.extractionMethod).toBe("pdf_table");
      expect(record.locator.pdfPage).toBeGreaterThan(0);
    }
  });

  it("fails closed when the study rewords the sentence it is read from", () => {
    const reworded = nyisoStudy(
      "For the CHPE-In case, the requirements are 86.4% for New York City, 110.3% for Long Island, "
      + "and 82.5% for the G-J Locality.",
    );
    expect(() => parse(nyisoCapacityAdapter, reworded)).toThrow(/no longer states/);
  });

  it("fails closed rather than inventing a capability year", () => {
    const undated = nyisoStudy(SUMMARY, FLOORS, "The NYSRC approved an Installed Reserve Margin (IRM) value of 24.5%.");
    expect(() => parse(nyisoCapacityAdapter, undated)).toThrow(/capability year/);
  });
});
