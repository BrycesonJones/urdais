/**
 * The import contract's structural validation.
 *
 * Almost every case below is a way of writing "unknown" that is not null: a
 * blank string, the word "unknown", a zero standing in for a missing figure, a
 * date that looks like a date. Those are what turn a sourced dataset into an
 * asserted one, and each is rejected with the path that carries it.
 */

import { describe, expect, it } from "vitest";

import { FACILITY_IMPORT_CONTRACT_VERSION, parseFacilityImportDocument } from "@/lib/facilities/contract";

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    publisher: "Fixture Publisher",
    title: "Fixture campus page",
    url: "https://example.invalid/campus",
    documentType: "company_facility_page",
    publishedOn: "2026-01-15",
    claims: [{ field: "location", statement: "Fixture Street 1" }],
    ...overrides,
  };
}

function facility(overrides: Record<string, unknown> = {}) {
  return {
    researchKey: "fixture-campus",
    canonicalName: "Fixture Campus",
    category: "data_center",
    ownerName: "Fixture Owner",
    operatorName: null,
    aliases: [{ alias: "The Fixture" }],
    location: {
      streetAddress: "Fixture Street 1",
      locality: "Fixtureton",
      adminArea: null,
      countryName: "Finland",
      countryCode: "FI",
      latitude: 64.23,
      longitude: 27.69,
      coordinatePrecision: "building",
      coordinateMethod: "documented_address_geocode",
      coordinateNotes: null,
    },
    lifecycle: { status: "operational", announcedDate: null, constructionStartDate: null, operationalDate: null },
    facts: [],
    evidence: [evidence()],
    quality: { confidence: "high", lastVerifiedDate: "2026-09-17", reviewNotes: [] },
    requestedPublicationState: "published",
    ...overrides,
  };
}

function document(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: FACILITY_IMPORT_CONTRACT_VERSION,
    datasetName: "Fixture dataset",
    researchDocument: "FIXTURE.md",
    generatedAt: "2026-09-17",
    facilities: [facility()],
    relationships: [],
    ...overrides,
  };
}

const paths = (issues: readonly { path: string }[]) => issues.map((issue) => issue.path);

describe("parseFacilityImportDocument", () => {
  it("accepts a well-formed document", () => {
    const { document: parsed, issues } = parseFacilityImportDocument(document());
    expect(issues).toEqual([]);
    expect(parsed?.facilities).toHaveLength(1);
    expect(parsed?.facilities[0]?.category).toBe("data_center");
  });

  it("refuses a document of another contract version rather than partially reading it", () => {
    const { document: parsed, issues } = parseFacilityImportDocument(document({ contractVersion: "urdais.map.facility-import/2" }));
    expect(parsed).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe("$.contractVersion");
    expect(issues[0]?.message).toContain("will not partially read another");
  });

  it("refuses a document with no version at all, and anything that is not an object", () => {
    expect(parseFacilityImportDocument(document({ contractVersion: undefined })).document).toBeNull();
    expect(parseFacilityImportDocument([]).issues[0]?.message).toContain("not an object");
    expect(parseFacilityImportDocument(null).issues[0]?.message).toContain("not an object");
  });

  it("rejects an unknown category and says which one the rename produced", () => {
    const { issues } = parseFacilityImportDocument(document({ facilities: [facility({ category: "compute_cluster" })] }));
    expect(paths(issues)).toContain("$.facilities[0].category");
    expect(issues[0]?.message).toContain("gpu_compute_cluster");
  });

  it("rejects every other unknown enum value", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ lifecycle: { status: "mothballed" } }, "$.facilities[0].lifecycle.status"],
      [{ location: { ...facility().location, coordinatePrecision: "parcel" } }, "$.facilities[0].location.coordinatePrecision"],
      [{ location: { ...facility().location, coordinateMethod: "guess" } }, "$.facilities[0].location.coordinateMethod"],
      [{ quality: { confidence: "probable" } }, "$.facilities[0].quality.confidence"],
      [{ aliases: [{ alias: "X", kind: "nickname" }] }, "$.facilities[0].aliases[0].kind"],
      [{ evidence: [evidence({ documentType: "blog" })] }, "$.facilities[0].evidence[0].documentType"],
      [{ evidence: [evidence({ claims: [{ field: "vibes", statement: "x" }] })] }, "$.facilities[0].evidence[0].claims[0].field"],
      [{ requestedPublicationState: "withdrawn" }, "$.facilities[0].requestedPublicationState"],
    ];
    for (const [override, path] of cases) {
      const { issues } = parseFacilityImportDocument(document({ facilities: [facility(override)] }));
      expect(paths(issues), path).toContain(path);
    }
  });

  it("rejects impossible coordinates, a half position, and a position with no precision", () => {
    const base = facility().location;
    const at = (location: Record<string, unknown>) => parseFacilityImportDocument(document({ facilities: [facility({ location })] })).issues;

    expect(paths(at({ ...base, latitude: 91 }))).toContain("$.facilities[0].location.latitude");
    expect(paths(at({ ...base, longitude: -181 }))).toContain("$.facilities[0].location.longitude");
    expect(at({ ...base, longitude: null }).some((issue) => issue.message.includes("one alone is not a position"))).toBe(true);
    expect(paths(at({ ...base, coordinatePrecision: null }))).toContain("$.facilities[0].location.coordinatePrecision");
    expect(paths(at({ ...base, latitude: "64.23" }))).toContain("$.facilities[0].location.latitude");
  });

  it("rejects a date that is not an ISO date, and one that is not a real day", () => {
    const issues = parseFacilityImportDocument(
      document({ facilities: [facility({ lifecycle: { status: "operational", operationalDate: "2026-02-30" } })] }),
    ).issues;
    expect(issues[0]?.message).toContain("not a real calendar date");
    expect(
      parseFacilityImportDocument(document({ facilities: [facility({ quality: { confidence: "high", lastVerifiedDate: "17/09/2026" } })] })).issues[0]
        ?.message,
    ).toContain("not an ISO date");
  });

  it("rejects a facility that opened before it was announced or before construction started", () => {
    const before = parseFacilityImportDocument(
      document({ facilities: [facility({ lifecycle: { status: "operational", announcedDate: "2026-06-01", operationalDate: "2025-01-01" } })] }),
    ).issues;
    expect(before[0]?.message).toContain("precedes the announcement");
    const construction = parseFacilityImportDocument(
      document({ facilities: [facility({ lifecycle: { status: "operational", constructionStartDate: "2026-06-01", operationalDate: "2025-01-01" } })] }),
    ).issues;
    expect(construction[0]?.message).toContain("precedes construction starting");
  });

  it("refuses a placeholder where null is meant", () => {
    for (const placeholder of ["", "   ", "N/A", "unknown", "TBD", "-"]) {
      const { issues } = parseFacilityImportDocument(document({ facilities: [facility({ ownerName: placeholder })] }));
      expect(paths(issues), placeholder).toContain("$.facilities[0].ownerName");
    }
    // Absent and null are the same thing and both are fine.
    expect(parseFacilityImportDocument(document({ facilities: [facility({ ownerName: null })] })).issues).toEqual([]);
    const { operatorName, ...withoutOperator } = facility();
    expect(operatorName).toBeNull();
    expect(parseFacilityImportDocument(document({ facilities: [withoutOperator] })).issues).toEqual([]);
  });

  it("requires a facility to cite at least one document, and every document to say what it supports", () => {
    expect(paths(parseFacilityImportDocument(document({ facilities: [facility({ evidence: [] })] })).issues)).toContain("$.facilities[0].evidence");
    expect(paths(parseFacilityImportDocument(document({ facilities: [facility({ evidence: [evidence({ claims: [] })] })] })).issues)).toContain(
      "$.facilities[0].evidence[0].claims",
    );
  });

  it("rejects a source that is not an http(s) URL, and the same document cited twice", () => {
    expect(paths(parseFacilityImportDocument(document({ facilities: [facility({ evidence: [evidence({ url: "example.invalid" })] })] })).issues)).toContain(
      "$.facilities[0].evidence[0].url",
    );
    const twice = parseFacilityImportDocument(document({ facilities: [facility({ evidence: [evidence(), evidence({ title: "Again" })] })] })).issues;
    expect(twice.some((issue) => issue.message.includes("more than once"))).toBe(true);
  });

  it("requires a fact to carry exactly one value and to cite evidence on its own facility", () => {
    const both = facility({ facts: [{ key: "capacity_mw", numericValue: 400, textValue: "400", unit: "MW", evidenceUrl: evidence().url }] });
    expect(parseFacilityImportDocument(document({ facilities: [both] })).issues.some((issue) => issue.message.includes("exactly one"))).toBe(true);

    const neither = facility({ facts: [{ key: "capacity_mw", evidenceUrl: evidence().url }] });
    expect(parseFacilityImportDocument(document({ facilities: [neither] })).issues.some((issue) => issue.message.includes("exactly one"))).toBe(true);

    // The rule that stops a megawatt figure attaching itself to a source that
    // never stated one.
    const orphan = facility({ facts: [{ key: "capacity_mw", numericValue: 400, unit: "MW", evidenceUrl: "https://example.invalid/elsewhere" }] });
    expect(
      parseFacilityImportDocument(document({ facilities: [orphan] })).issues.some((issue) => issue.message.includes("not evidence on this facility")),
    ).toBe(true);
  });

  it("rejects a unit on a text fact and a fact key that is not snake_case", () => {
    const unit = facility({ facts: [{ key: "process_nodes", textValue: "N4, N3", unit: "nm", evidenceUrl: evidence().url }] });
    expect(parseFacilityImportDocument(document({ facilities: [unit] })).issues.some((issue) => issue.message.includes("belongs to a number"))).toBe(true);
    const key = facility({ facts: [{ key: "Process Nodes", textValue: "N4", evidenceUrl: evidence().url }] });
    expect(parseFacilityImportDocument(document({ facilities: [key] })).issues.some((issue) => issue.message.includes("snake_case"))).toBe(true);
  });

  it("rejects a research key that is not kebab-case, and a relationship that relates a facility to itself", () => {
    expect(paths(parseFacilityImportDocument(document({ facilities: [facility({ researchKey: "Fixture Campus" })] })).issues)).toContain(
      "$.facilities[0].researchKey",
    );
    const self = parseFacilityImportDocument(
      document({ relationships: [{ fromResearchKey: "fixture-campus", toResearchKey: "fixture-campus", type: "hosted_by" }] }),
    ).issues;
    expect(self.some((issue) => issue.message.includes("to itself"))).toBe(true);
  });

  it("rejects an unknown relationship type, including the inverse forms that are not stored", () => {
    for (const type of ["hosts", "powered_by", "adjacent_to"]) {
      const { issues } = parseFacilityImportDocument(
        document({ relationships: [{ fromResearchKey: "fixture-campus", toResearchKey: "other-campus", type }] }),
      );
      expect(paths(issues), type).toContain("$.relationships[0].type");
    }
  });

  it("requires human_verified evidence to say when it was verified", () => {
    const { issues } = parseFacilityImportDocument(
      document({ facilities: [facility({ evidence: [evidence({ verificationState: "human_verified" })] })] }),
    );
    expect(paths(issues)).toContain("$.facilities[0].evidence[0].verifiedAt");
  });
});
