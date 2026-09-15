import { describe, expect, it } from "vitest";

import {
  CHIP_ACCELERATOR_INDEX,
  MARKET_CATALOG,
  catalogEntry,
  isPublishedMarket,
  searchMarketCatalog,
} from "@/data/market-catalog";

/** The index family the product publishes, in display order. */
const PUBLISHED_SYMBOLS = ["UCPI", "UGAI", "UAVI", "UMPI", "UPPI", "UEPI", "UBWI"];

describe("market catalog: chip and accelerator consolidation", () => {
  it("keeps exactly one chip / accelerator identity, with the canonical name, ticker, description, and question", () => {
    expect(CHIP_ACCELERATOR_INDEX.symbol).toBe("UACI");
    expect(catalogEntry("UACI")).toMatchObject({
      symbol: "UACI",
      name: "Urdais Chip & Accelerator Index",
      description: "Tracks normalized market pricing for leading AI accelerators, weighted by representative compute capability and market relevance.",
      question: "What does advanced compute hardware cost?",
      href: "/markets/uaci",
    });
  });

  it("no longer carries the old AI Chip Index or Accelerator Index entries", () => {
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
});

/*
 * UACI is withheld, not deleted: the data-source research does not yet support a
 * defensible basket. Its identity, route, and detail model stay in place so the
 * index can be published later without being rebuilt; the public catalog simply
 * does not carry it.
 */
describe("market catalog: UACI is withheld from public surfaces", () => {
  it("publishes the rest of the index family, and no chip or accelerator index", () => {
    expect(MARKET_CATALOG.map((market) => market.symbol)).toEqual(PUBLISHED_SYMBOLS);
    expect(MARKET_CATALOG.some((market) => market.symbol === "UACI")).toBe(false);
    expect(MARKET_CATALOG.filter((market) => /chip|accelerator/i.test(market.name))).toEqual([]);
  });

  it("returns no search result for UACI, by symbol or by name", () => {
    expect(searchMarketCatalog("uaci")).toEqual([]);
    expect(searchMarketCatalog("chip")).toEqual([]);
    expect(searchMarketCatalog("accelerator")).toEqual([]);
    expect(searchMarketCatalog("uaxi")).toEqual([]);
  });

  it("still finds every published index, by empty query, symbol, and name", () => {
    expect(searchMarketCatalog("").map((market) => market.symbol)).toEqual(PUBLISHED_SYMBOLS);
    expect(searchMarketCatalog("ucpi").map((market) => market.symbol)).toEqual(["UCPI"]);
    expect(searchMarketCatalog("volatility").map((market) => market.symbol)).toEqual(["UAVI"]);
    expect(searchMarketCatalog("bitcoin").map((market) => market.symbol)).toEqual(["UBWI"]);
  });

  it("keeps a withheld index registered, so its identity and route still resolve", () => {
    expect(isPublishedMarket("UACI")).toBe(false);
    expect(PUBLISHED_SYMBOLS.every(isPublishedMarket)).toBe(true);
    expect(catalogEntry("UACI").href).toBe("/markets/uaci");
    expect(catalogEntry("UACI").name).toBe(CHIP_ACCELERATOR_INDEX.name);
  });
});
