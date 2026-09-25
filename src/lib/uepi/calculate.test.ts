import { describe, expect, it } from "vitest";

import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";
import { calculateDailyValue, calculationInputDigest, orderHours } from "@/lib/uepi/calculate";
import { formatDecimal, meanDecimal, parseDecimal } from "@/lib/uepi/decimal";
import { completeDay, flatDay } from "@/lib/uepi/fixtures";
import { SPECIFICATION_DIGEST, SPECIFICATION_VERSION } from "@/lib/uepi/methodology";
import { operatingDayWindow } from "@/lib/uepi/operating-day";
import { UepiDomainError } from "@/lib/uepi/types";

const NYISO = UEPI_BENCHMARKS["uepi-nyiso"];
const SPP = UEPI_BENCHMARKS["uepi-spp"];
const MISO = UEPI_BENCHMARKS["uepi-miso"];

describe("1. the mean is the mean, including the hours nobody likes", () => {
  it("averages an ordinary 24-hour day", () => {
    const { window, hours } = flatDay(NYISO, "2026-09-23", "29.19");
    const result = calculateDailyValue(NYISO, window, hours);
    expect(result.valueUsdPerMwh).toBe("29.190000");
    expect(result.observationCount).toBe(24);
    expect(result.expectedObservationCount).toBe(24);
  });

  it("keeps negative hours in the mean rather than flooring them", () => {
    const window = operatingDayWindow(SPP, "2026-04-12");
    // Ten negative hours in twenty-four, which is the shape of SPP's 12 April 2026 MEC day.
    const hours = completeDay(SPP, window, (hour) => (hour <= 10 ? "-15.00" : "15.00"));
    const result = calculateDailyValue(SPP, window, hours);
    // (10 * -15 + 14 * 15) / 24
    expect(result.valueUsdPerMwh).toBe("2.500000");
  });

  it("produces a negative daily value where the day was negative, without complaint", () => {
    const window = operatingDayWindow(SPP, "2026-04-12");
    const hours = completeDay(SPP, window, (hour) => (hour <= 20 ? "-10.00" : "5.00"));
    const result = calculateDailyValue(SPP, window, hours);
    // (20 * -10 + 4 * 5) / 24
    expect(result.valueUsdPerMwh).toBe("-7.500000");
  });

  it("treats a zero hour as a price, not as a missing value", () => {
    const window = operatingDayWindow(SPP, "2026-04-12");
    const hours = completeDay(SPP, window, (hour) => (hour === 1 ? "0" : "24.00"));
    expect(calculateDailyValue(SPP, window, hours).valueUsdPerMwh).toBe("23.000000");
  });

  it("averages 23 hours on a spring day and 25 on a fall day, without a special case", () => {
    const spring = operatingDayWindow(SPP, "2026-03-08");
    expect(calculateDailyValue(SPP, spring, completeDay(SPP, spring, () => "10.00"))
      .observationCount).toBe(23);
    const fall = operatingDayWindow(SPP, "2025-11-02");
    expect(calculateDailyValue(SPP, fall, completeDay(SPP, fall, () => "10.00"))
      .observationCount).toBe(25);
  });

  it("averages MISO's always-24 day on a transition date", () => {
    const { window, hours } = flatDay(MISO, "2026-03-08", "30.00");
    expect(calculateDailyValue(MISO, window, hours).observationCount).toBe(24);
  });
});

describe("2. the result does not depend on how the hours arrived", () => {
  it("is identical for shuffled input", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, (hour) => `${20 + hour}.${String(hour).padStart(2, "0")}`);
    const shuffled = [...hours].reverse();
    const ordered = calculateDailyValue(NYISO, window, hours);
    const reversed = calculateDailyValue(NYISO, window, shuffled);
    expect(reversed.valueUsdPerMwh).toBe(ordered.valueUsdPerMwh);
    expect(reversed.inputDigest).toBe(ordered.inputDigest);
    expect(reversed.hourSpanStartUtc).toBe(ordered.hourSpanStartUtc);
  });

  it("orders hours by instant, not by the order they were handed over", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, () => "1.00");
    const sorted = orderHours([...hours].reverse());
    expect(sorted[0]!.intervalStartUtc).toBe(hours[0]!.intervalStartUtc);
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 in binary floating point is famously not 0.3; the mean of these must be 0.2.
    expect(meanDecimal(["0.1", "0.2", "0.3"], 6)).toBe("0.200000");
    expect(meanDecimal(["10.005", "10.005"], 2)).toBe("10.01");
  });

  it("rounds half away from zero, so a negative day and a positive day round symmetrically", () => {
    expect(meanDecimal(["0.0000005"], 6)).toBe("0.000001");
    expect(meanDecimal(["-0.0000005"], 6)).toBe("-0.000001");
  });

  it("parses and reprints decimals without losing a place", () => {
    expect(formatDecimal(parseDecimal("-15.2600"))).toBe("-15.2600");
    expect(formatDecimal(parseDecimal("0.0002"))).toBe("0.0002");
    expect(() => parseDecimal("1e5")).toThrow(UepiDomainError);
    expect(() => meanDecimal([], 6)).toThrow(UepiDomainError);
  });
});

describe("3. the digest makes a recomputation checkable", () => {
  it("changes when any price changes", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const base = completeDay(NYISO, window, () => "10.00");
    const nudged = completeDay(NYISO, window, (hour) => (hour === 7 ? "10.01" : "10.00"));
    expect(calculationInputDigest("uepi-nyiso", "2026-09-23", nudged))
      .not.toBe(calculationInputDigest("uepi-nyiso", "2026-09-23", base));
  });

  it("differs between two series holding identical prices", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, () => "10.00");
    expect(calculationInputDigest("uepi-nyiso", "2026-09-23", hours))
      .not.toBe(calculationInputDigest("uepi-caiso", "2026-09-23", hours));
  });

  it("is a sha256", () => {
    const { window, hours } = flatDay(NYISO, "2026-09-23", "10.00");
    expect(calculateDailyValue(NYISO, window, hours).inputDigest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("4. the specification travels with the value", () => {
  it("stamps the frozen version and digest onto every calculation", () => {
    const { window, hours } = flatDay(NYISO, "2026-09-23", "10.00");
    const result = calculateDailyValue(NYISO, window, hours);
    expect(result.specificationVersion).toBe(SPECIFICATION_VERSION);
    expect(result.specificationDigest).toBe(SPECIFICATION_DIGEST);
  });

  it("carries the construct, so a value can never be read without knowing what it measures", () => {
    const { window, hours } = flatDay(NYISO, "2026-09-23", "10.00");
    expect(calculateDailyValue(NYISO, window, hours).construct).toBe("system_energy_component");
    const ercot = UEPI_BENCHMARKS["uepi-ercot"];
    const day = flatDay(ercot, "2026-09-23", "36.40");
    expect(calculateDailyValue(ercot, day.window, day.hours).construct).toBe("delivered_price");
  });
});

describe("5. it refuses input that is not this day's", () => {
  it("rejects an hour belonging to another series", () => {
    const { window, hours } = flatDay(NYISO, "2026-09-23", "10.00");
    const foreign = [{ ...hours[0]!, seriesId: "uepi-spp" as const }, ...hours.slice(1)];
    expect(() => calculateDailyValue(NYISO, window, foreign)).toThrow(UepiDomainError);
  });

  it("rejects an hour belonging to another operating date", () => {
    const { window, hours } = flatDay(NYISO, "2026-09-23", "10.00");
    const strayed = [{ ...hours[0]!, operatingDate: "2026-09-22" }, ...hours.slice(1)];
    expect(() => calculateDailyValue(NYISO, window, strayed)).toThrow(UepiDomainError);
  });

  it("refuses to average nothing", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    expect(() => calculateDailyValue(NYISO, window, [])).toThrow(UepiDomainError);
  });
});
