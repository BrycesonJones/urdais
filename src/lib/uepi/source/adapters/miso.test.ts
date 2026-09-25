import { describe, expect, it } from "vitest";

import { meanDecimal } from "@/lib/uepi/decimal";
import { misoAdapter } from "@/lib/uepi/source/adapters/miso";
import { fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";
import { UepiSourceError, type RetrievedArtifact } from "@/lib/uepi/source/types";

/** Pinned to MISO's own ex-post reports for three named operating days. */
const ORDINARY = "miso-2026-09-23.csv";
const SPRING = "miso-2026-03-08.csv";
const FALL = "miso-2025-11-02.csv";

function csvArtifact(text: string): Map<string, RetrievedArtifact> {
  const body = Buffer.from(text, "utf8");
  return new Map([["day", {
    label: "day", url: "https://example.invalid", retrievedAt: "2026-09-25T00:00:00.000Z",
    status: 200, contentType: "text/csv", byteLength: body.byteLength, sha256: "0".repeat(64), body,
  }]]);
}

const PREAMBLE = "Day Ahead Market ExPost LMPs\n09/23/2026\n\n,,,All Hours-Ending are Eastern Standard Time (EST)\n";
const HEADER = `Node,Type,Value,${Array.from({ length: 24 }, (_, i) => `HE ${i + 1}`).join(",")}`;
const row = (node: string, value: string, price: string) =>
  `${node},Hub,${value},${Array.from({ length: 24 }, () => price).join(",")}`;

describe("1. the ordinary day, against known source values", () => {
  const parsed = misoAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));

  it("reads 24 hours, always", () => {
    expect(parsed.records).toHaveLength(24);
    expect(parsed.sourceSchema.clock).toBe("Eastern Standard Time, fixed offset");
  });

  it("derives the energy component from the exact components MISO published", () => {
    // INDIANA.HUB HE 1: LMP 28.47, MCC .6, MLC .2. Residual 28.47 - 0.6 - 0.2 = 27.67.
    const first = parsed.records[0]!;
    expect(first.raw.nativeIntervalLabel).toBe("HE 1");
    expect(first.raw.nativeComponents).toMatchObject({ LMP: "28.47", MCC: ".6", MLC: ".2", Node: "INDIANA.HUB" });
    expect(first.benchmarkPrice).toBe("27.67");
    // HE 13: 34.4 - 0.45 - 1.26 = 32.69.
    expect(parsed.records[12]!.benchmarkPrice).toBe("32.69");
  });

  it("keeps MISO's own spelling of a value below one, and still computes correctly", () => {
    // MISO writes .6 rather than 0.6. The raw record preserves the spelling; the arithmetic does not.
    expect(parsed.records[0]!.raw.nativeComponents.MCC).toBe(".6");
    expect(parsed.records[0]!.benchmarkPrice).toBe("27.67");
  });

  it("places hour-ending 1 at 05:00 UTC, because the clock is a fixed offset", () => {
    expect(parsed.records[0]!.intervalStartUtc).toBe("2026-09-23T05:00:00.000Z");
    expect(parsed.records.at(-1)!.intervalStartUtc).toBe("2026-09-24T04:00:00.000Z");
  });

  it("agrees with a second official hub, which is what makes this the system price", () => {
    const carrier = new Map(parsed.records.map((r) => [r.intervalStartUtc, r.benchmarkPrice]));
    expect(parsed.crossCheckRecords).toHaveLength(24);
    for (const record of parsed.crossCheckRecords) {
      expect(record.benchmarkPrice, record.intervalStartUtc).toBe(carrier.get(record.intervalStartUtc));
    }
  });

  it("filters on the eight official hub names, never on the broad Type flag", () => {
    // The fixture deliberately retains ILLINOIS.HUB, MICHIGAN.HUB and other nodes; none is used.
    expect(parsed.rejected.some((row) => row.detail.includes("ILLINOIS.HUB is an official hub but not a carrier"))).toBe(true);
    expect(parsed.rejected.some((row) => row.detail.includes("AECI"))).toBe(true);
    expect(parsed.records.every((record) => record.raw.nativeComponents.Node === "INDIANA.HUB")).toBe(true);
  });
});

describe("2. the day never changes length", () => {
  it("publishes 24 hours on spring forward", () => {
    const parsed = misoAdapter.parse("2026-03-08", fixtureArtifacts(SPRING, "day"));
    expect(parsed.records).toHaveLength(24);
    expect(parsed.records[0]!.intervalStartUtc).toBe("2026-03-08T05:00:00.000Z");
    expect(parsed.records.at(-1)!.intervalStartUtc).toBe("2026-03-09T04:00:00.000Z");
  });

  it("publishes 24 hours on fall back", () => {
    const parsed = misoAdapter.parse("2025-11-02", fixtureArtifacts(FALL, "day"));
    expect(parsed.records).toHaveLength(24);
    const instants = parsed.records.map((record) => record.intervalStartUtc);
    expect(new Set(instants).size).toBe(24);
  });
});

describe("3. the report must be the one the specification names", () => {
  it("refuses a report whose preamble states a different operating day", () => {
    expect(() => misoAdapter.parse("2026-09-24", fixtureArtifacts(ORDINARY, "day")))
      .toThrow(/states operating day 2026-09-23, not 2026-09-24/);
  });

  it("refuses a report that no longer identifies itself as ex-post", () => {
    const text = PREAMBLE.replace("ExPost", "ExAnte") + `${HEADER}\n${row("INDIANA.HUB", "LMP", "1")}\n`;
    expect(() => misoAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/does not identify itself as ex-post/);
  });

  it("refuses a report that no longer states Eastern Standard Time", () => {
    const text = PREAMBLE.replace("All Hours-Ending are Eastern Standard Time (EST)", "All Hours-Ending are local time")
      + `${HEADER}\n${row("INDIANA.HUB", "LMP", "1")}\n`;
    expect(() => misoAdapter.parse("2026-09-23", csvArtifact(text)))
      .toThrow(/no longer states that hours-ending are Eastern Standard Time/);
  });

  it("refuses a report with the wrong number of hour columns", () => {
    const shortHeader = `Node,Type,Value,${Array.from({ length: 23 }, (_, i) => `HE ${i + 1}`).join(",")}`;
    const text = `${PREAMBLE}${shortHeader}\nINDIANA.HUB,Hub,LMP,${Array.from({ length: 23 }, () => "1").join(",")}\n`;
    expect(() => misoAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/23 hour columns/);
  });

  it("refuses a node that is missing one of its three components", () => {
    const text = `${PREAMBLE}${HEADER}\n${row("INDIANA.HUB", "LMP", "1")}\n${row("INDIANA.HUB", "MCC", "0")}\n`
      + `${row("MINN.HUB", "LMP", "1")}\n${row("MINN.HUB", "MCC", "0")}\n${row("MINN.HUB", "MLC", "0")}\n`;
    expect(() => misoAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/has no MLC row/);
  });

  it("refuses a file with no carrier rows at all", () => {
    const text = `${PREAMBLE}${HEADER}\n${row("ILLINOIS.HUB", "LMP", "1")}\n`;
    expect(() => misoAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/holds no INDIANA.HUB rows/);
  });

  it("refuses a non-numeric component", () => {
    const text = `${PREAMBLE}${HEADER}\n${row("INDIANA.HUB", "LMP", "n/a")}\n${row("INDIANA.HUB", "MCC", "0")}\n`
      + `${row("INDIANA.HUB", "MLC", "0")}\n${row("MINN.HUB", "LMP", "1")}\n${row("MINN.HUB", "MCC", "0")}\n`
      + `${row("MINN.HUB", "MLC", "0")}\n`;
    expect(() => misoAdapter.parse("2026-09-23", csvArtifact(text))).toThrow(/unparseable component/);
  });

  it("requests the ex-post file, never the ex-ante sibling", () => {
    const [request] = misoAdapter.artifactsFor("2026-09-23");
    expect(request!.url).toContain("20260923_da_expost_lmp.csv");
    expect(request!.url).not.toContain("exante");
  });

  it("refuses a day with no artifact", () => {
    expect(() => misoAdapter.parse("2026-09-23", new Map())).toThrow(UepiSourceError);
  });
});

describe("4. the day's arithmetic", () => {
  it("reproduces the daily mean of the derived energy component", () => {
    const parsed = misoAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));
    expect(meanDecimal(parsed.records.map((record) => record.benchmarkPrice), 6)).toBe("37.195833");
  });
});
