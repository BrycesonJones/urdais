import { describe, expect, it } from "vitest";

import { availableRanges, isRangeAvailable, periodReturn, rangeStart, windowPoints } from "@/lib/market-ranges";
import type { DetailedSeries, TimeSeriesPoint } from "@/types/market";

const day = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
const iso = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(0, 10);

/** Daily points across an inclusive UTC span, with an optional date omitted. */
function dailyPoints(from: string, to: string, omit: readonly string[] = []): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  for (let t = day(from); t <= day(to); t += 86_400) {
    const date = iso(t);
    if (omit.includes(date)) continue;
    points.push({ time: t, value: 1_000 + points.length });
  }
  return points;
}

/** A UTVI-shaped series: daily closes and no fine tail, because none exists to have. */
const dailyOnly = (from: string, to: string, omit: readonly string[] = []): DetailedSeries => ({
  daily: dailyPoints(from, to, omit),
  intraday: [],
});

/** An instrument that does have a fine tail, like the mock-driven compute markets. */
function withIntraday(from: string, to: string): DetailedSeries {
  const daily = dailyPoints(from, to);
  const last = daily[daily.length - 1]!.time;
  const intraday: TimeSeriesPoint[] = [];
  for (let t = last - 5 * 86_400; t <= last; t += 900) intraday.push({ time: t, value: 2_000 });
  return { daily, intraday };
}

const ANCHOR = day("2026-09-15");

describe("a daily-frequency series with no intraday tail", () => {
  // The defect: 1D and 1W are intraday ranges, so the window function read an empty array and
  // fell back to the single daily point at the window base. One point is not a line, which is
  // why the chart was blank on 1D and 1W while the percentages beside it were correct.
  const series = dailyOnly("2026-08-01", "2026-09-15");

  it("draws 1D as the latest point and the one before it", () => {
    const points = windowPoints(series, "1D", ANCHOR);
    expect(points.map((p) => iso(p.time))).toEqual(["2026-09-14", "2026-09-15"]);
  });

  it("draws 1W as the inclusive seven-calendar-day span", () => {
    const points = windowPoints(series, "1W", ANCHOR);
    expect(points).toHaveLength(8);
    expect(iso(points[0]!.time)).toBe("2026-09-08");
    expect(iso(points[points.length - 1]!.time)).toBe("2026-09-15");
  });

  it("includes a point that falls exactly on the window start", () => {
    // The boundary the fix must not drop: the base is the last point at or before the start,
    // and a point sitting exactly on it is that base.
    const points = windowPoints(series, "1W", ANCHOR);
    expect(iso(points[0]!.time)).toBe(iso(rangeStart("1W", ANCHOR)));
  });

  it("offers 1D and 1W as available, because it can now fill them", () => {
    expect(isRangeAvailable(series, "1D", ANCHOR)).toBe(true);
    expect(isRangeAvailable(series, "1W", ANCHOR)).toBe(true);
    expect(availableRanges(series, ANCHOR)).toContain("1D");
    expect(availableRanges(series, ANCHOR)).toContain("1W");
  });

  it("leaves the longer ranges exactly as they were", () => {
    expect(windowPoints(series, "1M", ANCHOR)).toHaveLength(32);
    expect(iso(windowPoints(series, "1M", ANCHOR)[0]!.time)).toBe("2026-08-15");
    // Forty-six days of history does not reach back three months, and saying so is correct.
    expect(isRangeAvailable(series, "3M", ANCHOR)).toBe(false);
  });

  it("offers nothing shorter than it has: a single point supports no range", () => {
    const one = dailyOnly("2026-09-15", "2026-09-15");
    expect(availableRanges(one, ANCHOR)).toEqual([]);
    // And the window still returns the real point rather than inventing a second.
    expect(windowPoints(one, "1D", ANCHOR)).toHaveLength(1);
  });
});

describe("the window anchor", () => {
  it("ends at the series' own latest point, never at the clock", () => {
    // A daily series published after midnight would otherwise redraw itself as the browser
    // day rolled over, and differently in each timezone.
    const series = dailyOnly("2026-09-01", "2026-09-15");
    const points = windowPoints(series, "1W", ANCHOR);
    expect(iso(points[points.length - 1]!.time)).toBe("2026-09-15");

    // The same series anchored a day later draws a window that ends a day later, and the
    // caller decides which — the helper reads no clock of its own.
    const nextDay = windowPoints(series, "1D", day("2026-09-16"));
    expect(nextDay.map((p) => iso(p.time))).toEqual(["2026-09-15"]);
  });

  it("computes window starts on UTC calendar dates", () => {
    expect(iso(rangeStart("1D", ANCHOR))).toBe("2026-09-14");
    expect(iso(rangeStart("1W", ANCHOR))).toBe("2026-09-08");
    expect(iso(rangeStart("1M", ANCHOR))).toBe("2026-08-15");
    expect(iso(rangeStart("1Y", ANCHOR))).toBe("2025-09-15");
  });

  it("crosses a month and a year boundary without drifting a day", () => {
    expect(iso(rangeStart("1D", day("2026-03-01")))).toBe("2026-02-28");
    expect(iso(rangeStart("1M", day("2026-01-15")))).toBe("2025-12-15");
    expect(iso(rangeStart("1Y", day("2028-02-29")))).toBe("2027-03-01");
  });
});

describe("coverage gaps", () => {
  const series = dailyOnly("2026-09-08", "2026-09-15", ["2026-09-11"]);

  it("returns only real points: a missing date stays missing", () => {
    const points = windowPoints(series, "1W", ANCHOR);
    expect(points.map((p) => iso(p.time))).not.toContain("2026-09-11");
    expect(points).toHaveLength(7);
    expect(points.some((p) => p.value === 0)).toBe(false);
  });

  it("still anchors 1D on the two latest real points when the gap is elsewhere", () => {
    expect(windowPoints(series, "1D", ANCHOR).map((p) => iso(p.time))).toEqual([
      "2026-09-14",
      "2026-09-15",
    ]);
  });

  it("falls back to the previous real point when the day before the latest is missing", () => {
    // Not an interpolation: the base is the last real observation at or before the window
    // start, which is what a 1D window can honestly show across a hole.
    const withHole = dailyOnly("2026-09-08", "2026-09-15", ["2026-09-14"]);
    const points = windowPoints(withHole, "1D", ANCHOR);
    expect(points.map((p) => iso(p.time))).toEqual(["2026-09-13", "2026-09-15"]);
  });
});

describe("an instrument that does have an intraday tail", () => {
  // The compute and token markets are unaffected by the fix, and this is what says so.
  const series = withIntraday("2026-08-01", "2026-09-15");

  it("still draws its short ranges from the fine series", () => {
    const points = windowPoints(series, "1D", ANCHOR);
    expect(points.length).toBeGreaterThan(50);
    expect(points.every((p) => p.value === 2_000)).toBe(true);
  });

  it("still draws its long ranges from the daily closes", () => {
    const points = windowPoints(series, "1M", ANCHOR);
    expect(points.every((p) => p.value !== 2_000)).toBe(true);
  });

  it("still reports its short ranges as available", () => {
    expect(isRangeAvailable(series, "1D", ANCHOR)).toBe(true);
    expect(isRangeAvailable(series, "1W", ANCHOR)).toBe(true);
  });
});

describe("period returns are unchanged by the window fix", () => {
  const series = dailyOnly("2026-08-01", "2026-09-15");

  it("measures from the base observation to the latest", () => {
    const points = windowPoints(series, "1W", ANCHOR);
    const first = points[0]!.value;
    const last = points[points.length - 1]!.value;
    expect(periodReturn(series, "1W", ANCHOR)).toBeCloseTo(((last - first) / first) * 100, 9);
  });

  it("is null for a range the history cannot reach", () => {
    expect(periodReturn(series, "1Y", ANCHOR)).toBeNull();
  });
});
