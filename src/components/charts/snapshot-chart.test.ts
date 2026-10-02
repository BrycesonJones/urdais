import { describe, expect, it } from "vitest";

import { snapshotTickIndexes } from "@/components/charts/snapshot-chart";

describe("snapshotTickIndexes", () => {
  it("uses only the two real observations for a sparse 1D daily series", () => {
    expect(snapshotTickIndexes(2, 5)).toEqual([0, 1]);
  });

  it("never returns duplicate indexes when the requested tick count exceeds the data", () => {
    const ticks = snapshotTickIndexes(3, 5);
    expect(ticks).toEqual([0, 1, 2]);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("keeps a normal week evenly spaced without duplicate endpoints", () => {
    const ticks = snapshotTickIndexes(8, 5);
    expect(ticks).toEqual([0, 2, 4, 5, 7]);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(7);
  });

  it("returns no ticks when there is not enough data to draw a line", () => {
    expect(snapshotTickIndexes(1, 5)).toEqual([]);
  });
});
