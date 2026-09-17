import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createTwseAdapter,
  parseTwseDaily,
  parseTwseHolidays,
} from "@/lib/ugai/prices/sources/twse";

const fixtureDir = join(process.cwd(), "src/lib/ugai/prices/fixtures");
const daily = JSON.parse(readFileSync(join(fixtureDir, "twse-stock-day-all.json"), "utf8")) as unknown;
const holidays = JSON.parse(readFileSync(join(fixtureDir, "twse-holidays.json"), "utf8")) as unknown;

describe("TWSE daily parser", () => {
  it("reproduces the canonical close for a real published record", () => {
    const { closes } = parseTwseDaily(daily, "2026-09-16");
    const tsmc = closes.find((c) => c.listingRef.localCode === "2330");
    expect(tsmc).toEqual({
      listingRef: { venueMic: "XTAI", localCode: "2330" },
      tradingDate: "2026-09-16",
      sessionStatus: "traded",
      closePrice: "2380.00",
      priceCurrency: "TWD",
      priceUnit: "major",
      sourceReportedAt: null,
      sourcePayload: expect.objectContaining({ Code: "2330" }),
    });
  });

  it("preserves the published decimal exactly rather than normalising it", () => {
    const { closes } = parseTwseDaily(daily, "2026-09-16");
    // "2380.00" must not become "2380" or 2380. The column is numeric and the source is the
    // authority on how the price was quoted.
    expect(closes.find((c) => c.listingRef.localCode === "2330")?.closePrice).toBe("2380.00");
    expect(closes.find((c) => c.listingRef.localCode === "2317")?.closePrice).toBe("248.00");
  });

  it("carries no adjusted close anywhere in the canonical shape", () => {
    const { closes } = parseTwseDaily(daily, "2026-09-16");
    for (const close of closes) {
      expect(Object.keys(close)).not.toContain("adjustedClose");
      expect(Object.keys(close)).not.toContain("adjusted_close");
    }
  });

  it("refuses a payload published for a different date", () => {
    // The endpoint serves the latest session only. Accepting it under the requested date would
    // misdate every price in the set, which is the worst thing this adapter could do.
    expect(() => parseTwseDaily(daily, "2026-09-15")).toThrow(/serves the latest session only/);
  });

  it("records a line with no official close as such, never as a price", () => {
    const withBlank = [
      { Date: "1150916", Code: "9999", Name: "x", ClosingPrice: "" },
      ...(daily as unknown[]),
    ];
    const { closes } = parseTwseDaily(withBlank, "2026-09-16");
    const suspended = closes.find((c) => c.listingRef.localCode === "9999");
    expect(suspended?.sessionStatus).toBe("no_official_close");
    expect(suspended?.closePrice).toBeNull();
    expect(suspended?.priceCurrency).toBeNull();
  });

  it("fails closed on a malformed price rather than defaulting it", () => {
    const bad = [{ Date: "1150916", Code: "8888", Name: "x", ClosingPrice: "not-a-number" }, ...(daily as unknown[])];
    const { closes, rejected } = parseTwseDaily(bad, "2026-09-16");
    expect(rejected).toEqual([{ code: "8888", reason: expect.stringContaining("not a decimal price literal") }]);
    // The bad record does not become a close, and does not become a zero either.
    expect(closes.map((c) => c.listingRef.localCode)).not.toContain("8888");
  });

  it("rejects a non-positive price", () => {
    const zero = [{ Date: "1150916", Code: "8887", Name: "x", ClosingPrice: "0.00" }, ...(daily as unknown[])];
    const { closes, rejected } = parseTwseDaily(zero, "2026-09-16");
    expect(rejected).toEqual([{ code: "8887", reason: expect.stringContaining("not greater than zero") }]);
    expect(closes.map((c) => c.listingRef.localCode)).not.toContain("8887");
  });

  it("throws when nothing in the payload survives, rather than returning an empty set", () => {
    // An empty result would look like a quiet day. It is a failed parse and must say so.
    const allBad = [{ Date: "1150916", Code: "8886", Name: "x", ClosingPrice: "not-a-number" }];
    expect(() => parseTwseDaily(allBad, "2026-09-16")).toThrow(/no TWSE record/);
  });

  it("drops an unreadable record but reports it rather than silently shrinking the set", () => {
    const mixed = [{ Date: "1150916", Code: "", Name: "x", ClosingPrice: "1.00" }, ...(daily as unknown[])];
    const { closes, rejected } = parseTwseDaily(mixed, "2026-09-16");
    expect(rejected).toHaveLength(1);
    expect(closes).toHaveLength(3);
  });

  it("rejects a payload that is not an array, or is empty", () => {
    expect(() => parseTwseDaily({}, "2026-09-16")).toThrow(/not an array/);
    expect(() => parseTwseDaily([], "2026-09-16")).toThrow(/empty/);
  });
});

describe("TWSE trading calendar", () => {
  it("reads closures out of the venue's own calendar", () => {
    const byDate = parseTwseHolidays(holidays);
    // 1150101 is 2026-01-01, 中華民國開國紀念日, described as 放假1日.
    expect(byDate.has("2026-01-01")).toBe(true);
  });

  it("does not treat a notable trading day as a closure", () => {
    const byDate = parseTwseHolidays(holidays);
    // 國曆新年開始交易日 is the first trading day of the year, not a holiday.
    expect(byDate.has("2026-01-02")).toBe(false);
  });

  it("reports an exchange holiday as a session status, so no price is manufactured", async () => {
    const adapter = createTwseAdapter(async (url) =>
      url.includes("holiday") ? holidays : daily,
    );
    expect(await adapter.sessionStatusFor("2026-01-01")).toBe("exchange_holiday");
    expect(await adapter.sessionStatusFor("2026-09-16")).toBe("traded");
  });

  it("treats a weekend as a non-session without needing it in the calendar", async () => {
    const adapter = createTwseAdapter(async () => holidays);
    expect(await adapter.sessionStatusFor("2026-09-19")).toBe("exchange_holiday");
  });
});

describe("adapter shape", () => {
  it("is built around a venue, not an issuer", async () => {
    const adapter = createTwseAdapter(async () => daily);
    expect(adapter.venueMic).toBe("XTAI");
    // Returns everything the venue published; selection is the caller's concern.
    const closes = await adapter.fetchCloses("2026-09-16");
    expect(closes.length).toBeGreaterThan(1);
    expect(closes.map((c) => c.listingRef.localCode).sort()).toEqual(["2317", "2330", "2454"]);
  });
});
