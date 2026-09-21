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
  streetAddressStates,
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

  describe("when the street address is already a complete postal address", () => {
    // 145 of 271 public facilities rendered their city and country twice,
    // because many sources publish the whole postal address in the street field
    // and the tail was appended to it regardless.
    it("does not repeat the locality, admin area and country", () => {
      expect(
        composeAddress({
          streetAddress: "Camino a Nativitas 800, Colon, Querétaro, Mexico",
          locality: "Colón",
          adminArea: "Querétaro",
          countryName: "Mexico",
        }),
      ).toBe("Camino a Nativitas 800, Colon, Querétaro, Mexico");
    });

    it("matches across accents, case and punctuation", () => {
      // "Colon" is the street's spelling and "Colón" the locality's; "Qro." and
      // "Qro" are the same abbreviation. None of those is a second place.
      expect(
        composeAddress({
          streetAddress: "Parcela 10 Z-1 P1/1 del Ejido San Vicente, 76295 COLON, Qro., MEXICO",
          locality: "Colón",
          adminArea: "Qro",
          countryName: "Mexico",
        }),
      ).toBe("Parcela 10 Z-1 P1/1 del Ejido San Vicente, 76295 COLON, Qro., MEXICO");
    });

    it("finds a city fused to its postcode, as British and Dutch addresses write it", () => {
      expect(
        composeAddress({
          streetAddress: "11 Hanbury Street, Block B, London E1 6QR, United Kingdom",
          locality: "London",
          adminArea: null,
          countryName: "United Kingdom",
        }),
      ).toBe("11 Hanbury Street, Block B, London E1 6QR, United Kingdom");
      expect(
        composeAddress({
          streetAddress: "Koolhovenlaan 25, Schiphol-Rijk 1119 NB, Netherlands",
          locality: "Schiphol-Rijk",
          adminArea: "North Holland",
          countryName: "Netherlands",
        }),
      ).toBe("Koolhovenlaan 25, Schiphol-Rijk 1119 NB, Netherlands");
    });
  });

  describe("when the street address is partial", () => {
    it("still gains its city, state and country", () => {
      expect(
        composeAddress({ streetAddress: "3231 Paul R. Lowry Road", locality: "Memphis", adminArea: "TN", countryName: "United States" }),
      ).toBe("3231 Paul R. Lowry Road, Memphis, TN, United States");
    });

    it("appends only what is missing", () => {
      expect(
        composeAddress({
          streetAddress: "216 Greenfield Road, Lancaster, PA (former R.R. Donnelley plant)",
          locality: "Lancaster",
          adminArea: "PA",
          countryName: "United States",
        }),
      ).toBe("216 Greenfield Road, Lancaster, PA (former R.R. Donnelley plant), United States");
    });

    it("works with no admin area", () => {
      expect(composeAddress({ streetAddress: "1 Superloop Circle", locality: "McCarran", adminArea: null, countryName: "United States" })).toBe(
        "1 Superloop Circle, McCarran, United States",
      );
    });
  });

  describe("what it must not drop or collapse", () => {
    it("keeps a country that only appears inside a proper noun", () => {
      // "Southern Taiwan Science Park" names Taiwan without being addressed to
      // it. Reading that as the country would delete the country from the line.
      expect(
        composeAddress({
          streetAddress: "8, Beiyuan Rd. 2, Southern Taiwan Science Park",
          locality: "Tainan",
          adminArea: "Tainan",
          countryName: "Taiwan",
        }),
      ).toBe("8, Beiyuan Rd. 2, Southern Taiwan Science Park, Tainan, Taiwan");
    });

    it("does not let a short admin code match a longer word", () => {
      // "PA" must not be found inside "Paul".
      expect(composeAddress({ streetAddress: "100 Paul Street", locality: "Lancaster", adminArea: "PA", countryName: "United States" })).toBe(
        "100 Paul Street, Lancaster, PA, United States",
      );
    });

    it("says a city once where the city and its division share a name", () => {
      expect(
        composeAddress({ streetAddress: "8, Beiyuan Rd. 2", locality: "Tainan", adminArea: "Tainan", countryName: "Taiwan" }),
      ).toBe("8, Beiyuan Rd. 2, Tainan, Taiwan");
    });

    it("keeps a repeat the source itself wrote", () => {
      // Bogotá is both the city and the department; the source publishes both,
      // and rewriting a source's own address is not this function's business.
      expect(
        composeAddress({
          streetAddress: "Carrera 19 16-98, Bogotá, Bogotá, Colombia",
          locality: "Bogotá",
          adminArea: "Bogotá",
          countryName: "Colombia",
        }),
      ).toBe("Carrera 19 16-98, Bogotá, Bogotá, Colombia");
    });

    it("keeps a genuinely distinct city and state that resemble each other", () => {
      expect(
        composeAddress({ streetAddress: "350 5th Ave", locality: "New York", adminArea: "NY", countryName: "United States" }),
      ).toBe("350 5th Ave, New York, NY, United States");
    });
  });
});

describe("streetAddressStates", () => {
  it("matches whole words, ignoring case, accents and punctuation", () => {
    expect(streetAddressStates("76295 Colón, Qro., Mexico", "colon")).toBe(true);
    expect(streetAddressStates("London E1 6QR", "London")).toBe(true);
    expect(streetAddressStates("Hwaseong-si, Gyeonggi-do 18448", "Hwaseong")).toBe(true);
  });

  it("does not match a fragment of a longer word", () => {
    expect(streetAddressStates("100 Paul Street", "PA")).toBe(false);
    expect(streetAddressStates("Springfield Road", "Spring")).toBe(false);
  });

  it("is false for an empty or absent component", () => {
    expect(streetAddressStates("anywhere", null)).toBe(false);
    expect(streetAddressStates("anywhere", "   ")).toBe(false);
  });
});
