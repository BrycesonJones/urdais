/**
 * The UBWI production history: what it reads, what it refuses to read, and what the chart
 * does with each length of it.
 *
 * Every fixture here is hand-written rows, never a generated series. A test that built a
 * plausible-looking UBWI history out of a loop would be the first mock UBWI history in the
 * codebase, and the surface's whole claim is that no such thing exists.
 */
import { describe, expect, it } from "vitest";

import {
  isLowFrequencyRangeAvailable,
  lowFrequencyAvailableRanges,
  lowFrequencyPeriodReturn,
  lowFrequencyWindowPoints,
} from "@/lib/market-ranges";
import { DETAIL_RANGES } from "@/types/market";

import {
  ubwiCurrentRegimePoints,
  ubwiDetailedSeries,
  ubwiHistoryFromRows,
  ubwiSeriesPoints,
  type FrozenUbwiPoint,
} from "./publication-history";

const DAY = 86_400;

/** A frozen production row, shaped exactly as the query selects it. */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    published_at: "2026-09-15T04:33:47.738Z",
    frozen_at: "2026-09-15T04:33:47.738Z",
    superseded_by_id: null,
    published_value_percent: "0.26716309468662236",
    methodology_version: "1.2.0",
    residual_model_version: "1.0.0",
    ...overrides,
  };
}

function point(publishedAt: string, valuePercent: number, versions?: Partial<FrozenUbwiPoint>): FrozenUbwiPoint {
  return {
    publishedAt,
    valuePercent,
    methodologyVersion: "1.2.0",
    residualModelVersion: "1.0.0",
    ...versions,
  };
}

/** Daily points ending at `lastIso`, one per UTC day, values held deliberately distinct. */
function dailyPoints(count: number, lastIso: string): FrozenUbwiPoint[] {
  const last = Date.parse(lastIso) / 1000;
  return Array.from({ length: count }, (_, index) => {
    const time = last - (count - 1 - index) * DAY;
    return point(new Date(time * 1000).toISOString(), 0.26 + index * 0.001);
  });
}

describe("the frozen history loader", () => {
  it("reads the one real production point that exists today", () => {
    // The single frozen point in production on 2026-09-15, verbatim.
    const history = ubwiHistoryFromRows([row()]);
    expect(history).toHaveLength(1);
    expect(history[0]!.valuePercent).toBeCloseTo(0.26716309468662236, 15);
    expect(history[0]!.methodologyVersion).toBe("1.2.0");
    expect(history[0]!.residualModelVersion).toBe("1.0.0");
  });

  it("preserves the methodology and residual-model version of every point", () => {
    const history = ubwiHistoryFromRows([
      row({ methodology_version: "1.1.0", residual_model_version: "1.0.0" }),
      row({ published_at: "2026-09-16T06:00:00.000Z" }),
    ]);
    expect(history.map((p) => p.methodologyVersion)).toEqual(["1.1.0", "1.2.0"]);
  });

  it("excludes an unfrozen row: a publication that did not finish is not history", () => {
    expect(ubwiHistoryFromRows([row({ frozen_at: null })])).toEqual([]);
  });

  it("excludes a superseded point, which is a withdrawn statement", () => {
    expect(
      ubwiHistoryFromRows([row({ superseded_by_id: "7f3f0a2e-0000-4000-8000-000000000001" })]),
    ).toEqual([]);
  });

  it("drops a row whose value cannot be read as a number rather than plotting it at zero", () => {
    expect(ubwiHistoryFromRows([row({ published_value_percent: null })])).toEqual([]);
    expect(ubwiHistoryFromRows([row({ published_value_percent: "not a number" })])).toEqual([]);
  });

  it("returns points oldest first, in the order the query already imposes", () => {
    const history = ubwiHistoryFromRows([
      row({ published_at: "2026-09-15T04:33:47.738Z", published_value_percent: "0.2671" }),
      row({ published_at: "2026-09-16T06:00:00.000Z", published_value_percent: "0.2700" }),
      row({ published_at: "2026-09-17T06:00:00.000Z", published_value_percent: "0.2690" }),
    ]);
    const times = ubwiSeriesPoints(history).map((p) => p.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(history[0]!.valuePercent).toBe(0.2671);
    expect(history[2]!.valuePercent).toBe(0.269);
  });
});

describe("the chart series", () => {
  it("uses publication time in Unix seconds and the published level as the value", () => {
    const series = ubwiSeriesPoints([point("2026-09-15T04:33:47.738Z", 0.26716309468662236)]);
    expect(series).toEqual([
      { time: Math.floor(Date.parse("2026-09-15T04:33:47.738Z") / 1000), value: 0.26716309468662236 },
    ]);
  });

  it("never manufactures an intraday series from daily points", () => {
    // Copying the daily points into `intraday` would light up the 1D and 1W buttons on a
    // series that has no intraday observation in it. It is the exact shortcut this index
    // must not take.
    const series = ubwiDetailedSeries(dailyPoints(10, "2026-09-24T06:00:00.000Z"));
    expect(series.daily).toHaveLength(10);
    expect(series.intraday).toEqual([]);
  });

  it("does not interpolate a day on which nothing was published", () => {
    // September 18 failed; September 19 passed. The series steps over the 18th.
    const history = [
      point("2026-09-17T06:00:00.000Z", 0.2671),
      point("2026-09-19T06:00:00.000Z", 0.2702),
    ];
    const series = ubwiSeriesPoints(history);
    expect(series).toHaveLength(2);
    const dates = series.map((p) => new Date(p.time * 1000).toISOString().slice(0, 10));
    expect(dates).toEqual(["2026-09-17", "2026-09-19"]);
    expect(dates).not.toContain("2026-09-18");
    // And nothing was invented to bridge the gap: both values are the published ones.
    expect(series.map((p) => p.value)).toEqual([0.2671, 0.2702]);
  });
});

describe("the methodology boundary in chart history", () => {
  it("returns the whole history while one regime is published, as today", () => {
    const history = dailyPoints(4, "2026-09-18T06:00:00.000Z");
    expect(ubwiCurrentRegimePoints(history)).toHaveLength(4);
  });

  it("keeps only the current regime, so no line is drawn across two definitions", () => {
    const history = [
      point("2026-09-13T06:00:00.000Z", 0.24, { methodologyVersion: "1.1.0" }),
      point("2026-09-14T06:00:00.000Z", 0.25, { methodologyVersion: "1.1.0" }),
      point("2026-09-15T06:00:00.000Z", 0.2671),
      point("2026-09-16T06:00:00.000Z", 0.2702),
    ];
    const current = ubwiCurrentRegimePoints(history);
    expect(current).toHaveLength(2);
    expect(current.every((p) => p.methodologyVersion === "1.2.0")).toBe(true);
  });

  it("treats a residual-model change as a boundary too", () => {
    const history = [
      point("2026-09-15T06:00:00.000Z", 0.2671, { residualModelVersion: "1.0.0" }),
      point("2026-09-16T06:00:00.000Z", 0.2702, { residualModelVersion: "1.1.0" }),
    ];
    expect(ubwiCurrentRegimePoints(history)).toHaveLength(1);
  });

  it("never produces a return across a boundary, because the crossing point is not in the series", () => {
    const history = [
      point("2026-09-15T06:00:00.000Z", 0.2000, { methodologyVersion: "1.1.0" }),
      point("2026-09-16T06:00:00.000Z", 0.2702),
    ];
    const points = ubwiSeriesPoints(ubwiCurrentRegimePoints(history));
    expect(points).toHaveLength(1);
    // One point supports no range and therefore no return: a +35 % "move" that is really
    // a change of definition can never be computed.
    const asOf = points[0]!.time;
    for (const range of DETAIL_RANGES) {
      expect(lowFrequencyPeriodReturn(points, range, asOf)).toBeNull();
    }
  });
});

describe("chart visibility by history length", () => {
  it("has no history at all with zero production points", () => {
    const points = ubwiSeriesPoints(ubwiHistoryFromRows([]));
    expect(points).toEqual([]);
    expect(lowFrequencyAvailableRanges(points, 0)).toEqual([]);
  });

  it("with one frozen point has a value but no drawable line and no range", () => {
    const points = ubwiSeriesPoints(ubwiHistoryFromRows([row()]));
    expect(points).toHaveLength(1);
    // No flat line is available to be drawn through it, on any range.
    expect(lowFrequencyAvailableRanges(points, points[0]!.time)).toEqual([]);
  });

  it("with two frozen compatible points produces a real two-point series", () => {
    const history = [
      point("2026-09-15T04:33:47.738Z", 0.26716309468662236),
      point("2026-09-16T06:00:00.000Z", 0.2700),
    ];
    const points = ubwiSeriesPoints(history);
    expect(points).toHaveLength(2);
    expect(points[0]!.value).toBeCloseTo(0.26716309468662236, 15);
    expect(points[1]!.value).toBe(0.27);
    expect(points[0]!.time).toBeLessThan(points[1]!.time);
  });
});

describe("range availability grows with real history", () => {
  const asOfIso = "2026-12-15T06:00:00.000Z";
  const asOf = Date.parse(asOfIso) / 1000;

  it("offers nothing on one point", () => {
    expect(lowFrequencyAvailableRanges(ubwiSeriesPoints(dailyPoints(1, asOfIso)), asOf)).toEqual([]);
  });

  it("offers 1D once two consecutive daily points exist, and nothing longer", () => {
    const points = ubwiSeriesPoints(dailyPoints(2, asOfIso));
    expect(lowFrequencyAvailableRanges(points, asOf)).toEqual(["1D"]);
  });

  it("offers 1W after about a week, but not 1M", () => {
    const points = ubwiSeriesPoints(dailyPoints(8, asOfIso));
    const ranges = lowFrequencyAvailableRanges(points, asOf);
    expect(ranges).toContain("1W");
    expect(ranges).not.toContain("1M");
  });

  it("offers 1M after about a month, but not 3M", () => {
    const points = ubwiSeriesPoints(dailyPoints(35, asOfIso));
    const ranges = lowFrequencyAvailableRanges(points, asOf);
    expect(ranges).toContain("1M");
    expect(ranges).not.toContain("3M");
  });

  it("offers every range once a year of daily points exists", () => {
    const points = ubwiSeriesPoints(dailyPoints(400, asOfIso));
    expect(lowFrequencyAvailableRanges(points, asOf)).toEqual([...DETAIL_RANGES]);
  });

  it("never offers a range whose window the history does not reach", () => {
    const points = ubwiSeriesPoints(dailyPoints(3, asOfIso));
    expect(isLowFrequencyRangeAvailable(points, "1Y", asOf)).toBe(false);
    expect(lowFrequencyPeriodReturn(points, "1Y", asOf)).toBeNull();
  });

  it("measures a window return as a relative percentage return, like every other market", () => {
    const points = [
      { time: asOf - DAY, value: 0.2672 },
      { time: asOf, value: 0.2700 },
    ];
    // 0.2672 -> 0.2700 is a +1.05 % relative move, not a +0.0028 percentage-point one.
    expect(lowFrequencyPeriodReturn(points, "1D", asOf)).toBeCloseTo(1.047904, 5);
  });

  it("windows the series without dropping the base observation", () => {
    const points = ubwiSeriesPoints(dailyPoints(30, asOfIso));
    const week = lowFrequencyWindowPoints(points, "1W", asOf);
    expect(week[0]!.time).toBe(asOf - 7 * DAY);
    expect(week[week.length - 1]!.time).toBe(asOf);
    expect(week).toHaveLength(8);
  });
});
