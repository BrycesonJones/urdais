import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAP_VISIBILITY,
  FALLBACK_POINT_COLOR,
  MAP_VISIBILITY_GROUPS,
  buildPointFilter,
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

describe("buildPointFilter", () => {
  const filterFor = (visibility: Partial<Record<(typeof MAP_VISIBILITY_GROUPS)[number], boolean>>) => buildPointFilter({ ...DEFAULT_MAP_VISIBILITY, ...visibility });
  const enabledList = (filter: unknown) => (((filter as unknown[][])[2] as unknown[][])[2]![2] as unknown[])[1] as unknown[];
  const unmappedFlag = (filter: unknown) => ((filter as unknown[][])[1] as unknown[])[2];

  it("shows every group when all are enabled", () => {
    const filter = filterFor({});
    expect(filter).toEqual([
      "any",
      ["all", ["==", ["get", "mappingStatus"], "unmapped"], true],
      ["all", ["==", ["get", "mappingStatus"], "mapped"], ["in", ["get", "category"], ["literal", ["data_center", "compute_cluster", "power_infrastructure", "semiconductor_fab"]]]],
    ]);
  });

  it.each([
    ["data_center", ["compute_cluster", "power_infrastructure", "semiconductor_fab"]],
    ["compute_cluster", ["data_center", "power_infrastructure", "semiconductor_fab"]],
    ["power_infrastructure", ["data_center", "compute_cluster", "semiconductor_fab"]],
    ["semiconductor_fab", ["data_center", "compute_cluster", "power_infrastructure"]],
  ] as const)("disabling %s excludes only that category and leaves unmapped alone", (group, remaining) => {
    const filter = filterFor({ [group]: false });
    expect(enabledList(filter)).toEqual(remaining);
    expect(unmappedFlag(filter)).toBe(true);
  });

  it("disabling Unmapped excludes only unmapped points", () => {
    const filter = filterFor({ unmapped: false });
    expect(unmappedFlag(filter)).toBe(false);
    expect(enabledList(filter)).toEqual(["data_center", "compute_cluster", "power_infrastructure", "semiconductor_fab"]);
  });

  it("supports several categories off at once", () => {
    const filter = filterFor({ data_center: false, semiconductor_fab: false });
    expect(enabledList(filter)).toEqual(["compute_cluster", "power_infrastructure"]);
  });

  it("with everything off still yields a valid expression that matches nothing", () => {
    const filter = filterFor({ data_center: false, compute_cluster: false, power_infrastructure: false, semiconductor_fab: false, unmapped: false });
    expect(unmappedFlag(filter)).toBe(false);
    expect(enabledList(filter)).toEqual([]);
    expect((filter as unknown[])[0]).toBe("any");
  });
});
