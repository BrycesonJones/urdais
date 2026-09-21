import { describe, expect, it } from "vitest";

import { PdfTableError, numericCells, parseNumericCell, readNumbers, readRow } from "@/lib/power-delivery/pdf/tables";

describe("numeric cells", () => {
  it("reads plain and grouped numbers", () => {
    expect(parseNumericCell("125,531")).toBe(125_531);
    expect(parseNumericCell("0")).toBe(0);
    expect(parseNumericCell("7.06")).toBe(7.06);
  });

  it("reads accounting parentheses as negative", () => {
    // A cold weather derate of (11,320) is minus eleven thousand. Read as positive it becomes a
    // resource the system does not have.
    expect(parseNumericCell("(11,320)")).toBe(-11_320);
    expect(parseNumericCell("(830)")).toBe(-830);
  });

  it("treats an absent cell as absent rather than as zero", () => {
    for (const token of ["NA", "N/A", "None", "-", ""]) expect(parseNumericCell(token)).toBeNull();
  });

  it("strips a percent sign without changing the number", () => {
    expect(parseNumericCell("110.3%")).toBe(110.3);
  });

  it("joins a minus sign that was set apart from its digits", () => {
    // The reports set negative cells as "- 5". Treating the sign as its own cell shifts every
    // later column by one.
    expect(numericCells("2,472 - 5 3,879")).toEqual([2_472, -5, 3_879]);
    expect(numericCells("1,516 494 2,594")).toEqual([1_516, 494, 2_594]);
  });
});

describe("reading a labelled row", () => {
  const flat = "Peak Demand (MW) 18,927 12,874 10,567 [E] Unforced Capacity (MW) 19,351 13,651 10,873 [B]";

  it("finds a row by its label and stops at its formula key", () => {
    expect(readNumbers(flat, "Peak Demand (MW)", { expect: 3 })).toEqual([18_927, 12_874, 10_567]);
    expect(readNumbers(flat, "Unforced Capacity (MW)", { expect: 3 })).toEqual([19_351, 13_651, 10_873]);
  });

  it("matches a label the typesetter broke up with stray spaces", () => {
    const spaced = "LRR UCAP per - unit of LRZ Peak Demand 110.3% 109.9% [F]";
    expect(readNumbers(spaced, "LRR UCAP per-unit of LRZ Peak Demand", { expect: 2 })).toEqual([110.3, 109.9]);
  });

  it("refuses a row that has gained or lost a column", () => {
    // A table that has been reorganised should stop the ingestion, not silently shorten it and
    // file every value under the wrong heading.
    expect(() => readNumbers(flat, "Peak Demand (MW)", { expect: 4 })).toThrow(PdfTableError);
    expect(() => readNumbers(flat, "Peak Demand (MW)", { expect: 4 })).toThrow(/yielded 3 values where 4 were expected/);
  });

  it("refuses a label that is no longer there", () => {
    expect(() => readNumbers(flat, "Installed Capacity (MW)", { expect: 3 }))
      .toThrow(/no longer states a row labelled/);
  });

  it("refuses a row with a hole in it rather than shifting the columns", () => {
    const holed = "Peak Demand (MW) 18,927 N/A 10,567 [E]";
    expect(() => readNumbers(holed, "Peak Demand (MW)", { expect: 3 }))
      .toThrow(/no readable value in column 2/);
  });

  it("reads repeated tables in turn rather than only the first", () => {
    const twice = "Summer Peak Demand (MW) 1 2 [E] Winter Peak Demand (MW) 3 4 [E]";
    const first = readRow(twice, "Peak Demand (MW)", { expect: 2 });
    expect(first.values).toEqual([1, 2]);
    expect(readRow(twice, "Peak Demand (MW)", { expect: 2, from: first.end }).values).toEqual([3, 4]);
  });
});
