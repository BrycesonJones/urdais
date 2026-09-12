import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAP_VISIBILITY,
  FALLBACK_POINT_COLOR,
  MAP_VISIBILITY_GROUPS,
  filterPointCollection,
  visibilityGroupOf,
  MAP_LEGEND_ROWS,
  MAP_POINT_CATEGORIES,
  MAP_POINT_CATEGORY_COLORS,
  MAP_POINT_CATEGORY_LABELS,
  MAP_POINT_STATUSES,
  POINT_COLOR_EXPRESSION,
  UNMAPPED_POINT_COLOR,
  isMapPointCategory,
  isMapPointStatus,
} from "@/components/map/map-point-style";

describe("map point style", () => {
  it("knows exactly the mapped and unmapped statuses", () => {
    expect(MAP_POINT_STATUSES).toEqual(["mapped", "unmapped"]);
    expect(isMapPointStatus("mapped")).toBe(true);
    expect(isMapPointStatus("partial")).toBe(false);
    expect(isMapPointStatus(undefined)).toBe(false);
  });

  it("knows exactly the four infrastructure categories", () => {
    expect(MAP_POINT_CATEGORIES).toEqual(["data_center", "compute_cluster", "power_infrastructure", "semiconductor_fab"]);
    for (const category of MAP_POINT_CATEGORIES) expect(isMapPointCategory(category)).toBe(true);
    expect(isMapPointCategory("gpu")).toBe(false);
    expect(isMapPointCategory("transformer")).toBe(false);
    expect(isMapPointCategory("")).toBe(false);
    expect(isMapPointCategory(undefined)).toBe(false);
    expect(isMapPointCategory(3)).toBe(false);
  });

  it("gives every category a distinct colour and a readable label, and keeps unmapped exactly black", () => {
    const colours = MAP_POINT_CATEGORIES.map((category) => MAP_POINT_CATEGORY_COLORS[category]);
    expect(new Set(colours).size).toBe(4);
    expect(colours).not.toContain(UNMAPPED_POINT_COLOR);
    expect(UNMAPPED_POINT_COLOR).toBe("#000000");
    expect(MAP_POINT_CATEGORY_LABELS).toEqual({
      data_center: "Data Center",
      compute_cluster: "Compute Cluster",
      power_infrastructure: "Power Infrastructure",
      semiconductor_fab: "Semiconductor Fab",
    });
  });

  it("checks mapping status first, then matches every category to its colour with a fallback", () => {
    expect(POINT_COLOR_EXPRESSION).toEqual([
      "case",
      ["==", ["get", "mappingStatus"], "unmapped"],
      UNMAPPED_POINT_COLOR,
      [
        "match",
        ["get", "category"],
        "data_center",
        MAP_POINT_CATEGORY_COLORS.data_center,
        "compute_cluster",
        MAP_POINT_CATEGORY_COLORS.compute_cluster,
        "power_infrastructure",
        MAP_POINT_CATEGORY_COLORS.power_infrastructure,
        "semiconductor_fab",
        MAP_POINT_CATEGORY_COLORS.semiconductor_fab,
        FALLBACK_POINT_COLOR,
      ],
    ]);
  });

  it("derives the visibility groups from the taxonomy, all on by default", () => {
    expect(MAP_VISIBILITY_GROUPS).toEqual(["data_center", "compute_cluster", "power_infrastructure", "semiconductor_fab", "unmapped"]);
    expect(DEFAULT_MAP_VISIBILITY).toEqual({ data_center: true, compute_cluster: true, power_infrastructure: true, semiconductor_fab: true, unmapped: true });
    expect(Object.isFrozen(DEFAULT_MAP_VISIBILITY)).toBe(true);
  });

  it("resolves a feature's visibility group from its properties", () => {
    expect(visibilityGroupOf({ mappingStatus: "unmapped" })).toBe("unmapped");
    expect(visibilityGroupOf({ mappingStatus: "unmapped", category: "data_center" })).toBe("unmapped");
    expect(visibilityGroupOf({ mappingStatus: "mapped", category: "power_infrastructure" })).toBe("power_infrastructure");
    expect(visibilityGroupOf({ mappingStatus: "mapped" })).toBeNull();
    expect(visibilityGroupOf({ mappingStatus: "mapped", category: "gpu" })).toBeNull();
    expect(visibilityGroupOf(null)).toBeNull();
  });

  it("lists the legend as the four categories then Unmapped, from the same tables", () => {
    expect(MAP_LEGEND_ROWS.map((row) => row.label)).toEqual(["Data Center", "Compute Cluster", "Power Infrastructure", "Semiconductor Fab", "Unmapped"]);
    expect(MAP_LEGEND_ROWS.map((row) => row.color)).toEqual([...MAP_POINT_CATEGORIES.map((category) => MAP_POINT_CATEGORY_COLORS[category]), UNMAPPED_POINT_COLOR]);
    expect(MAP_LEGEND_ROWS.map((row) => row.label)).not.toContain("Mapped");
  });
});

describe("filterPointCollection", () => {
  const feature = (id: string, properties: Record<string, unknown>) => ({ type: "Feature" as const, id, geometry: { type: "Point" as const, coordinates: [0, 0] }, properties });
  const collection = {
    type: "FeatureCollection" as const,
    features: [
      feature("a", { name: "A", mappingStatus: "mapped", category: "data_center" }),
      feature("b", { name: "B", mappingStatus: "mapped", category: "compute_cluster" }),
      feature("c", { name: "C", mappingStatus: "mapped", category: "power_infrastructure" }),
      feature("d", { name: "D", mappingStatus: "mapped", category: "semiconductor_fab" }),
      feature("e", { name: "E", mappingStatus: "unmapped" }),
    ],
  } as unknown as Parameters<typeof filterPointCollection>[0];
  const ids = (visibility: Partial<Record<(typeof MAP_VISIBILITY_GROUPS)[number], boolean>>) => filterPointCollection(collection, { ...DEFAULT_MAP_VISIBILITY, ...visibility }).features.map((item) => item.id);

  it("keeps every feature when all groups are enabled, in order", () => {
    expect(ids({})).toEqual(["a", "b", "c", "d", "e"]);
  });

  it.each([
    ["data_center", ["b", "c", "d", "e"]],
    ["compute_cluster", ["a", "c", "d", "e"]],
    ["power_infrastructure", ["a", "b", "d", "e"]],
    ["semiconductor_fab", ["a", "b", "c", "e"]],
    ["unmapped", ["a", "b", "c", "d"]],
  ] as const)("disabling %s drops only that group", (group, remaining) => {
    expect(ids({ [group]: false })).toEqual(remaining);
  });

  it("supports several groups off at once and an empty result when all are off", () => {
    expect(ids({ data_center: false, semiconductor_fab: false, unmapped: false })).toEqual(["b", "c"]);
    expect(ids({ data_center: false, compute_cluster: false, power_infrastructure: false, semiconductor_fab: false, unmapped: false })).toEqual([]);
  });

  it("does not mutate the input and drops features with no valid group", () => {
    const withBad = { ...collection, features: [...collection.features, feature("z", { name: "Z", mappingStatus: "mapped" })] } as typeof collection;
    const before = JSON.stringify(withBad);
    const out = filterPointCollection(withBad, DEFAULT_MAP_VISIBILITY);
    expect(out.features.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(JSON.stringify(withBad)).toBe(before);
    expect(out).not.toBe(withBad);
  });
});
