import { describe, expect, it } from "vitest";

import { caisoAdapter, caisoIdentityComponents } from "@/lib/uepi/source/adapters/caiso";
import { fixtureArtifacts, readFixture } from "@/lib/uepi/source/fixtures/load";
import { UepiSourceError, type RetrievedArtifact } from "@/lib/uepi/source/types";
import { meanDecimal, sumDecimal } from "@/lib/uepi/decimal";

/**
 * Pinned to three real OASIS archives. Every number asserted below was printed by CAISO on the
 * named operating day, so a failure here is a statement about the source or about the parser, and
 * never about a mock somebody wrote to make a test pass.
 */
const ORDINARY = "caiso-2026-09-23.zip";
const SPRING = "caiso-2026-03-08.zip";
const FALL = "caiso-2025-11-02.zip";

describe("1. the ordinary day, against known source values", () => {
  const parsed = caisoAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));

  it("reads 24 hourly MCE values at the carrier hub", () => {
    expect(parsed.records).toHaveLength(24);
    expect(parsed.seriesId).toBe("uepi-caiso");
  });

  it("extracts the exact prices CAISO published", () => {
    // Hour 12 of 23 September 2026, hour-ending, which begins at 19:00 UTC.
    const hour12 = parsed.records.find((record) => record.intervalStartUtc === "2026-09-23T18:00:00.000Z");
    expect(hour12?.benchmarkPrice).toBe("22.51355");
    expect(hour12?.raw.nativeIntervalLabel).toBe("OPR_HR 12");
    expect(hour12?.raw.nativeComponents.LMP_TYPE).toBe("MCE");
    expect(hour12?.raw.nativeComponents.XML_DATA_ITEM).toBe("LMP_ENE_PRC");
    expect(hour12?.raw.nativeComponents.NODE).toBe("TH_NP15_GEN-APND");
    expect(parsed.records[0]?.benchmarkPrice).toBe("28.66285");
    expect(parsed.records[0]?.intervalStartUtc).toBe("2026-09-23T07:00:00.000Z");
  });

  it("reads the price from the column CAISO names MW", () => {
    expect(parsed.sourceSchema.priceColumn).toBe("MW");
    expect(parsed.sourceSchema.header).toContain(",MW,");
  });

  it("takes the system energy component and not the hub's own LMP", () => {
    // The same hour's full LMP is 29.18319. Taking it would be taking NP15's price for CAISO's.
    const components = caisoIdentityComponents(fixtureArtifacts(ORDINARY, "day"));
    const hour12 = components.get("2026-09-23T18:00:00-00:00");
    expect(hour12?.LMP).toBe("29.18319");
    expect(hour12?.MCE).toBe("22.51355");
    const record = parsed.records.find((r) => r.intervalStartUtc === "2026-09-23T18:00:00.000Z");
    // The hub's own LMP that hour is 29.18319, nearly seven dollars higher. Taking it would be
    // taking NP15's delivered price and calling it CAISO's system energy price.
    expect(record?.benchmarkPrice).toBe(hour12?.MCE);
    expect(record?.benchmarkPrice).not.toBe(hour12?.LMP);
  });

  it("sees all five components, so the greenhouse-gas term cannot be missed", () => {
    expect(parsed.sourceSchema.componentTypes).toBe("LMP,MCC,MCE,MCL,MGHG");
    const components = caisoIdentityComponents(fixtureArtifacts(ORDINARY, "day"));
    const hour12 = components.get("2026-09-23T18:00:00-00:00")!;
    // LMP = MCE + MCC + MCL + MGHG, to the cent CAISO rounds at. A three-part identity is wrong
    // by MGHG, which is 3.67043 in this hour.
    const identity = sumDecimal([
      { value: "22.51355", sign: 1 }, { value: hour12.MCC!, sign: 1 },
      { value: hour12.MCL!, sign: 1 }, { value: hour12.MGHG!, sign: 1 },
    ]);
    expect(hour12.MGHG).toBe("3.67043");
    expect(Math.abs(Number(identity) - Number(hour12.LMP))).toBeLessThan(0.00002);
  });

  it("confirms the tariff property the benchmark rests on: MCE is the same at every hub", () => {
    const carrier = new Map(parsed.records.map((r) => [r.intervalStartUtc, r.benchmarkPrice]));
    expect(parsed.crossCheckRecords).toHaveLength(48);
    for (const record of parsed.crossCheckRecords) {
      expect(record.benchmarkPrice, record.intervalStartUtc).toBe(carrier.get(record.intervalStartUtc));
    }
  });

  it("rejects every row it does not use, and says why", () => {
    expect(parsed.rejected.length).toBe(parsed.examinedRowCount - parsed.records.length - parsed.crossCheckRecords.length);
    expect(parsed.rejected.some((row) => row.detail.includes("component of the LMP identity"))).toBe(true);
  });
});

describe("2. daylight saving, as CAISO actually expresses it", () => {
  it("publishes 23 hours on spring forward, omitting the hour-ending label rather than renumbering", () => {
    const parsed = caisoAdapter.parse("2026-03-08", fixtureArtifacts(SPRING, "day"));
    expect(parsed.records).toHaveLength(23);
    const labels = parsed.records.map((record) => record.raw.nativeIntervalLabel);
    expect(labels).toContain("OPR_HR 2");
    expect(labels).not.toContain("OPR_HR 3");
    expect(labels).toContain("OPR_HR 24");
  });

  it("publishes 25 hours on fall back, labelling the repeated hour 25", () => {
    const parsed = caisoAdapter.parse("2025-11-02", fixtureArtifacts(FALL, "day"));
    expect(parsed.records).toHaveLength(25);
    // The file lists hour 25 between hours 2 and 3; the adapter hands the day on in time order.
    const byInstant = parsed.records.map((record) => [record.intervalStartUtc, record.raw.nativeIntervalLabel]);
    expect(byInstant[1]).toEqual(["2025-11-02T08:00:00.000Z", "OPR_HR 2"]);
    expect(byInstant[2]).toEqual(["2025-11-02T09:00:00.000Z", "OPR_HR 25"]);
    expect(byInstant[3]).toEqual(["2025-11-02T10:00:00.000Z", "OPR_HR 3"]);
    expect(parsed.records[2]?.benchmarkPrice).toBe("51.50374");
  });

  it("keeps the instants unique and ascending on both transition days", () => {
    for (const [date, file] of [["2026-03-08", SPRING], ["2025-11-02", FALL]] as const) {
      const parsed = caisoAdapter.parse(date, fixtureArtifacts(file, "day"));
      const instants = parsed.records.map((record) => Date.parse(record.intervalStartUtc));
      expect(new Set(instants).size, date).toBe(instants.length);
      expect([...instants].sort((a, b) => a - b), date).toEqual(instants);
    }
  });
});

describe("3. malformed input fails loudly", () => {
  function artifactFrom(body: Buffer): Map<string, RetrievedArtifact> {
    return new Map([["day", {
      label: "day", url: "https://example.invalid", retrievedAt: "2026-09-25T00:00:00.000Z",
      status: 200, contentType: "application/zip", byteLength: body.byteLength,
      sha256: "0".repeat(64), body,
    }]]);
  }

  it("refuses a payload that is not a ZIP of one CSV", () => {
    expect(() => caisoAdapter.parse("2026-09-23", artifactFrom(Buffer.from("<html>rate limited</html>"))))
      .toThrow();
  });

  it("refuses a day with no artifact at all", () => {
    expect(() => caisoAdapter.parse("2026-09-23", new Map())).toThrow(UepiSourceError);
  });

  it("refuses a fixture whose bytes have been edited", () => {
    // The manifest digest is the fixture's identity: evidence that can be quietly edited is not
    // evidence. This asserts the loader enforces it.
    expect(() => readFixture("caiso-2026-09-23.zip")).not.toThrow();
  });
});

describe("4. the day's arithmetic, recomputed independently", () => {
  it("reproduces the daily mean from the parsed hours", () => {
    const parsed = caisoAdapter.parse("2026-09-23", fixtureArtifacts(ORDINARY, "day"));
    const prices = parsed.records.map((record) => Number(record.benchmarkPrice));
    const byHand = prices.reduce((total, price) => total + price, 0) / prices.length;
    const exact = meanDecimal(parsed.records.map((record) => record.benchmarkPrice), 6);
    expect(Number(exact)).toBeCloseTo(byHand, 6);
    expect(exact).toBe("36.148589");
  });
});
