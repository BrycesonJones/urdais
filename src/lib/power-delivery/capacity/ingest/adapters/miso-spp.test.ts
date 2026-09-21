import { describe, expect, it } from "vitest";

import { misoLimitsAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/miso-limits";
import { misoLoleAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/miso-lole";
import { misoZoneKey } from "@/lib/power-delivery/capacity/ingest/adapters/miso-zones";
import { sppCapacityAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/spp";
import { INTERNAL_ONLY_CAPACITY_SOURCES, capacityDeferrals } from "@/lib/power-delivery/capacity/ingest/registry";
import { type CapacityAdapter } from "@/lib/power-delivery/capacity/ingest/types";
import { buildFixturePdf, showLines, showText, type FixtureFont } from "@/lib/power-delivery/pdf/fixture-pdf";
import { mayPublishSourceValue, type SourceRightsState } from "@/lib/rights/publication";
import { sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

function asciiFont(resource: string): FixtureFont {
  const toUnicode = new Map<number, string>();
  for (let code = 0x20; code <= 0x7e; code += 1) toUnicode.set(code, String.fromCharCode(code));
  return { resource, toUnicode, declaredCodespaceBytes: 2 };
}

const page = (text: string) => ({ content: showText("F1", text), fonts: [asciiFont("F1")] });
/** A page whose lines are separate positioning moves, as a slide's table cells are. */
const linedPage = (text: string) => ({ content: showLines("F1", text.split("\n")), fonts: [asciiFont("F1")] });

function parse(adapter: CapacityAdapter, body: Buffer) {
  const spec = adapter.artifacts[0]!;
  const artifact: RetrievedArtifact = {
    label: spec.label, url: spec.url, retrievedAt: "2026-09-21T00:00:00.000Z",
    status: 200, contentType: null, byteLength: body.byteLength, sha256: sha256(body), body,
  };
  return adapter.parse(new Map([[spec.label, artifact]]));
}

const find = (extraction: ReturnType<typeof parse>, term: string, geography?: string) =>
  extraction.records.find((record) =>
    record.nativeTerm === term && (geography === undefined || record.nativeGeography === geography));

// ------------------------------------------------------------------------------- MISO study
//
// The system table and one zonal table, laid out as the report lays them out: every row ends in
// a bracketed formula key, negatives are set in accounting parentheses, and the zonal table is
// introduced by a heading that names its season.

const ZONES = "LRZ-1 LRZ-2 LRZ-3 LRZ-4 LRZ-5 LRZ-6 LRZ-7 LRZ-8 LRZ-9 LRZ-10 Formula Key";
const tenOf = (base: number) => Array.from({ length: 10 }, (_, index) => base + index * 100).join(" ");

const zonalTable = (season: string) =>
  `PY 2026-2027 Local Reliability Requirements - ${season} ${ZONES} `
  + `Installed Capacity (MW) ${tenOf(20_000)} [A] `
  + `Unforced Capacity (MW) ${tenOf(19_000)} [B] `
  + `Adjustment to UCAP (MW) 1,516 494 2,594 2,759 3,319 5,125 2,472 - 5 3,879 1,417 [C] `
  + `Local Reliability Requirement (LRR) UCAP (MW) ${tenOf(21_000)} [D] `
  + `Peak Demand (MW) ${tenOf(18_000)} [E] `
  + `LRR UCAP per-unit of LRZ Peak Demand 110.3% 109.9% 127.4% 130.7% 129.0% 123.5% 110.2% 137.9% 115.4% 138.9% [F]`;

const misoStudy = (system?: string) => buildFixturePdf([
  page("Planning Year 2026-2027 | MISO Loss of Load Expectation Study Report"),
  page(system ?? (
    "MISO Planning Reserve Margin (PRM) Summer Fall Winter Spring Formula Key "
    + "MISO System Peak Demand (MW) 125,531 111,042 106,248 101,854 [A] "
    + "Unforced Capacity (MW) 135,743 130,395 126,514 126,438 [B] "
    + "Thermal 105,905 105,649 108,831 104,295 [B.1] "
    + "Cold Weather Outage Impacts 0 (830) (11,320) (7,850) [B.10] "
    + "Firm External Support UCAP (MW) 1,088 1,034 1,282 1,036 [C] "
    + "Adjustment to UCAP (MW) (1,440) (7,550) (1,440) (1,820) [D] "
    + "UCAP PRM Requirement (PRMR) (MW) 135,391 123,878 126,356 125,654 [E] "
    + "MISO PRM 7.9% 11.6% 18.9% 23.4% [F]"
  )),
  page(`${zonalTable("Summer 2026")} ${zonalTable("Fall 2026")}`),
  page(`${zonalTable("Winter 2026-2027")} ${zonalTable("Spring 2027")}`),
], { compress: true });

describe("MISO loss of load expectation study", () => {
  const extraction = parse(misoLoleAdapter, misoStudy());

  it("reads the reserve margin requirement as a requirement, never as capability", () => {
    const prmr = extraction.records.filter((record) => record.nativeTerm === "UCAP PRM Requirement (PRMR)");
    expect(prmr).toHaveLength(4);
    for (const record of prmr) {
      expect(record.target.kind === "component" && record.target.quantityKind).toBe("requirement");
      expect(record.target.kind === "component" && record.target.capacityBasis).toBe("ucap");
    }
    expect(prmr.map((record) => record.target.kind === "component" ? record.target.value : null))
      .toEqual([135_391, 123_878, 126_356, 125_654]);
  });

  it("reads a local reliability requirement as a requirement, never as capability", () => {
    const lrr = extraction.records.filter((record) =>
      record.nativeTerm === "Local Reliability Requirement (LRR) UCAP");
    expect(lrr).toHaveLength(40);
    for (const record of lrr) {
      expect(record.target.kind === "component" && record.target.quantityKind).toBe("requirement");
      expect(record.target.kind === "component" && record.target.componentKind).toBe("local_reliability_requirement");
    }
  });

  it("keeps accounting parentheses negative", () => {
    // A cold weather derate of (11,320) is minus eleven thousand. Read as positive it would turn
    // the largest single derate in the study into a resource.
    const winter = extraction.records.find((record) =>
      record.nativeTerm === "Adjustment to UCAP" && record.nativeGeography === "MISO"
      && record.target.kind === "component" && record.target.period.targetSeason === "winter");
    expect(winter?.target.kind === "component" && winter.target.value).toBe(-1_440);
    const derate = extraction.records.find((record) =>
      record.nativeTerm === "Unforced Capacity: Cold Weather Outage Impacts" && record.nativeValue === "-11320");
    expect(derate).toBeDefined();
  });

  it("keeps a minus sign that was set apart from its digits", () => {
    const adjustment = extraction.records.find((record) =>
      record.nativeTerm === "Adjustment to UCAP" && record.nativeGeography === "LRZ-8"
      && record.target.kind === "component" && record.target.period.targetSeason === "summer");
    expect(adjustment?.target.kind === "component" && adjustment.target.value).toBe(-5);
  });

  it("keeps installed and unforced capacity on their own bases", () => {
    const icap = find(extraction, "Installed Capacity", "LRZ-1");
    const ucap = find(extraction, "Unforced Capacity", "LRZ-1");
    expect(icap?.target.kind === "component" && icap.target.capacityBasis).toBe("icap");
    expect(ucap?.target.kind === "component" && ucap.target.capacityBasis).toBe("ucap");
  });

  it("keeps the resource-class decomposition as evidence rather than colliding rows", () => {
    const thermal = extraction.records.filter((record) => record.nativeTerm === "Unforced Capacity: Thermal");
    expect(thermal).toHaveLength(4);
    for (const record of thermal) expect(record.target.kind).toBe("evidence_only");
  });

  it("reads all four seasons of every zone", () => {
    const seasons = new Set(extraction.records
      .filter((record) => record.target.kind === "component")
      .map((record) => record.target.kind === "component" ? record.target.period.targetSeason : null));
    expect(seasons).toEqual(new Set(["summer", "fall", "winter", "spring"]));
    expect(extraction.subareas).toHaveLength(10);
    expect(extraction.subareas.every((subarea) => subarea.subareaKind === "lrz")).toBe(true);
  });

  it("asserts no period dates the study never stated", () => {
    for (const record of extraction.records) {
      if (record.target.kind !== "component") continue;
      expect(record.target.period.periodStart).toBeNull();
      expect(record.target.period.periodBasis).toBe("planning_year");
    }
  });

  it("creates no interface, because this release states no transfer limit", () => {
    expect(extraction.interfaces).toEqual([]);
  });

  it("refuses a study for a different planning year", () => {
    const other = buildFixturePdf([page("Planning Year 2029-2030 | MISO Loss of Load Expectation Study Report")]);
    expect(() => parse(misoLoleAdapter, other)).toThrow(/planning year 2029-2030/);
  });

  it("fails closed when a row loses a column instead of shortening the table", () => {
    const short = misoStudy(
      "MISO Planning Reserve Margin (PRM) Summer Fall Winter Formula Key "
      + "MISO System Peak Demand (MW) 125,531 111,042 106,248 [A]",
    );
    expect(() => parse(misoLoleAdapter, short)).toThrow(/values where 4 were expected|no longer states/);
  });
});

// ------------------------------------------------------------------------------ MISO limits

const slide = (kind: "Import" | "Export", zone: number, ability: string, limit: string) =>
  `Capacity ${kind} Limits\nZone ${zone}\n${zone === 10 ? "LRZ 10" : `LRZ${zone}`}\nMonitored Element\nContingency\nGLT\nRDS\n`
  + `${kind === "Import" ? "ZIA" : "ZEA"}\n${kind === "Import" ? "CIL" : "CEL"}\n`
  + ["Summer 2026", "Fall 2026", "Winter 2026-27", "Spring 2027"].map((season, index) =>
    `${season}\nSome - Line 345 kV\nAnother - Line 345 kV\nNone\n852 MWx2\n${Number(ability) + index}\n${Number(limit) + index}`,
  ).join("\n")
  // The voltage legend every slide ends with. Its "100" is a bare number too.
  + "\n100\n-\n161kV\n230kV\n345kV\n500kV";

const summaryTable = (kind: "Import" | "Export", base: number) =>
  `2026-2027 PY Zonal ${kind} Ability Results\nLRZ\nSummer\nFall\nWinter\nSpring\n`
  + Array.from({ length: 10 }, (_, index) =>
    `${index + 1}\n${base + index * 1000}\n${base + index * 1000 + 1}\n${base + index * 1000 + 2}\n${base + index * 1000 + 3}`,
  ).join("\n");

function misoLimits(options: { summaryDrift?: number } = {}) {
  const drift = options.summaryDrift ?? 0;
  return buildFixturePdf([
    page("PY 2026-2027 CIL/CEL Results"),
    linedPage(summaryTable("Import", 7_000 + drift)),
    linedPage(summaryTable("Export", 3_000)),
    ...Array.from({ length: 10 }, (_, index) =>
      linedPage(slide("Import", index + 1, String(7_000 + index * 1000), String(7_500 + index * 1000)))),
    ...Array.from({ length: 10 }, (_, index) =>
      linedPage(slide("Export", index + 1, String(3_000 + index * 1000), String(3_400 + index * 1000)))),
    linedPage("Local Resource Zone Local Balancing Authorities\n1\nDPC, GRE, MDU, MP, NSP, OTP, SMP"),
  ], { compress: true });
}

describe("MISO capacity import and export limits", () => {
  const extraction = parse(misoLimitsAdapter, misoLimits());

  it("puts every limit in the constraint layer and no limit among the components", () => {
    const limits = extraction.records.filter((record) => /Capacity (Import|Export) Limit/.test(record.nativeTerm));
    expect(limits).toHaveLength(80);
    for (const record of limits) expect(record.target.kind).toBe("constraint");
    expect(extraction.records.some((record) => record.target.kind === "component")).toBe(false);
  });

  it("classifies import and export limits by their own kinds", () => {
    const cil = find(extraction, "Capacity Import Limit (CIL)", "LRZ-1");
    const cel = find(extraction, "Capacity Export Limit (CEL)", "LRZ-1");
    expect(cil?.target.kind === "constraint" && cil.target.constraintKind).toBe("cil");
    expect(cil?.target.kind === "constraint" && cil.target.direction).toBe("import");
    expect(cel?.target.kind === "constraint" && cel.target.constraintKind).toBe("cel");
    expect(cel?.target.kind === "constraint" && cel.target.direction).toBe("export");
  });

  it("keeps the study's transfer ability apart from the limit MISO applies", () => {
    const ability = find(extraction, "Zonal Import Ability (ZIA)", "LRZ-1");
    expect(ability?.target.kind).toBe("evidence_only");
    expect(ability?.target.kind === "evidence_only" && ability.target.reason).toMatch(/not the limit MISO applies/);
  });

  it("does not read the voltage legend as the last season's limit", () => {
    // Each slide ends in a legend whose "100" is a bare number. Reading a season's row backwards
    // from the end of the slide makes the final season's limit 100 MW.
    const spring = extraction.records.find((record) =>
      record.nativeTerm === "Capacity Import Limit (CIL)" && record.nativeGeography === "LRZ-1"
      && record.target.kind === "constraint" && record.target.period.targetSeason === "spring");
    expect(spring?.target.kind === "constraint" && spring.target.value).toBe(7_503);
  });

  it("reconciles LRZ1, LRZ-1 and LRZ 10 to one key", () => {
    expect(misoZoneKey("LRZ1")).toBe("LRZ-1");
    expect(misoZoneKey("LRZ-1")).toBe("LRZ-1");
    expect(misoZoneKey("LRZ 10")).toBe("LRZ-10");
    expect(misoZoneKey("10")).toBe("LRZ-10");
    expect(misoZoneKey("LRZ 11")).toBeNull();
    expect(extraction.subareas.map((subarea) => subarea.nativeKey)).toContain("LRZ-10");
  });

  it("records the zones' membership from the deck rather than from this repository", () => {
    expect(extraction.subareas[0]?.notes).toMatch(/DPC, GRE, MDU/);
  });

  it("records a small self-disagreement instead of hiding it", () => {
    // The real deck states one zone's import ability as 7,245 in its summary and 7,244 on the
    // zone's slide. The detailed slide is carried forward and the disagreement is kept.
    const drifted = parse(misoLimitsAdapter, misoLimits({ summaryDrift: 1 }));
    const noted = drifted.records.filter((record) => record.nativeTerm.includes("as the summary table states it"));
    expect(noted.length).toBeGreaterThan(0);
    expect(noted[0]?.target.kind === "evidence_only" && noted[0].target.reason).toMatch(/disagree/);
    // The limits themselves are unaffected.
    const cil = find(drifted, "Capacity Import Limit (CIL)", "LRZ-1");
    expect(cil?.target.kind === "constraint" && cil.target.value).toBe(7_500);
  });

  it("fails closed when the two tables disagree by more than a rounding", () => {
    expect(() => parse(misoLimitsAdapter, misoLimits({ summaryDrift: 900 })))
      .toThrow(/a divergence this large means the table has been misread/);
  });
});

// ----------------------------------------------------------------------------------- SPP

const SPP_BODY = [
  "2026 Summer Season Resource Adequacy Report for the SPP East Balancing Authority Area.",
  "For the summer 2026 season, the ACAP PRM was established at 7.06% and applied uniformly to all LREs.",
  "the East BAA maintains a reserve margin of 17.1%, representing approximately 5,752 MW of excess "
  + "accredited capacity above the total Resource Adequacy Requirement.",
  "The Base Planning Reserve Margin (PRM) requirement was 12% from 2019 through 2022.",
  "By 2031, the East BAA is projected to experience a capacity deficit of 11,188 MW.",
  "The Total Capacity and Existing Resource values contain the Firm Capacity and Deliverable Capacity from LREs and GOs.",
  "The equation for calculating the Total LRE Forecasted Net Peak Demand is as follows: Forecasted "
  + "LRE Peak Demand - Controllable and Dispatchable Demand Response",
];

const sppReport = (lines: readonly string[] = SPP_BODY) =>
  buildFixturePdf(lines.map((line) => page(line)), { compress: true });

describe("SPP summer resource adequacy report", () => {
  const extraction = parse(sppCapacityAdapter, sppReport());

  it("stores the planning reserve margin as a requirement on SPP's own basis", () => {
    const prm = find(extraction, "Accredited Capacity Planning Reserve Margin (ACAP PRM)");
    expect(prm?.target.kind === "component" && prm.target.quantityKind).toBe("requirement");
    expect(prm?.target.kind === "component" && prm.target.value).toBe(7.06);
    expect(prm?.target.kind === "component" && prm.target.unit).toBe("percent");
    // Accredited capacity is neither installed nor unforced; SPP's framework is its own.
    expect(prm?.target.kind === "component" && prm.target.capacityBasis).toBe("accredited");
  });

  it("never turns the requirement into a capability", () => {
    for (const record of extraction.records) {
      if (record.target.kind !== "component") continue;
      expect(record.target.quantityKind).not.toBe("capability");
    }
  });

  it("keeps SPP's tariff term for deliverable capacity out of the Urdais quantity", () => {
    // SPP's "Deliverable Capacity" is accredited megawatts a study found deliverable to the East
    // Balancing Authority Area. Urdais's quantity of the same name is a market's maximum
    // load-serving capability. Nothing may turn one into the other.
    const term = find(extraction, "Deliverable Capacity (SPP tariff term)");
    expect(term?.target.kind).toBe("evidence_only");
    expect(term?.target.kind === "evidence_only" && term.target.reason).toMatch(/not the Urdais quantity of the same name/);
    for (const record of extraction.records) {
      if (record.target.kind === "evidence_only") continue;
      expect(record.target.kind).not.toBe("derived_quantity");
      if (record.target.kind === "component") expect(record.target.quantityKind).not.toBe("capability");
    }
  });

  it("records that demand response is already netted out of demand", () => {
    // SPP's Net Peak Demand subtracts controllable and dispatchable demand response, so counting
    // it again on the capacity side would count it twice.
    for (const record of extraction.records) {
      expect(record.rawPayload.netPeakDemandExcludesDemandResponse).toBe(true);
    }
  });

  it("manufactures no locality, because SPP studies none", () => {
    expect(extraction.subareas).toEqual([]);
    expect(extraction.interfaces).toEqual([]);
  });

  it("keeps a scheduled or historical margin out of this season's requirement", () => {
    const history = find(extraction, "Base Planning Reserve Margin (PRM), earlier planning years");
    expect(history?.target.kind).toBe("evidence_only");
  });

  it("refuses a document its publisher marked internal only", () => {
    const marked = sppReport([...SPP_BODY, "Southwest Power Pool, Inc. SPP Internal Only"]);
    expect(() => parse(sppCapacityAdapter, marked)).toThrow(/stamped "SPP Internal Only"/);
  });

  it("refuses an artifact about the Western Energy Imbalance Service area", () => {
    const weis = sppReport([...SPP_BODY, "This report covers the Western Energy Imbalance Service area."]);
    expect(() => parse(sppCapacityAdapter, weis)).toThrow(/Western Energy Imbalance Service/);
  });

  it("fails closed when the sentence it reads is reworded", () => {
    const reworded = sppReport(SPP_BODY.map((line) =>
      line.replace("the ACAP PRM was established at 7.06%", "the ACAP PRM for the season is 7.06 percent")));
    expect(() => parse(sppCapacityAdapter, reworded)).toThrow(/no longer states/);
  });
});

// --------------------------------------------------------------------------------- rights

describe("MISO and SPP rights", () => {
  const rightsFor = (purpose: string): SourceRightsState => ({
    sourceInterfaceSlug: "miso-lole-study", sourceName: "MISO", purpose,
    rightsClassification: "unsuitable_without_permission",
    disposition: "prohibited", attributionRequired: true,
    attributionText: "Source: MISO.", conditions: null,
    unresolvedIssue: "Public display requires express written permission.",
    termsDocumentUrl: null, reviewedBy: "Urdais research", reviewedOn: "2026-09-20",
  });

  it("blocks public display of a raw value", () => {
    const decision = mayPublishSourceValue({
      rights: rightsFor("public_raw_grid_capacity_value_display"),
      publicationState: "published",
      purpose: "public_raw_grid_capacity_value_display",
      isPublicPurpose: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_permission_prohibited");
  });

  it("blocks public display of a derived value", () => {
    const decision = mayPublishSourceValue({
      rights: rightsFor("public_derived_deliverable_capacity_display"),
      publicationState: "published",
      purpose: "public_derived_deliverable_capacity_display",
      isPublicPurpose: true,
    });
    expect(decision.allowed).toBe(false);
  });

  it("offers no founder-accepted-risk route for an unsuitable source", () => {
    // Ambiguity is what the founder-risk policy is for. A determination that the terms were
    // reviewed and refused is not ambiguity, and softening the disposition does not unlock it.
    const decision = mayPublishSourceValue({
      rights: { ...rightsFor("public_raw_grid_capacity_value_display"), disposition: "not_established" },
      publicationState: "published",
      purpose: "public_raw_grid_capacity_value_display",
      isPublicPurpose: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_unsuitable_without_permission");
  });

  it("opens only on an explicit permission grant, which these sources do not have", () => {
    const decision = mayPublishSourceValue({
      rights: { ...rightsFor("public_raw_grid_capacity_value_display"), disposition: "permitted" },
      publicationState: "published",
      purpose: "public_raw_grid_capacity_value_display",
      isPublicPurpose: true,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("allowed_by_explicit_permission_grant");
  });

  it("collects under the research purpose, which cites no permission grant", () => {
    for (const key of INTERNAL_ONLY_CAPACITY_SOURCES) {
      const adapter = { "miso-lole": misoLoleAdapter, "miso-limits": misoLimitsAdapter, spp: sppCapacityAdapter }[key];
      expect(adapter?.retrievalPurpose).toBe("research");
    }
  });

  it("marks every internal-only vintage internal_only", () => {
    for (const extraction of [parse(misoLoleAdapter, misoStudy()), parse(sppCapacityAdapter, sppReport())]) {
      expect(extraction.vintage.publicationState).toBe("internal_only");
    }
  });

  it("records why the deliverability study is not collected at all", () => {
    const deferred = capacityDeferrals("spp");
    const internalOnly = deferred.find((entry) => entry.reason.includes("SPP Internal Only"));
    expect(internalOnly).toBeDefined();
    expect(internalOnly?.unblockedBy).toMatch(/Written permission from SPP/);
  });
});
