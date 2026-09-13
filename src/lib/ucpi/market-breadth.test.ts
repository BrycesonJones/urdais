import { describe, expect, it } from "vitest";

import {
  capacitySourceKey,
  countIndependentCapacitySources,
  decideBreadth,
  regionalMedian,
  type CapacitySourceParticipant,
} from "@/lib/ucpi/market-breadth";

describe("participant-count rule", () => {
  it("publishes nothing for a region with no eligible participant", () => {
    expect(decideBreadth(0)).toEqual({ status: "unavailable", participantCount: 0, condition: "NO_ELIGIBLE_PARTICIPANT" });
  });

  it("publishes nothing for a region with exactly one participant, because one price is not a market price", () => {
    expect(decideBreadth(1)).toEqual({ status: "unavailable", participantCount: 1, condition: "SINGLE_PARTICIPANT" });
  });

  it("publishes exactly two participants at Minimum breadth, pivotal, with dispersion withheld", () => {
    expect(decideBreadth(2)).toEqual({
      status: "published",
      participantCount: 2,
      breadth: "minimum",
      allParticipantsPivotal: true,
      dispersionPublished: false,
      diagnostics: ["MARKET_BREADTH_MINIMUM"],
    });
  });

  it("publishes three or more at Normal breadth with no breadth diagnostic", () => {
    for (const n of [3, 4, 5, 15]) {
      expect(decideBreadth(n)).toEqual({
        status: "published",
        participantCount: n,
        breadth: "normal",
        allParticipantsPivotal: false,
        dispersionPublished: true,
        diagnostics: [],
      });
    }
  });

  it("never uses the word Limited for breadth", () => {
    for (const n of [2, 3]) {
      const decision = decideBreadth(n);
      expect(JSON.stringify(decision).toLowerCase()).not.toContain("limited");
    }
  });

  it("rejects a count that is not a non-negative integer", () => {
    expect(() => decideBreadth(-1)).toThrow(RangeError);
    expect(() => decideBreadth(1.5)).toThrow(RangeError);
    expect(() => decideBreadth(Number.NaN)).toThrow(RangeError);
  });
});

describe("breadth transitions", () => {
  const stateOf = (n: number) => {
    const d = decideBreadth(n);
    return d.status === "published" ? d.breadth : d.status;
  };

  it("downgrades 3 → 2 to Minimum breadth on the day it happens, and 2 → 1 to Unavailable", () => {
    expect([3, 2, 1].map(stateOf)).toEqual(["normal", "minimum", "unavailable"]);
  });

  it("upgrades 1 → 2 to Minimum breadth and 2 → 3 to Normal breadth on the day it happens", () => {
    expect([1, 2, 3].map(stateOf)).toEqual(["unavailable", "minimum", "normal"]);
  });

  it("has no hysteresis: the state depends only on that date's count, so flapping counts flap the state", () => {
    expect([2, 3, 2, 3, 2].map(stateOf)).toEqual(["minimum", "normal", "minimum", "normal", "minimum"]);
    // The same count always gives the same answer regardless of what came before.
    expect(decideBreadth(2)).toEqual(decideBreadth(2));
    expect(decideBreadth(3)).toEqual(decideBreadth(3));
  });
});

describe("regional median at small participant counts", () => {
  it("is the midpoint of two participants under the even-N convention", () => {
    expect(regionalMedian([2.0, 3.0])).toBe(2.5);
    expect(regionalMedian([3.0, 2.0])).toBe(2.5);
  });

  it("is the middle participant at three, unmoved by either extreme", () => {
    expect(regionalMedian([2.0, 3.0, 10.0])).toBe(3.0);
    expect(regionalMedian([0.01, 3.0, 4.0])).toBe(3.0);
  });

  it("uses the mean of the two central observations at any even count", () => {
    expect(regionalMedian([1, 2, 3, 10])).toBe(2.5);
  });

  it("moves by half of any one participant's move at two, which is why both are pivotal", () => {
    const before = regionalMedian([2.0, 3.0]);
    const after = regionalMedian([2.0, 3.5]);
    expect(after - before).toBeCloseTo(0.25, 12);
  });

  it("at three, an extreme participant cannot move the value past the middle one", () => {
    expect(regionalMedian([2.0, 3.0, 4.0])).toBe(3.0);
    expect(regionalMedian([2.0, 3.0, 40.0])).toBe(3.0);
    // The middle participant moves it one for one only inside the bracket of the other two.
    expect(regionalMedian([2.0, 3.5, 4.0])).toBe(3.5);
    expect(regionalMedian([2.0, 9.0, 4.0])).toBe(4.0);
  });

  it("is undefined over no participants", () => {
    expect(() => regionalMedian([])).toThrow(RangeError);
  });
});

describe("independence of capacity sources", () => {
  const seller = (sellerLegalEntityId: string, operatorId: string | null = null): CapacitySourceParticipant => ({
    sellerLegalEntityId,
    operatorId,
  });

  it("uses the operator where determinable and the seller otherwise", () => {
    expect(capacitySourceKey(seller("reseller-x", "operator-a"))).toBe("operator-a");
    expect(capacitySourceKey(seller("cloud-a"))).toBe("cloud-a");
  });

  it("counts two unrelated vertically integrated clouds as two capacity sources", () => {
    expect(countIndependentCapacitySources([seller("cloud-a"), seller("cloud-b")])).toBe(2);
  });

  it("counts two records of one seller, whether datacenters, tiers or interfaces, as one", () => {
    expect(countIndependentCapacitySources([seller("cloud-a"), seller("cloud-a"), seller("cloud-a")])).toBe(1);
  });

  it("counts two brands under one legal entity as one seller", () => {
    // Brands share the legal entity id by construction; the identity is legal, not commercial.
    expect(countIndependentCapacitySources([seller("holding-co"), seller("holding-co")])).toBe(1);
  });

  it("counts two sellers of one determinable operator's capacity as one", () => {
    expect(countIndependentCapacitySources([seller("reseller-x", "operator-a"), seller("reseller-y", "operator-a")])).toBe(1);
  });

  it("counts a reseller together with its disclosed underlying operator as one", () => {
    expect(countIndependentCapacitySources([seller("cloud-a"), seller("reseller-x", "cloud-a")])).toBe(1);
  });

  it("cannot see undisclosed shared operation, which is the standing limitation of seller fallback", () => {
    // Two sellers with undetermined operators count as two even if they in fact share hardware.
    expect(countIndependentCapacitySources([seller("cloud-a"), seller("cloud-b")])).toBe(2);
  });

  it("feeds the breadth rule: two independent clouds publish at Minimum breadth, a duplicated one does not publish", () => {
    const two = decideBreadth(countIndependentCapacitySources([seller("cloud-a"), seller("cloud-b")]));
    expect(two.status).toBe("published");
    if (two.status === "published") expect(two.breadth).toBe("minimum");

    const one = decideBreadth(countIndependentCapacitySources([seller("cloud-a"), seller("reseller-x", "cloud-a")]));
    expect(one).toMatchObject({ status: "unavailable", condition: "SINGLE_PARTICIPANT" });
  });
});
