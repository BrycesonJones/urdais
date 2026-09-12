import { describe, expect, it } from "vitest";

import { CHIP_ACCELERATOR_INDEX, MARKET_CATALOG, catalogEntry, searchMarketCatalog } from "@/data/market-catalog";

describe("market catalog: chip and accelerator consolidation", () => {
  it("lists exactly one chip / accelerator index, with the canonical name, ticker, description, and question", () => {
    const chipLike = MARKET_CATALOG.filter((market) => /chip|accelerator/i.test(market.name));
    expect(chipLike).toHaveLength(1);
    expect(chipLike[0]).toMatchObject({
      symbol: "UACI",
      name: "Urdais Chip & Accelerator Index",
      description: "Tracks normalized market pricing for leading AI accelerators, weighted by representative compute capability and market relevance.",
      question: "What does advanced compute hardware cost?",
      href: "/markets/uaci",
    });
    expect(CHIP_ACCELERATOR_INDEX.symbol).toBe("UACI");
  });

  it("no longer carries the old AI Chip Index or Accelerator Index entries", () => {
    expect(MARKET_CATALOG.map((market) => market.symbol)).toEqual(["UCPI", "UGAI", "UAVI", "UMPI", "UPPI", "UEPI", "UACI", "UBWI"]);
    expect(MARKET_CATALOG.map((market) => market.name)).not.toContain("Urdais AI Chip Index");
    expect(MARKET_CATALOG.map((market) => market.name)).not.toContain("Urdais Accelerator Index");
    expect(MARKET_CATALOG.some((market) => market.symbol === "UAXI")).toBe(false);
    expect(() => catalogEntry("UAXI")).toThrow("Unknown market symbol: UAXI");
  });

  it("keeps the Compute Price Index separate from the hardware index", () => {
    expect(catalogEntry("UCPI")).toMatchObject({ name: "Urdais Compute Price Index", href: "/markets/ucpi" });
    expect(catalogEntry("UCPI").description).toBeUndefined();
    expect(catalogEntry("UACI").name).not.toMatch(/compute price/i);
  });

  it("returns one entry for chip or accelerator searches", () => {
    expect(searchMarketCatalog("chip").map((market) => market.symbol)).toEqual(["UACI"]);
    expect(searchMarketCatalog("accelerator").map((market) => market.symbol)).toEqual(["UACI"]);
    expect(searchMarketCatalog("uaci").map((market) => market.symbol)).toEqual(["UACI"]);
    expect(searchMarketCatalog("uaxi")).toEqual([]);
  });
});
