import { describe, expect, it } from "vitest";

import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";
import {
  dstEvidenceSufficient, expectedIntervalStarts, localDateOf, operatingDayWindow,
} from "@/lib/uepi/operating-day";
import { UepiDomainError } from "@/lib/uepi/types";

/**
 * The hour count is derived from the market's own zone, never assumed to be 24. Three of these
 * cases are measured fact from the Phase 1 research: NYISO's 8 March 2026 file has 23 rows and no
 * 02:00, its 2 November 2025 file has 25, and SPP's files for the same dates behave the same way.
 */
describe("1. an operating day is 23, 24 or 25 hours", () => {
  it("is 24 hours on an ordinary day", () => {
    const window = operatingDayWindow(UEPI_BENCHMARKS["uepi-nyiso"], "2026-09-23");
    expect(window.expectedIntervalCount).toBe(24);
    expect(window.dstTransition).toBe("none");
    // Eastern Daylight Time: local midnight is 04:00 UTC.
    expect(window.startUtc).toBe("2026-09-23T04:00:00.000Z");
    expect(window.endUtc).toBe("2026-09-24T04:00:00.000Z");
  });

  it("is 23 hours on spring forward", () => {
    const window = operatingDayWindow(UEPI_BENCHMARKS["uepi-nyiso"], "2026-03-08");
    expect(window.expectedIntervalCount).toBe(23);
    expect(window.dstTransition).toBe("spring_forward");
    expect(expectedIntervalStarts(window)).toHaveLength(23);
  });

  it("is 25 hours on fall back", () => {
    const window = operatingDayWindow(UEPI_BENCHMARKS["uepi-nyiso"], "2025-11-02");
    expect(window.expectedIntervalCount).toBe(25);
    expect(window.dstTransition).toBe("fall_back");
    // The two instants a single "01:00" label collapses into. Keying on the label loses one.
    const starts = expectedIntervalStarts(window);
    expect(starts).toContain("2025-11-02T05:00:00.000Z");
    expect(starts).toContain("2025-11-02T06:00:00.000Z");
    expect(localDateOf("2025-11-02T05:00:00.000Z", "America/New_York")).toBe("2025-11-02");
    expect(localDateOf("2025-11-02T06:00:00.000Z", "America/New_York")).toBe("2025-11-02");
  });

  it("is 23 and 25 hours in Central time too, on the same dates", () => {
    expect(operatingDayWindow(UEPI_BENCHMARKS["uepi-spp"], "2026-03-08").expectedIntervalCount).toBe(23);
    expect(operatingDayWindow(UEPI_BENCHMARKS["uepi-spp"], "2025-11-02").expectedIntervalCount).toBe(25);
  });

  it("is 23 and 25 hours in Pacific time", () => {
    expect(operatingDayWindow(UEPI_BENCHMARKS["uepi-caiso"], "2026-03-08").expectedIntervalCount).toBe(23);
    expect(operatingDayWindow(UEPI_BENCHMARKS["uepi-caiso"], "2025-11-02").expectedIntervalCount).toBe(25);
  });
});

describe("2. MISO's day never changes length", () => {
  it("is 24 hours on both transition dates, because MISO publishes Eastern Standard Time all year", () => {
    for (const date of ["2026-03-08", "2025-11-02", "2026-09-23"]) {
      const window = operatingDayWindow(UEPI_BENCHMARKS["uepi-miso"], date);
      expect(window.expectedIntervalCount).toBe(24);
      expect(window.dstTransition).toBe("none");
    }
  });

  it("starts at 05:00 UTC every day of the year, summer included", () => {
    expect(operatingDayWindow(UEPI_BENCHMARKS["uepi-miso"], "2026-07-01").startUtc)
      .toBe("2026-07-01T05:00:00.000Z");
    expect(operatingDayWindow(UEPI_BENCHMARKS["uepi-miso"], "2026-01-01").startUtc)
      .toBe("2026-01-01T05:00:00.000Z");
  });
});

describe("3. the hours of a day are contiguous instants", () => {
  it("enumerates consecutive hours from local midnight to local midnight", () => {
    const window = operatingDayWindow(UEPI_BENCHMARKS["uepi-ercot"], "2026-09-23");
    const starts = expectedIntervalStarts(window).map((iso) => Date.parse(iso));
    expect(starts).toHaveLength(24);
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index]! - starts[index - 1]!).toBe(3_600_000);
    }
  });
});

describe("4. a transition day is only releasable where the behaviour was measured", () => {
  it("accepts an ordinary day for every market, measured or not", () => {
    for (const benchmark of Object.values(UEPI_BENCHMARKS)) {
      if (benchmark.dstEvidence === "unresolved") continue;
      const window = operatingDayWindow(benchmark, "2026-09-23");
      expect(dstEvidenceSufficient(benchmark, window)).toBe(true);
    }
  });

  it("accepts a transition day only where a transition file was actually parsed", () => {
    const spring = "2026-03-08";
    expect(dstEvidenceSufficient(
      UEPI_BENCHMARKS["uepi-nyiso"], operatingDayWindow(UEPI_BENCHMARKS["uepi-nyiso"], spring))).toBe(true);
    expect(dstEvidenceSufficient(
      UEPI_BENCHMARKS["uepi-spp"], operatingDayWindow(UEPI_BENCHMARKS["uepi-spp"], spring))).toBe(true);
    // Expected, never observed: ERCOT, PJM and CAISO stop and wait for an operator.
    expect(dstEvidenceSufficient(
      UEPI_BENCHMARKS["uepi-ercot"], operatingDayWindow(UEPI_BENCHMARKS["uepi-ercot"], spring))).toBe(false);
    expect(dstEvidenceSufficient(
      UEPI_BENCHMARKS["uepi-caiso"], operatingDayWindow(UEPI_BENCHMARKS["uepi-caiso"], spring))).toBe(false);
  });

  it("refuses every day for a market whose hour convention is unknown", () => {
    const isone = UEPI_BENCHMARKS["uepi-iso-ne"];
    expect(dstEvidenceSufficient(isone, operatingDayWindow(isone, "2026-09-23"))).toBe(false);
  });
});

describe("5. bad input is refused rather than guessed at", () => {
  it("rejects a malformed date", () => {
    expect(() => operatingDayWindow(UEPI_BENCHMARKS["uepi-ercot"], "23/09/2026")).toThrow(UepiDomainError);
  });

  it("rejects a date that does not exist", () => {
    expect(() => operatingDayWindow(UEPI_BENCHMARKS["uepi-ercot"], "2026-02-30")).toThrow(UepiDomainError);
  });

  it("accepts a leap day", () => {
    expect(operatingDayWindow(UEPI_BENCHMARKS["uepi-ercot"], "2028-02-29").expectedIntervalCount).toBe(24);
  });
});
