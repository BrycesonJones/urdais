import { describe, expect, it } from "vitest";

import { CsvFormatError, parsePreambleCsv, preambleValue, rowRecord, splitCsvLine, splitCsvRecords }
  from "@/lib/interconnection-queue/csv/preamble";

const isHeader = (values: string[]) => values.some((value) => value.trim() === "Generation Interconnection Number");

const SPP = [
  '"Last Updated On",9/21/2026,',
  "Generation Interconnection Number,State,Capacity,Status",
  '"GI-TC-2024-29",KS,170,"FACILITY STUDY STAGE"',
  '"GEN-2020-065",OK,1003,"IA FULLY EXECUTED/ON SCHEDULE"',
].join("\n");

describe("a CSV whose header does not begin the file", () => {
  it("finds the header beneath a one-row preamble", () => {
    const parsed = parsePreambleCsv(SPP, isHeader);
    expect(parsed.headerLine).toBe(2);
    expect(parsed.header).toEqual(["Generation Interconnection Number", "State", "Capacity", "Status"]);
    expect(parsed.rows).toHaveLength(2);
    // Line numbers are the file's own, so a value traces back to where it was read.
    expect(parsed.rows.map((row) => row.line)).toEqual([3, 4]);
  });

  it("keeps the preamble, because it is the only freshness stamp SPP publishes", () => {
    const parsed = parsePreambleCsv(SPP, isHeader);
    expect(parsed.preamble).toHaveLength(1);
    expect(preambleValue(parsed.preamble, /last\s*updated\s*on/i)).toBe("9/21/2026");
  });

  it("reads a different update date without any other change", () => {
    const later = SPP.replace("9/21/2026", "10/5/2026");
    expect(preambleValue(parsePreambleCsv(later, isHeader).preamble, /last updated on/i)).toBe("10/5/2026");
  });

  it("copes with a preamble that grows to several rows", () => {
    const wordy = ['"Report","SPP Generator Interconnection"', '"Last Updated On",9/21/2026,', "",
      ...SPP.split("\n").slice(1)].join("\n");
    const parsed = parsePreambleCsv(wordy, isHeader);
    expect(parsed.header[0]).toBe("Generation Interconnection Number");
    expect(preambleValue(parsed.preamble, /last updated on/i)).toBe("9/21/2026");
  });

  it("fails loudly when the header is gone, rather than reading metadata as data", () => {
    const renamed = SPP.replace("Generation Interconnection Number", "GI Number");
    expect(() => parsePreambleCsv(renamed, isHeader)).toThrow(/no header row was found/);
    // The error shows what the file actually began with, so the change is diagnosable.
    expect(() => parsePreambleCsv(renamed, isHeader)).toThrow(/Last Updated On/);
  });

  it("fails on an empty file", () => {
    expect(() => parsePreambleCsv("\n\n", isHeader)).toThrow(CsvFormatError);
  });
});

describe("splitting values", () => {
  it("honours quotes, commas inside them, and doubled quotes", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(splitCsvLine('"he said ""hi""",x')).toEqual(['he said "hi"', "x"]);
    expect(splitCsvLine("a,,b")).toEqual(["a", "", "b"]);
  });

  it("joins a quoted field that runs across several lines", () => {
    // SPP writes a cause of delay containing newlines, which a line-oriented reader splits in two.
    const text = 'A,B\n"one","a note\nsecond line\nthird"\n"two","plain"';
    const records = splitCsvRecords(text);
    expect(records).toHaveLength(3);
    expect(records[1]!.line).toBe(2);
    expect(splitCsvLine(records[1]!.text)).toEqual(["one", "a note second line third"]);
    expect(records[2]!.line).toBe(5);
  });

  it("fails on a quoted field that is never closed", () => {
    expect(() => splitCsvRecords('a,"unterminated\nmore')).toThrow(/never closed/);
  });

  it("maps a row onto the header, dropping only what the row left empty", () => {
    const parsed = parsePreambleCsv(SPP, isHeader);
    expect(rowRecord(parsed.header, parsed.rows[0]!)).toEqual({
      "Generation Interconnection Number": "GI-TC-2024-29", State: "KS",
      Capacity: "170", Status: "FACILITY STUDY STAGE",
    });
  });
});
