import { describe, expect, it } from "vitest";

import { MAPPED_POINT_COLOR, MAP_POINT_STATUSES, MAP_POINT_STATUS_COLOR, POINT_COLOR_EXPRESSION, UNMAPPED_POINT_COLOR, isMapPointStatus } from "@/components/map/map-point-style";

describe("map point style", () => {
  it("knows exactly the mapped and unmapped statuses", () => {
    expect(MAP_POINT_STATUSES).toEqual(["mapped", "unmapped"]);
    expect(isMapPointStatus("mapped")).toBe(true);
    expect(isMapPointStatus("unmapped")).toBe(true);
    expect(isMapPointStatus("partial")).toBe(false);
    expect(isMapPointStatus(undefined)).toBe(false);
    expect(isMapPointStatus(true)).toBe(false);
  });

  it("paints unmapped black and mapped with the single temporary colour", () => {
    expect(UNMAPPED_POINT_COLOR).toBe("#000000");
    expect(MAP_POINT_STATUS_COLOR).toEqual({ mapped: MAPPED_POINT_COLOR, unmapped: UNMAPPED_POINT_COLOR });
    expect(MAPPED_POINT_COLOR).not.toBe(UNMAPPED_POINT_COLOR);
  });

  it("drives the circle colour from mappingStatus, with unmapped as the fallback", () => {
    expect(POINT_COLOR_EXPRESSION).toEqual(["match", ["get", "mappingStatus"], "mapped", MAPPED_POINT_COLOR, UNMAPPED_POINT_COLOR]);
  });
});
