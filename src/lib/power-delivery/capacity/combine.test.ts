import { describe, expect, it } from "vitest";

import {
  CapacityCombinationError, assertCombinable, assertDifferenceable, refuseSevenMarketCapacityTotal,
  type CombinableQuantity,
} from "@/lib/power-delivery/capacity/combine";

const base: CombinableQuantity = {
  quantityKind: "capability",
  period: { periodBasis: "delivery_year", targetYear: 2031, targetSeason: null, periodStart: null, periodEnd: null },
  unit: "MW", capacityBasis: "ucap", gridAreaId: "pjm", gridSubareaId: null, gridInterfaceId: null,
};
const q = (over: Partial<CombinableQuantity>): CombinableQuantity => ({ ...base, ...over });

describe("what may be combined", () => {
  it("allows two capabilities that agree on everything", () => {
    expect(() => assertCombinable([base, q({})], "test")).not.toThrow();
  });

  it("refuses a requirement summed with a capability", () => {
    expect(() => assertCombinable([base, q({ quantityKind: "requirement" })], "test"))
      .toThrow(/cannot combine a capability with a requirement; they measure different things/);
  });

  it("refuses a delivery year combined with a calendar year", () => {
    expect(() => assertCombinable([base, q({ period: { ...base.period, periodBasis: "calendar" } })], "test"))
      .toThrow(CapacityCombinationError);
    expect(() => assertCombinable([base, q({ period: { ...base.period, periodBasis: "calendar" } })], "test"))
      .toThrow(/cannot combine delivery_year 2031 with calendar 2031/);
  });

  it("refuses two different target years and two different seasons", () => {
    expect(() => assertCombinable([base, q({ period: { ...base.period, targetYear: 2032 } })], "test")).toThrow();
    const summer = q({ period: { ...base.period, periodBasis: "seasonal", targetSeason: "summer" } });
    const winter = q({ period: { ...base.period, periodBasis: "seasonal", targetSeason: "winter" } });
    expect(() => assertCombinable([summer, winter], "test")).toThrow(/summer with seasonal 2031 winter/);
  });

  it("refuses mixed units and mixed capacity bases", () => {
    expect(() => assertCombinable([base, q({ unit: "GW" })], "test")).toThrow(/cannot combine MW with GW/);
    expect(() => assertCombinable([base, q({ capacityBasis: "icap" })], "test"))
      .toThrow(/UCAP and ICAP differ by the forced-outage treatment/);
  });

  it("refuses two markets", () => {
    expect(() => assertCombinable([base, q({ gridAreaId: "ercot" })], "test"))
      .toThrow(/cannot combine values from two markets/);
  });

  it("refuses a locality value combined with a market-level value", () => {
    expect(() => assertCombinable([base, q({ gridSubareaId: "eastern-maac" })], "test"))
      .toThrow(/cannot combine a market value with a locality value/);
  });

  it("refuses the same locality counted twice", () => {
    const locality = q({ gridSubareaId: "eastern-maac" });
    expect(() => assertCombinable([locality, { ...locality }], "test"))
      .toThrow(/the same locality appears more than once/);
    // Two distinct localities are allowed by this guard; whether they may be added is a
    // methodology question, not a categorical one.
    expect(() => assertCombinable([locality, q({ gridSubareaId: "pseg" })], "test")).not.toThrow();
  });

  it("refuses to treat network constraints as additive supply", () => {
    const limit = q({ quantityKind: "constraint", gridInterfaceId: "cetl-emaac" });
    expect(() => assertCombinable([limit], "test"))
      .toThrow(/network constraints are not additive; a limit bounds a result/);
  });

  it("refuses an empty set", () => {
    expect(() => assertCombinable([], "test")).toThrow(/nothing to combine/);
  });
});

describe("capability minus requirement", () => {
  it("permits the one cross-kind operation with an obvious meaning", () => {
    expect(() => assertDifferenceable(base, q({ quantityKind: "requirement" }), "margin")).not.toThrow();
  });

  it("refuses the operands the wrong way round", () => {
    expect(() => assertDifferenceable(q({ quantityKind: "requirement" }), q({ quantityKind: "requirement" }), "margin"))
      .toThrow(/the minuend is a requirement, not a capability/);
    expect(() => assertDifferenceable(base, base, "margin"))
      .toThrow(/the subtrahend is a capability, not a requirement/);
  });

  it("still requires everything else to agree", () => {
    expect(() => assertDifferenceable(base, q({ quantityKind: "requirement", unit: "GW" }), "margin"))
      .toThrow(/cannot combine MW with GW/);
    expect(() => assertDifferenceable(base, q({ quantityKind: "requirement", gridAreaId: "ercot" }), "margin"))
      .toThrow(/two markets/);
  });
});

describe("the seven-market total", () => {
  it("does not exist and says why", () => {
    expect(() => refuseSevenMarketCapacityTotal())
      .toThrow(/different bases, over different delivery periods, against different reliability standards/);
  });

  it("is not reachable through the combination guard either", () => {
    const markets = ["ercot", "pjm", "miso", "spp", "caiso", "nyiso", "iso-ne"]
      .map((gridAreaId) => q({ gridAreaId }));
    expect(() => assertCombinable(markets, "seven-market total")).toThrow(/two markets/);
  });
});
