import { describe, expect, it } from "vitest";

import { meanDecimal } from "@/lib/uepi/decimal";
import { sppAdapter } from "@/lib/uepi/source/adapters/spp";
import { fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";
import { UepiSourceError, type RetrievedArtifact } from "@/lib/uepi/source/types";

/** Pinned to SPP's own By_Day files: two in the modern schema, two in the legacy one. */
const ORDINARY = "spp-2026-09-23.csv";
const NEGATIVE = "spp-2026-04-12.csv";
const SPRING_LEGACY = "spp-2026-03-08.csv";
const FALL_LEGACY = "spp-2025-11-02.csv";

function csvArtifact(text: string): Map<string, RetrievedArtifact> {
  const body = Buffer.from(text, "utf8");
  return new Map([["day", {
    label: "day", url: "https://example.invalid", retrievedAt: "2026-09-25T00:00:00.000Z",
    status: 200, contentType: "text/csv", byteLength: body.byteLength, sha256: "0".repeat(64), body,
  }]]);
}

describe("1. the modern schema, against known source values", () => {
  const parsed = sppAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));

  it("reads 24 hours of MEC at the carrier location", () => {
    expect(parsed.records).toHaveLength(24);
    expect(parsed.sourceSchema.schemaVariant).toBe("with_baa");
    expect(parsed.sourceSchema.header)
      .toBe("Interval,GMTIntervalEnd,BAA,Settlement Location,Pnode,LMP,MLC,MCC,MEC");
  });

  it("extracts the exact published MEC, and treats the interval as hour-ending", () => {
    const first = parsed.records[0]!;
    expect(first.raw.nativeIntervalLabel).toBe("09/23/2026 01:00:00");
    expect(first.raw.nativeIntervalUtc).toBe("2026-09-23T06:00:00.000Z");
    // Hour-ending 06:00 GMT means the hour begins at 05:00 GMT.
    expect(first.intervalStartUtc).toBe("2026-09-23T05:00:00.000Z");
    expect(first.benchmarkPrice).toBe("18.5070");
    expect(first.raw.nativeComponents).toMatchObject({ LMP: "15.8983", MLC: "-1.1890", MCC: "-1.4197" });
  });

  it("takes the system component rather than the hub's own LMP", () => {
    const first = parsed.records[0]!;
    expect(first.benchmarkPrice).not.toBe(first.raw.nativeComponents.LMP);
  });

  it("excludes the western market, and counts what it excluded", () => {
    expect(Number(parsed.sourceSchema.westernRowsExcluded)).toBeGreaterThan(0);
    expect(parsed.records.every((record) => record.raw.nativeComponents.BAA === "SPP")).toBe(true);
    expect(parsed.rejected.some((row) => row.detail.includes("SWPW is not the Integrated Marketplace"))).toBe(true);
  });

  it("ignores participant hubs whose names merely contain HUB", () => {
    expect(parsed.rejected.some((row) => row.detail.includes("CSWS_HUB is not the carrier"))).toBe(true);
  });
});

describe("2. the negative day, preserved exactly", () => {
  const parsed = sppAdapter.parse("2026-04-12", fixtureArtifacts(NEGATIVE, "day"));

  it("keeps negative prices, including the first hour", () => {
    expect(parsed.records[0]!.benchmarkPrice).toBe("-12.4483");
    expect(parsed.records[0]!.raw.nativeComponents.LMP).toBe("-15.8917");
  });

  it("keeps every negative hour, and clips nothing", () => {
    const negatives = parsed.records.filter((record) => Number(record.benchmarkPrice) < 0);
    expect(negatives).toHaveLength(10);
    expect(Math.min(...parsed.records.map((record) => Number(record.benchmarkPrice)))).toBe(-15.2603);
  });

  it("reproduces the daily mean the research measured: +2.7785", () => {
    expect(meanDecimal(parsed.records.map((record) => record.benchmarkPrice), 6)).toBe("2.778533");
  });
});

describe("3. the legacy schema, recognised rather than guessed at", () => {
  it("parses a file with no BAA column, and says which shape it read", () => {
    const parsed = sppAdapter.parse("2026-03-08", fixtureArtifacts(SPRING_LEGACY, "day"));
    expect(parsed.sourceSchema.schemaVariant).toBe("without_baa");
    expect(parsed.sourceSchema.header)
      .toBe("Interval,GMTIntervalEnd,Settlement Location,Pnode,LMP,MLC,MCC,MEC");
    // 23 hours, and the local hour-ending label jumps straight from 01:00 to 03:00.
    expect(parsed.records).toHaveLength(23);
    expect(parsed.records[0]!.benchmarkPrice).toBe("21.8081");
    expect(parsed.records[0]!.raw.nativeIntervalLabel).toBe("03/08/2026 01:00:00");
    expect(parsed.records[1]!.raw.nativeIntervalLabel).toBe("03/08/2026 03:00:00");
    expect(parsed.records[1]!.benchmarkPrice).toBe("18.2109");
    // Two of the day's hours clear below zero, which the parser passes through untouched.
    const negatives = parsed.records.filter((record) => Number(record.benchmarkPrice) < 0);
    expect(negatives).toHaveLength(2);
    expect(Math.min(...parsed.records.map((record) => Number(record.benchmarkPrice)))).toBe(-9.4073);
  });

  it("warns that a legacy file cannot identify or exclude western rows", () => {
    const parsed = sppAdapter.parse("2026-03-08", fixtureArtifacts(SPRING_LEGACY, "day"));
    expect(parsed.warnings.join(" ")).toMatch(/predates the BAA column/);
    expect(parsed.sourceSchema.westernRowsExcluded).toBe("0");
  });

  it("branches on the header rather than on a date, because the cutover date is unresolved", async () => {
    const source = await import("node:fs/promises")
      .then((fs) => fs.readFile("src/lib/uepi/source/adapters/spp.ts", "utf8"));
    // No date literal anywhere in the adapter: the specification records the cutover as unresolved,
    // and a guessed date would silently mis-read whichever side of it was wrong.
    expect(source).not.toMatch(/20\d{2}-\d{2}-\d{2}/);
    expect(source).toMatch(/schemaVariant/);
  });

  it("keeps both rows of a repeated local hour, separated by the GMT interval end", () => {
    const parsed = sppAdapter.parse("2025-11-02", fixtureArtifacts(FALL_LEGACY, "day"));
    expect(parsed.records).toHaveLength(25);
    const repeated = parsed.records.filter((record) => record.raw.nativeIntervalLabel === "11/02/2025 02:00:00");
    expect(repeated).toHaveLength(2);
    expect(repeated.map((record) => record.raw.nativeIntervalUtc))
      .toEqual(["2025-11-02T07:00:00.000Z", "2025-11-02T08:00:00.000Z"]);
    expect(repeated.map((record) => record.intervalStartUtc))
      .toEqual(["2025-11-02T06:00:00.000Z", "2025-11-02T07:00:00.000Z"]);
  });
});

describe("4. an unfamiliar shape stops rather than being read positionally", () => {
  const modernHeader = "Interval,GMTIntervalEnd,BAA,Settlement Location,Pnode,LMP,MLC,MCC,MEC";

  it("refuses a header it has never seen", () => {
    const renamed = "Interval,GMTIntervalEnd,Region,Settlement Location,Pnode,LMP,MLC,MCC,MEC\n"
      + "09/23/2026 01:00:00,09/23/2026 06:00:00,SPP,SPPNORTH_HUB,SPPNORTH_H,1,0,0,1\n";
    expect(() => sppAdapter.parse("2026-09-23", csvArtifact(renamed))).toThrow(/unrecognised header/);
  });

  it("refuses a malformed GMT interval end", () => {
    const text = `${modernHeader}\n09/23/2026 01:00:00,not-a-time,SPP,SPPNORTH_HUB,SPPNORTH_H,1,0,0,1\n`;
    expect(() => sppAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/not MM\/DD\/YYYY/);
  });

  it("refuses a blank MEC instead of reading it as zero", () => {
    const text = `${modernHeader}\n09/23/2026 01:00:00,09/23/2026 06:00:00,SPP,SPPNORTH_HUB,SPPNORTH_H,1,0,0,\n`;
    expect(() => sppAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/blank MEC/);
  });

  it("refuses a non-numeric MEC", () => {
    const text = `${modernHeader}\n09/23/2026 01:00:00,09/23/2026 06:00:00,SPP,SPPNORTH_HUB,SPPNORTH_H,1,0,0,n/a\n`;
    expect(() => sppAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/not a decimal number/);
  });

  it("refuses two rows claiming the same instant", () => {
    const row = "09/23/2026 01:00:00,09/23/2026 06:00:00,SPP,SPPNORTH_HUB,SPPNORTH_H,1,0,0,1";
    expect(() => sppAdapter.parse("2026-09-23", csvArtifact(`${modernHeader}\n${row}\n${row}\n`)))
      .toThrow(/two rows for/);
  });

  it("refuses a file with no carrier rows", () => {
    const text = `${modernHeader}\n09/23/2026 01:00:00,09/23/2026 06:00:00,SPP,AEC,SOUC,1,0,0,1\n`;
    expect(() => sppAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/holds no SPPNORTH_HUB rows/);
  });

  it("refuses an empty file", () => {
    expect(() => sppAdapter.parse("2026-09-23", csvArtifact(`${modernHeader}\n`)))
      .toThrow(UepiSourceError);
  });
});
