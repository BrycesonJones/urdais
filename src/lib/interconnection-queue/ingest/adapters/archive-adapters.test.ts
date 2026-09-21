import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { discoverErcotArchive, ercotLifecycle, ercotReportPeriod, ercotTechnology,
  ercotQueueAdapter, resolveHeader } from "@/lib/interconnection-queue/ingest/adapters/ercot";
import { nyisoEndUse, nyisoQueueAdapter, parseStatusLegend, stageFromLegend }
  from "@/lib/interconnection-queue/ingest/adapters/nyiso";
import type { QueueExtraction } from "@/lib/interconnection-queue/ingest/types";
import { buildFixtureWorkbook, sheetFromGrid, type FixtureCell }
  from "@/lib/power-delivery/planning/xlsx/fixture-workbook";
import { XlsxWorkbook } from "@/lib/power-delivery/planning/xlsx/workbook";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

function letter(index: number): string {
  let value = index + 1;
  let out = "";
  while (value > 0) {
    out = String.fromCharCode(65 + ((value - 1) % 26)) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

function grid(rows: FixtureCell[][]): Record<number, Record<string, FixtureCell>> {
  const out: Record<number, Record<string, FixtureCell>> = {};
  rows.forEach((cells, rowIndex) => {
    const row: Record<string, FixtureCell> = {};
    cells.forEach((cell, columnIndex) => {
      if (cell !== "" && cell !== null) row[letter(columnIndex)] = cell;
    });
    out[rowIndex + 1] = row;
  });
  return out;
}

function artifact(label: string, body: Buffer | string): RetrievedArtifact {
  const buffer = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return {
    label, url: `https://example.test/${label}`, retrievedAt: "2026-09-21T12:00:00.000Z",
    status: 200, contentType: null, byteLength: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"), body: buffer,
  };
}

const find = (extraction: QueueExtraction, id: string) =>
  extraction.records.find((record) => record.nativeQueueId === id)!;

// --------------------------------------------------------------------------- ERCOT archive

describe("the ERCOT archive index", () => {
  it("reads a report period and a correction out of the publisher's own filename", () => {
    expect(ercotReportPeriod("GIS_Report_December_2018")).toEqual({ period: "2018-12-01", isCorrection: false });
    expect(ercotReportPeriod("GIS_Report_Jun2026")).toEqual({ period: "2026-06-01", isCorrection: false });
    expect(ercotReportPeriod("GIS_Report_June_2023_Corrected")).toEqual({ period: "2023-06-01", isCorrection: true });
    expect(ercotReportPeriod("GIS_Report_July_2020_CORRECTION2")).toEqual({ period: "2020-07-01", isCorrection: true });
    expect(ercotReportPeriod("GIS_Report_April_2020_revised")).toEqual({ period: "2020-04-01", isCorrection: true });
    expect(ercotReportPeriod("Co-located_Battery_Identification_Report_August_2026").period).toBeNull();
  });

  const listing = (documents: Record<string, string>[]) => JSON.stringify({
    ListDocsByRptTypeRes: { DocumentList: documents.map((Document) => ({ Document })) },
  });

  it("orders by the period reported on, not the day ERCOT happened to upload it", async () => {
    // ERCOT uploaded its whole 2018-2020 backlog on one day, so publication date says nothing
    // about which month a file describes.
    const refs = await discoverErcotArchive(async (url) => artifact("index", listing([
      { DocID: "3", FriendlyName: "GIS_Report_April_2020", PublishDate: "2020-06-29T10:00:00-05:00",
        Extension: "xlsx", ContentSize: "1" },
      { DocID: "1", FriendlyName: "GIS_Report_December_2018", PublishDate: "2020-06-29T10:05:00-05:00",
        Extension: "xlsx", ContentSize: "1" },
      { DocID: "2", FriendlyName: "GIS_Report_July_2019", PublishDate: "2020-06-29T10:02:00-05:00",
        Extension: "xlsx", ContentSize: "1" },
    ]).replace("__", url)));
    expect(refs.map((ref) => ref.reportPeriod)).toEqual(["2018-12-01", "2019-07-01", "2020-04-01"]);
  });

  it("puts a correction after the artifact it corrects", async () => {
    const refs = await discoverErcotArchive(async () => artifact("index", listing([
      { DocID: "9", FriendlyName: "GIS_Report_June_2023_Corrected", PublishDate: "2023-07-07T00:00:00-05:00",
        Extension: "xlsx", ContentSize: "1" },
      { DocID: "8", FriendlyName: "GIS_Report_June2023", PublishDate: "2023-07-03T00:00:00-05:00",
        Extension: "xlsx", ContentSize: "1" },
    ])));
    expect(refs.map((ref) => ref.isCorrection)).toEqual([false, true]);
    expect(refs.map((ref) => ref.nativeDocumentId)).toEqual(["8", "9"]);
  });

  it("ignores the other report the MIS type carries, and non-workbooks", async () => {
    const refs = await discoverErcotArchive(async () => artifact("index", listing([
      { DocID: "1", FriendlyName: "GIS_Report_August2026", PublishDate: "2026-09-01T00:00:00-05:00",
        Extension: "xlsx", ContentSize: "1" },
      { DocID: "2", FriendlyName: "Co-located_Battery_Identification_Report_August_2026",
        PublishDate: "2026-09-09T00:00:00-05:00", Extension: "xlsx", ContentSize: "1" },
      { DocID: "3", FriendlyName: "GIS_Report_August2026", PublishDate: "2026-09-01T00:00:00-05:00",
        Extension: "pdf", ContentSize: "1" },
    ])));
    expect(refs).toHaveLength(1);
    expect(refs[0]!.nativeDocumentId).toBe("1");
  });

  it("fails loudly on an index it does not recognise", async () => {
    await expect(discoverErcotArchive(async () => artifact("index", "not json")))
      .rejects.toThrow(/not JSON/);
    await expect(discoverErcotArchive(async () => artifact("index", "{}")))
      .rejects.toThrow(/no DocumentList/);
    await expect(discoverErcotArchive(async () => artifact("index", listing([]))))
      .rejects.toThrow(/no GIS workbooks/);
  });
});

describe("the ERCOT stacked header", () => {
  /** A header written the way ERCOT writes one: labels split down consecutive rows. */
  const stacked = () => buildFixtureWorkbook([sheetFromGrid("Project Details - Large Gen", grid([
    ["GIM Project Details - Large Generators"],
    ["NOTES:"],
    ["A 1-1-1900 date signifies that an actual date is not available."],
    ["Project Attributes", "", "", "", "", "", "", "", "", "", "", "Changes from Last Report", "GIM Project Milestone Dates"],
    ["INR", "Project Name", "GIM Study Phase", "Interconnecting Entity", "POI Location", "County",
      "CDR Reporting Zone", "Projected COD", "Fuel", "Technology", "Capacity (MW)", "Change indicators", "Approval Date for"],
    ["", "", "", "", "", "", "", "", "", "", "", "Proj Name, MW", "Submission of Proof of"],
    ["", "", "", "", "", "", "", "", "", "", "", "Size, COD", "Site Control"],
    ["19INR0176", "Big Battery", "SS Completed, FIS Completed, IA", "Battery LLC", "Node 345kV",
      "Harris", "COASTAL", 46447, "OTH", "BA", 50],
  ]))]);

  it("reconstructs a label that the publisher split across rows", () => {
    const sheet = XlsxWorkbook.open(stacked()).sheet("Project Details - Large Gen");
    const { columns, headerRow } = resolveHeader(sheet);
    // The block starts at the row carrying INR, so the group banner above it is not part of any
    // column's name — only the continuations beneath are.
    expect([...columns.values()]).toContain("Approval Date for Submission of Proof of Site Control");
    expect([...columns.values()]).toContain("INR");
    // Data starts on the row after the header block, wherever the block happens to end.
    expect(headerRow).toBe(7);
  });

  it("finds the fields it needs wherever the block sits", () => {
    const extraction = ercotQueueAdapter.parse(new Map([["gis", artifact("gis", stacked())]]));
    const record = find(extraction, "19INR0176");
    expect(record.nativeProjectName).toBe("Big Battery");
    expect(record.nativeCounty).toBe("Harris");
    expect(record.nativeZone).toBe("COASTAL");
    expect(record.proposedInServiceOn).toBe("2027-03-01");
  });

  it("fails explicitly when a required field cannot be resolved", () => {
    const broken = buildFixtureWorkbook([sheetFromGrid("Project Details", grid([
      ["INR", "Project Name"],
      ["19INR0001", "No capacity column here"],
    ]))]);
    expect(() => ercotQueueAdapter.parse(new Map([["gis", artifact("gis", broken)]])))
      .toThrow(/does not expose Capacity \(MW\), Fuel, Technology/);
  });
});

describe("ERCOT semantics", () => {
  const workbook = (capacity: FixtureCell, fuel: string, technology: string, phase = "SS Completed, FIS Started, No IA") =>
    buildFixtureWorkbook([sheetFromGrid("Project Details", grid([
      ["INR", "Project Name", "GIM Study Phase", "County", "Projected COD", "Fuel", "Technology", "Capacity (MW)"],
      ["24INR0372", "Repower", phase, "Pecos", 46447, fuel, technology, capacity],
    ]))]);

  it("keeps a negative MW exactly as ERCOT published it", () => {
    // The sheet states capacity is reported on a net-change basis for repowering and "may have
    // zero or negative values". A reduction is a real number, not an error and not a withdrawal.
    const extraction = ercotQueueAdapter.parse(new Map([["gis", artifact("gis", workbook(-53.3, "SOL", "PV"))]]));
    const record = find(extraction, "24INR0372");
    const quantity = record.quantities[0]!;
    expect(quantity.value).toBe(-53.3);
    expect(quantity.nativeField).toBe("Capacity (MW)");
    expect(quantity.unit).toBe("MW");
    // Not absolute, not zeroed, not read as leaving the queue.
    expect(quantity.value).not.toBe(53.3);
    expect(record.lifecycleStage).not.toBe("withdrawn");
    expect(record.withdrawnOn).toBeNull();
  });

  it("keeps a zero MW rather than dropping the row", () => {
    const extraction = ercotQueueAdapter.parse(new Map([["gis", artifact("gis", workbook(0, "SOL", "PV"))]]));
    expect(find(extraction, "24INR0372").quantities[0]!.value).toBe(0);
  });

  it("identifies a battery by technology, never by fuel alone", () => {
    // 866 of the current large-generator rows are exactly this pair.
    expect(ercotTechnology("OTH", "BA")).toBe("battery_storage");
    expect(ercotTechnology(null, "BA")).toBe("battery_storage");
    // Fuel OTH on its own says nothing.
    expect(ercotTechnology("OTH", null)).toBeNull();
    expect(ercotTechnology("SOL", "PV")).toBe("solar");
    expect(ercotTechnology("WIN", "WT")).toBe("wind");
    expect(ercotTechnology("GAS", "CC")).toBe("natural_gas");

    const extraction = ercotQueueAdapter.parse(new Map([["gis", artifact("gis", workbook(50, "OTH", "BA"))]]));
    const record = find(extraction, "24INR0372");
    expect(record.resources[0]).toMatchObject({ nativeFuel: "OTH", nativeTechnology: "BA", technology: "battery_storage" });
    expect(record.requestClass).toBe("storage");
    // Both native fields survive.
    expect(record.nativeStatus.fuel).toBe("OTH");
    expect(record.nativeStatus.technology).toBe("BA");
  });

  it("decomposes the study-phase sentence into a stage", () => {
    expect(ercotLifecycle("SS Started, FIS Started, No IA", null).stage).toBe("study");
    expect(ercotLifecycle("SS Completed, FIS Completed, No IA", null).stage).toBe("study");
    expect(ercotLifecycle("SS Completed, FIS Completed, IA", null).stage).toBe("agreement_executed");
    expect(ercotLifecycle("SS Completed, FIS Completed, IA", "2021-06-15").stage).toBe("under_construction");
    expect(ercotLifecycle("something new", null)).toEqual({ stage: "unknown", unmapped: "something new" });
  });

  it("never marks an ERCOT project operational, because the report states no actual COD", () => {
    // An energization approval is a milestone, and a projected COD is a plan. Neither is
    // evidence that a plant is commercially operating, and the workbook publishes nothing else.
    const extraction = ercotQueueAdapter.parse(new Map([["gis", artifact("gis",
      workbook(50, "SOL", "PV", "SS Completed, FIS Completed, IA"))]]));
    const record = find(extraction, "24INR0372");
    expect(record.actualInServiceOn).toBeNull();
    expect(record.lifecycleStage).not.toBe("operational");
    expect(record.proposedInServiceOn).not.toBeNull();
  });

  it("reads the archive's older single-sheet layout as well as the current one", () => {
    // Until 2021 there was one sheet called "Project Details"; the "- Large Gen" suffix is newer.
    const older = ercotQueueAdapter.parse(new Map([["gis", artifact("gis", workbook(10, "WIN", "WT"))]]));
    expect(older.records).toHaveLength(1);
    expect(older.records[0]!.sourcePartition).toBe("large_gen");
  });

  it("names the report period and correction in its snapshot key", () => {
    const ref = { label: "GIS_Report_June_2023_Corrected", url: "u", reportPeriod: "2023-06-01",
      publishedAt: "2023-07-07T00:00:00.000Z", isCorrection: true, nativeDocumentId: "927713161",
      archiveMetadata: {} };
    const extraction = ercotQueueAdapter.parse(new Map([["gis", artifact("gis", workbook(1, "SOL", "PV"))]]), ref);
    expect(extraction.snapshot.nativeSnapshotKey).toBe("gis-2023-06-correction");
    expect(extraction.snapshot.sourcePublishedAt).toBe("2023-07-07T00:00:00.000Z");
  });
});

// --------------------------------------------------------------------------- NYISO

describe("the NYISO status legend", () => {
  const legendSheet = (cells: string[]) => XlsxWorkbook.open(buildFixtureWorkbook([
    sheetFromGrid("Interconnection Queue", grid([
      ["Queue Pos.", "Developer", "Project Name"],
      ["0001", "Someone", "A project"],
      ["", cells[0] ?? ""],
      ["", cells[1] ?? ""],
    ])),
  ])).sheet("Interconnection Queue");

  it("reads a legend the publisher split across two cells", () => {
    // The first cell stops at code 10; 11 through 15 continue in another.
    const legend = parseStatusLegend(legendSheet([
      "● Project Status # Key: 1=Scoping Meeting Pending, 2=FES Pending, 10=Accepted Cost Allocation/IA in Progress, ",
      "11=IA Completed, 12=Under Construction, 13=In Service for Test, 14=In Service Commercial, 0=Withdrawn",
    ]));
    expect(legend.get("1")).toBe("Scoping Meeting Pending");
    expect(legend.get("10")).toBe("Accepted Cost Allocation/IA in Progress");
    expect(legend.get("11")).toBe("IA Completed");
    expect(legend.get("14")).toBe("In Service Commercial");
    expect(legend.get("0")).toBe("Withdrawn");
  });

  it("accumulates the cluster sheet's parallel legend alongside it", () => {
    const legend = parseStatusLegend(legendSheet([
      "● Project Status # Key: 1=Scoping Meeting Pending, 2=FES Pending",
      "1C = IR Validated/ Scoping Meeting Pending, 11C = IA Completed, 14C = In Service Commercial",
    ]));
    expect(legend.get("1")).toBe("Scoping Meeting Pending");
    expect(legend.get("11C")).toBe("IA Completed");
  });

  it("ignores an ordinary cell that merely contains an equals sign", () => {
    expect(parseStatusLegend(legendSheet(["Capacity = as filed", ""])).size).toBe(0);
  });

  it("separates commercial operation from being in service for test", () => {
    // NYISO defines both, and only one is operating. A loose match on "in service" would
    // declare a plant under test to be operational.
    expect(stageFromLegend("In Service Commercial")).toBe("operational");
    expect(stageFromLegend("In Service for Test")).toBe("under_construction");
    expect(stageFromLegend("Partial In-Service")).toBe("under_construction");
    expect(stageFromLegend("Under Construction")).toBe("under_construction");
    expect(stageFromLegend("IA Completed")).toBe("agreement_executed");
    expect(stageFromLegend("Accepted Cost Allocation/IA in Progress")).toBe("agreement_pending");
    expect(stageFromLegend("Withdrawn")).toBe("withdrawn");
    expect(stageFromLegend("SRIS/SIS Approved")).toBe("study");
    expect(stageFromLegend("something NYISO has not defined before")).toBeNull();
  });
});

describe("NYISO load end use", () => {
  it("keeps the AI data centre code the publisher itself assigns", () => {
    expect(nyisoEndUse("DAT-AI")).toEqual({ normalized: "data_center_ai", known: true });
    expect(nyisoEndUse("DAT")).toEqual({ normalized: "data_center", known: true });
    expect(nyisoEndUse("DAT-CM")).toEqual({ normalized: "data_center", known: true });
    expect(nyisoEndUse("M-CH")).toEqual({ normalized: "manufacturing", known: true });
    expect(nyisoEndUse("RD")).toEqual({ normalized: "research", known: true });
    expect(nyisoEndUse(null)).toEqual({ normalized: "unknown", known: true });
  });

  it("defers a code it does not recognise instead of guessing", () => {
    expect(nyisoEndUse("XYZ")).toEqual({ normalized: "unknown", known: false });
  });
});

describe("the NYISO adapter", () => {
  function workbook(): Buffer {
    const generation = [
      ["Queue Pos.", "Developer/Interconnection Customer", "Project Name", "Date of IR",
        "SP (MW)", "WP (MW)", "Record Type", "Type/ Fuel", "Energy Storage Capability",
        "Minimum_Duration", "County", "State", "NYISO Zone", "Points of Interconnection",
        "Utility", "ATO", "Project Status #"],
      ["0276", "A developer", "Solar One", 39477, 90, 90, "Large Facility", "S", "", "",
        "Orange", "NY", "G", "Rock Tavern 345kV", "CONED", "", "11"],
      ["", "● Project Status # Key: 1=Scoping Meeting Pending, 11=IA Completed, 14=In Service Commercial"],
    ];
    const load = [
      ["Queue Number", "Developer Name", "Project: Project Name", "IR Submission Date",
        "Peak MW load", "End-Use", "Record Type Name", "Type/Fuel", "County", "State",
        "NYISO Zone", "Points of Interconnection", "CTO/Utility", "ATO", "Project Status #"],
      ["1670", "AI Developer", "Hyperscale Campus", 45314, 250, "DAT-AI", "Load Interconnection",
        "L", "Erie", "NY", "A", "Dunkirk 230kV", "NATGRID", "", "6"],
      ["205", "National Grid", "Luther Forest", 38658, 40, "", "Load Interconnection", "L",
        "Saratoga", "NY", "F", "Luther Forest", "NATGRID", "", "14"],
    ];
    const inService = [
      ["Queue", "", "", "Date", "SP", "WP", "Type/", "Location", "", "Z", "Interconnection"],
      ["Pos.", "Owner/Developer", "Project Name", "of IR", "(MW)", "(MW)", "Fuel", "County", "State", "", "Point"],
      ["0001", "Con Edison", "Middletown Station", 32766, "N/A", "N/A", "AC", "Orange County", "NY", "G", "Coop Lines"],
    ];
    const withdrawn = [
      ["Queue Pos.", "Owner/Developer", "Project Name", "Date of IR", "SP (MW)", "WP (MW)",
        "Type/ Fuel", "County", "State", "Z"],
      ["0005", "Sithe Energies", "Torne Valley", 36188, 860, "", "NG", "Rockland", "NY", "G"],
    ];
    return buildFixtureWorkbook([
      sheetFromGrid("Interconnection Queue", grid(generation)),
      sheetFromGrid("Load Projects", grid(load)),
      sheetFromGrid("In Service", grid(inService)),
      sheetFromGrid("Withdrawn", grid(withdrawn)),
    ]);
  }

  const extraction = nyisoQueueAdapter.parse(new Map([["interconnection-queue", artifact("interconnection-queue", workbook())]]));

  it("keeps generation and load in separate identity spaces", () => {
    // Queue numbers repeat across the two queues, so the prefix keeps them apart.
    expect(extraction.records.map((record) => record.nativeQueueId).sort())
      .toEqual(["L1670", "L205", "Q0001", "Q0005", "Q0276"]);
  });

  it("classifies a load request as load and never as generation", () => {
    const load = find(extraction, "L1670");
    expect(load.requestClass).toBe("load");
    expect(load.resources[0]!.technology).toBe("load");
    expect(load.sourcePartition).toBe("load");
  });

  it("stores a load MW under its own kind, so it cannot reach a generation total", () => {
    const load = find(extraction, "L1670");
    expect(load.quantities).toEqual([{
      nativeField: "Peak MW load", quantityKind: "other_mw", value: 250, unit: "MW",
      resourceOrdinal: null, direction: "withdrawal",
    }]);
    // None of the generation quantity kinds appears on a load request.
    for (const quantity of load.quantities) {
      expect(["summer_mw", "winter_mw", "net_mw_to_grid", "maximum_facility_output",
        "capacity_service_mw", "energy_service_mw"]).not.toContain(quantity.quantityKind);
    }
    // And a generator carries the seasonal pair instead.
    expect(find(extraction, "Q0276").quantities.map((q) => q.quantityKind))
      .toEqual(["summer_mw", "winter_mw"]);
  });

  it("keeps the publisher's AI data-centre code and its normalized family", () => {
    const load = find(extraction, "L1670");
    expect(load.nativeEndUse).toBe("DAT-AI");
    expect(load.loadEndUse).toBe("data_center_ai");
    expect(load.nativeStatus.endUse).toBe("DAT-AI");
  });

  it("assigns no end use to a generator", () => {
    expect(find(extraction, "Q0276").loadEndUse).toBeNull();
    expect(find(extraction, "Q0276").nativeEndUse).toBeNull();
  });

  it("resolves a status code through the legend printed in the sheet", () => {
    const generator = find(extraction, "Q0276");
    expect(generator.nativeStatus.projectStatusCode).toBe("11");
    expect(generator.nativeStatus.projectStatusDescription).toBe("IA Completed");
    expect(generator.lifecycleStage).toBe("agreement_executed");
  });

  it("lets sheet membership decide the stage, and records it as the evidence", () => {
    const operational = find(extraction, "Q0001");
    expect(operational.lifecycleStage).toBe("operational");
    expect(operational.nativeStatus.sourceSheet).toBe("In Service");
    expect(operational.nativeStatusDisplay).toContain("In Service");
    // NYISO publishes no actual in-service date, so none is invented.
    expect(operational.actualInServiceOn).toBeNull();

    const withdrawn = find(extraction, "Q0005");
    expect(withdrawn.lifecycleStage).toBe("withdrawn");
    // Withdrawn with no date published: the date is not invented either.
    expect(withdrawn.withdrawnOn).toBeNull();
  });

  it("reads the In Service sheet's stacked two-row header", () => {
    // "Queue" sits above "Pos.", and "Date" above "of IR".
    const operational = find(extraction, "Q0001");
    expect(operational.nativeProjectName).toBe("Middletown Station");
    expect(operational.requestedOn).toBe("1989-09-15");
  });

  it("fails loudly on a workbook that is not the one it was written against", () => {
    const empty = buildFixtureWorkbook([sheetFromGrid("Something Else", grid([["x"]]))]);
    expect(() => nyisoQueueAdapter.parse(new Map([["interconnection-queue", artifact("interconnection-queue", empty)]])))
      .toThrow(/produced no queue rows/);
  });
});
