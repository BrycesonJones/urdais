import { describe, expect, it } from "vitest";

import { hasIntradayCadence } from "@/components/market/ucpi-chart";
import type { TimeSeriesPoint } from "@/types/market";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

function points(times: number[]): TimeSeriesPoint[] {
  return times.map((time, index) => ({ time, value: 3 + index / 10 }));
}

describe("hasIntradayCadence", () => {
  it("keeps daily production observations on date labels for a 1D view", () => {
    expect(hasIntradayCadence(points([0, DAY]))).toBe(false);
  });

  it("keeps a daily week on date labels even when publication times vary", () => {
    expect(
      hasIntradayCadence(points([0, DAY + HOUR, 2 * DAY, 3 * DAY + 2 * HOUR, 4 * DAY, 5 * DAY, 6 * DAY])),
    ).toBe(false);
  });

  it("uses clock labels for genuinely intraday observations", () => {
    expect(hasIntradayCadence(points([0, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR]))).toBe(true);
  });

  it("does not infer intraday cadence from one point", () => {
    expect(hasIntradayCadence(points([0]))).toBe(false);
  });
});
