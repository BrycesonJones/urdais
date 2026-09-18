/**
 * The public read model's contract check.
 *
 * Every case here is a response that would render perfectly and say something
 * false: a dot with no source behind it, a city centroid presented as a site, a
 * reviewer's note on a public surface. None of them is a crash, which is why
 * the check exists.
 */

import { describe, expect, it } from "vitest";

import { FACILITY_VERIFICATION_HORIZON_DAYS } from "@/lib/facilities/domain";
import {
  composeAddress,
  emptyFacilityReadModel,
  validatePublicFacilities,
  type FacilityMapReadModel,
  type PublicFacility,
} from "@/lib/facilities/read/read-model";

const NOW = new Date("2026-09-17T00:00:00Z");

const facility = (overrides: Partial<PublicFacility> = {}): PublicFacility => ({
  id: "csc-kajaani-lumi-host",
  name: "CSC Kajaani Data Center (LUMI host)",
  category: "data_center",
  latitude: 64.2319866,
  longitude: 27.691477,
  coordinatePrecision: "building",
  address: "Tehdaskatu 15, Kajaani, Kainuu, Finland",
  ownerName: "CSC – IT Center for Science",
  operatorName: "CSC",
  lifecycleStatus: "operational",
  verificationStatus: "verified",
  lastVerifiedDate: "2026-09-17",
  sources: [{ publisher: "CSC", title: "LUMI Supercomputer", url: "https://example.com/csc" }],
  ...overrides,
});

const model = (facilities: PublicFacility[]): FacilityMapReadModel => ({
  dataset: "urdais-map-facilities",
  verificationHorizonDays: FACILITY_VERIFICATION_HORIZON_DAYS,
  facilities,
  coverage: {
    published: facilities.length,
    served: facilities.length,
    byCategory: { data_center: facilities.length, gpu_compute_cluster: 0, power_infrastructure: 0, semiconductor_fab: 0 },
    countries: 1,
  },
  unavailableReason: null,
});

describe("validatePublicFacilities", () => {
  it("passes a clean response", () => {
    expect(validatePublicFacilities(model([facility()]), NOW)).toEqual([]);
  });

  it("passes an empty response that says why it is empty", () => {
    expect(validatePublicFacilities(emptyFacilityReadModel("no_public_facilities"), NOW)).toEqual([]);
    expect(validatePublicFacilities(emptyFacilityReadModel("not_configured"), NOW)).toEqual([]);
  });

  it("refuses an empty response with no reason, and a populated one carrying one", () => {
    expect(validatePublicFacilities({ ...model([]), unavailableReason: null }, NOW)).toContain("no facilities and no reason given for their absence");
    expect(validatePublicFacilities({ ...model([facility()]), unavailableReason: "no_public_facilities" }, NOW)).toContain(
      "facilities were served alongside a reason they are unavailable",
    );
  });

  it("refuses a dot with no source cited", () => {
    expect(validatePublicFacilities(model([facility({ sources: [] })]), NOW)).toContain("csc-kajaani-lumi-host is on the map with no source cited");
  });

  it("refuses a city centroid presented as a position", () => {
    const cityLevel = { ...facility(), coordinatePrecision: "city" } as unknown as PublicFacility;
    expect(validatePublicFacilities(model([cityLevel]), NOW)).toContain("csc-kajaani-lumi-host is placed at city precision, which is not a position");
  });

  it("refuses an unusable coordinate and a category that is not public", () => {
    expect(validatePublicFacilities(model([facility({ latitude: 91 })]), NOW)).toContain("csc-kajaani-lumi-host has an unusable latitude");
    expect(validatePublicFacilities(model([facility({ longitude: Number.NaN })]), NOW)).toContain("csc-kajaani-lumi-host has an unusable longitude");
    const retired = { ...facility(), category: "compute_cluster" } as unknown as PublicFacility;
    expect(validatePublicFacilities(model([retired]), NOW)).toContain("csc-kajaani-lumi-host has category compute_cluster, which is not public");
  });

  it("refuses a record verified past the horizon", () => {
    const stale = facility({ lastVerifiedDate: "2024-01-01" });
    expect(validatePublicFacilities(model([stale]), NOW).join(" ")).toContain(`past the ${FACILITY_VERIFICATION_HORIZON_DAYS}-day horizon`);
    expect(validatePublicFacilities(model([facility({ lastVerifiedDate: "" })]), NOW)).toContain(
      "csc-kajaani-lumi-host does not say when it was last verified",
    );
  });

  it("refuses a facility carrying an internal field", () => {
    for (const field of ["reviewNotes", "confidence", "publicationState", "coordinateNotes"]) {
      const leaked = { ...facility(), [field]: "something internal" } as unknown as PublicFacility;
      expect(validatePublicFacilities(model([leaked]), NOW), field).toContain(`csc-kajaani-lumi-host carries the internal field ${field}`);
    }
  });

  it("refuses a duplicated id, a missing id and a missing name", () => {
    expect(validatePublicFacilities(model([facility(), facility()]), NOW)).toContain("csc-kajaani-lumi-host appears more than once");
    expect(validatePublicFacilities(model([facility({ id: "" })]), NOW)).toContain("a facility was served with no id");
    expect(validatePublicFacilities(model([facility({ name: "  " })]), NOW)).toContain("csc-kajaani-lumi-host has no name");
  });

  it("refuses a response that is not this dataset", () => {
    expect(validatePublicFacilities({ ...model([facility()]), dataset: "something-else" }, NOW)).toContain("dataset identifier is wrong or missing");
    expect(validatePublicFacilities(null, NOW)).toEqual(["response is not an object"]);
  });
});

describe("composeAddress", () => {
  it("joins the parts a source published and skips the ones it did not", () => {
    expect(composeAddress({ streetAddress: "1500 Beech Road", locality: "New Albany", adminArea: "OH", countryName: "United States" })).toBe(
      "1500 Beech Road, New Albany, OH, United States",
    );
    expect(composeAddress({ streetAddress: null, locality: "Salem Township", adminArea: "PA", countryName: "United States" })).toBe(
      "Salem Township, PA, United States",
    );
  });

  it("returns null rather than an empty line when nothing was published", () => {
    expect(composeAddress({ streetAddress: null, locality: null, adminArea: null, countryName: null })).toBeNull();
    expect(composeAddress({ streetAddress: "  ", locality: null, adminArea: null, countryName: null })).toBeNull();
  });
});
