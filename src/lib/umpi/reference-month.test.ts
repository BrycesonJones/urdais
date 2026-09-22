import { describe, expect, it } from "vitest";

import { calendarYearMonths, compareMonths, isConsecutive, isReferenceMonth, parseReferenceMonth, previousMonth } from "./reference-month";

describe("reference months", () => {
  it("accepts YYYY-MM and nothing else", () => {
    expect(isReferenceMonth("2026-06")).toBe(true);
    for (const bad of ["2026-6", "2026-00", "2026-13", "2026-06-01", "202606", ""]) {
      expect(isReferenceMonth(bad), bad).toBe(false);
    }
    expect(() => parseReferenceMonth("2026-13")).toThrow();
  });

  it("steps back across a year boundary without a Date", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-07")).toBe("2026-06");
  });

  it("knows which months are consecutive", () => {
    expect(isConsecutive("2026-06", "2026-07")).toBe(true);
    expect(isConsecutive("2025-12", "2026-01")).toBe(true);
    expect(isConsecutive("2026-05", "2026-07")).toBe(false);
    expect(isConsecutive("2026-07", "2026-06")).toBe(false);
  });

  it("lists a calendar year in order, which is the base window", () => {
    const months = calendarYearMonths(2020);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2020-01");
    expect(months[11]).toBe("2020-12");
    expect([...months].sort(compareMonths)).toEqual(months);
  });
});
