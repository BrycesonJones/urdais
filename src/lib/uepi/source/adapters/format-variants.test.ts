import { describe, expect, it } from "vitest";

import { meanDecimal } from "@/lib/uepi/decimal";
import { misoAdapter } from "@/lib/uepi/source/adapters/miso";
import { sppAdapter } from "@/lib/uepi/source/adapters/spp";
import { fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";
import { isConnectionFailure } from "@/lib/uepi/store";
import { UepiSourceError, type RetrievedArtifact } from "@/lib/uepi/source/types";

/**
 * The source spellings a thirteen-month production backfill found, each pinned to the day it was
 * found on.
 *
 * Eleven SPP days and one MISO day were refused by parsers written against a single sample of each
 * file. The refusals were right -- a reader that guesses at an unfamiliar shape is how MEC ends up
 * read out of the wrong column -- but the shapes turn out to be ordinary variance in how the same
 * publisher writes the same field, so they are now recognised, from evidence, one variant at a time.
 */

function csvArtifact(text: string): Map<string, RetrievedArtifact> {
  const body = Buffer.from(text, "utf8");
  return new Map([["day", {
    label: "day", url: "https://example.invalid", retrievedAt: "2026-09-26T00:00:00.000Z",
    status: 200, contentType: "text/csv", byteLength: body.byteLength, sha256: "0".repeat(64), body,
  }]]);
}

describe("1. SPP writes its GMT interval end three ways", () => {
  it("reads the documented form: 09/23/2026 06:00:00", () => {
    const parsed = sppAdapter.parse("2026-09-23", fixtureArtifacts("spp-2026-09-23.csv", "day"));
    expect(parsed.records[0]!.raw.nativeIntervalUtc).toBe("2026-09-23T06:00:00.000Z");
    expect(parsed.records[0]!.intervalStartUtc).toBe("2026-09-23T05:00:00.000Z");
  });

  it("reads the unpadded, secondless form: 4/1/2026 6:00", () => {
    const parsed = sppAdapter.parse("2026-04-01", fixtureArtifacts("spp-2026-04-01.csv", "day"));
    expect(parsed.records).toHaveLength(24);
    const first = parsed.records[0]!;
    expect(first.raw.nativeIntervalLabel).toBe("4/1/2026 1:00");
    // Hour-ending 06:00 GMT: the hour begins at 05:00 GMT, exactly as the padded form resolves.
    expect(first.raw.nativeIntervalUtc).toBe("2026-04-01T06:00:00.000Z");
    expect(first.intervalStartUtc).toBe("2026-04-01T05:00:00.000Z");
    expect(first.benchmarkPrice).toBe("23.0599");
  });

  it("reads the padded-hour, secondless form: 6/1/2026 06:00", () => {
    const parsed = sppAdapter.parse("2026-06-01", fixtureArtifacts("spp-2026-06-01.csv", "day"));
    expect(parsed.records).toHaveLength(24);
    expect(parsed.records[0]!.raw.nativeIntervalLabel).toBe("6/1/2026 01:00");
    expect(parsed.records[0]!.intervalStartUtc).toBe("2026-06-01T05:00:00.000Z");
    expect(parsed.records[0]!.benchmarkPrice).toBe("17.4564");
  });

  it("still refuses a timestamp whose meaning would differ", () => {
    const header = "Interval,GMTIntervalEnd,BAA,Settlement Location,Pnode,LMP,MLC,MCC,MEC";
    for (const stamp of ["1/4/26 6:00", "2026-04-01 06:00", "4/1/2026 6:00 CST", "4/1/2026"]) {
      const row = `4/1/2026 1:00,${stamp},SPP,SPPNORTH_HUB,SPPNORTH_H,1,0,0,1`;
      expect(() => sppAdapter.parse("2026-04-01", csvArtifact(`${header}\n${row}\n`)), stamp)
        .toThrow(/not MM\/DD\/YYYY/);
    }
  });
});

describe("2. SPP writes its header in more than one casing", () => {
  it("reads the all-uppercase header with SETTLEMENT_LOCATION", () => {
    const parsed = sppAdapter.parse("2026-06-04", fixtureArtifacts("spp-2026-06-04.csv", "day"));
    expect(parsed.records).toHaveLength(24);
    expect(parsed.sourceSchema.schemaVariant).toBe("with_baa");
    expect(parsed.sourceSchema.header)
      .toBe("INTERVAL,GMTINTERVALEND,BAA,SETTLEMENT_LOCATION,PNODE,LMP,MLC,MCC,MEC");
    expect(parsed.records[0]!.benchmarkPrice).toBe("12.819");
  });

  it("still excludes the western market from an uppercase file", () => {
    const parsed = sppAdapter.parse("2026-06-04", fixtureArtifacts("spp-2026-06-04.csv", "day"));
    expect(Number(parsed.sourceSchema.westernRowsExcluded)).toBeGreaterThan(0);
    expect(parsed.records.every((record) => record.raw.nativeComponents.BAA === "SPP")).toBe(true);
  });

  it("still refuses a header whose columns differ, however it is cased", () => {
    const renamed = "INTERVAL,GMTINTERVALEND,REGION,SETTLEMENT_LOCATION,PNODE,LMP,MLC,MCC,MEC\n"
      + "6/4/2026 1:00,6/4/2026 6:00,SPP,SPPNORTH_HUB,SPPNORTH_H,1,0,0,1\n";
    expect(() => sppAdapter.parse("2026-06-04", csvArtifact(renamed))).toThrow(/unrecognised header/);
  });

  it("does not treat a differently-spelled column as a different schema variant", () => {
    const upper = sppAdapter.parse("2026-06-04", fixtureArtifacts("spp-2026-06-04.csv", "day"));
    const documented = sppAdapter.parse("2026-09-23", fixtureArtifacts("spp-2026-09-23.csv", "day"));
    expect(upper.sourceSchema.schemaVariant).toBe(documented.sourceSchema.schemaVariant);
  });
});

describe("3. MISO writes its report date both padded and not", () => {
  it("reads the unpadded preamble date: 12/1/2025", () => {
    const parsed = misoAdapter.parse("2025-12-01", fixtureArtifacts("miso-2025-12-01.csv", "day"));
    expect(parsed.records).toHaveLength(24);
    // HE 1: 50.86 - (-1.31) - (-0.23) = 52.40
    expect(parsed.records[0]!.raw.nativeComponents).toMatchObject({ LMP: "50.86", MCC: "-1.31", MLC: "-0.23" });
    expect(parsed.records[0]!.benchmarkPrice).toBe("52.40");
    expect(parsed.records[0]!.raw.nativeOperatingDate).toBe("2025-12-01");
  });

  it("still refuses a report whose stated date is a different day", () => {
    expect(() => misoAdapter.parse("2025-12-02", fixtureArtifacts("miso-2025-12-01.csv", "day")))
      .toThrow(/states operating day 2025-12-01, not 2025-12-02/);
  });

  it("computes the same daily value however the date was written", () => {
    const parsed = misoAdapter.parse("2025-12-01", fixtureArtifacts("miso-2025-12-01.csv", "day"));
    expect(meanDecimal(parsed.records.map((r) => r.benchmarkPrice), 6)).toBe("69.505833");
  });
});

describe("4. a cancelled statement is transient in the same way a dropped connection is", () => {
  it("classifies SQLSTATE 57014 and its message as retryable", () => {
    // Verified against a real server rather than assumed: a statement cancelled by
    // `statement_timeout` raises 57014 with exactly this text, which is what one day of the
    // production backfill failed with and what a re-run then wrote without incident.
    expect(isConnectionFailure({ code: "57014" })).toBe(true);
    expect(isConnectionFailure(new Error("canceling statement due to statement timeout"))).toBe(true);
  });

  it("still refuses to retry a statement cancelled for any other reason", () => {
    // A user cancellation or a lock timeout is not the same event and must not be retried blindly.
    expect(isConnectionFailure(new Error("canceling statement due to user request"))).toBe(false);
    expect(isConnectionFailure({ code: "55P03" })).toBe(false);
    expect(isConnectionFailure({ code: "23514" })).toBe(false);
  });
});

describe("5. the days the backfill actually refused now parse", () => {
  const refused = [
    { market: "spp", date: "2026-04-01", file: "spp-2026-04-01.csv", hours: 24 },
    { market: "spp", date: "2026-06-01", file: "spp-2026-06-01.csv", hours: 24 },
    { market: "spp", date: "2026-06-04", file: "spp-2026-06-04.csv", hours: 24 },
    { market: "miso", date: "2025-12-01", file: "miso-2025-12-01.csv", hours: 24 },
  ] as const;

  it("parses every captured variant into a complete operating day", () => {
    for (const entry of refused) {
      const adapter = entry.market === "spp" ? sppAdapter : misoAdapter;
      const parsed = adapter.parse(entry.date, fixtureArtifacts(entry.file, "day"));
      expect(parsed.records.length, `${entry.market} ${entry.date}`).toBe(entry.hours);
      expect(parsed.rejected.length, `${entry.market} ${entry.date}`).toBeGreaterThan(0);
      for (const record of parsed.records) {
        expect(Number.isNaN(Date.parse(record.intervalStartUtc)), record.intervalStartUtc).toBe(false);
      }
    }
  });

  it("does not throw on any of them", () => {
    for (const entry of refused) {
      const adapter = entry.market === "spp" ? sppAdapter : misoAdapter;
      expect(() => adapter.parse(entry.date, fixtureArtifacts(entry.file, "day")),
        `${entry.market} ${entry.date}`).not.toThrow(UepiSourceError);
    }
  });
});
