import { describe, expect, it } from "vitest";

import { meanDecimal } from "@/lib/uepi/decimal";
import { ercotAdapter } from "@/lib/uepi/source/adapters/ercot";
import { fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";
import { UepiSourceError, type RetrievedArtifact } from "@/lib/uepi/source/types";

/** Pinned to three authenticated NP4-190-CD responses, captured on named operating days. */
const ORDINARY = "ercot-2026-09-23.json";
const SPRING = "ercot-2026-03-08.json";
const FALL = "ercot-2025-11-02.json";

function jsonArtifact(body: string): Map<string, RetrievedArtifact> {
  const buffer = Buffer.from(body, "utf8");
  return new Map([["day", {
    label: "day", url: "https://api.ercot.com/api/public-reports/np4-190-cd/dam_stlmnt_pnt_prices",
    retrievedAt: "2026-09-25T18:05:00.000Z", status: 200, contentType: "application/json",
    byteLength: buffer.byteLength, sha256: "0".repeat(64), body: buffer,
  }]]);
}

const FIELDS = '"fields":[{"name":"deliveryDate"},{"name":"hourEnding"},{"name":"settlementPoint"},'
  + '{"name":"settlementPointPrice"},{"name":"DSTFlag"}]';

describe("1. the ordinary day, against known source values", () => {
  const parsed = ercotAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));

  it("reads 24 hourly settlement point prices", () => {
    expect(parsed.records).toHaveLength(24);
    expect(parsed.seriesId).toBe("uepi-ercot");
    expect(parsed.sourceSchema.settlementPoint).toBe("HB_HUBAVG");
    expect(parsed.sourceSchema.report).toBe("np4-190-cd");
  });

  it("extracts the exact prices ERCOT published", () => {
    // Hour ending 01:00 is the hour beginning at midnight Central, which is 05:00 UTC in September.
    const first = parsed.records[0]!;
    expect(first.raw.nativeIntervalLabel).toBe("01:00");
    expect(first.intervalStartUtc).toBe("2026-09-23T05:00:00.000Z");
    expect(first.benchmarkPrice).toBe("37.9");
    expect(parsed.records[11]!.raw.nativeIntervalLabel).toBe("12:00");
    expect(parsed.records[11]!.benchmarkPrice).toBe("28.9");
    const last = parsed.records[23]!;
    expect(last.raw.nativeIntervalLabel).toBe("24:00");
    expect(last.benchmarkPrice).toBe("35.97");
    expect(last.intervalStartUtc).toBe("2026-09-24T04:00:00.000Z");
  });

  it("keeps the hub identity and the DST flag on every row", () => {
    for (const record of parsed.records) {
      expect(record.raw.nativeComponents.settlementPoint).toBe("HB_HUBAVG");
      expect(record.raw.nativeComponents.DSTFlag).toBe("false");
      expect(record.raw.nativeOperatingDate).toBe("2026-09-23");
    }
  });

  it("takes only the canonical hub, and asks the API for only that hub", () => {
    const [request] = ercotAdapter.artifactsFor("2026-09-23");
    expect(request!.url).toContain("settlementPoint=HB_HUBAVG");
    expect(request!.url).toContain("np4-190-cd/dam_stlmnt_pnt_prices");
    // Never the regional hubs, the bus-average hub, the Panhandle hub or a load zone.
    for (const other of ["HB_NORTH", "HB_BUSAVG", "HB_PAN", "LZ_HOUSTON"]) {
      expect(request!.url).not.toContain(other);
      expect(JSON.stringify(parsed.records)).not.toContain(other);
    }
    expect(parsed.crossCheckRecords).toHaveLength(0);
  });

  it("reads column positions from the payload's own field list", () => {
    expect(parsed.sourceSchema.fields)
      .toBe("deliveryDate,hourEnding,settlementPoint,settlementPointPrice,DSTFlag");
  });
});

describe("2. daylight saving, as ERCOT actually expresses it", () => {
  it("publishes 23 rows on spring forward and omits the hour-ending label", () => {
    const parsed = ercotAdapter.parse("2026-03-08", fixtureArtifacts(SPRING, "day"));
    expect(parsed.records).toHaveLength(23);
    const labels = parsed.records.map((record) => record.raw.nativeIntervalLabel);
    expect(labels.slice(0, 3)).toEqual(["01:00", "02:00", "04:00"]);
    expect(labels).not.toContain("03:00");
    expect(parsed.records[0]!.intervalStartUtc).toBe("2026-03-08T06:00:00.000Z");
    expect(parsed.records[1]!.benchmarkPrice).toBe("36.24");
    // The hour labelled 02:00 begins at 01:00 CST and ends at 03:00 CDT by the clock.
    expect(parsed.records[1]!.intervalStartUtc).toBe("2026-03-08T07:00:00.000Z");
    expect(parsed.records[2]!.intervalStartUtc).toBe("2026-03-08T08:00:00.000Z");
  });

  it("publishes 25 rows on fall back and separates the repeat with DSTFlag", () => {
    const parsed = ercotAdapter.parse("2025-11-02", fixtureArtifacts(FALL, "day"));
    expect(parsed.records).toHaveLength(25);
    const repeated = parsed.records.filter((record) => record.raw.nativeIntervalLabel === "02:00");
    expect(repeated).toHaveLength(2);
    // Daylight time first, then standard time: 06:00 and 07:00 UTC.
    expect(repeated.map((record) => record.intervalStartUtc))
      .toEqual(["2025-11-02T06:00:00.000Z", "2025-11-02T07:00:00.000Z"]);
    expect(repeated.map((record) => record.raw.nativeComponents.DSTFlag)).toEqual(["true", "false"]);
    expect(repeated.map((record) => record.benchmarkPrice)).toEqual(["48.25", "46.44"]);
  });

  it("would place the repeated hours in either order without the flag", () => {
    const parsed = ercotAdapter.parse("2025-11-02", fixtureArtifacts(FALL, "day"));
    const labels = parsed.records.map((record) => record.raw.nativeIntervalLabel);
    expect(new Set(labels).size).toBe(24);
    expect(new Set(parsed.records.map((record) => record.intervalStartUtc)).size).toBe(25);
  });

  it("keeps instants unique and ascending on every day", () => {
    for (const [date, file] of [["2026-09-23", ORDINARY], ["2026-03-08", SPRING], ["2025-11-02", FALL]] as const) {
      const instants = ercotAdapter.parse(date, fixtureArtifacts(file, "day"))
        .records.map((record) => Date.parse(record.intervalStartUtc));
      expect(new Set(instants).size, date).toBe(instants.length);
      expect([...instants].sort((a, b) => a - b), date).toEqual(instants);
    }
  });
});

describe("3. malformed responses fail loudly", () => {
  it("refuses a payload that is not JSON", () => {
    expect(() => ercotAdapter.parse("2026-09-23", jsonArtifact("<html>gateway</html>")))
      .toThrow(/not JSON/);
  });

  it("refuses a renamed field rather than reading by position", () => {
    const body = `{"fields":[{"name":"deliveryDate"},{"name":"hour"},{"name":"settlementPoint"},`
      + `{"name":"settlementPointPrice"},{"name":"DSTFlag"}],"data":[]}`;
    expect(() => ercotAdapter.parse("2026-09-23", jsonArtifact(body))).toThrow(/missing 'hourEnding'/);
  });

  it("refuses an empty result", () => {
    expect(() => ercotAdapter.parse("2026-09-23", jsonArtifact(`{${FIELDS},"data":[]}`)))
      .toThrow(UepiSourceError);
  });

  it("refuses a paginated response, because one hub for one day cannot legitimately paginate", () => {
    const body = `{${FIELDS},"_meta":{"totalPages":2},"data":[["2026-09-23","01:00","HB_HUBAVG",1,false]]}`;
    expect(() => ercotAdapter.parse("2026-09-23", jsonArtifact(body))).toThrow(/claims 2 pages/);
  });

  it("refuses a row count that does not match the operating day", () => {
    const body = `{${FIELDS},"data":[["2026-09-23","01:00","HB_HUBAVG",1,false]]}`;
    expect(() => ercotAdapter.parse("2026-09-23", jsonArtifact(body))).toThrow(/1 rows for an operating day of 24 hours/);
  });

  it("refuses a blank price instead of reading it as zero", () => {
    const rows = Array.from({ length: 24 }, (_, index) =>
      `["2026-09-23","${String(index + 1).padStart(2, "0")}:00","HB_HUBAVG",${index === 3 ? '""' : "1"},false]`);
    expect(() => ercotAdapter.parse("2026-09-23", jsonArtifact(`{${FIELDS},"data":[${rows.join(",")}]}`)))
      .toThrow(/no settlement point price/);
  });

  it("refuses a non-numeric price", () => {
    const rows = Array.from({ length: 24 }, (_, index) =>
      `["2026-09-23","${String(index + 1).padStart(2, "0")}:00","HB_HUBAVG",${index === 3 ? '"n/a"' : "1"},false]`);
    expect(() => ercotAdapter.parse("2026-09-23", jsonArtifact(`{${FIELDS},"data":[${rows.join(",")}]}`)))
      .toThrow(/non-numeric/);
  });

  it("rejects a row for another settlement point rather than averaging it in", () => {
    const rows = Array.from({ length: 24 }, (_, index) =>
      `["2026-09-23","${String(index + 1).padStart(2, "0")}:00","HB_HUBAVG",1,false]`);
    const parsed = ercotAdapter.parse("2026-09-23",
      jsonArtifact(`{${FIELDS},"data":[${rows.join(",")},["2026-09-23","01:00","HB_NORTH",99,false]]}`));
    expect(parsed.records).toHaveLength(24);
    expect(parsed.rejected.some((row) => row.detail.includes("HB_NORTH"))).toBe(true);
  });

  it("refuses a day with no artifact", () => {
    expect(() => ercotAdapter.parse("2026-09-23", new Map())).toThrow(UepiSourceError);
  });
});

describe("4. signed and zero prices survive", () => {
  it("keeps a negative settlement point price exactly", () => {
    const rows = Array.from({ length: 24 }, (_, index) =>
      `["2026-09-23","${String(index + 1).padStart(2, "0")}:00","HB_HUBAVG",${index === 0 ? "-12.34" : index === 1 ? "0" : "10"},false]`);
    const parsed = ercotAdapter.parse("2026-09-23", jsonArtifact(`{${FIELDS},"data":[${rows.join(",")}]}`));
    expect(parsed.records[0]!.benchmarkPrice).toBe("-12.34");
    expect(parsed.records[1]!.benchmarkPrice).toBe("0");
  });
});

describe("5. the day's arithmetic", () => {
  it("reproduces the daily mean from the parsed hours", () => {
    const parsed = ercotAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));
    const prices = parsed.records.map((record) => Number(record.benchmarkPrice));
    const byHand = prices.reduce((total, price) => total + price, 0) / prices.length;
    const exact = meanDecimal(parsed.records.map((record) => record.benchmarkPrice), 6);
    expect(Number(exact)).toBeCloseTo(byHand, 6);
    expect(exact).toBe("44.251250");
  });
});
