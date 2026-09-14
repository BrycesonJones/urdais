import { describe, expect, it } from "vitest";

import { CHIP_ACCELERATOR_INDEX } from "@/data/market-catalog";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { MARKETS, defaultInstrument, findMarket } from "@/data/mock/market-detail";

describe("market detail dataset: chip and accelerator consolidation", () => {
  it("routes exactly one chip / accelerator market, at /markets/uaci, and none at /markets/uaxi", () => {
    expect(MARKETS.map((market) => market.symbol)).toEqual(["UCPI", "UGAI", "UAVI", "UMPI", "UPPI", "UEPI", "UACI", "UBWI"]);
    expect(MARKETS.filter((market) => /chip|accelerator/i.test(market.name))).toHaveLength(1);
    expect(findMarket("uaxi")).toBeUndefined();
    expect(findMarket("uaci")?.name).toBe(CHIP_ACCELERATOR_INDEX.name);
  });

  it("carries the canonical description and question onto the detail model", () => {
    const uaci = findMarket("uaci")!;
    expect(uaci.description).toBe(CHIP_ACCELERATOR_INDEX.description);
    expect(uaci.question).toBe(CHIP_ACCELERATOR_INDEX.question);
    expect(uaci.unit).toBe("pts");
    expect(defaultInstrument(uaci).name).toBe("Urdais Chip & Accelerator Index");
    expect(findMarket("ucpi")?.description).toBeUndefined();
  });

  it("offers UACI once, and never UAXI, in every cross-index comparison list", () => {
    for (const market of MARKETS) {
      const labels = defaultInstrument(market).comparisons.map((option) => option.label);
      const standalone = market.families.length === 1 && market.families[0]!.instruments.length === 1;
      if (standalone && market.symbol !== "UACI") expect(labels.filter((label) => label === "UACI")).toHaveLength(1);
      expect(labels).not.toContain("UAXI");
    }
    expect(defaultInstrument(findMarket("ugai")!).comparisons.map((option) => option.label)).toEqual(["UCPI", "UAVI", "UMPI", "UPPI", "UEPI", "UACI", "UBWI"]);
  });

  it("shows one chip / accelerator row on the homepage rail with the canonical name", () => {
    const rows = INDEX_SNAPSHOTS.filter((snapshot) => /chip|accelerator/i.test(snapshot.name));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "UACI", name: "Urdais Chip & Accelerator Index", unit: "pts" });
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).toEqual(["UGAI", "UAVI", "UMPI", "UPPI", "UEPI", "UACI", "UBWI"]);
  });
});

/*
 * UBWI is a percentage of Total Global Wealth, never an index level. The
 * methodology is explicit that it carries no base date and no base value and
 * that "any presentation of UBWI as a points series is wrong", and that it is
 * bounded in [0, 100] because Bitcoin sits inside its own denominator.
 */
describe("market detail dataset: UBWI is a percentage, not a points index", () => {
  const ubwi = findMarket("ubwi")!;
  const instrument = defaultInstrument(ubwi);

  it("carries a percentage unit everywhere it is surfaced", () => {
    expect(ubwi.unit).toBe("%");
    expect(instrument.unit).toBe("%");
    expect(instrument.unit).not.toBe("pts");
    expect(INDEX_SNAPSHOTS.find((snapshot) => snapshot.symbol === "UBWI")!.unit).toBe("%");
  });

  it("keeps every demo point inside the bounds a share of a whole can take", () => {
    for (const point of [...instrument.series.daily, ...instrument.series.intraday]) {
      expect(point.value).toBeGreaterThan(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
    expect(instrument.snapshot.value).toBeLessThanOrEqual(100);
  });

  it("states the percentage definition and the question the index answers", () => {
    expect(ubwi.description).toContain("percentage of Total Global Wealth");
    // The formal term is Total Global Wealth; "global wealth supply" is used nowhere.
    expect(`${ubwi.description} ${ubwi.question}`).not.toContain("global wealth supply");
    expect(ubwi.question).toBe("What share of all presently existing global wealth is represented by Bitcoin?");
  });
});
