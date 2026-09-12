import { describe, expect, it } from "vitest";

import {
  FALLBACK_POINT_COLOR,
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

  it("lists the legend as the four categories then Unmapped, from the same tables", () => {
    expect(MAP_LEGEND_ROWS.map((row) => row.label)).toEqual(["Data Center", "Compute Cluster", "Power Infrastructure", "Semiconductor Fab", "Unmapped"]);
    expect(MAP_LEGEND_ROWS.map((row) => row.color)).toEqual([...MAP_POINT_CATEGORIES.map((category) => MAP_POINT_CATEGORY_COLORS[category]), UNMAPPED_POINT_COLOR]);
    expect(MAP_LEGEND_ROWS.map((row) => row.label)).not.toContain("Mapped");
  });
});
