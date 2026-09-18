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
  POINT_COLOR_EXPRESSION,
  isMapPointCategory,
} from "@/components/map/map-point-style";
import { FACILITY_CATEGORIES } from "@/lib/facilities/domain";

describe("map point style", () => {
  it("knows exactly the four infrastructure categories, and takes them from the facility taxonomy", () => {
    expect(MAP_POINT_CATEGORIES).toEqual(["data_center", "gpu_compute_cluster", "power_infrastructure", "semiconductor_fab"]);
    expect(MAP_POINT_CATEGORIES).toBe(FACILITY_CATEGORIES);
    for (const category of MAP_POINT_CATEGORIES) expect(isMapPointCategory(category)).toBe(true);
    expect(isMapPointCategory("gpu")).toBe(false);
    expect(isMapPointCategory("transformer")).toBe(false);
    expect(isMapPointCategory("")).toBe(false);
    expect(isMapPointCategory(undefined)).toBe(false);
    expect(isMapPointCategory(3)).toBe(false);
  });

  it("no longer accepts the retired compute_cluster value", () => {
    // The rename is the taxonomy change this phase settled: the category is
    // GPU compute clusters, and the old broader name must not resolve.
    expect(isMapPointCategory("compute_cluster")).toBe(false);
    expect(MAP_POINT_CATEGORIES).not.toContain("compute_cluster");
  });

  it("gives every category a distinct colour and its public label", () => {
    const colours = MAP_POINT_CATEGORIES.map((category) => MAP_POINT_CATEGORY_COLORS[category]);
    expect(new Set(colours).size).toBe(4);
    expect(MAP_POINT_CATEGORY_LABELS).toEqual({
      data_center: "Data Center",
      gpu_compute_cluster: "GPU Compute Cluster",
      power_infrastructure: "Power Infrastructure",
      semiconductor_fab: "Semiconductor Fab",
    });
  });

  it("matches every category to its colour with a fallback, and reads no other property", () => {
    expect(POINT_COLOR_EXPRESSION).toEqual([
      "match",
      ["get", "category"],
      "data_center",
      MAP_POINT_CATEGORY_COLORS.data_center,
      "gpu_compute_cluster",
      MAP_POINT_CATEGORY_COLORS.gpu_compute_cluster,
      "power_infrastructure",
      MAP_POINT_CATEGORY_COLORS.power_infrastructure,
      "semiconductor_fab",
      MAP_POINT_CATEGORY_COLORS.semiconductor_fab,
      FALLBACK_POINT_COLOR,
    ]);
    // Every point on the map is a published facility, so there is no mapping
    // status left for the colour to branch on.
    expect(JSON.stringify(POINT_COLOR_EXPRESSION)).not.toContain("mappingStatus");
  });

  it("derives the visibility groups from the taxonomy, all on by default", () => {
    expect(MAP_VISIBILITY_GROUPS).toEqual(["data_center", "gpu_compute_cluster", "power_infrastructure", "semiconductor_fab"]);
    expect(DEFAULT_MAP_VISIBILITY).toEqual({
      data_center: true,
      gpu_compute_cluster: true,
      power_infrastructure: true,
      semiconductor_fab: true,
    });
    expect(Object.isFrozen(DEFAULT_MAP_VISIBILITY)).toBe(true);
  });

  it("resolves a feature's visibility group from its category alone", () => {
    expect(visibilityGroupOf({ category: "power_infrastructure" })).toBe("power_infrastructure");
    expect(visibilityGroupOf({ category: "gpu_compute_cluster" })).toBe("gpu_compute_cluster");
    expect(visibilityGroupOf({})).toBeNull();
    expect(visibilityGroupOf({ category: "gpu" })).toBeNull();
    expect(visibilityGroupOf(null)).toBeNull();
  });

  it("lists the legend as the four categories and nothing else", () => {
    // "Unmapped" was a data-quality state wearing the clothes of an
    // infrastructure type. Whether a record is ready is a publication decision
    // in the database now, and an unpublished facility is simply absent.
    expect(MAP_LEGEND_ROWS.map((row) => row.label)).toEqual([
      "Data Center",
      "GPU Compute Cluster",
      "Power Infrastructure",
      "Semiconductor Fab",
    ]);
    expect(MAP_LEGEND_ROWS.map((row) => row.color)).toEqual(MAP_POINT_CATEGORIES.map((category) => MAP_POINT_CATEGORY_COLORS[category]));
    expect(MAP_LEGEND_ROWS.map((row) => row.label)).not.toContain("Unmapped");
    expect(MAP_LEGEND_ROWS.map((row) => row.label)).not.toContain("Mapped");
  });
});

describe("filterPointCollection", () => {
  const feature = (id: string, properties: Record<string, unknown>) => ({ type: "Feature" as const, id, geometry: { type: "Point" as const, coordinates: [0, 0] }, properties });
  const collection = {
    type: "FeatureCollection" as const,
    features: [
      feature("a", { name: "A", category: "data_center" }),
      feature("b", { name: "B", category: "gpu_compute_cluster" }),
      feature("c", { name: "C", category: "power_infrastructure" }),
      feature("d", { name: "D", category: "semiconductor_fab" }),
    ],
  } as unknown as Parameters<typeof filterPointCollection>[0];
  const ids = (visibility: Partial<Record<(typeof MAP_VISIBILITY_GROUPS)[number], boolean>>) =>
    filterPointCollection(collection, { ...DEFAULT_MAP_VISIBILITY, ...visibility }).features.map((item) => item.id);

  it("keeps every feature when all groups are enabled, in order", () => {
    expect(ids({})).toEqual(["a", "b", "c", "d"]);
  });

  it.each([
    ["data_center", ["b", "c", "d"]],
    ["gpu_compute_cluster", ["a", "c", "d"]],
    ["power_infrastructure", ["a", "b", "d"]],
    ["semiconductor_fab", ["a", "b", "c"]],
  ] as const)("disabling %s drops only that group", (group, remaining) => {
    expect(ids({ [group]: false })).toEqual(remaining);
  });

  it("supports several groups off at once and an empty result when all are off", () => {
    expect(ids({ data_center: false, semiconductor_fab: false })).toEqual(["b", "c"]);
    expect(ids({ data_center: false, gpu_compute_cluster: false, power_infrastructure: false, semiconductor_fab: false })).toEqual([]);
  });

  it("does not mutate the input and drops features with no valid group", () => {
    const withBad = { ...collection, features: [...collection.features, feature("z", { name: "Z" })] } as typeof collection;
    const before = JSON.stringify(withBad);
    const out = filterPointCollection(withBad, DEFAULT_MAP_VISIBILITY);
    expect(out.features.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(JSON.stringify(withBad)).toBe(before);
    expect(out).not.toBe(withBad);
  });
});
