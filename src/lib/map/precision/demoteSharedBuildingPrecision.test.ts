/**
 * The shared-point rule, which exists because a coordinate two facilities share
 * cannot establish either building.
 */
import { describe, expect, it } from "vitest";

import { demoteSharedBuildingPrecision, type SharedPointResult } from "@/lib/map/precision/demoteSharedBuildingPrecision";

const result = (overrides: Partial<SharedPointResult> & { researchKey: string }): SharedPointResult => ({
  latitude: 51.5217361,
  longitude: -0.0730612,
  coordinatePrecision: "building",
  precisionClass: "exact_or_rooftop",
  outcomeReason: "Geocoded.",
  ...overrides,
});

describe("demoteSharedBuildingPrecision", () => {
  it("lowers building to street where two facilities sit on one point", () => {
    const { results, demoted } = demoteSharedBuildingPrecision([result({ researchKey: "a" }), result({ researchKey: "b" })]);
    expect(demoted).toEqual(["a", "b"]);
    for (const row of results) {
      expect(row.coordinatePrecision).toBe("street");
      expect(row.precisionClass).toBe("interpolated_or_street");
      expect(row.outcomeReason).toContain("locates the property rather than this named building");
    }
  });

  it("never moves a coordinate", () => {
    const input = [result({ researchKey: "a" }), result({ researchKey: "b" })];
    const { results } = demoteSharedBuildingPrecision(input);
    for (const [index, row] of results.entries()) {
      expect(row.latitude).toBe(input[index]!.latitude);
      expect(row.longitude).toBe(input[index]!.longitude);
    }
  });

  it("leaves a facility alone on a point of its own", () => {
    const { results, demoted } = demoteSharedBuildingPrecision([
      result({ researchKey: "alone" }),
      result({ researchKey: "elsewhere", latitude: 40.1, longitude: -74.2 }),
    ]);
    expect(demoted).toEqual([]);
    expect(results.every((row) => row.coordinatePrecision === "building")).toBe(true);
  });

  it("does not raise a precision that is already lower than building", () => {
    const { results, demoted } = demoteSharedBuildingPrecision([
      result({ researchKey: "a", coordinatePrecision: "campus" }),
      result({ researchKey: "b", coordinatePrecision: "campus" }),
    ]);
    expect(demoted).toEqual([]);
    expect(results.every((row) => row.coordinatePrecision === "campus")).toBe(true);
  });

  it("reports every co-located group, including ones it changed nothing in", () => {
    const { groups } = demoteSharedBuildingPrecision([
      result({ researchKey: "a" }),
      result({ researchKey: "b" }),
      result({ researchKey: "c", coordinatePrecision: "campus", latitude: 1, longitude: 2 }),
      result({ researchKey: "d", coordinatePrecision: "campus", latitude: 1, longitude: 2 }),
    ]);
    expect(groups).toHaveLength(2);
    const campus = groups.find((group) => group.researchKeys.includes("c"));
    expect(campus?.demoted).toEqual([]);
    expect(campus?.researchKeys).toEqual(["c", "d"]);
  });

  it("ignores facilities with no coordinate at all", () => {
    const { demoted, groups } = demoteSharedBuildingPrecision([
      result({ researchKey: "a", latitude: null, longitude: null }),
      result({ researchKey: "b", latitude: null, longitude: null }),
    ]);
    expect(demoted).toEqual([]);
    expect(groups).toEqual([]);
  });
});
