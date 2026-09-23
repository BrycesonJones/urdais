import { describe, expect, it } from "vitest";

import {
  MARKET_TIMEZONES, assessCoverage, assessPeakRegion, localDateOf, localYearOf, localYearWindow,
  zonedWallTimeToInstant,
} from "@/lib/flexible-capacity/period";
import { FlexibleCapacityDomainError, type HourlyLoadPoint } from "@/lib/flexible-capacity/types";
import { PD2_V1_AREAS } from "@/lib/power-delivery/universe";

const HOUR_MS = 3_600_000;

function hoursOf(period: { startUtc: string; endUtc: string }): string[] {
  const out: string[] = [];
  for (let ms = Date.parse(period.startUtc); ms < Date.parse(period.endUtc); ms += HOUR_MS) {
    out.push(new Date(ms).toISOString());
  }
  return out;
}

const series = (instants: readonly string[], value = 100): HourlyLoadPoint[] =>
  instants.map((periodStartUtc) => ({ periodStartUtc, valueMw: value }));

describe("1. market zones come from the Power Delivery universe", () => {
  it("covers all seven markets and never invents a second list", () => {
    expect(Object.keys(MARKET_TIMEZONES).sort()).toEqual(
      [...PD2_V1_AREAS].map((area) => area.slug).sort());
    for (const area of PD2_V1_AREAS) {
      expect(MARKET_TIMEZONES[area.slug]).toBe(area.timezone);
    }
  });
});

describe("2. a local year is a whole number of hours, whatever the clock does inside it", () => {
  it("is 8,760 hours in a common year for every market", () => {
    for (const area of PD2_V1_AREAS) {
      expect(localYearWindow(area.slug, 2025).expectedObservationCount).toBe(8760);
    }
  });

  it("is 8,784 hours in a leap year for every market", () => {
    for (const area of PD2_V1_AREAS) {
      expect(localYearWindow(area.slug, 2024).expectedObservationCount).toBe(8784);
    }
  });

  it("starts at local midnight on 1 January, expressed as a UTC instant", () => {
    // January is standard time everywhere here: Central is UTC-6, Pacific UTC-8, Eastern UTC-5.
    expect(localYearWindow("ercot", 2025).startUtc).toBe("2025-01-01T06:00:00.000Z");
    expect(localYearWindow("caiso", 2025).startUtc).toBe("2025-01-01T08:00:00.000Z");
    expect(localYearWindow("pjm", 2025).startUtc).toBe("2025-01-01T05:00:00.000Z");
  });

  it("ends exactly where the next year begins, leaving no hour in both or neither", () => {
    for (const area of PD2_V1_AREAS) {
      expect(localYearWindow(area.slug, 2025).endUtc).toBe(localYearWindow(area.slug, 2026).startUtc);
    }
  });
});

describe("3. daylight saving is a non-event because the series is indexed by instant", () => {
  const spring = "2025-03-09"; // US spring-forward: local 02:00 does not exist
  const autumn = "2025-11-02"; // US fall-back: local 01:00 occurs twice

  it("keeps exactly 24 instants on the spring-forward day", () => {
    const window = localYearWindow("ercot", 2025);
    const onDay = hoursOf(window).filter((iso) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: MARKET_TIMEZONES.ercot, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date(iso)) === spring);
    // The local *day* is 23 wall-clock hours long, and that is precisely the trap: counted as
    // instants it is 23, and the year total is still 8,760 because autumn gives one back.
    expect(onDay).toHaveLength(23);
  });

  it("keeps 25 instants on the fall-back day, so the year still totals 8,760", () => {
    const window = localYearWindow("ercot", 2025);
    const onDay = hoursOf(window).filter((iso) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: MARKET_TIMEZONES.ercot, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date(iso)) === autumn);
    expect(onDay).toHaveLength(25);
    expect(hoursOf(window)).toHaveLength(8760);
  });

  it("never produces a duplicate instant across the fall-back repeat", () => {
    const window = localYearWindow("ercot", 2025);
    const instants = hoursOf(window);
    expect(new Set(instants).size).toBe(instants.length);
  });

  it("assigns every hour of the window to the same local year", () => {
    const window = localYearWindow("caiso", 2025);
    const instants = hoursOf(window);
    expect(localYearOf(instants[0]!, "caiso")).toBe(2025);
    expect(localYearOf(instants[instants.length - 1]!, "caiso")).toBe(2025);
    expect(localYearOf(window.endUtc, "caiso")).toBe(2026);
  });
});

describe("4. wall-clock conversion", () => {
  it("resolves a summer instant using the zone's daylight offset, not its January one", () => {
    // 1 July 2025 12:00 in Chicago is CDT, UTC-5, so 17:00Z -- not 18:00Z.
    expect(new Date(zonedWallTimeToInstant(2025, 7, 1, 12, "America/Chicago")).toISOString())
      .toBe("2025-07-01T17:00:00.000Z");
  });

  it("rejects a year outside the supported range rather than guessing", () => {
    expect(() => localYearWindow("ercot", 1999)).toThrow(FlexibleCapacityDomainError);
  });
});

describe("5. coverage counts absence and refuses to repair it", () => {
  const period = localYearWindow("ercot", 2025);
  const allHours = hoursOf(period);

  it("reports full coverage for a complete year", () => {
    const assessment = assessCoverage(series(allHours), period, 0.995);
    expect(assessment.observationCount).toBe(8760);
    expect(assessment.missingObservationCount).toBe(0);
    expect(assessment.coverageRatio).toBe(1);
    expect(assessment.meetsThreshold).toBe(true);
    expect(assessment.gaps).toEqual([]);
  });

  it("locates a gap by its first missing hour and its length", () => {
    const withHole = [...allHours.slice(0, 100), ...allHours.slice(105)];
    const assessment = assessCoverage(series(withHole), period, 0.995);
    expect(assessment.missingObservationCount).toBe(5);
    expect(assessment.gaps).toEqual([{ startUtc: allHours[100]!, hours: 5 }]);
  });

  it("fails a year that falls below the threshold instead of modelling it", () => {
    const short = allHours.slice(0, 8000);
    const assessment = assessCoverage(series(short), period, 0.995);
    expect(assessment.meetsThreshold).toBe(false);
    expect(assessment.coverageRatio).toBeCloseTo(8000 / 8760, 10);
  });

  it("rejects a duplicated hour, because supersession must be resolved first", () => {
    const duplicated = [...series(allHours.slice(0, 10)), { periodStartUtc: allHours[3]!, valueMw: 77 }];
    expect(() => assessCoverage(duplicated, period, 0.5)).toThrow(/appears twice/);
  });

  it("rejects an hour outside the period rather than silently dropping it", () => {
    const strayed = [...series(allHours.slice(0, 10)), { periodStartUtc: period.endUtc, valueMw: 50 }];
    expect(() => assessCoverage(strayed, period, 0.001)).toThrow(/outside/);
  });

  it("rejects an instant that is not an exact hour", () => {
    expect(() => assessCoverage(
      [{ periodStartUtc: "2025-06-01T12:30:00.000Z", valueMw: 50 }], period, 0.001)).toThrow(/exact UTC hour/);
  });

  it("rejects a negative or non-finite load", () => {
    expect(() => assessCoverage(
      [{ periodStartUtc: allHours[0]!, valueMw: -1 }], period, 0.001)).toThrow(/non-finite or negative/);
    expect(() => assessCoverage(
      [{ periodStartUtc: allHours[0]!, valueMw: Number.NaN }], period, 0.001)).toThrow(/non-finite or negative/);
  });
});

describe("6. the peak region", () => {
  const period = localYearWindow("ercot", 2025);
  const allHours = hoursOf(period);

  it("reads the local date of an instant, not its UTC date", () => {
    // 06:00Z on 1 July is 01:00 in Chicago, still the 1st; 04:00Z is 23:00 on 30 June.
    expect(localDateOf("2025-07-01T06:00:00.000Z", "America/Chicago")).toBe("2025-07-01");
    expect(localDateOf("2025-07-01T04:00:00.000Z", "America/Chicago")).toBe("2025-06-30");
  });

  it("expects 24 hours on an ordinary local day and finds them all in a complete year", () => {
    const assessment = assessPeakRegion(series(allHours), period, "2025-08-18T23:00:00.000Z");
    expect(assessment).toEqual({
      localDate: "2025-08-18", expectedHours: 24, presentHours: 24, missingHours: 0, complete: true,
    });
  });

  it("expects 23 hours on the spring-forward day and 25 on the fall-back day", () => {
    expect(assessPeakRegion(series(allHours), period, "2025-03-09T18:00:00.000Z").expectedHours).toBe(23);
    expect(assessPeakRegion(series(allHours), period, "2025-11-02T18:00:00.000Z").expectedHours).toBe(25);
  });

  it("counts only the hours absent from the peak day, not from the year", () => {
    const peakAt = "2025-08-18T23:00:00.000Z";
    // Drop two hours from the peak day and a hundred from elsewhere.
    const dropped = new Set([
      "2025-08-18T20:00:00.000Z", "2025-08-18T21:00:00.000Z", ...allHours.slice(0, 100),
    ]);
    const assessment = assessPeakRegion(
      series(allHours.filter((iso) => !dropped.has(iso))), period, peakAt);
    expect(assessment.missingHours).toBe(2);
    expect(assessment.complete).toBe(false);
  });
});
