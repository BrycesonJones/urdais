import { describe, expect, it } from "vitest";

import { FxContractError, invertRate, resolveUsdPerUnit } from "@/lib/ugai/fx/derive";
import { cbcRateFor, parseCbcDaily, parseCbcDate, parseCbcRate } from "@/lib/ugai/fx/sources/cbc";

// The researched observation. Live retrieval could not be re-verified from the build environment,
// where cpx.cbc.gov.tw fails DNS resolution, so this is a captured fixture and not a recorded call.
const payload = [
  { 日期: "20260917", NTD_USD: "31.881" },
  { 日期: "20260916", NTD_USD: "31.905" },
  { 日期: "20260912", NTD_USD: "31.940" },
];

describe("CBC daily series", () => {
  it("parses the published row in the orientation CBC publishes it", () => {
    expect(cbcRateFor(payload, "2026-09-17")).toEqual({
      // TWD per one USD. Not relabelled, because relabelling would destroy the only evidence
      // that an inversion later happens at all.
      baseCurrency: "TWD",
      quoteCurrency: "USD",
      rate: "31.881",
      fixingDate: "2026-09-17",
    });
  });

  it("preserves the decimal exactly rather than normalising it", () => {
    expect(cbcRateFor(payload, "2026-09-12")?.rate).toBe("31.940");
  });

  it("returns null for a date the series does not carry", () => {
    // 13 and 14 September 2026 are a weekend. The parser reports absence; what the index does
    // about a missing fixing is the unresolved fixing convention's problem, not this module's.
    expect(cbcRateFor(payload, "2026-09-13")).toBeNull();
  });

  it("does not impose a Monday-to-Friday calendar", () => {
    // Taiwan runs Saturday make-up workdays, which carry real observations. A weekday filter
    // would silently discard them.
    const saturday = [{ 日期: "20260919", NTD_USD: "31.800" }];
    expect(cbcRateFor(saturday, "2026-09-19")?.rate).toBe("31.800");
  });

  it("drops a malformed row with its reason instead of shrinking quietly", () => {
    const mixed = [{ 日期: "not-a-date", NTD_USD: "31.881" }, ...payload];
    const { rates, rejected } = parseCbcDaily(mixed);
    expect(rates).toHaveLength(3);
    expect(rejected[0]?.reason).toMatch(/not an eight-digit date/);
  });

  it("rejects zero, negative and NaN rates", () => {
    expect(() => parseCbcRate("0")).toThrow(/not greater than zero/);
    expect(() => parseCbcRate("-31.881")).toThrow(/not a decimal rate literal/);
    expect(() => parseCbcRate("NaN")).toThrow(FxContractError);
    expect(() => parseCbcRate(null)).toThrow(FxContractError);
  });

  it("rejects an impossible calendar date rather than rolling it forward", () => {
    expect(() => parseCbcDate("20260230")).toThrow(/not a real calendar date/);
    expect(() => parseCbcDate("20261301")).toThrow(/has month 13/);
    expect(() => parseCbcDate("2026-09-17")).toThrow(/eight-digit/);
  });

  it("throws when nothing in the payload survives", () => {
    expect(() => parseCbcDaily([{ 日期: "x", NTD_USD: "y" }])).toThrow(/no CBC row/);
    expect(() => parseCbcDaily({})).toThrow(/not an array/);
  });
});

describe("inversion into UGAI orientation", () => {
  it("derives USD per TWD as one over the published rate", () => {
    const source = cbcRateFor(payload, "2026-09-17")!;
    const derived = invertRate(source);
    expect(derived.baseCurrency).toBe("USD");
    expect(derived.quoteCurrency).toBe("TWD");
    // 1 / 31.881 = 0.031366...
    expect(derived.rate.startsWith("0.0313666")).toBe(true);
    expect(Math.abs(Number(derived.rate) - 1 / 31.881)).toBeLessThan(1e-15);
  });

  it("keeps the source row as the component, so the inversion is visible", () => {
    const source = cbcRateFor(payload, "2026-09-17")!;
    const derived = invertRate(source);
    expect(derived.derivation).toBe("inverted");
    expect(derived.components).toEqual([source]);
    // The component is still TWD per USD. If this ever reads USD per TWD, the orientation was
    // relabelled somewhere and a second inversion would go unnoticed.
    expect(derived.components[0]!.baseCurrency).toBe("TWD");
  });

  it("resolves through the generic Phase 5.5 machinery without a special case", () => {
    const source = cbcRateFor(payload, "2026-09-17")!;
    const resolved = resolveUsdPerUnit("TWD", [source], "2026-09-17");
    expect(resolved?.derivation).toBe("inverted");
    expect(resolved?.rate).toBe(invertRate(source).rate);
  });

  it("will not resolve TWD from a leg of another date", () => {
    const source = cbcRateFor(payload, "2026-09-16")!;
    expect(resolveUsdPerUnit("TWD", [source], "2026-09-17")).toBeNull();
  });
});
