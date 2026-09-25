import { describe, expect, it } from "vitest";

import { meanDecimal } from "@/lib/uepi/decimal";
import { nyisoAdapter } from "@/lib/uepi/source/adapters/nyiso";
import { fixtureArtifact, fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";
import { UepiSourceError, type RetrievedArtifact } from "@/lib/uepi/source/types";

/** Pinned to NYISO's own P-2A files for three named operating days. */
const ORDINARY = "nyiso-2026-09-23.csv";
const MARCH_ARCHIVE = "nyiso-2026-03.zip";
const NOVEMBER_ARCHIVE = "nyiso-2025-11.zip";

describe("1. the ordinary day, against known source values", () => {
  const parsed = nyisoAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "daily"));

  it("reads 24 hours from the carrier zone", () => {
    expect(parsed.records).toHaveLength(24);
    expect(parsed.sourceSchema.carrierZone).toBe("WEST");
    expect(parsed.sourceSchema.artifact).toBe("daily");
  });

  it("derives the reference price from the exact components NYISO published", () => {
    // 09/23/2026 00:00 WEST: LBMP 30.71, losses -3.11, congestion 0.00.
    // lambda = 30.71 - (-3.11) + 0.00 = 33.82.
    const first = parsed.records[0]!;
    expect(first.raw.nativeIntervalLabel).toBe("09/23/2026 00:00");
    expect(first.raw.nativeValue).toBe("30.71");
    expect(first.raw.nativeComponents["Marginal Cost Losses ($/MWHr)"]).toBe("-3.11");
    expect(first.raw.nativeComponents.PTID).toBe("61752");
    expect(first.benchmarkPrice).toBe("33.82");
    // Hour beginning 12:00 local, which is 16:00 UTC in September.
    const noon = parsed.records.find((record) => record.intervalStartUtc === "2026-09-23T16:00:00.000Z")!;
    expect(noon.raw.nativeValue).toBe("27.15");
    expect(noon.benchmarkPrice).toBe("29.19");
  });

  it("maps hour-beginning local labels onto the right instants", () => {
    expect(parsed.records[0]!.intervalStartUtc).toBe("2026-09-23T04:00:00.000Z");
    expect(parsed.records.at(-1)!.intervalStartUtc).toBe("2026-09-24T03:00:00.000Z");
  });

  it("never reads an external proxy zone, and says so for each row it drops", () => {
    const externals = parsed.rejected.filter((row) =>
      ["H Q", "NPX", "O H", "PJM"].some((name) => row.detail.startsWith(name)));
    expect(externals.length).toBe(4 * 24);
    expect(parsed.records.every((record) => record.raw.nativeComponents.Name === "WEST")).toBe(true);
  });

  it("confirms the identity against a second internal zone", () => {
    const carrier = new Map(parsed.records.map((r) => [r.intervalStartUtc, Number(r.benchmarkPrice)]));
    expect(parsed.crossCheckRecords).toHaveLength(24);
    for (const record of parsed.crossCheckRecords) {
      // A cent of rounding, and not a second price: the components are published rounded, so the
      // residual lands within one cent rather than exactly equal.
      expect(Math.abs(carrier.get(record.intervalStartUtc)! - Number(record.benchmarkPrice)))
        .toBeLessThan(0.0101);
    }
  });
});

describe("2. the fall-back day, where row order is the only discriminator", () => {
  const parsed = nyisoAdapter.parse("2025-11-02", fixtureArtifacts(NOVEMBER_ARCHIVE, "monthly"));

  it("keeps 25 hours", () => {
    expect(parsed.records).toHaveLength(25);
    expect(parsed.sourceSchema.artifact).toBe("monthly_archive");
  });

  it("keeps both rows printed 01:00, as two different instants and two different prices", () => {
    const repeated = parsed.records.filter((record) => record.raw.nativeIntervalLabel === "11/02/2025 01:00");
    expect(repeated).toHaveLength(2);
    // Daylight time first, then standard time: 05:00 and 06:00 UTC.
    expect(repeated.map((record) => record.intervalStartUtc))
      .toEqual(["2025-11-02T05:00:00.000Z", "2025-11-02T06:00:00.000Z"]);
    // WEST printed LBMP 50.72 then 48.63, with losses -0.72 and -1.45.
    expect(repeated.map((record) => record.raw.nativeValue)).toEqual(["50.72", "48.63"]);
    expect(repeated.map((record) => record.benchmarkPrice)).toEqual(["51.44", "50.08"]);
  });

  it("would lose an hour if the timestamp string were the key", () => {
    const labels = parsed.records.map((record) => record.raw.nativeIntervalLabel);
    expect(new Set(labels).size).toBe(24);
    expect(new Set(parsed.records.map((record) => record.intervalStartUtc)).size).toBe(25);
  });
});

describe("3. the spring-forward day", () => {
  const parsed = nyisoAdapter.parse("2026-03-08", fixtureArtifacts(MARCH_ARCHIVE, "monthly"));

  it("keeps 23 hours and no 02:00 label", () => {
    expect(parsed.records).toHaveLength(23);
    const labels = parsed.records.map((record) => record.raw.nativeIntervalLabel);
    expect(labels).toContain("03/08/2026 01:00");
    expect(labels).not.toContain("03/08/2026 02:00");
    expect(labels).toContain("03/08/2026 03:00");
  });

  it("spans 23 contiguous instants, because the gap is in the labels and not in time", () => {
    // Nothing is missing in UTC: the clocks skip a label, so the local day is simply an hour
    // shorter. 01:00 EST is 06:00Z and the next row, labelled 03:00 EDT, is 07:00Z.
    const instants = parsed.records.map((record) => Date.parse(record.intervalStartUtc));
    expect(instants[0]).toBe(Date.parse("2026-03-08T05:00:00.000Z"));
    expect(instants.at(-1)).toBe(Date.parse("2026-03-09T03:00:00.000Z"));
    for (let index = 1; index < instants.length; index += 1) {
      expect(instants[index]! - instants[index - 1]!).toBe(3_600_000);
    }
    const labelled = parsed.records.map((record) =>
      [record.raw.nativeIntervalLabel, record.intervalStartUtc] as const);
    expect(labelled[1]).toEqual(["03/08/2026 01:00", "2026-03-08T06:00:00.000Z"]);
    expect(labelled[2]).toEqual(["03/08/2026 03:00", "2026-03-08T07:00:00.000Z"]);
  });
});

describe("4. the archive path a backfill actually uses", () => {
  it("requests the daily URL and the monthly archive, both optional", () => {
    const requests = nyisoAdapter.artifactsFor("2026-03-08");
    expect(requests.map((request) => request.label)).toEqual(["daily", "monthly"]);
    expect(requests[0]!.url).toContain("20260308damlbmp_zone.csv");
    expect(requests[1]!.url).toContain("20260301damlbmp_zone_csv.zip");
    expect(requests.every((request) => request.optional === true)).toBe(true);
  });

  it("prefers the daily file when both were retrieved", () => {
    const both = new Map<string, RetrievedArtifact>([
      ["daily", fixtureArtifact(ORDINARY, "daily")],
      ["monthly", fixtureArtifact(NOVEMBER_ARCHIVE, "monthly")],
    ]);
    expect(nyisoAdapter.parse("2026-09-23", both).sourceSchema.artifact).toBe("daily");
  });

  it("fails when neither artifact was retrieved", () => {
    expect(() => nyisoAdapter.parse("2026-09-23", new Map())).toThrow(UepiSourceError);
  });

  it("fails when the archive holds no member for the requested day", () => {
    expect(() => nyisoAdapter.parse("2025-12-25", fixtureArtifacts(NOVEMBER_ARCHIVE, "monthly")))
      .toThrow(/holds no member/);
  });
});

describe("5. malformed input", () => {
  function csvArtifact(text: string): Map<string, RetrievedArtifact> {
    const body = Buffer.from(text, "utf8");
    return new Map([["daily", {
      label: "daily", url: "https://example.invalid", retrievedAt: "2026-09-25T00:00:00.000Z",
      status: 200, contentType: "text/csv", byteLength: body.byteLength, sha256: "0".repeat(64), body,
    }]]);
  }
  const header = "Time Stamp,Name,PTID,LBMP ($/MWHr),Marginal Cost Losses ($/MWHr),Marginal Cost Congestion ($/MWHr)";

  it("refuses a renamed header rather than reading by position", () => {
    expect(() => nyisoAdapter.parse("2026-09-23", csvArtifact("Time Stamp,Zone,PTID,Price\n")))
      .toThrow(/SCHEMA_MISMATCH|missing/);
  });

  it("refuses a blank component instead of treating it as zero", () => {
    expect(() => nyisoAdapter.parse("2026-09-23",
      csvArtifact(`${header}\n09/23/2026 00:00,WEST,61752,30.71,,0.00\n`))).toThrow(/missing a component/);
  });

  it("refuses a non-numeric price", () => {
    expect(() => nyisoAdapter.parse("2026-09-23",
      csvArtifact(`${header}\n09/23/2026 00:00,WEST,61752,n/a,0.00,0.00\n`))).toThrow(/unparseable/);
  });

  it("refuses a row whose label does not match its position", () => {
    expect(() => nyisoAdapter.parse("2026-09-23",
      csvArtifact(`${header}\n09/23/2026 05:00,WEST,61752,30.71,0.00,0.00\n`)))
      .toThrow(/prints '09\/23\/2026 05:00' where position 1/);
  });

  it("refuses a file with no carrier rows", () => {
    expect(() => nyisoAdapter.parse("2026-09-23",
      csvArtifact(`${header}\n09/23/2026 00:00,N.Y.C.,61761,30.71,0.00,0.00\n`)))
      .toThrow(/holds no WEST rows/);
  });
});

describe("6. the day's arithmetic", () => {
  it("reproduces the daily mean of the derived reference price", () => {
    const parsed = nyisoAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "daily"));
    expect(meanDecimal(parsed.records.map((record) => record.benchmarkPrice), 6)).toBe("35.225000");
  });
});
