import { describe, expect, it } from "vitest";

import {
  CHIP_ACCELERATOR_INDEX,
  MARKET_CATALOG,
  PUBLIC_MARKET_CATALOG,
  catalogEntry,
  isPubliclyListed,
  searchMarketCatalog,
} from "@/data/market-catalog";

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

  it("finds no chip or accelerator index by search, because UACI is not presented as a product", () => {
    // The consolidation above is about identity, not about being on sale. UACI still has exactly
    // one canonical entry; search returns none of them.
    expect(searchMarketCatalog("chip")).toEqual([]);
    expect(searchMarketCatalog("accelerator")).toEqual([]);
    expect(searchMarketCatalog("uaci")).toEqual([]);
    expect(searchMarketCatalog("uaxi")).toEqual([]);
  });
});

/**
 * Existing in Urdais and being presented as a product are two different facts. These assert the
 * second one, and deliberately also assert the first: an index Urdais withholds keeps its entry,
 * its name and its route, because hiding a product must never become losing it.
 */
describe("public presentation", () => {
  // UGAI, UAVI and UACI are not productized; UPPI's production is deferred pending data rights
  // per the Photonics close-out. Four reasons, one mechanism.
  const WITHHELD = ["UGAI", "UAVI", "UACI", "UPPI"];
  const PRESENTED = ["UCPI", "UMPI", "UEPI", "UBWI"];

  it("withholds UGAI, UAVI, UACI and UPPI from the public catalog", () => {
    expect(PUBLIC_MARKET_CATALOG.map((market) => market.symbol)).toEqual(PRESENTED);
    for (const symbol of WITHHELD) {
      expect(PUBLIC_MARKET_CATALOG.some((market) => market.symbol === symbol)).toBe(false);
      expect(isPubliclyListed(symbol)).toBe(false);
      // The route form too: `/markets/ugai` must not slip through on casing.
      expect(isPubliclyListed(symbol.toLowerCase())).toBe(false);
      // One source of truth: the helper and the derived catalog both read the entry's own flag.
      expect(catalogEntry(symbol).publiclyPresented).toBe(false);
    }
  });

  it("keeps every other index presented, so hiding four did not hide the product family", () => {
    for (const symbol of PRESENTED) {
      expect(isPubliclyListed(symbol), symbol).toBe(true);
      expect(isPubliclyListed(symbol.toLowerCase()), symbol).toBe(true);
      expect(catalogEntry(symbol).publiclyPresented, symbol).toBe(true);
    }
    expect(isPubliclyListed("nonsense")).toBe(false);
  });

  it("has exactly one publication source of truth, which every derived view agrees with", () => {
    // `PUBLIC_MARKET_CATALOG` and `isPubliclyListed` are both derived from the entry flag, so
    // they cannot drift apart, and no separate set of withheld symbols exists to maintain.
    for (const market of MARKET_CATALOG) {
      expect(isPubliclyListed(market.symbol), market.symbol).toBe(market.publiclyPresented);
      expect(PUBLIC_MARKET_CATALOG.includes(market), market.symbol).toBe(market.publiclyPresented);
    }
    expect(PUBLIC_MARKET_CATALOG.every((market) => market.publiclyPresented)).toBe(true);
  });

  it("keeps the withheld indices' identity and route in the canonical catalog", () => {
    expect(MARKET_CATALOG.map((market) => market.symbol)).toEqual([
      "UCPI", "UGAI", "UAVI", "UMPI", "UPPI", "UEPI", "UACI", "UBWI",
    ]);
    expect(catalogEntry("UGAI")).toMatchObject({ name: "Urdais Global AI Index", href: "/markets/ugai" });
    expect(catalogEntry("UAVI")).toMatchObject({ name: "Urdais AI Volatility Index", href: "/markets/uavi" });
    expect(catalogEntry("UACI")).toMatchObject({ name: "Urdais Chip & Accelerator Index", href: "/markets/uaci" });
    expect(catalogEntry("UPPI")).toMatchObject({ name: "Urdais Photonics Price Index", href: "/markets/uppi" });
  });

  it("does not find a withheld index by symbol or by name", () => {
    for (const symbol of WITHHELD) expect(searchMarketCatalog(symbol)).toEqual([]);
    expect(searchMarketCatalog("global ai")).toEqual([]);
    expect(searchMarketCatalog("volatility")).toEqual([]);
    expect(searchMarketCatalog("photonics")).toEqual([]);
    // An empty query is the "browse everything" case, and browsing must not reveal them either.
    expect(searchMarketCatalog("").map((market) => market.symbol)).toEqual(PRESENTED);
    // A query that matches a presented index still works.
    expect(searchMarketCatalog("ucpi").map((market) => market.symbol)).toEqual(["UCPI"]);
  });
});
