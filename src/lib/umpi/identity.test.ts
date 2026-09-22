import { describe, expect, it } from "vitest";

import {
  BOK_DRAM_ITEM_CODE,
  BOK_PPI_BY_COMMODITY_STAT_CODE,
  DEFERRED_BOK_STAT_CODES,
  KCS_DRAM_CHIP_HS_CODE,
  UmpiIdentityError,
  bokSeriesIdentity,
  customsSeriesIdentity,
  identityKey,
  identityMatches,
  productionIdentityFor,
} from "./identity";

describe("BOK source identity", () => {
  const dram = () =>
    bokSeriesIdentity({
      statCode: BOK_PPI_BY_COMMODITY_STAT_CODE,
      itemCode: BOK_DRAM_ITEM_CODE,
      cycle: "M",
      groupDimensions: {},
    });

  it("is the triple, and the item code alone does not identify a series", () => {
    // The fact this whole module exists for: the same item code means DRAM in the producer
    // price table and in the export price table, and the two disagree.
    const producer = dram();
    expect(identityKey(producer)).toBe("bok:404Y016/30911201AA/M");

    // Two identities sharing only the item code are not the same identity.
    const otherTable = bokSeriesIdentity({
      statCode: "404Y014",
      itemCode: BOK_DRAM_ITEM_CODE,
      cycle: "M",
      groupDimensions: {},
    });
    expect(identityMatches(producer, otherTable)).toBe(false);

    // And neither is the same item at a different cycle.
    const quarterly = bokSeriesIdentity({
      statCode: BOK_PPI_BY_COMMODITY_STAT_CODE,
      itemCode: BOK_DRAM_ITEM_CODE,
      cycle: "Q",
      groupDimensions: {},
    });
    expect(identityMatches(producer, quarterly)).toBe(false);
  });

  it("refuses the deferred export price index by code, not by convention", () => {
    expect(() =>
      bokSeriesIdentity({ statCode: "402Y016", itemCode: BOK_DRAM_ITEM_CODE, cycle: "M", groupDimensions: {} }),
    ).toThrow(UmpiIdentityError);
    expect(DEFERRED_BOK_STAT_CODES["402Y016"]).toMatch(/currency basis/);
    // The aggregate-only table is refused too, for a different and stated reason.
    expect(() =>
      bokSeriesIdentity({ statCode: "402Y014", itemCode: "30911AA", cycle: "M", groupDimensions: {} }),
    ).toThrow(UmpiIdentityError);
  });

  it("carries group dimensions in the key, so a dimensioned table cannot collapse to one series", () => {
    const usdBasis = bokSeriesIdentity({
      statCode: "404Y016",
      itemCode: BOK_DRAM_ITEM_CODE,
      cycle: "M",
      groupDimensions: { currency_basis: "usd" },
    });
    const krwBasis = bokSeriesIdentity({
      statCode: "404Y016",
      itemCode: BOK_DRAM_ITEM_CODE,
      cycle: "M",
      groupDimensions: { currency_basis: "krw" },
    });
    expect(identityMatches(usdBasis, krwBasis)).toBe(false);
    expect(identityKey(usdBasis)).toContain("currency_basis=usd");
    // Key order in the source payload must not change the identity.
    const a = bokSeriesIdentity({ statCode: "404Y016", itemCode: "30911201AA", cycle: "M", groupDimensions: { b: "2", a: "1" } });
    const b = bokSeriesIdentity({ statCode: "404Y016", itemCode: "30911201AA", cycle: "M", groupDimensions: { a: "1", b: "2" } });
    expect(identityKey(a)).toBe(identityKey(b));
  });

  it("rejects malformed codes rather than passing them to a request", () => {
    expect(() => bokSeriesIdentity({ statCode: "404", itemCode: BOK_DRAM_ITEM_CODE, cycle: "M", groupDimensions: {} })).toThrow();
    expect(() => bokSeriesIdentity({ statCode: "404Y016", itemCode: "dram", cycle: "M", groupDimensions: {} })).toThrow();
  });
});

describe("Korea Customs source identity", () => {
  it("requires the HS code and the dataset it was read from", () => {
    const identity = customsSeriesIdentity({ hsCode: KCS_DRAM_CHIP_HS_CODE, datasetId: "15100475" });
    expect(identityKey(identity)).toBe("kcs:8542321010/15100475");
    expect(() => customsSeriesIdentity({ hsCode: "854232", datasetId: "15100475" })).toThrow(UmpiIdentityError);
    expect(() => customsSeriesIdentity({ hsCode: KCS_DRAM_CHIP_HS_CODE, datasetId: "x" })).toThrow(UmpiIdentityError);
  });

  it("does not confuse the DRAM chip code with its sibling memory codes", () => {
    const dram = customsSeriesIdentity({ hsCode: "8542321010", datasetId: "15100475" });
    // SRAM, flash and multichip packages are different ten-digit codes under the same heading.
    for (const sibling of ["8542321020", "8542321030", "8542321090", "8542323000"]) {
      expect(identityMatches(dram, customsSeriesIdentity({ hsCode: sibling, datasetId: "15100475" }))).toBe(false);
    }
  });
});

describe("production identities", () => {
  it("binds each V1 series to exactly the verified source identity", () => {
    expect(identityKey(productionIdentityFor("UMPI-KR-DRAM-PPI"))).toBe("bok:404Y016/30911201AA/M");
    // Corrected in Phase 4: 15101609 is aggregate-by-item; 15100475 is the country-dimension
    // operation and cannot yield a Korea-wide total.
    expect(identityKey(productionIdentityFor("UMPI-KR-DRAM-EXPORT-UV"))).toBe("kcs:8542321010/15101609");
  });

  it("never returns an identity that is a human-facing name", () => {
    for (const code of ["UMPI-KR-DRAM-PPI", "UMPI-KR-DRAM-EXPORT-UV"] as const) {
      const key = identityKey(productionIdentityFor(code));
      expect(key).not.toMatch(/DRAM PPI|Export UV|Bank of Korea|Customs/i);
    }
  });
});
