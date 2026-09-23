/**
 * The Equinix tranche's own rules: what the geocoder is asked, what the stored
 * address keeps, and what a provider feature type is allowed to claim.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  campusKey,
  classifyEquinixPrecision,
  classifyReviewIssue,
  namedFacilityCodes,
  resolveByNamedIdentity,
  materializeEquinixQueue,
  simplifiedEquinixQuery,
  streetLevelFallbackQuery,
  validateEquinixTranche,
  type EquinixTranche,
} from "@/lib/facilities/equinix-tranche";

const tranche = JSON.parse(readFileSync("data/map/equinix-manual-tranche.v1.json", "utf8")) as EquinixTranche;

describe("the frozen artifact", () => {
  it("passes validation with no issues", () => {
    expect(validateEquinixTranche(tranche).issues).toEqual([]);
  });

  it("carries 48 markets and 187 uniquely keyed facilities, and no coordinates", () => {
    const facilities = tranche.markets.flatMap((market) => market.facilities);
    expect(tranche.markets).toHaveLength(48);
    expect(facilities).toHaveLength(187);
    expect(new Set(facilities.map((facility) => facility.researchKey)).size).toBe(187);
    expect(facilities.some((facility) => "latitude" in facility || "longitude" in facility)).toBe(false);
  });

  it("gives every market first-party evidence and a country", () => {
    for (const market of tranche.markets) {
      expect(market.sourceUrl, market.parentLocationId).toMatch(/^https:\/\/www\.equinix\.com\//);
      expect(market.countryCode, market.parentLocationId).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("derives every research key from its facility code", () => {
    for (const market of tranche.markets) {
      for (const facility of market.facilities) {
        expect(facility.researchKey).toBe(`equinix-${facility.facilityCode.toLowerCase()}`);
      }
    }
  });
});

describe("validateEquinixTranche", () => {
  it("refuses a duplicated research key", () => {
    const broken = { ...tranche, markets: [tranche.markets[0]!, tranche.markets[0]!] };
    expect(validateEquinixTranche(broken).issues.join(" ")).toContain("appears more than once");
  });

  it("refuses a market with no evidence url", () => {
    const broken = { ...tranche, markets: [{ ...tranche.markets[0]!, sourceUrl: "" }] };
    expect(validateEquinixTranche(broken).issues.join(" ")).toContain("cannot reach the map");
  });

  it("refuses an artifact that already carries coordinates", () => {
    const market = tranche.markets[0]!;
    const broken = {
      ...tranche,
      markets: [{ ...market, facilities: [{ ...market.facilities[0]!, latitude: 1, longitude: 2 }] }],
    } as unknown as EquinixTranche;
    expect(validateEquinixTranche(broken).issues.join(" ")).toContain("already carries a coordinate");
  });
});

describe("simplifiedEquinixQuery", () => {
  it("strips interior detail a geocoder cannot resolve", () => {
    expect(simplifiedEquinixQuery("350 E Cermak Rd, 5th Floor, Chicago, IL 60616, USA")).toBe("350 E Cermak Rd, Chicago, IL 60616, USA");
    expect(simplifiedEquinixQuery("1950 North Stemmons Freeway, Suite 1034, Dallas, TX 75207, USA")).toBe("1950 North Stemmons Freeway, Dallas, TX 75207, USA");
    expect(simplifiedEquinixQuery("2960 Corvin Drive, Pod D, Santa Clara, CA 95051, USA")).toBe("2960 Corvin Drive, Santa Clara, CA 95051, USA");
    expect(simplifiedEquinixQuery("639 Gardeners Road, Unit B, Sydney, NSW 2020, Australia")).toBe("639 Gardeners Road, Sydney, NSW 2020, Australia");
  });

  it("drops a placeholder component rather than querying it", () => {
    expect(simplifiedEquinixQuery("7 Great Oaks Boulevard, N/A, San Jose, CA 95119, USA")).toBe("7 Great Oaks Boulevard, San Jose, CA 95119, USA");
  });

  it("returns null when there is nothing to strip", () => {
    expect(simplifiedEquinixQuery("445 N Douglas St, El Segundo, CA 90245, USA")).toBeNull();
  });

  it("does not mistake a street number for a suite", () => {
    expect(simplifiedEquinixQuery("18155 Technology Drive, Building A, Culpeper, VA 22701, USA")).toBe("18155 Technology Drive, Culpeper, VA 22701, USA");
  });
});

describe("streetLevelFallbackQuery", () => {
  it("falls back to the street and its town", () => {
    const query = streetLevelFallbackQuery({
      facilityCode: "CH1",
      researchKey: "equinix-ch1",
      address: "350 E Cermak Rd, 5th Floor, Chicago, IL 60616, USA",
      locality: "Chicago",
      adminArea: "Illinois",
      countryName: "United States",
    });
    expect(query).toBe("350 E Cermak Rd, Chicago, United States");
  });
});

describe("classifyEquinixPrecision", () => {
  const raw = (addresstype: string) => ({ addresstype } as never);

  it("calls a building a building and a road a street", () => {
    expect(classifyEquinixPrecision(raw("building"))).toEqual({ coordinatePrecision: "building", precisionClass: "exact_or_rooftop" });
    expect(classifyEquinixPrecision(raw("road"))).toEqual({ coordinatePrecision: "street", precisionClass: "interpolated_or_street" });
  });

  it("refuses to treat a city centroid as a position", () => {
    expect(classifyEquinixPrecision(raw("city"))).toEqual({ coordinatePrecision: "street", precisionClass: "lower_precision" });
    expect(classifyEquinixPrecision(raw("suburb"))).toEqual({ coordinatePrecision: "street", precisionClass: "lower_precision" });
  });

  it("is unresolved when there is no result at all", () => {
    expect(classifyEquinixPrecision(null).precisionClass).toBe("unresolved");
  });
});

describe("the geocoder query never rewrites the stored address", () => {
  it("keeps suite, floor, pod, unit and building in what the map will show", () => {
    const queue = materializeEquinixQueue(tranche);
    const byKey = new Map(queue.map((item) => [item.researchKey, item]));
    const cases: [string, string][] = [
      ["equinix-ch1", "5th Floor"],
      ["equinix-da1", "Suite 1034"],
      ["equinix-sv14", "Pod D"],
      ["equinix-sy1", "Unit B"],
      ["equinix-cu1", "Building A"],
      ["equinix-mu1", "2nd Floor"],
    ];
    for (const [key, detail] of cases) {
      expect(byKey.get(key)?.address, key).toContain(detail);
    }
  });

  it("asks the provider a query with that detail removed", () => {
    const queue = materializeEquinixQueue(tranche);
    const chicago = queue.find((item) => item.researchKey === "equinix-ch1")!;
    expect(chicago.query).toContain("5th Floor");
    expect(chicago.fallbackQuery).not.toContain("5th Floor");
  });
});

describe("resolveByNamedIdentity", () => {
  const ambiguous = (facilityCode: string, returned: string) => ({
    researchKey: `equinix-${facilityCode.toLowerCase()}`,
    facilityCode,
    outcome: "geocoded_review" as const,
    outcomeReason: "Provider returned multiple similarly ranked candidates.",
    latitude: -37.823209,
    longitude: 144.9155089,
    returnedFormattedAddress: returned,
  });

  it("reads the facility codes a provider put in a feature name", () => {
    expect(namedFacilityCodes("Equinix ME1, 522-578, Lorimer Street")).toEqual(new Set(["ME1"]));
    expect(namedFacilityCodes("Equinix MU4 Rechenzentrum, 10, Dywidagstraße")).toEqual(new Set(["MU4"]));
    expect(namedFacilityCodes("12, Calle de La Pedriza, Madrid")).toEqual(new Set());
  });

  it("accepts a result the provider named for this very facility", () => {
    const resolved = resolveByNamedIdentity(ambiguous("ME1", "Equinix ME1, 522-578, Lorimer Street, Port Melbourne") as never);
    expect(resolved.outcome).toBe("geocoded_ready");
    expect(resolved.outcomeReason).toContain("named for this facility");
  });

  it("refuses a result the provider named for a neighbour", () => {
    // The real cases this exists to refuse: ME1 comes back for ME2, SY5 for
    // SY4, PA3 for PA2/PA9x/PA10, SV17 for SV14 — all halls at one address.
    for (const [code, returned] of [["ME2", "Equinix ME1, 522-578, Lorimer Street"], ["SY4", "Equinix SY5, 200, Bourke Road"], ["SV14", "Equinix SV17, 2960, Corvin Drive"]] as const) {
      expect(resolveByNamedIdentity(ambiguous(code, returned) as never).outcome, code).toBe("geocoded_review");
    }
  });

  it("refuses a name that carries no facility code at all", () => {
    expect(resolveByNamedIdentity(ambiguous("ZH2", "225, Josefstrasse, Zürich") as never).outcome).toBe("geocoded_review");
  });

  it("leaves a result that was never ambiguous alone", () => {
    const ready = { ...ambiguous("ME1", "Equinix ME1"), outcome: "geocoded_ready" as const };
    expect(resolveByNamedIdentity(ready as never).outcomeReason).toBe("Provider returned multiple similarly ranked candidates.");
  });
});

describe("the review queue", () => {
  it("treats two floors of one building as one campus", () => {
    const ch1 = campusKey("350 E Cermak Rd, 5th Floor, Chicago, IL 60616, USA", "US");
    const ch2 = campusKey("350 E Cermak Rd, 6th Floor, Chicago, IL 60616, USA", "US");
    const da1 = campusKey("1950 North Stemmons Freeway, Suite 1034, Dallas, TX 75207, USA", "US");
    const da2 = campusKey("1950 North Stemmons Freeway, Suite 2027, Dallas, TX 75207, USA", "US");
    expect(ch1).toBe(ch2);
    expect(da1).toBe(da2);
    expect(ch1).not.toBe(da1);
  });

  it("does not merge two different streets, or one street across countries", () => {
    expect(campusKey("11 Great Oaks Boulevard, San Jose, CA 95119, USA", "US"))
      .not.toBe(campusKey("9 Great Oaks Boulevard, San Jose, CA 95119, USA", "US"));
    expect(campusKey("1 High Street, Somewhere", "US")).not.toBe(campusKey("1 High Street, Somewhere", "GB"));
  });

  const result = (overrides: Record<string, unknown>) => ({
    facilityCode: "ME2",
    latitude: -37.8,
    longitude: 144.9,
    returnedFormattedAddress: null,
    ...overrides,
  }) as never;

  it("separates the three kinds of work a reviewer has to do", () => {
    expect(classifyReviewIssue(result({ latitude: null, longitude: null }), false).issueType).toBe("no_candidate");
    expect(classifyReviewIssue(result({ returnedFormattedAddress: "Equinix ME1, Lorimer Street" }), true).issueType).toBe("neighbor_facility_match");
    expect(classifyReviewIssue(result({ returnedFormattedAddress: "Carrer de l'Acer, Barcelona" }), true).issueType).toBe("ambiguous_shared_location");
  });

  it("names the neighbour it actually matched, so the reviewer can check it", () => {
    const { issueSummary } = classifyReviewIssue(result({ returnedFormattedAddress: "Equinix ME1, Lorimer Street" }), true);
    expect(issueSummary).toContain("ME1");
    expect(issueSummary).toContain("not ME2");
  });

  it("says whether an ambiguous case is a shared address or simply unranked", () => {
    expect(classifyReviewIssue(result({ returnedFormattedAddress: "somewhere" }), true).issueSummary).toContain("share this address or campus");
    expect(classifyReviewIssue(result({ returnedFormattedAddress: "somewhere" }), false).issueSummary).toContain("multiple similarly ranked");
  });
});
