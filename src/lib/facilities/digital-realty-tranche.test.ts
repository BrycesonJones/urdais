import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { ContractFacility } from "@/lib/facilities/contract";
import {
  DIGITAL_REALTY_EXPECTED_FACILITIES,
  DIGITAL_REALTY_EXPECTED_MARKETS,
  applyDigitalRealtyReviewDecisions,
  canonicalDigitalRealtyFacility,
  classifyProviderPrecision,
  materializeDigitalRealtyQueue,
  projectDigitalRealtyFacilities,
  simplifiedAddressQuery,
  streetLevelFallbackQuery,
  validateDigitalRealtyTranche,
  type DigitalRealtyGeocodeResult,
  type DigitalRealtyReviewDecisions,
} from "@/lib/facilities/digital-realty-tranche";

const source = () => validateDigitalRealtyTranche(JSON.parse(readFileSync(resolve(process.cwd(), "data/map/digital-realty-manual-tranche.v1.json"), "utf8")));
const decisions = () => JSON.parse(readFileSync(resolve(process.cwd(), "data/map/geocoding/digital-realty-review-decisions.v1.json"), "utf8")) as DigitalRealtyReviewDecisions;

function result(researchKey: string, overrides: Partial<DigitalRealtyGeocodeResult> = {}): DigitalRealtyGeocodeResult {
  const queue = materializeDigitalRealtyQueue(source());
  const item = queue.find((candidate) => candidate.researchKey === researchKey)!;
  return {
    researchKey,
    provider: "nominatim",
    query: item.query,
    originalLocation: item.address,
    originalSources: [{ label: `Digital Realty ${item.market}`, url: item.sourceUrl }],
    returnedFormattedAddress: item.address,
    latitude: 50,
    longitude: 8,
    providerCategory: "building",
    providerType: "building",
    providerImportance: 0.5,
    outcome: "geocoded_ready",
    outcomeReason: "fixture",
    coordinatePrecision: "building",
    geocodedAt: "2026-09-21T00:00:00.000Z",
    rawResult: { place_id: 1, lat: "50", lon: "8", display_name: item.address, addresstype: "building", address: { country_code: item.countryCode.toLowerCase() } },
    parentLocationId: item.parentLocationId,
    facilityCode: item.facilityCode,
    market: item.market,
    countryName: item.countryName,
    countryCode: item.countryCode,
    sourceUrl: item.sourceUrl,
    selectedQuery: item.query,
    fallbackUsed: false,
    precisionClass: "exact_or_rooftop",
    ...overrides,
  };
}

describe("Digital Realty manual tranche", () => {
  it("materializes the frozen market and physical-facility counts with stable unique IDs", () => {
    const document = source();
    const queue = materializeDigitalRealtyQueue(document);
    expect(document.markets).toHaveLength(DIGITAL_REALTY_EXPECTED_MARKETS);
    expect(queue).toHaveLength(DIGITAL_REALTY_EXPECTED_FACILITIES);
    expect(new Set(queue.map((item) => item.researchKey)).size).toBe(DIGITAL_REALTY_EXPECTED_FACILITIES);
    expect(queue.map((item) => item.researchKey)).toEqual([...queue.map((item) => item.researchKey)].sort());
  });

  it("includes MEX01 at the superseding manually verified address", () => {
    const mex01 = materializeDigitalRealtyQueue(source()).find((item) => item.facilityCode === "MEX01");
    expect(mex01).toMatchObject({
      parentLocationId: "digital-realty-queretaro",
      researchKey: "digital-realty-mex01",
      address: "Camino a Nativitas 800, Colon, Querétaro, Mexico",
    });
  });

  it("applies reviewed facility coordinates to all three Querétaro records", () => {
    const queue = materializeDigitalRealtyQueue(source());
    const unresolved = queue.filter((item) => item.parentLocationId === "digital-realty-queretaro")
      .map((item) => result(item.researchKey, { outcome: "geocode_no_match", latitude: null, longitude: null, rawResult: null, precisionClass: "unresolved" }));
    const allDecisions = decisions();
    const reviewed = applyDigitalRealtyReviewDecisions(unresolved, {
      ...allDecisions,
      decisions: allDecisions.decisions.filter((decision) => decision.researchKey.startsWith("digital-realty-mex")),
    });
    expect(reviewed).toHaveLength(3);
    expect(reviewed.every((item) => item.outcome === "geocoded_ready" && item.latitude !== null && item.longitude !== null)).toBe(true);
    expect(reviewed.find((item) => item.facilityCode === "MEX01")).toMatchObject({ latitude: 20.593235, longitude: -100.164375 });
    expect(reviewed.find((item) => item.facilityCode === "MEX03")?.coordinatePrecision).toBe("campus");
  });

  it("preserves distinct facility codes at shared addresses", () => {
    const queue = materializeDigitalRealtyQueue(source());
    const pairs = [["digital-realty-bru3", "digital-realty-bru4"], ["digital-realty-sp05", "digital-realty-sp06"], ["digital-realty-vin01", "digital-realty-vin02"]];
    for (const [leftKey, rightKey] of pairs) {
      const left = queue.find((item) => item.researchKey === leftKey)!;
      const right = queue.find((item) => item.researchKey === rightKey)!;
      expect(left.address).toBe(right.address);
      expect(left.facilityCode).not.toBe(right.facilityCode);
      expect(left.researchKey).not.toBe(right.researchKey);
    }
  });

  it("uses the full verified address first and only strips building notation for fallback", () => {
    const address = "Louis-Häfliger-Gasse 10, Building 2, Vienna 1210, Austria";
    expect(simplifiedAddressQuery(address)).toBe("Louis-Häfliger-Gasse 10, Vienna 1210, Austria");
    expect(simplifiedAddressQuery("Mercuriusstraat 27, 1930 Zaventem, Belgium")).toBeNull();
  });

  it("derives a Querétaro street fallback from each facility's own supplied address", () => {
    const document = source();
    const market = document.markets.find((item) => item.parentLocationId === "digital-realty-queretaro")!;
    const queries = market.facilities.map((facility) => streetLevelFallbackQuery(facility, market));
    expect(queries).toEqual([
      "Camino a Nativitas, Colón, Querétaro, Mexico",
      "Carretera Estatal 100, Colón, Querétaro, Mexico",
      "Ejido San Vicente, Colón, Querétaro, Mexico",
    ]);
  });

  it("classifies centroids as lower precision and roads as street precision", () => {
    expect(classifyProviderPrecision({ place_id: 1, lat: "1", lon: "2", display_name: "x", addresstype: "city" })).toEqual({ coordinatePrecision: "street", precisionClass: "lower_precision" });
    expect(classifyProviderPrecision({ place_id: 2, lat: "1", lon: "2", display_name: "x", addresstype: "road" })).toEqual({ coordinatePrecision: "street", precisionClass: "interpolated_or_street" });
  });

  it("preserves code, parent market, address, operator, and human-verification evidence", () => {
    const queue = materializeDigitalRealtyQueue(source());
    const item = queue.find((candidate) => candidate.researchKey === "digital-realty-fra1")!;
    const facility = canonicalDigitalRealtyFacility(item, result(item.researchKey));
    expect(facility.operatorName).toBe("Digital Realty");
    expect(facility.location.streetAddress).toBe(item.address);
    expect(facility.aliases).toEqual(expect.arrayContaining([
      expect.objectContaining({ alias: "FRA1" }),
      expect.objectContaining({ alias: "digital-realty-frankfurt" }),
    ]));
    expect(facility.evidence[0]?.verificationState).toBe("human_verified");
  });

  it("is idempotent, excludes unresolved records, and never removes unrelated facilities", () => {
    const queue = materializeDigitalRealtyQueue(source());
    const unrelated = {
      researchKey: "unrelated-facility",
      canonicalName: "Unrelated",
      category: "data_center",
      location: {},
      evidence: [],
      quality: { confidence: "medium" },
      requestedPublicationState: "review_required",
    } satisfies ContractFacility;
    const ready = result("digital-realty-mex01");
    const unresolved = result("digital-realty-mex02", { outcome: "geocode_no_match", latitude: null, longitude: null, rawResult: null, precisionClass: "unresolved" });
    const first = projectDigitalRealtyFacilities([unrelated], queue, [ready, unresolved]);
    expect(first).toMatchObject({ inserted: 1, updated: 0, excluded: 1, unchangedOutsideTranche: 1 });
    expect(first.facilities.find((facility) => facility.researchKey === unrelated.researchKey)).toEqual(unrelated);
    expect(first.facilities.some((facility) => facility.researchKey === "digital-realty-mex02")).toBe(false);
    const second = projectDigitalRealtyFacilities(first.facilities, queue, [ready, unresolved]);
    expect(second).toMatchObject({ inserted: 0, updated: 1, excluded: 1, unchangedOutsideTranche: 1 });
    expect(second.facilities).toEqual(first.facilities);
  });
});
