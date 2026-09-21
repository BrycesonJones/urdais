import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isoneLifecycle, isoneQueueAdapter, isoneResources, referencedQueuePosition }
  from "@/lib/interconnection-queue/ingest/adapters/isone";
import { sppLifecycle, sppQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/spp";
import type { NormalizedQueueRecord, QueueExtraction } from "@/lib/interconnection-queue/ingest/types";
import { mayPublishSourceValue, type SourceRightsState } from "@/lib/rights/publication";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

function artifact(label: string, body: string): ReadonlyMap<string, RetrievedArtifact> {
  const buffer = Buffer.from(body, "utf8");
  return new Map([[label, {
    label, url: `https://example.test/${label}`, retrievedAt: "2026-09-21T12:00:00.000Z",
    status: 200, contentType: null, byteLength: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"), body: buffer,
  }]]);
}

const find = (extraction: QueueExtraction, id: string): NormalizedQueueRecord =>
  extraction.records.find((record) => record.nativeQueueId === id)!;

/** New-generation quantity kinds: the ones a queue total would pick up. */
const NEW_GENERATION_KINDS = ["maximum_facility_output", "net_mw_to_grid", "summer_mw",
  "winter_mw", "in_service_mw"];

// --------------------------------------------------------------------------------- ISO-NE

const HEADERS = ["Cluster", "QP", "Updated", "Type", "Requested", "Alternative Name", "Unit",
  "Fuel Type", "Net MW", "Summer MW", "Winter MW", "County", "ST", "Op Date", "Sync Date",
  "W/D Date", "POI", "Serv", "SIS", "I39", "TO Report", "Dev", "Zone", "FS", "SIS", "OS", "FAC",
  "IA", "Project Status", "Status", "Jurisdiction"];

function isonePage(rows: string[][]): string {
  const filler = Array.from({ length: 120 }, (_, index) => {
    const row = new Array(HEADERS.length).fill("");
    row[1] = String(9000 + index); row[3] = "G"; row[4] = "1/1/2020";
    row[5] = `Filler ${index}`; row[17] = "NR"; row[29] = "W";
    return row;
  });
  const body = [...rows, ...filler]
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  return `<html><body><table id="publicqueue">
    <tr>${HEADERS.map((header) => `<th>${header}</th>`).join("")}</tr>${body}</table></body></html>`;
}

/** Build one row by column name, leaving the rest blank. */
function isoneRow(values: Record<string, string>): string[] {
  const row = new Array(HEADERS.length).fill("");
  for (const [name, value] of Object.entries(values)) {
    const position = HEADERS.indexOf(name);
    if (position === -1) throw new Error(`no column ${name}`);
    row[position] = value;
  }
  return row;
}

describe("the ISO-NE adapter", () => {
  const extraction = isoneQueueAdapter.parse(artifact("public-queue", isonePage([
    isoneRow({ QP: "1116", Type: "G", Requested: "4/13/2021", "Alternative Name": "SouthCoast Wind 1",
      Unit: "WT", "Fuel Type": "WND", "Net MW": "1200", "Summer MW": "1200", "Winter MW": "1200",
      Serv: "NR", Status: "A", ST: "MA", "Op Date": "12/31/2031" }),
    isoneRow({ QP: "1090", Type: "G", Requested: "1/13/2021", "Alternative Name": "Park City Offshore Wind CNR",
      Unit: "WT", "Fuel Type": "WND", "Net MW": "0", "Summer MW": "838.2", "Winter MW": "838.2",
      Serv: "CNR", Status: "A", ST: "MA" }),
    isoneRow({ QP: "367", Type: "G", Requested: "5/2/2011", "Alternative Name": "Kingdom Community Wind Increase (see Q311)",
      Unit: "WT", "Fuel Type": "WND", "Net MW": "3.075", "Summer MW": "64.575", Serv: "CNR", Status: "C" }),
    isoneRow({ QP: "800", Type: "ETU", Requested: "6/1/2019", "Alternative Name": "An elective upgrade",
      "Net MW": "0", Serv: "NA", Status: "W" }),
    isoneRow({ QP: "1000", Type: "G", Requested: "4/9/2020", "Alternative Name": "Solar plus storage",
      Unit: "OT", "Fuel Type": "SUN BAT", "Net MW": "3.15", "Summer MW": "3.15", Serv: "NA", Status: "W",
      "W/D Date": "6/13/2025" }),
    isoneRow({ QP: "900", Type: "G", Requested: "1/1/2015", "Alternative Name": "Dual fuel plant",
      Unit: "CC", "Fuel Type": "DFO NG", "Net MW": "500", "Summer MW": "500", Serv: "NR", Status: "C" }),
  ])));

  it("reads the queue and keeps ISO-NE's own queue position as identity", () => {
    expect(find(extraction, "1116").nativeQueueId).toBe("1116");
    expect(find(extraction, "1116").nativeProjectName).toBe("SouthCoast Wind 1");
  });

  it("records a CNR request as capacity rights, not as new generation", () => {
    // ISO-NE defines CNR capability as an interconnection service right, settling whether an
    // analysis is needed for a proposed increase in output from an existing capacity resource.
    const cnr = find(extraction, "1090");
    expect(cnr.requestSubtype).toBe("capacity_rights");
    expect(cnr.nativeRequestType).toBe("G CNR");
    expect(cnr.nativeStatus.serv).toBe("CNR");
  });

  it("keeps a CNR row's MW out of every new-generation quantity kind", () => {
    // This is the guard. 838.2 MW of summer capability on a facility that already exists must
    // never be able to land in a queue total.
    const cnr = find(extraction, "1090");
    for (const quantity of cnr.quantities) {
      expect(NEW_GENERATION_KINDS).not.toContain(quantity.quantityKind);
    }
    expect(cnr.quantities.map((q) => [q.nativeField, q.quantityKind, q.value])).toEqual([
      ["Net MW", "capacity_service_mw", 0],
      ["Summer MW", "other_mw", 838.2],
      ["Winter MW", "other_mw", 838.2],
    ]);
  });

  it("gives an ordinary generation request the new-generation kinds", () => {
    const ordinary = find(extraction, "1116");
    expect(ordinary.requestSubtype).toBe("new_generation");
    expect(ordinary.quantities.map((q) => q.quantityKind))
      .toEqual(["net_mw_to_grid", "summer_mw", "winter_mw"]);
  });

  it("treats an elective transmission upgrade and a transmission service request as neither", () => {
    const etu = find(extraction, "800");
    expect(etu.requestSubtype).toBe("elective_transmission_upgrade");
    expect(etu.requestClass).toBe("transmission");
    for (const quantity of etu.quantities) {
      expect(NEW_GENERATION_KINDS).not.toContain(quantity.quantityKind);
    }
  });

  it("keeps an administrative row and records what it points at, without creating a relationship", () => {
    // ISO-NE publishes no relationship field; the reference lives in the project title, and its
    // own guidance says to disregard such rows when counting projects.
    const admin = find(extraction, "367");
    expect(admin.nativeStatus.referencesQueuePosition).toBe("311");
    expect(admin.nativeStatus.administrativeRelation).toBe("named_in_project_title");
    expect(admin.nativeProjectName).toContain("see Q311");
    // The row itself is kept, not dropped.
    expect(admin.nativeQueueId).toBe("367");
    expect(extraction.deferrals.some((deferral) =>
      deferral.nativeQueueId === "367" && /no canonical relationship is created/.test(deferral.detail))).toBe(true);
  });

  it("names a co-located project's parts and invents no MW split for them", () => {
    const hybrid = find(extraction, "1000");
    expect(hybrid.resources.map((resource) => [resource.nativeFuel, resource.technology]))
      .toEqual([["SUN", "solar"], ["BAT", "battery_storage"]]);
    expect(hybrid.resources.every((resource) => !resource.isSourceSeparated)).toBe(true);
    expect(hybrid.quantities.every((quantity) => quantity.resourceOrdinal === null)).toBe(true);
    expect(hybrid.requestClass).toBe("mixed");
  });

  it("does not read a dual-fuel machine as two resources", () => {
    // DFO NG is one plant that burns oil or gas. Counting fuels as resources would invent one.
    const dualFuel = find(extraction, "900");
    expect(dualFuel.resources).toHaveLength(1);
    expect(dualFuel.resources[0]!.nativeFuel).toBe("DFO NG");
    expect(dualFuel.requestClass).toBe("generation");
  });

  it("never marks an ISO-NE request operational from a planned date", () => {
    for (const record of extraction.records) {
      expect(record.actualInServiceOn).toBeNull();
    }
    expect(find(extraction, "900").lifecycleStage).toBe("operational");
    expect(find(extraction, "900").nativeStatus.status).toBe("C");
  });

  it("does not invent a withdrawal date the queue did not publish", () => {
    expect(find(extraction, "1000").withdrawnOn).toBe("2025-06-13");
    expect(find(extraction, "800").lifecycleStage).toBe("withdrawn");
    expect(find(extraction, "800").withdrawnOn).toBeNull();
  });

  it("fails loudly when the page changes shape", () => {
    expect(() => isoneQueueAdapter.parse(artifact("public-queue", "<html><body>no table</body></html>")))
      .toThrow(/no table with id "publicqueue"/);
    const renamed = isonePage([]).replace("<th>QP</th>", "<th>Queue Position</th>");
    expect(() => isoneQueueAdapter.parse(artifact("public-queue", renamed))).toThrow(/no longer exposes QP/);
  });

  it("refuses a catastrophically short table rather than reporting an empty queue", () => {
    const tiny = `<html><table id="publicqueue"><tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr>`
      + `<tr>${new Array(HEADERS.length).fill("<td>x</td>").join("")}</tr></table></html>`;
    expect(() => isoneQueueAdapter.parse(artifact("public-queue", tiny))).toThrow(/far below any plausible queue/);
  });
});

describe("ISO-NE helpers", () => {
  it("maps the three published statuses and defers anything else", () => {
    expect(isoneLifecycle("A").stage).toBe("study");
    expect(isoneLifecycle("C").stage).toBe("operational");
    expect(isoneLifecycle("W").stage).toBe("withdrawn");
    expect(isoneLifecycle("Z")).toEqual({ stage: "unknown", unmapped: "Z" });
  });

  it("splits a compound fuel only where storage is one of the parts", () => {
    expect(isoneResources("SUN BAT", "OT").resources).toHaveLength(2);
    expect(isoneResources("DFO NG", "CC").resources).toHaveLength(1);
    expect(isoneResources("DFO KER NG", "CT").resources).toHaveLength(1);
    expect(isoneResources("WND BAT", "WT").resources).toHaveLength(2);
  });

  it("reads the queue position a title points at, in the shapes ISO-NE writes it", () => {
    expect(referencedQueuePosition("Kingdom Community Wind Increase (see Q311)")).toBe("311");
    expect(referencedQueuePosition("Brayton Point 3 Uprate( see 243)")).toBe("243");
    expect(referencedQueuePosition("Naugatuck Avenue CNR Only (see QP1089)")).toBe("1089");
    expect(referencedQueuePosition("An ordinary project")).toBeNull();
  });
});

// --------------------------------------------------------------------------------- SPP

function sppCsv(rows: string[][], updated = "9/21/2026"): string {
  const header = ["Generation Interconnection Number", "State", "Capacity", "MAX Summer MW",
    "MAX Winter MW", "Service Type", "Requested Maximum Injection Capability (MW)",
    "Requested Network Resource Deliverability (MW)", "Nameplate Capacity", "Generation Type",
    "Fuel Type", "Substation or Line", "Request Received", "Commercial Operation Date",
    "In-Service Date", "Date Withdrawn", "Status", "Cause of Delay"];
  const filler = Array.from({ length: 120 }, (_, index) =>
    [`FILL-${index}`, "KS", "10", "10", "10", "ER", "0", "0", "0", "Wind", "", "", "1/1/2020", "", "", "", "DISIS STAGE", ""]);
  const body = [...rows, ...filler]
    .map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  return `"Last Updated On",${updated},\n${header.join(",")}\n${body}`;
}

describe("the SPP adapter", () => {
  const extraction = sppQueueAdapter.parse(artifact("active-requests", sppCsv([
    ["GI-TC-2024-29", "KS", "170", "170", "170", "ER/NR", "0", "0", "0", "Wind", "Wind",
      "Redtail 115 Substation", "5/29/2024", "", "9/15/2027", "", "FACILITY STUDY STAGE",
      "GIA delayed due to Affected Systems Study"],
    ["TI-18-0827", "CO", "145", "145", "145", "ER/NR", "0", "0", "0", "Wind", "Wind", "Redtail",
      "8/27/2018", "6/24/2022", "6/24/2022", "", "IA FULLY EXECUTED/COMMERCIAL OPERATION", ""],
    ["GEN-2020-065", "OK", "1003", "912.3", "1003", "ER", "500", "450", "1100", "Thermal",
      "Combined Cycle", "Anadarko", "4/30/2020", "", "12/1/2025", "", "IA FULLY EXECUTED/ON SCHEDULE", ""],
    ["GEN-2021-100", "KS", "100", "100", "100", "ER", "0", "0", "0", "Hybrid", "Solar/Storage",
      "Clark", "1/5/2021", "", "6/1/2026", "", "IA FULLY EXECUTED/ON SUSPENSION", ""],
  ])));

  it("reads past the preamble and takes its update date as the snapshot key", () => {
    expect(extraction.snapshot.nativeSnapshotKey).toBe("active-2026-09-21");
    expect(extraction.snapshot.sourcePublishedAt).toBe("2026-09-21T00:00:00.000Z");
  });

  it("keeps all six MW fields under their own names", () => {
    const record = find(extraction, "GEN-2020-065");
    expect(record.quantities.map((q) => [q.nativeField, q.quantityKind, q.value])).toEqual([
      ["Capacity", "maximum_facility_output", 1003],
      ["MAX Summer MW", "summer_mw", 912.3],
      ["MAX Winter MW", "winter_mw", 1003],
      ["Requested Maximum Injection Capability (MW)", "energy_service_mw", 500],
      ["Requested Network Resource Deliverability (MW)", "capacity_service_mw", 450],
      ["Nameplate Capacity", "other_mw", 1100],
    ]);
    // Six fields, six different numbers. None is promoted to "the" MW.
    expect(new Set(record.quantities.map((q) => q.value)).size).toBeGreaterThan(3);
  });

  it("derives lifecycle from the status field, not from the report being called active", () => {
    // A third of SPP's "active" listing is already operating.
    expect(find(extraction, "TI-18-0827").lifecycleStage).toBe("operational");
    expect(find(extraction, "GEN-2020-065").lifecycleStage).toBe("agreement_executed");
    expect(find(extraction, "GI-TC-2024-29").lifecycleStage).toBe("study");
    expect(find(extraction, "GEN-2021-100").lifecycleStage).toBe("suspended");
  });

  it("takes a commercial operation date only where the status agrees", () => {
    expect(find(extraction, "TI-18-0827").actualInServiceOn).toBe("2022-06-24");
    // GEN-2020-065 has no commercial operation date and is not operating.
    expect(find(extraction, "GEN-2020-065").actualInServiceOn).toBeNull();
  });

  it("keeps a hybrid label whole rather than inventing components", () => {
    const hybrid = find(extraction, "GEN-2021-100");
    expect(hybrid.resources).toHaveLength(1);
    expect(hybrid.resources[0]!.nativeTechnology).toBe("Hybrid");
    expect(hybrid.resources[0]!.nativeFuel).toBe("Solar/Storage");
    expect(hybrid.resources[0]!.isSourceSeparated).toBe(false);
  });

  it("preserves every native status field", () => {
    expect(find(extraction, "GI-TC-2024-29").nativeStatus).toMatchObject({
      status: "FACILITY STUDY STAGE", "Service Type": "ER/NR",
      "Cause of Delay": "GIA delayed due to Affected Systems Study",
    });
  });

  it("fails loudly when the columns change or the listing collapses", () => {
    const renamed = sppCsv([]).replace("Generation Interconnection Number", "GI Number");
    expect(() => sppQueueAdapter.parse(artifact("active-requests", renamed))).toThrow(/could not be read/);
    const tiny = '"Last Updated On",9/21/2026,\nGeneration Interconnection Number,Status,Request Received\n"A","DISIS STAGE","1/1/2020"';
    expect(() => sppQueueAdapter.parse(artifact("active-requests", tiny))).toThrow(/far below any plausible queue/);
  });
});

describe("SPP lifecycle", () => {
  it("separates an executed agreement from commercial operation", () => {
    expect(sppLifecycle("IA FULLY EXECUTED/COMMERCIAL OPERATION").stage).toBe("operational");
    expect(sppLifecycle("IA FULLY EXECUTED/ON SCHEDULE").stage).toBe("agreement_executed");
    expect(sppLifecycle("IA FULLY EXECUTED/ON SUSPENSION").stage).toBe("suspended");
    expect(sppLifecycle("IA PENDING").stage).toBe("agreement_pending");
    expect(sppLifecycle("DISIS STAGE").stage).toBe("study");
    expect(sppLifecycle("SOMETHING NEW")).toEqual({ stage: "unknown", unmapped: "SOMETHING NEW" });
  });
});

describe("the SPP publication block", () => {
  /** The determination this phase registers for SPP, as the migration records it. */
  const sppRights = (purpose: string): SourceRightsState => ({
    sourceInterfaceSlug: "spp-generator-interconnection-queue",
    sourceName: "SPP Generator Interconnection Active Request Listing",
    purpose,
    rightsClassification: "unsuitable_without_permission",
    disposition: "prohibited",
    attributionRequired: false,
    attributionText: null,
    conditions: "SPP grants copying and distribution with citation except for use in commercial publication.",
    unresolvedIssue: null,
    termsDocumentUrl: "https://www.spp.org/terms-conditions/",
    reviewedBy: "Urdais research",
    reviewedOn: "2026-09-21",
  });

  it("blocks raw display", () => {
    const decision = mayPublishSourceValue({
      rights: sppRights("public_interconnection_queue_display"),
      publicationState: "publication_candidate",
      purpose: "public_interconnection_queue_display", isPublicPurpose: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_permission_prohibited");
  });

  it("blocks derived display too, so a metric cannot launder the block", () => {
    const decision = mayPublishSourceValue({
      rights: sppRights("public_interconnection_queue_derived_metric_display"),
      publicationState: "publication_candidate",
      purpose: "public_interconnection_queue_derived_metric_display", isPublicPurpose: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_permission_prohibited");
  });

  it("stays blocked even if somebody marks the value as published", () => {
    for (const publicationState of ["published", "publication_candidate"] as const) {
      const decision = mayPublishSourceValue({
        rights: sppRights("public_interconnection_queue_display"),
        publicationState, purpose: "public_interconnection_queue_display", isPublicPurpose: true,
      });
      expect(decision.allowed).toBe(false);
    }
  });

  it("is not reachable by the founder-accepted-risk path", () => {
    // That path exists for `ambiguous_requires_legal_review`, where the question is open. SPP's
    // terms state an exclusion instead, so even a disposition that was not prohibited leaves the
    // classification blocking it.
    const decision = mayPublishSourceValue({
      rights: { ...sppRights("public_interconnection_queue_display"), disposition: "not_established" },
      publicationState: "publication_candidate",
      purpose: "public_interconnection_queue_display", isPublicPurpose: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_unsuitable_without_permission");
  });

  it("could only ever be published by someone recording an actual permission", () => {
    // The one route the policy leaves open, and it requires a deliberate act: a disposition of
    // `permitted` on an unsuitable source means a permission was obtained and written down.
    // Today SPP's disposition is `prohibited`, which the migration and the database tests assert.
    const granted = mayPublishSourceValue({
      rights: { ...sppRights("public_interconnection_queue_display"), disposition: "permitted" },
      publicationState: "publication_candidate",
      purpose: "public_interconnection_queue_display", isPublicPurpose: true,
    });
    expect(granted.reasonCode).toBe("allowed_by_explicit_permission_grant");
    // And nothing in this phase does that: the determination registered is prohibited.
    expect(sppRights("public_interconnection_queue_display").disposition).toBe("prohibited");
  });

  it("collects under research purpose, since no production permission covers it", () => {
    expect(sppQueueAdapter.retrievalPurpose).toBe("research");
  });
});
