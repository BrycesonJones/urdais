import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { caisoQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/caiso";
import { misoLifecycle, misoQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/miso";
import { pjmQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/pjm";
import { resolveIdentityCollisions } from "@/lib/interconnection-queue/ingest/collisions";
import { COMPONENT_QUANTITY_KIND } from "@/lib/interconnection-queue/types";
import type { QueueExtraction } from "@/lib/interconnection-queue/ingest/types";
import { buildFixtureWorkbook, sheetFromGrid, type FixtureCell }
  from "@/lib/power-delivery/planning/xlsx/fixture-workbook";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

function artifact(label: string, body: Buffer | string): ReadonlyMap<string, RetrievedArtifact> {
  const buffer = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return new Map([[label, {
    label, url: `https://example.test/${label}`, retrievedAt: "2026-09-21T12:00:00.000Z",
    status: 200, contentType: null, byteLength: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"), body: buffer,
  }]]);
}

const find = (extraction: QueueExtraction, id: string) =>
  extraction.records.find((record) => record.nativeQueueId === id)!;

// --------------------------------------------------------------------------------- PJM

const PJM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Projects>
  <Project>
    <ProjectNumber>A01</ProjectNumber><Name>South Lebanon 230 KV</Name>
    <CommercialName>Ironwood</CommercialName><State>PA</State><County>Lebanon</County>
    <Status>In Service</Status><TransmissionOwner>ME</TransmissionOwner>
    <MaximumFacilityOutput>720</MaximumFacilityOutput><MWEnergy>720</MWEnergy>
    <MWCapacity>705</MWCapacity><MWInService>720</MWInService>
    <ProjectType>Generation Interconnection</ProjectType><Fuel>Natural Gas</Fuel>
    <SubmittedDate>1997-05-20</SubmittedDate><ProjectedInServiceDate>2001-06-01</ProjectedInServiceDate>
    <ActualInServiceDate>2001-07-02</ActualInServiceDate><WithdrawalDate/>
  </Project>
  <Project>
    <ProjectNumber>AE1-070</ProjectNumber><Name>Elwood 345 kV</Name><State>IL</State>
    <County>Will</County><Status>Active</Status><TransmissionOwner>ComEd</TransmissionOwner>
    <MaximumFacilityOutput>1610.0</MaximumFacilityOutput><MWEnergy>0.0</MWEnergy>
    <MWCapacity>135.0</MWCapacity><MWInService></MWInService>
    <ProjectType>Generation Interconnection</ProjectType><Fuel>Solar; Storage</Fuel>
    <SubmittedDate>2021-04-13</SubmittedDate>
    <ProjectedInServiceDate>2020-01-01</ProjectedInServiceDate>
  </Project>
  <Project>
    <ProjectNumber>Z99</ProjectNumber><Name>Gone</Name><State>OH</State><County>Wood</County>
    <Status>Withdrawn</Status><MaximumFacilityOutput>200</MaximumFacilityOutput>
    <ProjectType>Generation Interconnection</ProjectType><Fuel>Wind</Fuel>
    <SubmittedDate>2015-02-02</SubmittedDate><WithdrawalDate>2019-08-01</WithdrawalDate>
    <WithdrawnRemarks>Customer request</WithdrawnRemarks>
  </Project>
</Projects>`;

describe("the PJM adapter", () => {
  const extraction = pjmQueueAdapter.parse(artifact("planning-queues", PJM_XML));

  it("reads every project and keeps the publisher's own queue id", () => {
    expect(extraction.records.map((record) => record.nativeQueueId)).toEqual(["A01", "AE1-070", "Z99"]);
  });

  it("keeps all four MW fields under their own names rather than choosing one", () => {
    const quantities = find(extraction, "A01").quantities;
    expect(quantities.map((quantity) => [quantity.nativeField, quantity.quantityKind, quantity.value])).toEqual([
      ["MaximumFacilityOutput", "maximum_facility_output", 720],
      ["MWEnergy", "energy_service_mw", 720],
      ["MWCapacity", "capacity_service_mw", 705],
      ["MWInService", "in_service_mw", 720],
    ]);
    // Every one of them is MW, and none of them is "the" MW.
    expect(new Set(quantities.map((quantity) => quantity.unit))).toEqual(new Set(["MW"]));
  });

  it("marks a project operational only on PJM's own word", () => {
    expect(find(extraction, "A01").lifecycleStage).toBe("operational");
    expect(find(extraction, "A01").actualInServiceOn).toBe("2001-07-02");
  });

  it("never makes a project operational because its projected date has passed", () => {
    // AE1-070 was projected in service in 2020 and PJM still calls it Active.
    const active = find(extraction, "AE1-070");
    expect(active.proposedInServiceOn).toBe("2020-01-01");
    expect(active.actualInServiceOn).toBeNull();
    expect(active.lifecycleStage).toBe("study");
  });

  it("keeps a withdrawn project as a request with its withdrawal date", () => {
    const withdrawn = find(extraction, "Z99");
    expect(withdrawn.lifecycleStage).toBe("withdrawn");
    expect(withdrawn.withdrawnOn).toBe("2019-08-01");
    expect(withdrawn.requestedOn).toBe("2015-02-02");
  });

  it("splits a compound fuel label into resources but attributes no MW to them", () => {
    const hybrid = find(extraction, "AE1-070");
    expect(hybrid.resources.map((resource) => [resource.nativeFuel, resource.technology])).toEqual([
      ["Solar", "solar"], ["Storage", "battery_storage"],
    ]);
    // PJM publishes no component MW, so nothing claims to be one.
    expect(hybrid.resources.every((resource) => !resource.isSourceSeparated)).toBe(true);
    expect(hybrid.quantities.some((quantity) => quantity.quantityKind === COMPONENT_QUANTITY_KIND)).toBe(false);
    expect(hybrid.requestClass).toBe("mixed");
  });

  it("publishes no snapshot key, because PJM versions nothing", () => {
    expect(extraction.snapshot.nativeSnapshotKey).toBeNull();
    expect(extraction.snapshot.sourcePublishedAt).toBeNull();
  });

  it("fails loudly on a feed that is not the one it was written against", () => {
    expect(() => pjmQueueAdapter.parse(artifact("planning-queues", "<Other/>")))
      .toThrow(/expected a <Projects> root/);
    expect(() => pjmQueueAdapter.parse(artifact("planning-queues", "<Projects/>")))
      .toThrow(/no <Project> elements/);
  });
});

// --------------------------------------------------------------------------------- MISO

const MISO_JSON = JSON.stringify([
  { projectNumber: "J1000", queueDate: "2020-01-15T00:00:00+00:00", inService: "2024-06-01T04:00:00+00:00",
    applicationStatus: "Active", studyPhase: "Phase 2", postGIAStatus: "", svcType: "NRIS",
    summerNetMW: 200.0, winterNetMW: 210.0, dp1ErisMw: 200.0, dp1NrisMw: 150.0, dp2ErisMw: 0.0, dp2NrisMw: 0.0,
    fuelType: "Solar", facilityType: "Photovoltaic", county: "Scott", state: "IA",
    transmissionOwner: "MIDAMERICAN", poiName: "Cedar 161kV", studyCycle: "DPP-2020", studyGroup: "West" },
  { projectNumber: "J2000", queueDate: "2019-03-01T00:00:00+00:00", withdrawnDate: "2021-05-04T04:00:00+00:00",
    applicationStatus: "Withdrawn", studyPhase: "Phase 3", postGIAStatus: "", summerNetMW: 1750.0,
    winterNetMW: 1750.0, fuelType: "Wind", facilityType: "Wind Turbine", state: "MN" },
  { projectNumber: "J3000", queueDate: "2018-02-01T00:00:00+00:00", doneDate: "2022-11-01T04:00:00+00:00",
    applicationStatus: "Done", studyPhase: "GIA", postGIAStatus: "In Service", summerNetMW: 100.0,
    fuelType: "Hybrid", facilityType: "Solar/Battery", state: "IL" },
  { projectNumber: "J4000", queueDate: "2021-06-01T00:00:00+00:00", inService: "2019-01-01T04:00:00+00:00",
    applicationStatus: "Active", studyPhase: "GIA", postGIAStatus: "Under Construction",
    summerNetMW: 50.0, fuelType: "Gas", facilityType: "Combined Cycle", state: "IN" },
]);

describe("the MISO adapter", () => {
  const extraction = misoQueueAdapter.parse(artifact("gi-queue", MISO_JSON));

  it("preserves the three-field status tuple rather than flattening it", () => {
    expect(find(extraction, "J4000").nativeStatus).toMatchObject({
      applicationStatus: "Active", studyPhase: "GIA", postGIAStatus: "Under Construction",
    });
    expect(find(extraction, "J4000").nativeStatusDisplay).toBe("Active / GIA / Under Construction");
  });

  it("keeps all six MW fields, with ERIS and NRIS as different service rights", () => {
    const quantities = find(extraction, "J1000").quantities;
    expect(quantities.map((quantity) => [quantity.nativeField, quantity.quantityKind])).toEqual([
      ["summerNetMW", "summer_mw"], ["winterNetMW", "winter_mw"],
      ["dp1ErisMw", "energy_service_mw"], ["dp2ErisMw", "energy_service_mw"],
      ["dp1NrisMw", "capacity_service_mw"], ["dp2NrisMw", "capacity_service_mw"],
    ]);
  });

  it("lets a withdrawal outrank the study phase it reached", () => {
    const withdrawn = find(extraction, "J2000");
    expect(withdrawn.lifecycleStage).toBe("withdrawn");
    expect(withdrawn.withdrawnOn).toBe("2021-05-04");
    // The phase it got to is still on the record.
    expect(withdrawn.nativeStatus.studyPhase).toBe("Phase 3");
  });

  it("lets post-GIA construction outrank an executed agreement", () => {
    expect(find(extraction, "J4000").lifecycleStage).toBe("under_construction");
  });

  it("never reads a past proposed in-service date as operation", () => {
    // J4000 was proposed for 2019 and MISO still calls it under construction.
    const late = find(extraction, "J4000");
    expect(late.proposedInServiceOn).toBe("2019-01-01");
    expect(late.actualInServiceOn).toBeNull();
    expect(late.lifecycleStage).not.toBe("operational");
  });

  it("marks operational on MISO's in-service status, and only that", () => {
    const done = find(extraction, "J3000");
    expect(done.lifecycleStage).toBe("operational");
    // MISO publishes no actual in-service date. doneDate is the completion of the interconnection
    // *request process* and is kept as the publisher's own field rather than promoted to a COD.
    expect(done.actualInServiceOn).toBeNull();
    expect(done.nativeStatus.doneDate).toBe("2022-11-01");
  });

  it("never treats a done date as operation when MISO says the plant is still being built", () => {
    // Of MISO's 269 requests carrying a doneDate, 201 are not in service: 104 under construction,
    // 62 not started, 32 withdrawn.
    const built = misoQueueAdapter.parse(artifact("gi-queue", JSON.stringify([{
      projectNumber: "J1034", applicationStatus: "Done", studyPhase: "GIA",
      postGIAStatus: "Under Construction", doneDate: "2021-10-12T04:00:00+00:00",
      inService: "2021-10-31T04:00:00+00:00", summerNetMW: 225.0, fuelType: "Solar",
    }])));
    const record = built.records[0]!;
    expect(record.lifecycleStage).toBe("under_construction");
    expect(record.actualInServiceOn).toBeNull();
  });

  it("does not treat a done date as operation when MISO says the request withdrew", () => {
    const gone = misoQueueAdapter.parse(artifact("gi-queue", JSON.stringify([{
      projectNumber: "J9", applicationStatus: "Withdrawn", postGIAStatus: "Withdrawn",
      doneDate: "2020-01-01T00:00:00+00:00", withdrawnDate: "2020-02-02T00:00:00+00:00",
      summerNetMW: 1, fuelType: "Wind",
    }])));
    expect(gone.records[0]!.lifecycleStage).toBe("withdrawn");
    expect(gone.records[0]!.actualInServiceOn).toBeNull();
  });

  it("records a co-located project's parts without inventing a MW split", () => {
    const hybrid = find(extraction, "J3000");
    expect(hybrid.resources.map((resource) => resource.technology)).toEqual(["solar", "battery_storage"]);
    expect(hybrid.resources.every((resource) => !resource.isSourceSeparated)).toBe(true);
    expect(hybrid.quantities.some((quantity) => quantity.resourceOrdinal !== null)).toBe(false);
    expect(hybrid.requestClass).toBe("mixed");
  });

  it("survives unexpected extra fields and fails on a missing identity", () => {
    const extra = misoQueueAdapter.parse(artifact("gi-queue",
      JSON.stringify([{ projectNumber: "J1", applicationStatus: "Active", newFieldMisoAdded: "x", summerNetMW: 1 }])));
    expect(extra.records).toHaveLength(1);
    expect(extra.records[0]!.payload.newFieldMisoAdded).toBe("x");

    const missing = misoQueueAdapter.parse(artifact("gi-queue", JSON.stringify([{ applicationStatus: "Active" }])));
    expect(missing.records).toHaveLength(0);
    expect(missing.deferrals[0]!.detail).toMatch(/identity would have to be invented/);
  });

  it("refuses a response that is not the shape it was written against", () => {
    expect(() => misoQueueAdapter.parse(artifact("gi-queue", "{\"projects\":[]}"))).toThrow(/not an array/);
    expect(() => misoQueueAdapter.parse(artifact("gi-queue", "[]"))).toThrow(/no projects/);
    expect(() => misoQueueAdapter.parse(artifact("gi-queue", "not json"))).toThrow(/not JSON/);
  });
});

describe("MISO lifecycle precedence", () => {
  it("puts withdrawal above everything", () => {
    expect(misoLifecycle({ applicationStatus: "Withdrawn", studyPhase: "GIA",
      postGiaStatus: "In Service", withdrawnOn: null }).stage).toBe("withdrawn");
  });

  it("puts operation above a post-GIA status, and both above a phase", () => {
    expect(misoLifecycle({ applicationStatus: "Done", studyPhase: "Phase 1",
      postGiaStatus: "In Service", withdrawnOn: null }).stage).toBe("operational");
    expect(misoLifecycle({ applicationStatus: "Active", studyPhase: "Phase 1",
      postGiaStatus: "Under Construction", withdrawnOn: null }).stage).toBe("under_construction");
  });

  it("leaves a completed application with no outcome evidence unknown rather than guessing", () => {
    // MISO closes some requests as Done with no done date and no post-GIA status at all.
    const result = misoLifecycle({ applicationStatus: "Done", studyPhase: null,
      postGiaStatus: null, withdrawnOn: null });
    expect(result.stage).toBe("unknown");
    expect(result.unmapped).toBe("Done");
  });
});

// --------------------------------------------------------------------------------- CAISO

/** Rows of cells to the column-letter grid the fixture builder wants, 1-based. */
function grid(rows: FixtureCell[][]): Record<number, Record<string, FixtureCell>> {
  const letter = (index: number): string => {
    let value = index + 1;
    let out = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      out = String.fromCharCode(65 + remainder) + out;
      value = Math.floor((value - 1) / 26);
    }
    return out;
  };
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

/** The three sheets, with the withdrawn sheet's shifted columns reproduced faithfully. */
function caisoWorkbook(): Buffer {
  const header = (labels: string[]): FixtureCell[] => labels;
  const active = [
    ["Report Run Date: 09/21/2026"],
    ["The California ISO Controlled Grid Generation Queue for All: Active"],
    [],
    header(["Project Name", "Queue Position", "Interconnection Request\nReceive Date", "Queue Date",
      "Application Status", "Study\nProcess", "Type-1", "Type-2", "Type-3", "Fuel-1", "Fuel-2", "Fuel-3",
      "MW-1", "MW-2", "MW-3", "Net MWs to Grid", "Full Capacity, Partial or Energy Only (FC/P/EO)",
      "County", "State", "Utility", "PTO Study Region", "Station or Transmission Line",
      "Proposed\nOn-line Date\n(as filed with IR)", "Current\nOn-line Date", "Suspension Status",
      "Interconnection Agreement \nStatus"]),
    ["MONTEZUMA", "22", "37943", "37943", "ACTIVE", "AMEND 39", "Wind Turbine", "Storage", "", "Wind", "Battery", "",
      "38", "38", "", "38", "Full Capacity", "Solano", "CA", "PG&E", "North", "Birds Landing",
      "45383", "45383", "", "Executed"],
    ["SOLO SOLAR", "900", "44000", "44000", "ACTIVE", "C14", "Solar", "", "", "Solar", "", "",
      "150", "", "", "150", "Energy Only", "Kern", "CA", "SCE", "South", "Kramer Jct",
      "46000", "46000", "", ""],
  ];
  const completed = [
    ["Report Run Date: 09/21/2026"], [], [],
    header(["Project Name", "Queue Position", "Interconnection Request\nReceive Date", "Queue Date",
      "Application Status", "Study\nProcess", "Type-1", "Type-2", "Type-3", "Fuel-1", "Fuel-2", "Fuel-3",
      "MW-1", "MW-2", "MW-3", "Net MWs to Grid", "Full Capacity, Partial or Energy Only (FC/P/EO)",
      "County", "State", "Utility", "PTO Study Region", "Station or Transmission Line",
      "Proposed\nOn-line Date\n(as filed with IR)", "Actual\nOn-line Date",
      "Interconnection Agreement \nStatus"]),
    ["DONE PLANT", "100", "39000", "39000", "COMPLETED", "Serial LGIP", "Gas Turbine", "", "", "Natural Gas", "", "",
      "500", "", "", "500", "Full Capacity", "Fresno", "CA", "PG&E", "Central", "Helm",
      "41000", "41500", "Executed"],
  ];
  // The withdrawn sheet inserts Withdrawn Date at F, shifting every later column by one.
  const withdrawn = [
    ["Report Run Date: 09/21/2026"], [], [],
    header(["Project Name - Confidential", "Queue Position", "Interconnection Request\nReceive Date",
      "Queue Date", "Application Status", "Withdrawn Date", "Study\nProcess", "Type-1", "Type-2", "Type-3",
      "Fuel-1", "Fuel-2", "Fuel-3", "MW-1", "MW-2", "MW-3", "Net MWs to Grid",
      "Full Capacity, Partial or Energy Only (FC/P/EO)", "County", "State", "Utility",
      "Station or Transmission Line", "Proposed\nOn-line Date\n(as filed with IR)", "Current\nOn-line Date",
      "Interconnection Agreement \nStatus", "Reason for Withdrawal"]),
    ["Project Name - Confidential", "700", "42000", "42000", "WITHDRAWN", "43500", "C08", "Solar", "", "",
      "Solar", "", "", "80", "", "", "80", "Energy Only", "Imperial", "CA", "IID", "El Centro",
      "44000", "44000", "", "IC Request"],
  ];
  return buildFixtureWorkbook([
    sheetFromGrid("Grid GenerationQueue", grid(active)),
    sheetFromGrid("Completed Generation Projects", grid(completed)),
    sheetFromGrid("Withdrawn Generation Projects", grid(withdrawn)),
  ]);
}

describe("the CAISO adapter", () => {
  const extraction = caisoQueueAdapter.parse(artifact("public-queue-report", caisoWorkbook()));

  it("reads all three lifecycle sheets and keeps sheet membership as evidence", () => {
    expect(extraction.records.map((record) => [record.nativeQueueId, record.sourcePartition])).toEqual([
      ["22", "active"], ["900", "active"], ["100", "completed"], ["700", "withdrawn"],
    ]);
    expect(find(extraction, "700").nativeStatus.sourceSheet).toBe("Withdrawn Generation Projects");
  });

  it("resolves the withdrawn sheet's shifted columns by header rather than by letter", () => {
    const withdrawn = find(extraction, "700");
    expect(withdrawn.lifecycleStage).toBe("withdrawn");
    expect(withdrawn.withdrawnOn).toBe("2019-02-04");
    expect(withdrawn.nativeStatus.reasonForWithdrawal).toBe("IC Request");
    expect(withdrawn.nativeCounty).toBe("Imperial");
  });

  it("publishes component MW that must never be summed into the project quantity", () => {
    const hybrid = find(extraction, "22");
    const components = hybrid.quantities.filter((quantity) => quantity.quantityKind === COMPONENT_QUANTITY_KIND);
    const project = hybrid.quantities.find((quantity) => quantity.quantityKind === "net_mw_to_grid")!;

    expect(components.map((component) => [component.nativeField, component.value])).toEqual([
      ["MW-1", 38], ["MW-2", 38],
    ]);
    // The whole point: the parts add to 76 and CAISO's own project figure is 38.
    expect(components.reduce((total, component) => total + component.value, 0)).toBe(76);
    expect(project.value).toBe(38);
    expect(project.value).not.toBe(components.reduce((total, component) => total + component.value, 0));
  });

  it("marks CAISO's components as genuinely source-separated, unlike the other two markets", () => {
    const hybrid = find(extraction, "22");
    expect(hybrid.resources.map((resource) => [resource.nativeFuel, resource.technology, resource.isSourceSeparated]))
      .toEqual([["Wind", "wind", true], ["Battery", "battery_storage", true]]);
    expect(hybrid.requestClass).toBe("mixed");
  });

  it("takes an actual on-line date only from the completed sheet", () => {
    const completed = find(extraction, "100");
    expect(completed.lifecycleStage).toBe("operational");
    expect(completed.actualInServiceOn).toBe("2013-08-14");

    // An active row's "Current On-line Date" is a forecast and stays one.
    const active = find(extraction, "900");
    expect(active.actualInServiceOn).toBeNull();
    expect(active.revisedInServiceOn).not.toBeNull();
    expect(active.lifecycleStage).not.toBe("operational");
  });

  it("reads the report run date as its snapshot key", () => {
    expect(extraction.snapshot.nativeSnapshotKey).toBe("report-run-2026-09-21");
    expect(extraction.snapshot.sourcePublishedAt).toBe("2026-09-21T00:00:00.000Z");
  });

  it("fails loudly when a lifecycle sheet is missing", () => {
    const partial = buildFixtureWorkbook([sheetFromGrid("Grid GenerationQueue", grid([["x"]]))]);
    expect(() => caisoQueueAdapter.parse(artifact("public-queue-report", partial)))
      .toThrow(/has no sheet named|has no header/);
  });
});

// --------------------------------------------------------------------------------- collisions

describe("identity collisions", () => {
  it("denies a canonical identity to a queue id the source served twice, keeping both rows", () => {
    const extraction = misoQueueAdapter.parse(artifact("gi-queue", JSON.stringify([
      { projectNumber: "J2656", applicationStatus: "Active", summerNetMW: 180.0, studyCycle: "" },
      { projectNumber: "J2656", applicationStatus: "Active", summerNetMW: 0.0, studyCycle: "DPP-2022" },
      { projectNumber: "J9999", applicationStatus: "Active", summerNetMW: 5.0 },
    ])));
    const collisions = resolveIdentityCollisions(extraction);

    expect(collisions).toEqual([{ nativeQueueId: "J2656", rows: 2 }]);
    // Both rows survive as evidence; neither becomes a request.
    expect(extraction.records).toHaveLength(3);
    expect(extraction.records.filter((record) => record.canonical).map((record) => record.nativeQueueId))
      .toEqual(["J9999"]);
    expect(extraction.deferrals.some((deferral) =>
      deferral.nativeQueueId === "J2656" && deferral.deferralKind === "unsupported_row")).toBe(true);
  });

  it("finds nothing to do when every id is unique", () => {
    const extraction = pjmQueueAdapter.parse(artifact("planning-queues", PJM_XML));
    expect(resolveIdentityCollisions(extraction)).toEqual([]);
    expect(extraction.records.every((record) => record.canonical)).toBe(true);
  });
});
