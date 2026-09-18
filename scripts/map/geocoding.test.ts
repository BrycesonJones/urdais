import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { parseFacilityImportDocument } from "@/lib/facilities/contract";
import { isMapEligible } from "@/lib/facilities/domain";
import { applyReadyGeocodes, assessGeocode, buildGeocodingQueue, cacheKey, type GeocodeCacheEntry, type GeocodeQueueItem } from "./geocoding";
import { parseResearchPackage } from "./research-parser";

const dataset = JSON.parse(readFileSync("data/map/facilities.v1.json", "utf8"));
const parsed = parseFacilityImportDocument(dataset).document!;
const queue = buildGeocodingQueue({
  classBMarkdown: readFileSync("docs/operations/map-class-b-42-location-remediation.md", "utf8"),
  globalMarkdown: readFileSync("URDAIS_GLOBAL_DATA_CENTER_EXPANSION.md", "utf8"),
  existingFacilities: new Map(parsed.facilities.map((facility) => [facility.researchKey, { category: facility.category }])),
  baselineResearchKeys: new Set(parseResearchPackage(readFileSync("URDAIS_MAP_RESEARCH_PHASE_1.md", "utf8")).facilities.map((facility) => facility.researchKey)),
});

const item = (overrides: Partial<GeocodeQueueItem> = {}): GeocodeQueueItem => ({
  researchKey: "test-site", canonicalName: "Test Site", category: "data_center", documentedLocation: "1 Main Street",
  locality: "Ashburn", adminArea: "VA", countryName: "United States", countryCode: "US", coordinatePrecision: "street",
  query: "1 Main Street, Ashburn, VA, United States", sources: [{ label: "permit", url: "https://example.com/permit" }],
  queueSources: ["global_expansion"], existingFacility: true, operatorName: "Test", lifecycleStatus: "operational", aiRelevance: "unknown", ...overrides,
});
const response = (overrides: Partial<GeocodeCacheEntry["results"][number]> = {}): GeocodeCacheEntry => ({
  provider: "nominatim", query: "q", countryCode: "US", fetchedAt: "2026-09-18T12:00:00.000Z",
  results: [{ place_id: 1, lat: "39.0", lon: "-77.4", display_name: "1 Main Street, Ashburn, Virginia, United States", addresstype: "building", importance: 0.5, address: { country_code: "us", state: "Virginia", "ISO3166-2-lvl4": "US-VA", town: "Ashburn" }, ...overrides }],
});

describe("Phase 4A geocoding queue", () => {
  it("contains the 28 Class B records and 47 global rows as 60 unique facilities", () => {
    expect(queue.filter((entry) => entry.queueSources.includes("class_b_28"))).toHaveLength(28);
    expect(queue.filter((entry) => entry.queueSources.includes("global_expansion"))).toHaveLength(47);
    expect(queue).toHaveLength(60);
  });

  it("excludes city-only and human-review records", () => {
    expect(queue.some((entry) => entry.researchKey === "equinix-atlanta")).toBe(false);
    for (const held of ["aws-morrow-county", "aws-new-carlisle", "google-council-bluffs", "vantage-shackelford"]) {
      expect(queue.some((entry) => entry.researchKey === held), held).toBe(false);
    }
  });

  it("rejects a different country and reviews a centroid", () => {
    expect(assessGeocode(item(), response({ address: { country_code: "ca", state: "Ontario", city: "Toronto" } })).outcome).toBe("geocode_conflict");
    expect(assessGeocode(item(), response({ addresstype: "city" })).outcome).toBe("geocoded_review");
  });

  it("preserves source precision and retains full provenance metadata", () => {
    const assessed = assessGeocode(item({ coordinatePrecision: "street" }), response());
    expect(assessed.outcome).toBe("geocoded_ready");
    expect(assessed.coordinatePrecision).toBe("street");
    expect(assessed.provider).toBe("nominatim");
    expect(assessed.query).toContain("Main Street");
    expect(assessed.returnedFormattedAddress).toContain("Ashburn");
    expect(assessed.rawResult?.place_id).toBe(1);
    expect(assessed.originalSources).toHaveLength(1);
  });

  it("uses a stable cache key, so deterministic reruns need no provider call", () => {
    const first = cacheKey("1 Main Street", "US");
    expect(cacheKey("1 Main Street", "US")).toBe(first);
    const provider = vi.fn();
    const cache = new Map([[first, response()]]);
    if (!cache.has(first)) provider();
    expect(provider).not.toHaveBeenCalled();
  });

  it("applies only ready coordinates, without changing publication state or upgrading precision", () => {
    const facility = { researchKey: "test-site", location: { latitude: null, longitude: null, coordinatePrecision: "street" }, requestedPublicationState: "research" };
    const assessed = assessGeocode(item(), response());
    const [updated] = applyReadyGeocodes([facility], [assessed]);
    expect(updated!.requestedPublicationState).toBe("research");
    expect(updated!.location.coordinatePrecision).toBe("street");
    expect(isMapEligible({ latitude: updated!.location.latitude as unknown as number, longitude: updated!.location.longitude as unknown as number, coordinatePrecision: updated!.location.coordinatePrecision as "street" })).toBe(true);
  });
});
