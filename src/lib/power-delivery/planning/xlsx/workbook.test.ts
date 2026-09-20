import { describe, expect, it } from "vitest";

import { createHash } from "node:crypto";

import { buildFixtureWorkbook, buildFixtureZip, sheetFromGrid } from "@/lib/power-delivery/planning/xlsx/fixture-workbook";
import { XlsxFormatError, XlsxWorkbook, cellNumber, columnToIndex, expandMerges, indexToColumn } from "@/lib/power-delivery/planning/xlsx/workbook";
import { ZipFormatError, ZipIntegrityError, readZipDirectory, readZipMember } from "@/lib/power-delivery/planning/xlsx/zip";

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

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

describe("ZIP member integrity", () => {
  const member = { name: "xl/worksheets/sheet1.xml", body: Buffer.from("<worksheet><sheetData/></worksheet>") };
  const second = { name: "xl/worksheets/sheet2.xml", body: Buffer.from("<worksheet><sheetData><row r=\"1\"/></sheetData></worksheet>") };
  const read = (archive: Buffer, name: string) => readZipMember(archive, readZipDirectory(archive).get(name)!);

  it("returns the member bytes when CRC and size both agree", () => {
    const archive = buildFixtureZip([member, second]);
    expect(read(archive, member.name)).toEqual(member.body);
    expect(read(archive, second.name)).toEqual(second.body);
  });

  it("fails closed on a CRC mismatch instead of parsing whatever decompressed", () => {
    const archive = buildFixtureZip([member, second], [{ member: member.name, crc: 0x12345678 }]);
    expect(() => read(archive, member.name)).toThrow(ZipIntegrityError);
    expect(() => read(archive, member.name)).toThrow(/CRC-32 mismatch/);
    expect(() => read(archive, member.name)).toThrow(new RegExp(member.name));
    // The sound member in the same archive is unaffected.
    expect(read(archive, second.name)).toEqual(second.body);
  });

  it("fails closed when the declared uncompressed size does not match the content", () => {
    const archive = buildFixtureZip([member], [{ member: member.name, uncompressedSize: member.body.length + 7 }]);
    expect(() => read(archive, member.name)).toThrow(ZipIntegrityError);
    expect(() => read(archive, member.name)).toThrow(/declared uncompressed size/);
  });

  it("refuses a member whose size lives in a ZIP64 extra field rather than misreading it", () => {
    const archive = buildFixtureZip([member], [{ member: member.name, uncompressedSize: 0xffffffff }]);
    expect(() => read(archive, member.name)).toThrow(ZipFormatError);
    expect(() => read(archive, member.name)).toThrow(/ZIP64 extra field/);
  });

  it("refuses a truncated archive", () => {
    const archive = buildFixtureZip([member, second]);
    const directory = readZipDirectory(archive);
    const truncated = Buffer.concat([archive.subarray(0, 40), archive.subarray(41)]);
    expect(() => readZipMember(truncated, directory.get(second.name)!)).toThrow();
  });
});

describe("sheet member hashes", () => {
  const book = () => buildFixtureWorkbook([
    sheetFromGrid("One", { 1: { A: "first" } }),
    sheetFromGrid("Two", { 1: { A: "second" } }),
  ]);

  it("hashes the exact decompressed member bytes the parser was given", () => {
    const archive = book();
    const sheet = XlsxWorkbook.open(archive).sheet("One");
    const bytes = readZipMember(archive, readZipDirectory(archive).get(sheet.part)!);
    expect(sheet.partSha256).toBe(sha256(bytes));
    expect(sheet.partSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives two members of one package two different hashes", () => {
    const workbook = XlsxWorkbook.open(book());
    const one = workbook.sheet("One");
    const two = workbook.sheet("Two");
    expect(one.part).not.toBe(two.part);
    expect(one.partSha256).not.toBe(two.partSha256);
  });

  it("is deterministic across reads, so a rerun produces the same hash", () => {
    const archive = book();
    expect(XlsxWorkbook.open(archive).sheet("One").partSha256)
      .toBe(XlsxWorkbook.open(archive).sheet("One").partSha256);
  });
});
