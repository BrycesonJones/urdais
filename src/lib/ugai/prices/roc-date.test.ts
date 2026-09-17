import { describe, expect, it } from "vitest";

import { isoDateToRoc, rocDateToIso } from "@/lib/ugai/prices/roc-date";
import { PriceContractError } from "@/lib/ugai/prices/types";

describe("ROC calendar conversion", () => {
  it("converts the date TWSE actually published", () => {
    expect(rocDateToIso("1150916")).toBe("2026-09-16");
  });

  it("handles the six-digit form used before ROC year 100", () => {
    // ROC 99 is 2010. A fixed seven-character parse would read the year as 9 and the month as 91.
    expect(rocDateToIso("990415")).toBe("2010-04-15");
  });

  it("round-trips", () => {
    expect(isoDateToRoc(rocDateToIso("1150916"))).toBe("1150916");
    expect(rocDateToIso(isoDateToRoc("2026-01-02"))).toBe("2026-01-02");
  });

  it("is not off by 1911 in either direction", () => {
    // The failure mode this guards: an unconverted ROC year still parses as a plausible date.
    expect(rocDateToIso("1150101")).toBe("2026-01-01");
    expect(rocDateToIso("1150101")).not.toBe("1150-01-01");
    expect(isoDateToRoc("2026-01-01")).toBe("1150101");
  });

  it("rejects a month or day that cannot exist rather than rolling it forward", () => {
    expect(() => rocDateToIso("1151332")).toThrow(PriceContractError);
    expect(() => rocDateToIso("1150230")).toThrow(/not a real calendar date/);
    expect(() => rocDateToIso("1150000")).toThrow(PriceContractError);
  });

  it("rejects malformed input instead of guessing", () => {
    expect(() => rocDateToIso("")).toThrow(PriceContractError);
    expect(() => rocDateToIso("2026-09-16")).toThrow(PriceContractError);
    expect(() => rocDateToIso("11509161")).toThrow(PriceContractError);
  });
});
