import { describe, expect, it } from "vitest";

import { buildFixtureWorkbook, sheetFromGrid } from "@/lib/power-delivery/planning/xlsx/fixture-workbook";
import { XlsxFormatError, XlsxWorkbook, cellNumber, columnToIndex, expandMerges, indexToColumn } from "@/lib/power-delivery/planning/xlsx/workbook";
import { ZipFormatError, readZipDirectory } from "@/lib/power-delivery/planning/xlsx/zip";

const workbook = () => XlsxWorkbook.open(buildFixtureWorkbook([
  sheetFromGrid("Data", {
    1: { A: null, B: "COAST", C: "ERCOT" },
    2: { A: 2031, B: 33517.94, C: 144521.884 },
    3: { A: "2031-2032", B: true, C: null },
  }, ["A1:C1"]),
  sheetFromGrid("Other", { 1: { A: "x" } }),
]));

describe("XLSX reading", () => {
  it("does not let a self-closing empty cell swallow the next cell", () => {
    // The real ERCOT workbook opens its header row with <c r="A1" s="1"/>, and a greedy
    // attribute match ran past it into B1 and reported B1's shared-string index as A1's number.
    const sheet = workbook().sheet("Data");
    const header = sheet.rows.find((row) => row.row === 1)!;
    expect(header.cells.get("A")!.value).toBeNull();
    expect(header.cells.get("B")!.value).toBe("COAST");
    expect(header.cells.get("C")!.value).toBe("ERCOT");
  });

  it("reads numbers as their literal text and never as dates", () => {
    const row = workbook().sheet("Data").rows.find((row) => row.row === 2)!;
    expect(cellNumber(row.cells.get("C"))).toBe(144521.884);
    expect(row.cells.get("C")!.kind).toBe("number");
  });

  it("reads a boolean cell as a boolean, which is how the CEC writes its coincidence flag", () => {
    const row = workbook().sheet("Data").rows.find((row) => row.row === 3)!;
    expect(row.cells.get("B")).toMatchObject({ value: "true", kind: "boolean" });
    expect(cellNumber(row.cells.get("B"))).toBeNull();
  });

  it("keeps shared strings and merged ranges", () => {
    const sheet = workbook().sheet("Data");
    expect(sheet.rows.find((row) => row.row === 3)!.cells.get("A")!.value).toBe("2031-2032");
    expect(sheet.merges).toEqual(["A1:C1"]);
    expect(expandMerges(sheet).get("C1")).toBe("A1");
  });

  it("fails closed when a sheet is renamed or removed", () => {
    expect(() => workbook().sheet("1.6 Forecast Distributions")).toThrow(XlsxFormatError);
    expect(() => workbook().sheet("1.6 Forecast Distributions")).toThrow(/has no sheet named/);
    expect(workbook().sheetNames()).toEqual(["Data", "Other"]);
  });

  it("refuses a file that is not a ZIP and a ZIP that is not a workbook", () => {
    expect(() => readZipDirectory(Buffer.from("<html>not a workbook</html>"))).toThrow(ZipFormatError);
    const notAWorkbook = buildFixtureWorkbook([sheetFromGrid("S", { 1: { A: 1 } })]);
    const corrupted = Buffer.from(notAWorkbook);
    expect(() => XlsxWorkbook.open(corrupted.subarray(0, 40))).toThrow();
  });

  it("maps column letters past Z", () => {
    expect(columnToIndex("A")).toBe(1);
    expect(columnToIndex("AA")).toBe(27);
    expect(indexToColumn(27)).toBe("AA");
    expect(indexToColumn(columnToIndex("XFD"))).toBe("XFD");
  });
});
