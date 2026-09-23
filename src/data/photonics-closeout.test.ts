import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  catalogEntry,
  isPubliclyListed,
  MARKET_CATALOG,
  PUBLIC_MARKET_CATALOG,
  searchMarketCatalog,
} from "@/data/market-catalog";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { assembleIndexRail } from "@/lib/market/index-rail";
import { findInstrumentById, findMarket, MARKETS } from "@/data/mock/market-detail";

/*
 * The Photonics close-out, asserted rather than described.
 *
 * PH-3 concluded DEFERRED_PENDING_DATA_RIGHTS: the research found optical pricing at usable
 * grain and settled a methodology, and every source that carries the data prohibits, or has not
 * granted, the right to publish anything derived from it. So UPPI stops being a product a reader
 * can see, and stops being nothing else. These tests hold both halves of that at once, because
 * each is easy to undo by accident -- a future engineer deleting the market to "finish the
 * removal", or re-adding the row because the rail looks short.
 *
 * See docs/research/photonics/ph-3-closeout.md.
 */
describe("UPPI is deferred, not deleted", () => {
  it("is absent from the public index catalog a reader browses", () => {
    expect(PUBLIC_MARKET_CATALOG.map((market) => market.symbol)).not.toContain("UPPI");
    expect(isPubliclyListed("UPPI")).toBe(false);
    // The deferral is recorded on the entry itself, which is the only place any market's
    // publication state lives. There is no second list of withheld symbols to fall out of step.
    expect(catalogEntry("UPPI").publiclyPresented).toBe(false);
  });

  it("is absent from the homepage indices rail, though the demo dataset still offers a row", () => {
    // The row is still built -- UPPI keeps its market definition and illustrative series -- and
    // the rail refuses it. Asserting the source were empty would prove the wrong thing.
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).toContain("UPPI");
    expect(assembleIndexRail(INDEX_SNAPSHOTS).map((row) => row.symbol)).not.toContain("UPPI");
  });

  it("is unfindable by symbol or by name in site search", () => {
    for (const query of ["UPPI", "uppi", "Photonics", "photonics", "Urdais Photonics Price Index"]) {
      expect(searchMarketCatalog(query).map((market) => market.symbol)).not.toContain("UPPI");
    }
    // An empty query lists what a reader may open, not the whole registry.
    expect(searchMarketCatalog("").map((market) => market.symbol)).not.toContain("UPPI");
  });

  it("is offered as a comparison on no other market", () => {
    for (const market of MARKETS) {
      for (const family of market.families) {
        for (const instrument of family.instruments) {
          expect(instrument.comparisons.map((option) => option.label)).not.toContain("UPPI");
        }
      }
    }
  });

  it("keeps its canonical registry entry, so the identifier and route survive the deferral", () => {
    expect(MARKET_CATALOG.map((market) => market.symbol)).toContain("UPPI");
    const entry = catalogEntry("UPPI");
    expect(entry.name).toBe("Urdais Photonics Price Index");
    expect(entry.href).toBe("/markets/uppi");
  });

  it("keeps its market definition, families and instruments intact", () => {
    const market = findMarket("UPPI");
    expect(market).toBeDefined();
    expect(market!.families.flatMap((family) => family.instruments).length).toBeGreaterThan(0);
    // The specific instruments PH-1 and PH-2 critiqued are still here to be critiqued. Reopening
    // Photonics should start from the close-out's comparison key, not from a blank file.
    expect(findInstrumentById("optics-800g")).toBeDefined();
  });

  it("leaves every index that is a current product publicly listed", () => {
    // UGAI, UAVI and UACI are withheld too, for their own reasons and not the Photonics one --
    // see src/app/markets/hidden-indices.test.tsx. The deferral took UPPI and nothing else.
    const publicSymbols = PUBLIC_MARKET_CATALOG.map((market) => market.symbol);
    for (const symbol of ["UCPI", "UMPI", "UEPI", "UBWI"]) {
      expect(publicSymbols, symbol).toContain(symbol);
      expect(isPubliclyListed(symbol), symbol).toBe(true);
    }
  });
});

describe("the Photonics research record is durable in the repository", () => {
  const artifacts = [
    "ph-1-uppi-benchmark-methodology.md",
    "ph-1-external-research.md",
    "ph-1-source-matrix.json",
    "ph-2-source-rights-research.md",
    "ph-2-source-rights-matrix.json",
    "ph-2-feasibility-audit.md",
    "ph-2-feasibility-matrix.json",
    "ph-3-closeout.md",
    "ph-3-closeout.json",
  ];

  const read = (file: string) =>
    readFileSync(path.join(process.cwd(), "docs", "research", "photonics", file), "utf8");

  it.each(artifacts)("%s is present", (file) => {
    expect(existsSync(path.join(process.cwd(), "docs", "research", "photonics", file))).toBe(true);
  });

  it.each(artifacts.filter((file) => file.endsWith(".json")))("%s is valid JSON", (file) => {
    expect(() => JSON.parse(read(file))).not.toThrow();
  });

  it("records the close-out decision the frontend change implements", () => {
    expect(read("ph-3-closeout.md")).toContain("DEFERRED_PENDING_DATA_RIGHTS");
    const closeout = JSON.parse(read("ph-3-closeout.json"));
    expect(closeout.final_status.uppi_production_status).toBe("DEFERRED_PENDING_DATA_RIGHTS");
    expect(closeout.final_status.mvp_requirement).toBe("NO");
    expect(closeout.final_status.ph4_should_begin).toBe(false);
  });

  it("carries the PH-1 methodology pass recovered from the session scratchpad", () => {
    // It existed only in a temporary directory until the close-out. If this file goes missing,
    // a future engineer loses the index-number analysis and has to repeat PH-1.
    const methodology = read("ph-1-uppi-benchmark-methodology.md");
    expect(methodology.length).toBeGreaterThan(10_000);
    expect(methodology).toContain("UPPI");
  });
});
