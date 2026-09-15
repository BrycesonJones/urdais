import { describe, expect, it } from "vitest";

import { CHIP_ACCELERATOR_INDEX, isPublishedMarket } from "@/data/market-catalog";
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

  it("never offers UAXI in a comparison list", () => {
    for (const market of MARKETS) {
      // A market that publishes no series has no headline instrument to compare from.
      if (market.families.every((family) => family.instruments.length === 0)) continue;
      expect(defaultInstrument(market).comparisons.map((option) => option.label)).not.toContain("UAXI");
    }
  });
});

/*
 * UACI is withheld from the public product, not deleted. The detail model is
 * built exactly as before — so republishing is a one-line catalog change — and
 * every surface that lists, searches, or compares markets leaves it out.
 */
describe("market detail dataset: UACI is withheld from public surfaces", () => {
  it("keeps the UACI detail model intact, with its series and its headline instrument", () => {
    const uaci = findMarket("uaci")!;
    expect(isPublishedMarket(uaci.symbol)).toBe(false);
    expect(defaultInstrument(uaci).series.daily.length).toBeGreaterThan(0);
    expect(defaultInstrument(uaci).snapshot.value).toBeGreaterThan(0);
  });

  it("offers UACI in no cross-index comparison list", () => {
    for (const market of MARKETS) {
      if (market.families.every((family) => family.instruments.length === 0)) continue;
      expect(defaultInstrument(market).comparisons.map((option) => option.label)).not.toContain("UACI");
    }
    expect(defaultInstrument(findMarket("ugai")!).comparisons.map((option) => option.label)).toEqual(["UCPI", "UAVI", "UMPI", "UPPI", "UEPI"]);
  });

  it("compares the withheld index itself against the published family", () => {
    // Its own page keeps working: the comparison menu simply carries published indices.
    expect(defaultInstrument(findMarket("uaci")!).comparisons.map((option) => option.label)).toEqual(["UCPI", "UGAI", "UAVI", "UMPI", "UPPI", "UEPI"]);
  });

  it("shows no chip / accelerator row on the homepage rail", () => {
    expect(INDEX_SNAPSHOTS.filter((snapshot) => /chip|accelerator/i.test(snapshot.name))).toEqual([]);
    // UBWI is deliberately absent too, for a different reason: it publishes no value,
    // so it gets no watchlist row rather than a fabricated one. Its detail page carries
    // the withheld state instead.
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).toEqual(["UGAI", "UAVI", "UMPI", "UPPI", "UEPI"]);
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).not.toContain("UACI");
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).not.toContain("UBWI");
  });
});

/*
 * UBWI is a percentage of Total Global Wealth, never an index level. The
 * methodology is explicit that it carries no base date and no base value and
 * that "any presentation of UBWI as a points series is wrong", and that it is
 * bounded in [0, 100] because Bitcoin sits inside its own denominator.
 */
describe("market detail dataset: UBWI publishes a percentage or nothing at all", () => {
  const ubwi = findMarket("ubwi")!;

  it("carries a percentage unit and no points unit", () => {
    expect(ubwi.unit).toBe("%");
    expect(ubwi.unit).not.toBe("pts");
  });

  it("carries no demo series, no demo level and no watchlist row", () => {
    // The production gate refuses the current denominator, so there is no published value.
    // A synthetic walk in its place would be fake history on a public surface.
    const instruments = ubwi.families.flatMap((family) => family.instruments);
    expect(instruments).toHaveLength(0);
    expect(INDEX_SNAPSHOTS.find((snapshot) => snapshot.symbol === "UBWI")).toBeUndefined();
  });

  it("states the percentage definition and the question the index answers", () => {
    expect(ubwi.description).toContain("percentage of Total Global Wealth");
    // The formal term is Total Global Wealth; "global wealth supply" is used nowhere.
    expect(`${ubwi.description} ${ubwi.question}`).not.toContain("global wealth supply");
    expect(ubwi.question).toBe("What share of all presently existing global wealth is represented by Bitcoin?");
  });
});
