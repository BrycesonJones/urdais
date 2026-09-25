import { describe, expect, it } from "vitest";

import { meanDecimal } from "@/lib/uepi/decimal";
import { isoneAdapter } from "@/lib/uepi/source/adapters/isone";
import { fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";
import { UepiSourceError, type RetrievedArtifact } from "@/lib/uepi/source/types";

/** Pinned to the first ISO-NE payloads Urdais has ever observed. */
const ORDINARY = "isone-2026-09-23.json";
const SPRING = "isone-2026-03-08.json";
const FALL = "isone-2025-11-02.json";

function jsonArtifact(body: string): Map<string, RetrievedArtifact> {
  const buffer = Buffer.from(body, "utf8");
  return new Map([["day", {
    label: "day", url: "https://webservices.iso-ne.com/api/v1.1/hourlylmp/da/final/day/20260923/location/4000.json",
    retrievedAt: "2026-09-25T18:06:00.000Z", status: 200, contentType: "application/json",
    byteLength: buffer.byteLength, sha256: "0".repeat(64), body: buffer,
  }]]);
}

const hub = (begin: string, total: number) =>
  `{"BeginDate":"${begin}","Location":{"@LocId":"4000","@LocType":"HUB","$":".H.INTERNAL_HUB"},`
  + `"LmpTotal":${total},"EnergyComponent":${total},"CongestionComponent":0,"LossComponent":0}`;

describe("1. the observed payload matches the frozen specification", () => {
  const parsed = isoneAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));

  it("confirms the container and the field names the derived schema had", () => {
    expect(parsed.sourceSchema.container).toBe("HourlyLmps.HourlyLmp");
    expect(parsed.sourceSchema.fields)
      .toBe("BeginDate,Location,LmpTotal,EnergyComponent,CongestionComponent,LossComponent");
    expect(parsed.sourceSchema.report).toBe("hourlylmp/da/final");
  });

  it("confirms the benchmark is the internal Hub at location 4000", () => {
    expect(parsed.sourceSchema.locationId).toBe("4000");
    expect(parsed.sourceSchema.locationName).toBe(".H.INTERNAL_HUB");
    for (const record of parsed.records) {
      expect(record.raw.nativeComponents.LocId).toBe("4000");
      expect(record.raw.nativeComponents.LocType).toBe("HUB");
    }
    const [request] = isoneAdapter.artifactsFor("2026-09-23");
    expect(request!.url).toContain("/hourlylmp/da/final/day/20260923/location/4000.json");
  });

  it("takes the Hub's total LMP, which is the tariff's node average", () => {
    const first = parsed.records[0]!;
    expect(first.benchmarkPrice).toBe("31.5");
    expect(first.raw.nativeComponents.EnergyComponent).toBe("31.28");
    expect(first.raw.nativeComponents.LossComponent).toBe("0.22");
    // The delivered price, not the energy component: those differ by the loss term here.
    expect(first.benchmarkPrice).not.toBe(first.raw.nativeComponents.EnergyComponent);
  });

  it("reads hour-beginning instants from the offset the source states", () => {
    expect(parsed.records).toHaveLength(24);
    const first = parsed.records[0]!;
    expect(first.raw.nativeIntervalLabel).toBe("2026-09-23T00:00:00.000-04:00");
    expect(first.intervalStartUtc).toBe("2026-09-23T04:00:00.000Z");
    expect(parsed.records[11]!.raw.nativeIntervalLabel).toBe("2026-09-23T11:00:00.000-04:00");
    expect(parsed.records[11]!.benchmarkPrice).toBe("26.42");
    expect(parsed.records[23]!.intervalStartUtc).toBe("2026-09-24T03:00:00.000Z");
  });

  it("needs no cross-check, because the ISO already averaged the Hub's nodes", () => {
    expect(parsed.crossCheckRecords).toHaveLength(0);
  });
});

describe("2. daylight saving needs no convention here", () => {
  it("returns 23 hours on spring forward, with the offset moving inside the day", () => {
    const parsed = isoneAdapter.parse("2026-03-08", fixtureArtifacts(SPRING, "day"));
    expect(parsed.records).toHaveLength(23);
    expect(parsed.records[0]!.raw.nativeIntervalLabel).toBe("2026-03-08T00:00:00.000-05:00");
    expect(parsed.records[1]!.raw.nativeIntervalLabel).toBe("2026-03-08T01:00:00.000-05:00");
    // The clocks jump: the next hour is 03:00 local, an hour later in instants.
    expect(parsed.records[2]!.raw.nativeIntervalLabel).toBe("2026-03-08T03:00:00.000-04:00");
    expect(parsed.records[2]!.intervalStartUtc).toBe("2026-03-08T07:00:00.000Z");
    expect(parsed.records[2]!.benchmarkPrice).toBe("25.14");
  });

  it("returns 25 hours on fall back, with the repeated hour separated by the offset itself", () => {
    const parsed = isoneAdapter.parse("2025-11-02", fixtureArtifacts(FALL, "day"));
    expect(parsed.records).toHaveLength(25);
    const repeated = parsed.records.filter((record) =>
      record.raw.nativeIntervalLabel.startsWith("2025-11-02T01:00:00.000"));
    expect(repeated).toHaveLength(2);
    expect(repeated.map((record) => record.raw.nativeIntervalLabel))
      .toEqual(["2025-11-02T01:00:00.000-04:00", "2025-11-02T01:00:00.000-05:00"]);
    expect(repeated.map((record) => record.intervalStartUtc))
      .toEqual(["2025-11-02T05:00:00.000Z", "2025-11-02T06:00:00.000Z"]);
    expect(repeated.map((record) => record.benchmarkPrice)).toEqual(["33.89", "31.96"]);
  });

  it("keeps instants unique and ascending on every day", () => {
    for (const [date, file] of [["2026-09-23", ORDINARY], ["2026-03-08", SPRING], ["2025-11-02", FALL]] as const) {
      const instants = isoneAdapter.parse(date, fixtureArtifacts(file, "day"))
        .records.map((record) => Date.parse(record.intervalStartUtc));
      expect(new Set(instants).size, date).toBe(instants.length);
      expect([...instants].sort((a, b) => a - b), date).toEqual(instants);
    }
  });
});

describe("3. malformed responses fail loudly", () => {
  it("refuses a payload that is not JSON", () => {
    expect(() => isoneAdapter.parse("2026-09-23", jsonArtifact("<html/>"))).toThrow(/not JSON/);
  });

  it("refuses a renamed container", () => {
    expect(() => isoneAdapter.parse("2026-09-23", jsonArtifact('{"HourlyPrices":{}}')))
      .toThrow(/no HourlyLmps.HourlyLmp/);
  });

  it("refuses an empty day", () => {
    expect(() => isoneAdapter.parse("2026-09-23", jsonArtifact('{"HourlyLmps":{"HourlyLmp":[]}}')))
      .toThrow(UepiSourceError);
  });

  it("refuses a malformed BeginDate", () => {
    const body = `{"HourlyLmps":{"HourlyLmp":[${hub("not-a-date", 1)}]}}`;
    expect(() => isoneAdapter.parse("2026-09-23", jsonArtifact(body))).toThrow(/BeginDate 'not-a-date'/);
  });

  it("refuses a missing LmpTotal instead of reading it as zero", () => {
    const body = '{"HourlyLmps":{"HourlyLmp":[{"BeginDate":"2026-09-23T00:00:00.000-04:00",'
      + '"Location":{"@LocId":"4000"},"EnergyComponent":1}]}}';
    expect(() => isoneAdapter.parse("2026-09-23", jsonArtifact(body))).toThrow(/no LmpTotal/);
  });

  it("rejects a row for another location rather than averaging it in", () => {
    const body = `{"HourlyLmps":{"HourlyLmp":[${hub("2026-09-23T00:00:00.000-04:00", 10)},`
      + '{"BeginDate":"2026-09-23T01:00:00.000-04:00","Location":{"@LocId":"4001","@LocType":"LOAD ZONE"},"LmpTotal":99}]}}';
    const parsed = isoneAdapter.parse("2026-09-23", jsonArtifact(body));
    expect(parsed.records).toHaveLength(1);
    expect(parsed.rejected[0]!.detail).toContain("4001");
  });

  it("refuses two rows claiming the same instant", () => {
    const row = hub("2026-09-23T00:00:00.000-04:00", 10);
    expect(() => isoneAdapter.parse("2026-09-23", jsonArtifact(`{"HourlyLmps":{"HourlyLmp":[${row},${row}]}}`)))
      .toThrow(/two rows claim/);
  });

  it("refuses a day with no artifact", () => {
    expect(() => isoneAdapter.parse("2026-09-23", new Map())).toThrow(UepiSourceError);
  });
});

describe("4. signed and zero prices survive", () => {
  it("keeps a negative Hub price exactly", () => {
    const body = `{"HourlyLmps":{"HourlyLmp":[${hub("2026-09-23T00:00:00.000-04:00", -7.25)},`
      + `${hub("2026-09-23T01:00:00.000-04:00", 0)}]}}`;
    const parsed = isoneAdapter.parse("2026-09-23", jsonArtifact(body));
    expect(parsed.records.map((record) => record.benchmarkPrice)).toEqual(["-7.25", "0"]);
  });
});

describe("5. the day's arithmetic", () => {
  it("reproduces the daily mean from the parsed hours", () => {
    const parsed = isoneAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));
    const prices = parsed.records.map((record) => Number(record.benchmarkPrice));
    const byHand = prices.reduce((total, price) => total + price, 0) / prices.length;
    const exact = meanDecimal(parsed.records.map((record) => record.benchmarkPrice), 6);
    expect(Number(exact)).toBeCloseTo(byHand, 6);
    expect(exact).toBe("33.567500");
  });
});
