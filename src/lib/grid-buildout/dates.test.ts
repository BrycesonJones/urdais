/**
 * Spreadsheet value reading for Grid Buildout ingestion.
 *
 * The cases here are the ones a publisher's real workbook produced and a naive reader got wrong: a
 * bare year in a date column, a placeholder written as a bare number, and a genuine serial that
 * must still be read as a serial. Each of the first two produced a specific false date before it
 * was handled, and the false dates are named in the tests so a regression is recognisable.
 */

import { describe, expect, it } from "vitest";

import { parseQuantity, parseSpreadsheetDate, serialToUtc } from "@/lib/grid-buildout/dates";

describe("spreadsheet serials", () => {
  it("converts against the 1900 epoch Excel actually uses", () => {
    expect(serialToUtc(45681)).toEqual({ year: 2025, month: 1, day: 24 });
    expect(serialToUtc(2958101)).toEqual({ year: 9999, month: 1, day: 1 });
  });

  it("reads a genuine serial as a date at the requested precision", () => {
    expect(parseSpreadsheetDate("45681", { precision: "day" }))
      .toMatchObject({ date: "2025-01-24", quality: "reported", precision: "day" });
    expect(parseSpreadsheetDate("46184", { precision: "month" }))
      .toMatchObject({ quality: "reported", precision: "month" });
  });
});

describe("a bare year in a date column", () => {
  it("is read as a year, not as a serial", () => {
    // CAISO writes 2035 for a target it knows only to the year. As a serial that is 27 July 1905 --
    // not merely imprecise but a date the publisher never wrote, and it produced schedule slips of
    // 130 years. 69 of CAISO's 233 approval targets are written this way.
    const parsed = parseSpreadsheetDate("2035", { precision: "day" });
    expect(parsed).toMatchObject({ date: "2035-01-01", quality: "reported", precision: "year" });
    expect(parsed.native).toBe("2035");
    expect(parsed.date).not.toBe("1905-07-27");
  });

  it("covers the whole plausible span and nothing outside it", () => {
    expect(parseSpreadsheetDate("1900", { precision: "day" }).precision).toBe("year");
    expect(parseSpreadsheetDate("2200", { precision: "day" }).precision).toBe("year");
    // 2201 is below the serial floor for any real date here, so it is not a year and not a date.
    expect(parseSpreadsheetDate("2201", { precision: "day" }).precision).toBe("day");
  });

  it("keeps the publisher's own value so the imprecision stays visible", () => {
    expect(parseSpreadsheetDate("2030", { precision: "day" }).native).toBe("2030");
  });

  it("does not turn a fractional number into a year", () => {
    // A fractional serial is a timestamp, not a year someone typed.
    expect(parseSpreadsheetDate("2035.5", { precision: "day" }).precision).not.toBe("year");
  });
});

describe("the sentinel", () => {
  it("is recognised when written as a bare number, before any serial conversion", () => {
    // As a serial, 9999 is 18 May 1927. Checking the sentinel first is what stops that.
    const parsed = parseSpreadsheetDate("9999", { precision: "month" });
    expect(parsed.quality).toBe("sentinel_unknown");
    expect(parsed.date).toBeNull();
    expect(parsed.native).toBe("9999");
  });

  it("is recognised when written as a full date in the sentinel year", () => {
    // ERCOT's Actual In-Service Date column holds serial 2958101, which is 9999-01-01.
    expect(parseSpreadsheetDate("2958101", { precision: "month" }))
      .toMatchObject({ date: null, quality: "sentinel_unknown", precision: "none" });
  });

  it("is recognised as publisher text", () => {
    expect(parseSpreadsheetDate("TBD", { precision: "day" }).quality).toBe("sentinel_unknown");
  });
});

describe("values that are not dates", () => {
  it("refuses to invent a date from text it cannot read", () => {
    expect(parseSpreadsheetDate("sometime in 2027", { precision: "month" }).quality).toBe("unparseable");
    expect(parseSpreadsheetDate("2022-2023 Transmission Plan", { precision: "day" }).quality).toBe("unparseable");
  });

  it("treats an empty cell as not reported rather than as a defect", () => {
    expect(parseSpreadsheetDate("", { precision: "month" }).quality).toBe("not_reported");
    expect(parseSpreadsheetDate(null, { precision: "month" }).quality).toBe("not_reported");
    expect(parseSpreadsheetDate(undefined, { precision: "month" }).quality).toBe("not_reported");
  });

  it("refuses a serial at or below the epoch", () => {
    expect(parseSpreadsheetDate("0", { precision: "day" }).quality).toBe("unparseable");
    expect(parseSpreadsheetDate("-5", { precision: "day" }).quality).toBe("unparseable");
  });
});

describe("quantities", () => {
  it("keeps an empty cell distinct from a reported zero", () => {
    expect(parseQuantity(null)).toEqual({ value: null, isReported: false, native: null });
    expect(parseQuantity("")).toEqual({ value: null, isReported: false, native: null });
    expect(parseQuantity("0")).toEqual({ value: 0, isReported: true, native: "0" });
  });

  it("reads a reported value, commas and all", () => {
    expect(parseQuantity("12.5")).toEqual({ value: 12.5, isReported: true, native: "12.5" });
    expect(parseQuantity("1,234")).toEqual({ value: 1234, isReported: true, native: "1,234" });
  });
});
