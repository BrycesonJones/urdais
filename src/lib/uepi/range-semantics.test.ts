import { describe, expect, it } from "vitest";

import {
  isLowFrequencyRangeAvailable, lowFrequencyAvailableRanges, lowFrequencyPeriodChange,
  lowFrequencyPeriodChanges, rangeStart,
} from "@/lib/market-ranges";
import { DETAIL_RANGES, type TimeSeriesPoint } from "@/types/market";

/**
 * UEPI's range semantics are the shared Urdais ones, exercised here on a signed daily series.
 *
 * UEPI publishes once per operating day and has no intraday tail, so it reads the low-frequency
 * path: the base is the last released observation at or before the window start, bounded by one
 * further window back. Nothing here is a UEPI-specific rule; what is UEPI-specific is that the
 * values can be negative, and these cases prove the shared machinery stays honest when they are.
 *
 * Points are stamped at the operating date's UTC midnight, which is what makes calendar shifts
 * exact and lets four timezones share one axis.
 */

const DAY = 86_400;

function operatingDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 1000;
}

/** A daily series ending at `asOf`, `days` long, priced by `priceAt`. */
function dailySeries(asOf: number, days: number, priceAt: (dayBack: number) => number): TimeSeriesPoint[] {
  return Array.from({ length: days }, (_, index) => {
    const back = days - 1 - index;
    return { time: asOf - back * DAY, value: priceAt(back) };
  });
}

const ASOF = operatingDay("2026-09-23");

describe("1. all six horizons, on a series long enough for them", () => {
  const series = dailySeries(ASOF, 400, (back) => 30 + back * 0.01);

  it("offers every horizon once the history reaches back to it", () => {
    expect(lowFrequencyAvailableRanges(series, ASOF)).toEqual([...DETAIL_RANGES]);
  });

  it("measures each horizon from the observation at or before its own boundary", () => {
    for (const { range, change } of lowFrequencyPeriodChanges(series, ASOF)) {
      expect(change.kind, range).toBe("percentage");
      if (change.kind === "unavailable") continue;
      const boundary = rangeStart(range, ASOF);
      expect(change.baseTime, range).toBeLessThanOrEqual(boundary);
      expect(change.latestTime, range).toBe(ASOF);
      // The base is the closest observation at or before the boundary, never an older one.
      expect(boundary - change.baseTime!, range).toBeLessThan(DAY);
    }
  });

  it("shifts calendar months rather than counting 30-day blocks", () => {
    const march31 = operatingDay("2026-03-31");
    // February has no 31st, so the shift resolves forward into March. This is the existing
    // Urdais convention and UEPI adopts it rather than inventing a second calendar.
    expect(new Date(rangeStart("1M", march31) * 1000).toISOString()).toBe("2026-03-03T00:00:00.000Z");
  });

  it("handles a leap-year boundary without a special case", () => {
    const leapDay = operatingDay("2028-02-29");
    expect(new Date(rangeStart("1Y", leapDay) * 1000).toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });
});

describe("2. a horizon the history cannot honestly measure is not offered", () => {
  it("offers only the horizons a forty-day series reaches", () => {
    const series = dailySeries(ASOF, 40, () => 30);
    expect(lowFrequencyAvailableRanges(series, ASOF)).toEqual(["1D", "1W", "1M"]);
    expect(lowFrequencyPeriodChange(series, "3M", ASOF))
      .toEqual({ kind: "unavailable", reason: "insufficient_history" });
  });

  it("refuses a single point, which is a dot rather than a movement", () => {
    const series = [{ time: ASOF, value: 30 }];
    expect(lowFrequencyAvailableRanges(series, ASOF)).toEqual([]);
  });

  it("still measures the day before when yesterday's day failed, and says which date it used", () => {
    // One withheld day. The base falls two days back, inside the bound, and the caller can see it.
    const series: TimeSeriesPoint[] = [
      { time: ASOF - 2 * DAY, value: 30 },
      { time: ASOF, value: 33 },
    ];
    const change = lowFrequencyPeriodChange(series, "1D", ASOF);
    expect(change.kind).toBe("percentage");
    if (change.kind === "unavailable") return;
    expect(change.baseTime).toBe(ASOF - 2 * DAY);
    expect(new Date(change.baseTime! * 1000).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("drops the horizon entirely once the gap exceeds one further window", () => {
    const series: TimeSeriesPoint[] = [
      { time: ASOF - 4 * DAY, value: 30 },
      { time: ASOF, value: 33 },
    ];
    expect(isLowFrequencyRangeAvailable(series, "1D", ASOF)).toBe(false);
    expect(lowFrequencyPeriodChange(series, "1D", ASOF).kind).toBe("unavailable");
  });
});

describe("3. the horizons behave the same way when the series goes negative", () => {
  it("reports a dollar change and no percentage across a negative base", () => {
    const series: TimeSeriesPoint[] = [
      { time: ASOF - 7 * DAY, value: -0.11 },
      { time: ASOF, value: 24.5 },
    ];
    const change = lowFrequencyPeriodChange(series, "1W", ASOF);
    expect(change.kind).toBe("absolute");
    if (change.kind !== "absolute") return;
    expect(change.reason).toBe("base_negative");
    expect(change.absoluteChange).toBeCloseTo(24.61, 10);
    expect(change.direction).toBe("up");
  });

  it("keeps the horizon available: the comparison exists, only the percentage does not", () => {
    const series: TimeSeriesPoint[] = [
      { time: ASOF - 7 * DAY, value: -0.11 },
      { time: ASOF, value: 24.5 },
    ];
    expect(isLowFrequencyRangeAvailable(series, "1W", ASOF)).toBe(true);
  });
});

describe("4. a clock change does not move a calendar boundary", () => {
  it("measures one week across a spring-forward weekend as seven calendar days", () => {
    const afterSpringForward = operatingDay("2026-03-09");
    const series = dailySeries(afterSpringForward, 30, () => 30);
    const change = lowFrequencyPeriodChange(series, "1W", afterSpringForward);
    expect(change.kind).toBe("percentage");
    if (change.kind === "unavailable") return;
    expect(new Date(change.baseTime! * 1000).toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });

  it("measures one week across a fall-back weekend the same way", () => {
    const afterFallBack = operatingDay("2025-11-03");
    const series = dailySeries(afterFallBack, 30, () => 30);
    const change = lowFrequencyPeriodChange(series, "1W", afterFallBack);
    if (change.kind === "unavailable") throw new Error("the horizon should be available");
    expect(new Date(change.baseTime! * 1000).toISOString()).toBe("2025-10-27T00:00:00.000Z");
  });
});
