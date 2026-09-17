import { describe, expect, it } from "vitest";

import {
  isUsableMapping,
  selectVolatilityInstrument,
  type VolatilityInstrumentMapping,
} from "@/lib/uavi/instrument";

function representative(issuerId: string, securityId: string): VolatilityInstrumentMapping {
  return {
    id: `vi-rep-${issuerId}`,
    issuerId,
    volatilitySecurityId: securityId,
    mappingType: "representative",
    preferenceRank: 1,
    mappingState: "verified",
    isSponsored: null,
    receiptRatioNumerator: null,
    receiptRatioDenominator: null,
  };
}

function adr(issuerId: string, securityId: string, overrides: Partial<VolatilityInstrumentMapping> = {}): VolatilityInstrumentMapping {
  return {
    id: `vi-adr-${issuerId}`,
    issuerId,
    volatilitySecurityId: securityId,
    mappingType: "adr",
    preferenceRank: 2,
    mappingState: "verified",
    isSponsored: true,
    receiptRatioNumerator: 5,
    receiptRatioDenominator: 1,
    ...overrides,
  };
}

const ALL = () => true;
const NONE = () => false;

describe("the volatility-instrument waterfall", () => {
  it("uses the representative security when it qualifies", () => {
    const result = selectVolatilityInstrument("iss", [representative("iss", "sec-ord")], ALL);
    expect(result.selected).toBe(true);
    if (!result.selected) throw new Error("unreachable");
    expect(result.mapping.mappingType).toBe("representative");
  });

  it("prefers the representative when BOTH routes qualify", () => {
    // The rule that stops an issuer's measured volatility switching instrument between sessions
    // because one option market happened to look better than the other.
    const result = selectVolatilityInstrument(
      "iss",
      [adr("iss", "sec-adr"), representative("iss", "sec-ord")],
      ALL,
    );
    if (!result.selected) throw new Error("unreachable");
    expect(result.mapping.mappingType).toBe("representative");
    expect(result.mapping.volatilitySecurityId).toBe("sec-ord");
  });

  it("prefers the representative regardless of input order", () => {
    const forward = selectVolatilityInstrument(
      "iss", [representative("iss", "sec-ord"), adr("iss", "sec-adr")], ALL);
    const reversed = selectVolatilityInstrument(
      "iss", [adr("iss", "sec-adr"), representative("iss", "sec-ord")], ALL);
    if (!forward.selected || !reversed.selected) throw new Error("unreachable");
    expect(forward.mapping.id).toBe(reversed.mapping.id);
  });

  it("reaches the ADR only when the representative does not qualify", () => {
    const result = selectVolatilityInstrument(
      "iss",
      [representative("iss", "sec-ord"), adr("iss", "sec-adr")],
      (m) => m.mappingType === "adr",
    );
    if (!result.selected) throw new Error("unreachable");
    expect(result.mapping.mappingType).toBe("adr");
  });

  it("reports the issuer uncovered when neither route qualifies", () => {
    const result = selectVolatilityInstrument(
      "iss", [representative("iss", "sec-ord"), adr("iss", "sec-adr")], NONE);
    expect(result.selected).toBe(false);
    if (result.selected) throw new Error("unreachable");
    expect(result.reason).toBe("no_volatility_instrument");
  });

  it("rejects a mapping belonging to another issuer", () => {
    // The check that stops one company's volatility being published under another's parent
    // weight. There is no downstream check that would catch it: the number would be plausible.
    const foreign = representative("other-issuer", "sec-other");
    expect(isUsableMapping(foreign, "iss")).toBe(false);
    expect(selectVolatilityInstrument("iss", [foreign], ALL).selected).toBe(false);
  });

  it("rejects an unsponsored depositary programme", () => {
    expect(isUsableMapping(adr("iss", "sec-adr", { isSponsored: false }), "iss")).toBe(false);
    expect(isUsableMapping(adr("iss", "sec-adr", { isSponsored: null }), "iss")).toBe(false);
  });

  it("rejects a receipt with an incomplete or non-positive ratio", () => {
    expect(isUsableMapping(adr("iss", "s", { receiptRatioNumerator: null }), "iss")).toBe(false);
    expect(isUsableMapping(adr("iss", "s", { receiptRatioDenominator: 0 }), "iss")).toBe(false);
    expect(isUsableMapping(adr("iss", "s", { receiptRatioNumerator: Number.NaN }), "iss")).toBe(false);
  });

  it("rejects a mapping that is a candidate or withdrawn rather than verified", () => {
    expect(isUsableMapping(representative("iss", "s"), "iss")).toBe(true);
    expect(isUsableMapping({ ...representative("iss", "s"), mappingState: "candidate" }, "iss")).toBe(false);
    expect(isUsableMapping({ ...representative("iss", "s"), mappingState: "withdrawn" }, "iss")).toBe(false);
  });

  it("rejects a mapping whose rank contradicts its route", () => {
    // preferenceRank carries the waterfall order as data. A representative wearing rank 2 would
    // let a receipt be tried first, which is the one reordering the methodology forbids.
    expect(isUsableMapping({ ...representative("iss", "s"), preferenceRank: 2 }, "iss")).toBe(false);
    expect(isUsableMapping(adr("iss", "s", { preferenceRank: 1 }), "iss")).toBe(false);
  });

  it("selects nothing for an issuer with no mappings at all", () => {
    expect(selectVolatilityInstrument("iss", [], ALL).selected).toBe(false);
  });
});
