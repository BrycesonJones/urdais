import { describe, expect, it } from "vitest";

import { CHIP_ACCELERATOR_INDEX } from "@/data/market-catalog";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { MARKETS, defaultInstrument, findMarket } from "@/data/mock/market-detail";

describe("market detail dataset: chip and accelerator consolidation", () => {
  it("routes exactly one chip / accelerator market, at /markets/uaci, and none at /markets/uaxi", () => {
    // UGAI is deliberately absent from the mock dataset. It has never published an observation,
    // so a generated market would have to invent a level, a daily return and a year of history;
    // the one it carried was 184.21 on a base of 1,000. Its detail page renders canonical
    // published observations or an empty state.
    expect(MARKETS.map((market) => market.symbol)).toEqual(["UCPI", "UAVI", "UMPI", "UPPI", "UEPI", "UACI", "UBWI"]);
    expect(MARKETS.map((market) => market.symbol)).not.toContain("UGAI");
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
      // A market that publishes no series has no headline instrument to compare from.
      if (market.families.every((family) => family.instruments.length === 0)) continue;
      const labels = defaultInstrument(market).comparisons.map((option) => option.label);
      const standalone = market.families.length === 1 && market.families[0]!.instruments.length === 1;
      if (standalone && market.symbol !== "UACI") expect(labels.filter((label) => label === "UACI")).toHaveLength(1);
      expect(labels).not.toContain("UAXI");
    }
    // UGAI is offered nowhere for comparison, and is not routable from the mock dataset at all.
    // An index with no observations has nothing to plot against another series, and offering it
    // would mean comparing a real series against synthetic points.
    expect(findMarket("ugai")).toBeUndefined();
    for (const market of MARKETS) {
      if (market.families.every((family) => family.instruments.length === 0)) continue;
      expect(defaultInstrument(market).comparisons.map((option) => option.label)).not.toContain("UGAI");
    }
  });

  it("shows one chip / accelerator row on the homepage rail with the canonical name", () => {
    const rows = INDEX_SNAPSHOTS.filter((snapshot) => /chip|accelerator/i.test(snapshot.name));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "UACI", name: "Urdais Chip & Accelerator Index", unit: "pts" });
    // UBWI is deliberately absent: it publishes no value, so it gets no watchlist row
    // rather than a fabricated one. Its detail page carries the withheld state instead.
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).toEqual(["UEPI", "UACI"]);
    // UPPI left this list at the Photonics close-out. Its market, instruments and illustrative
    // series are all still here -- the PH-3 decision was DEFERRED_PENDING_DATA_RIGHTS, not
    // deletion -- but a deferred index is not presented to readers as a current Urdais product,
    // so it gets no rail row. See docs/research/photonics/ph-3-closeout.md.
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).not.toContain("UPPI");
    // UMPI left this list in Phase 7, when its nine demo chip-price instruments were removed. It
    // publishes two monthly series and no composite, so it has no single level for a rail row;
    // the homepage joins its own row from @/lib/umpi/read/watchlist, carrying no number.
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).not.toContain("UMPI");
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).not.toContain("UBWI");
    // And UGAI, for the mirror-image reason: it is joined to the rail by the homepage from
    // @/lib/ugai/read/watchlist as an unpublished row carrying no number.
    expect(INDEX_SNAPSHOTS.map((snapshot) => snapshot.symbol)).not.toContain("UGAI");
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
