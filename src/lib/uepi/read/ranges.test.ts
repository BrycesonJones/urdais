/**
 * Range selection over a released UEPI series, against specification 1.0.0 §E.
 *
 * §E.4 enumerates the cases the product must get right, and three of them are about holes: a
 * released series has them, because a source can publish nothing (ERCOT, 2026-03-07) and a
 * quality check can withhold a day (MISO, 2026-05-19). What the rule must never do is stretch a
 * label over one.
 */

import { describe, expect, it } from "vitest";

import { availableRangesFor, operatingDateInstant, rangeChanges, seriesAsOf, toTimeSeries, windowDays } from "@/lib/uepi/read/ranges";
import { consecutiveDays } from "@/lib/uepi/read/read-fixtures";
import type { FakeDayRow } from "@/lib/uepi/read/read-fixtures";
import type { ReleasedDayRow } from "@/lib/uepi/read/load";

/** The fixture rows as the loader would return them. */
function released(rows: readonly FakeDayRow[]): ReleasedDayRow[] {
  return rows.map((row) => ({
    seriesId: row.seriesId,
    operatingDate: row.operatingDate,
    valueUsdPerMwh: row.value,
    observationCount: 24,
    expectedObservationCount: 24,
    releasedAt: `${row.operatingDate}T12:00:00.000Z`,
    methodologyVersion: "1.0.0",
    specificationDigest: "14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a",
  }));
}

/** `n` consecutive days ending on `lastDate`, all priced the same unless a value is given. */
function run(lastDate: string, count: number, value = "40.000000"): ReleasedDayRow[] {
  const end = new Date(`${lastDate}T00:00:00Z`).getTime();
  const first = new Date(end - (count - 1) * 86_400_000).toISOString().slice(0, 10);
  return released(consecutiveDays("uepi-ercot", first, Array.from({ length: count }, () => value)));
}

const changeFor = (days: readonly ReleasedDayRow[], range: string) =>
  rangeChanges(days).find((entry) => entry.range === range)!.change;

describe("the point clock (§E.1)", () => {
  it("stamps a released day at its operating date at 00:00:00 UTC", () => {
    expect(operatingDateInstant("2026-09-23")).toBe(Date.UTC(2026, 8, 23) / 1000);
    expect(toTimeSeries(run("2026-09-23", 1))[0]!.time).toBe(Date.UTC(2026, 8, 23) / 1000);
  });

  it("takes asOf from the series' own latest observation, never from the clock", () => {
    // A day published at 05:00 UTC draws the same chart all day, in every browser timezone.
    expect(seriesAsOf(run("2026-09-23", 5))).toBe(Date.UTC(2026, 8, 23) / 1000);
    expect(seriesAsOf([])).toBe(0);
  });
});

describe("which ranges a history supports (§E.4)", () => {
  it("offers 1D, 1W and 1M at 40 days and nothing longer", () => {
    expect(availableRangesFor(run("2026-09-23", 40))).toEqual(["1D", "1W", "1M"]);
  });

  it("offers every horizon once the history reaches a year", () => {
    expect(availableRangesFor(run("2026-09-23", 400))).toEqual(["1D", "1W", "1M", "3M", "6M", "1Y"]);
  });

  it("offers nothing on a single released day", () => {
    // One point is a dot, not a line, and no movement.
    expect(availableRangesFor(run("2026-09-23", 1))).toEqual([]);
  });

  it("drops 1D but keeps 1W when three consecutive days failed", () => {
    // §E.4: nothing is invented to fill the button.
    const days = [...run("2026-09-16", 10), ...released(consecutiveDays("uepi-ercot", "2026-09-20", ["41.000000"]))];
    const available = availableRangesFor(days);
    expect(available).not.toContain("1D");
    expect(available).toContain("1W");
  });

  it("measures from two days back, inside the bound, when yesterday failed completeness", () => {
    const days = [
      ...released(consecutiveDays("uepi-ercot", "2026-09-19", ["30.000000", "31.000000"])),
      ...released(consecutiveDays("uepi-ercot", "2026-09-22", ["33.000000"])),
    ];
    const change = changeFor(days, "1D");
    // The base is 2026-09-20, not 2026-09-21, and the change says so rather than implying a day.
    expect(change.baseOperatingDate).toBe("2026-09-20");
    expect(change.latestOperatingDate).toBe("2026-09-22");
    expect(change.absoluteChangeUsdPerMwh).toBe(2);
  });
});

describe("what a range change says", () => {
  it("keeps a horizon usable when its endpoints forbid a percentage", () => {
    // The defect this prevents: treating "no percentage" as "no history" would disable a button
    // over a real, measurable move on a negative-price day.
    const days = released([
      ...consecutiveDays("uepi-ercot", "2026-04-01", Array.from({ length: 10 }, () => "-2.000000")),
      { seriesId: "uepi-ercot", operatingDate: "2026-04-11", value: "-0.108300" },
    ]);
    const change = changeFor(days, "1W");
    expect(change.basis).toBe("absolute");
    expect(change.percentChange).toBeNull();
    expect(change.reason).toBe("base_negative");
    expect(change.direction).toBe("up");
    expect(change.absoluteChangeUsdPerMwh).toBe(1.8917);
  });

  it("reports an unavailable horizon as unavailable, not as a zero move", () => {
    const change = changeFor(run("2026-09-23", 40), "1Y");
    expect(change.basis).toBe("unavailable");
    expect(change.absoluteChangeUsdPerMwh).toBeNull();
    expect(change.direction).toBeNull();
  });

  it("computes each horizon exactly, in decimal", () => {
    const days = released([
      ...consecutiveDays("uepi-ercot", "2026-09-01", Array.from({ length: 22 }, () => "35.650000")),
      { seriesId: "uepi-ercot", operatingDate: "2026-09-23", value: "35.670000" },
    ]);
    expect(changeFor(days, "1W").absoluteChangeUsdPerMwh).toBe(0.02);
  });

  it("gives every horizon a stated reason when the series has released nothing", () => {
    for (const { change } of rangeChanges([])) {
      expect(change.basis).toBe("unavailable");
      expect(change.reason).toBe("no_released_value");
    }
  });
});

describe("the window a range draws", () => {
  it("starts at the base observation and runs to the latest, inclusive", () => {
    const days = run("2026-09-23", 40);
    const window = windowDays(days, "1W");
    expect(window[window.length - 1]!.operatingDate).toBe("2026-09-23");
    // The window opens seven calendar days back, at 2026-09-16, and a point sits exactly
    // there: that point is the base, and the window is it plus the seven days after it.
    expect(window[0]!.operatingDate).toBe("2026-09-16");
    expect(window.length).toBe(8);
  });

  it("returns the whole history when the window opens before it begins", () => {
    const days = run("2026-09-23", 5);
    expect(windowDays(days, "1Y")).toHaveLength(5);
  });

  it("returns nothing for an empty series rather than throwing", () => {
    expect(windowDays([], "1M")).toEqual([]);
  });
});
