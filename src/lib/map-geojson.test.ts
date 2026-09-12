import { describe, expect, it } from "vitest";

import { buildMapFeatureCollection, isValidLatitude, isValidLongitude } from "@/lib/map-geojson";
import type { UrdaisMapPoint } from "@/types/map";

const atlanta: UrdaisMapPoint = { id: "example-1", name: "Example Point", longitude: -84.388, latitude: 33.749, mappingStatus: "mapped" };
const london: UrdaisMapPoint = { id: "example-2", name: "Second Point", longitude: -0.128, latitude: 51.507, mappingStatus: "unmapped" };

describe("buildMapFeatureCollection", () => {
  it("converts a valid point into a Point feature with [longitude, latitude] and its name", () => {
    expect(buildMapFeatureCollection([atlanta])).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "example-1",
          geometry: { type: "Point", coordinates: [-84.388, 33.749] },
          properties: { name: "Example Point", mappingStatus: "mapped" },
        },
      ],
    });
  });

  it("produces one feature per point, in input order", () => {
    const { features } = buildMapFeatureCollection([atlanta, london]);
    expect(features).toHaveLength(2);
    expect(features.map((feature) => feature.id)).toEqual(["example-1", "example-2"]);
  });

  it("uses the point id as the feature id, identically on every build", () => {
    const first = buildMapFeatureCollection([atlanta, london]);
    const second = buildMapFeatureCollection([atlanta, london]);
    expect(first.features.map((feature) => feature.id)).toEqual(second.features.map((feature) => feature.id));
    expect(first).toEqual(second);
  });

  it("returns an empty collection for no points", () => {
    expect(buildMapFeatureCollection([])).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("accepts the edges of the valid ranges", () => {
    const corners: UrdaisMapPoint[] = [
      { id: "a", name: "A", longitude: -180, latitude: -90, mappingStatus: "mapped" },
      { id: "b", name: "B", longitude: 180, latitude: 90, mappingStatus: "unmapped" },
      { id: "c", name: "C", longitude: 0, latitude: 0, mappingStatus: "mapped" },
    ];
    expect(buildMapFeatureCollection(corners).features).toHaveLength(3);
  });

  it("rejects an invalid longitude and names the point", () => {
    expect(() => buildMapFeatureCollection([{ ...atlanta, longitude: 181 }])).toThrow('Map point "example-1" has an invalid longitude: 181');
    expect(() => buildMapFeatureCollection([{ ...atlanta, longitude: -180.5 }])).toThrow("invalid longitude");
    expect(() => buildMapFeatureCollection([{ ...atlanta, longitude: Number.NaN }])).toThrow("invalid longitude");
  });

  it("rejects an invalid latitude and names the point", () => {
    expect(() => buildMapFeatureCollection([{ ...atlanta, latitude: 90.01 }])).toThrow('Map point "example-1" has an invalid latitude: 90.01');
    expect(() => buildMapFeatureCollection([{ ...atlanta, latitude: -91 }])).toThrow("invalid latitude");
    expect(() => buildMapFeatureCollection([{ ...atlanta, latitude: Number.POSITIVE_INFINITY }])).toThrow("invalid latitude");
  });

  it("rejects a missing or duplicated id, so feature ids stay stable and unique", () => {
    expect(() => buildMapFeatureCollection([{ ...atlanta, id: "" }])).toThrow('Map point "Example Point" has no id');
    expect(() => buildMapFeatureCollection([atlanta, { ...london, id: "example-1" }])).toThrow('Map point id "example-1" is used more than once');
  });

  it("preserves each point's mapping status in its properties", () => {
    const { features } = buildMapFeatureCollection([atlanta, london]);
    expect(features.map((feature) => feature.properties.mappingStatus)).toEqual(["mapped", "unmapped"]);
  });

  it("carries operator and location into properties only when the point has them", () => {
    const withProfile = buildMapFeatureCollection([{ ...atlanta, operator: "Demo Operator", location: "Atlanta, Georgia, USA" }]);
    expect(withProfile.features[0]?.properties).toEqual({ name: "Example Point", mappingStatus: "mapped", operator: "Demo Operator", location: "Atlanta, Georgia, USA" });
    const partial = buildMapFeatureCollection([{ ...london, location: "London, United Kingdom" }]);
    expect(partial.features[0]?.properties).toEqual({ name: "Second Point", mappingStatus: "unmapped", location: "London, United Kingdom" });
    expect(buildMapFeatureCollection([atlanta]).features[0]?.properties).not.toHaveProperty("operator");
    expect(buildMapFeatureCollection([atlanta]).features[0]?.properties).not.toHaveProperty("location");
  });

  it("rejects blank or non-string profile metadata", () => {
    expect(() => buildMapFeatureCollection([{ ...atlanta, operator: "  " }])).toThrow('Map point "example-1" has an invalid operator');
    expect(() => buildMapFeatureCollection([{ ...atlanta, location: 42 as unknown as string }])).toThrow('Map point "example-1" has an invalid location: 42');
  });

  it("rejects a mapping status outside the known set at runtime, even if the types were bypassed", () => {
    const partial = { ...atlanta, mappingStatus: "partial" } as unknown as UrdaisMapPoint;
    expect(() => buildMapFeatureCollection([partial])).toThrow('Map point "example-1" has an unknown mapping status: partial');
    const missing = { ...atlanta, mappingStatus: undefined } as unknown as UrdaisMapPoint;
    expect(() => buildMapFeatureCollection([missing])).toThrow("unknown mapping status");
  });

  it("does not build a partial collection when a later point is invalid", () => {
    expect(() => buildMapFeatureCollection([atlanta, { ...london, latitude: 100 }])).toThrow();
  });
});

describe("coordinate predicates", () => {
  it("bound longitude to −180…180 and latitude to −90…90", () => {
    expect([-180, 0, 180].every(isValidLongitude)).toBe(true);
    expect([-180.001, 180.001, Number.NaN].some(isValidLongitude)).toBe(false);
    expect([-90, 0, 90].every(isValidLatitude)).toBe(true);
    expect([-90.001, 90.001, Number.NEGATIVE_INFINITY].some(isValidLatitude)).toBe(false);
  });
});
