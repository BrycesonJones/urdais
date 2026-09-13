import { describe, expect, it } from "vitest";

import { decideBreadth } from "@/lib/ucpi/market-breadth";
import { freshnessOnCalculationDate } from "@/lib/ucpi/launch-parameters";
import {
  calculationDateOf,
  calculationWindow,
  isWithinWindow,
  percentageChangeDisposition,
  publicationStatus,
  selectReconfirmation,
  type Retrieval,
} from "@/lib/ucpi/calculation-window";

const D = "2026-09-13"; // a Sunday

describe("calculation window", () => {
  it("is the half-open UTC day with the cutoff at the next midnight and the deadline at the one after", () => {
    expect(calculationWindow(D)).toEqual({
      calculationDate: D,
      windowStart: "2026-09-13T00:00:00.000Z",
      cutoff: "2026-09-14T00:00:00.000Z",
      publicationDeadline: "2026-09-15T00:00:00.000Z",
    });
  });

  it("includes the start instant and the last millisecond, and excludes the cutoff instant", () => {
    expect(isWithinWindow("2026-09-13T00:00:00.000Z", D)).toBe(true);
    expect(isWithinWindow("2026-09-13T23:59:59.999Z", D)).toBe(true);
    expect(isWithinWindow("2026-09-14T00:00:00.000Z", D)).toBe(false);
    expect(isWithinWindow("2026-09-14T00:00:00.001Z", D)).toBe(false);
    expect(isWithinWindow("2026-09-12T23:59:59.999Z", D)).toBe(false);
  });

  it("assigns an observation at exactly the cutoff to the next date", () => {
    expect(calculationDateOf("2026-09-14T00:00:00.000Z")).toBe("2026-09-14");
    expect(calculationDateOf("2026-09-13T23:59:59.999Z")).toBe(D);
  });

  it("uses UTC regardless of how the instant is written", () => {
    // 20:00 in UTC-5 on the 13th is 01:00Z on the 14th.
    expect(calculationDateOf("2026-09-13T20:00:00-05:00")).toBe("2026-09-14");
  });

  it("rejects malformed dates", () => {
    expect(() => calculationWindow("2026-9-13")).toThrow(RangeError);
    expect(() => calculationWindow("2026-02-30")).toThrow(RangeError);
    expect(() => isWithinWindow("not a time", D)).toThrow(RangeError);
  });
});

describe("which retrieval is the observation", () => {
  const r = (requestedAt: string, completedAt: string | null, complete = true, sourceEffectiveAt: string | null = null): Retrieval => ({
    requestedAt,
    completedAt,
    complete,
    sourceEffectiveAt,
  });

  it("takes the last complete reconfirmation before the cutoff, not the first", () => {
    const chosen = selectReconfirmation(
      [r("2026-09-13T06:00:00Z", "2026-09-13T06:00:02Z"), r("2026-09-13T18:00:00Z", "2026-09-13T18:00:01Z")],
      D,
    );
    expect(chosen?.completedAt).toBe("2026-09-13T18:00:01Z");
  });

  it("a request started before the cutoff but completed after it belongs to the next date", () => {
    const late = r("2026-09-13T23:59:58Z", "2026-09-14T00:00:01Z");
    expect(selectReconfirmation([late], D)).toBeNull();
    expect(selectReconfirmation([late], "2026-09-14")).toBe(late);
  });

  it("a source-native timestamp from before the cutoff does not rescue a response received after it", () => {
    const late = r("2026-09-14T00:00:05Z", "2026-09-14T00:00:06Z", true, "2026-09-13T12:00:00Z");
    expect(selectReconfirmation([late], D)).toBeNull();
  });

  it("ignores incomplete reconfirmations and retrievals that never completed", () => {
    const partial = r("2026-09-13T20:00:00Z", "2026-09-13T20:00:01Z", false);
    const failed = r("2026-09-13T21:00:00Z", null);
    const good = r("2026-09-13T10:00:00Z", "2026-09-13T10:00:01Z");
    expect(selectReconfirmation([good, partial, failed], D)).toBe(good);
  });

  it("returns null when the source was never successfully observed in the window", () => {
    expect(selectReconfirmation([r("2026-09-13T10:00:00Z", null)], D)).toBeNull();
    expect(selectReconfirmation([], D)).toBeNull();
  });
});

describe("cross-date behaviour with zero carry", () => {
  it("does not carry a participant observed yesterday into today", () => {
    const priceDate = calculationDateOf("2026-09-12T23:00:00Z");
    expect(freshnessOnCalculationDate({ calculationDate: D, priceObservedOn: priceDate, availabilityObservedOn: priceDate })).toBe("PRICE_STALE");
  });

  it("one participant fresh and one failed by the cutoff leaves two-participant coverage Unavailable", () => {
    const fresh = selectReconfirmation([{ requestedAt: "2026-09-13T10:00:00Z", completedAt: "2026-09-13T10:00:01Z", complete: true }], D);
    const failed = selectReconfirmation([{ requestedAt: "2026-09-13T10:00:00Z", completedAt: null, complete: false }], D);
    const participants = [fresh, failed].filter((x) => x !== null).length;
    expect(participants).toBe(1);
    expect(decideBreadth(participants)).toMatchObject({ status: "unavailable", condition: "SINGLE_PARTICIPANT" });
  });

  it("treats a weekend date with the same window and cutoff", () => {
    expect(new Date(`${D}T12:00:00Z`).getUTCDay()).toBe(0);
    expect(calculationWindow(D).cutoff).toBe("2026-09-14T00:00:00.000Z");
    expect(calculationWindow("2026-09-12").cutoff).toBe("2026-09-13T00:00:00.000Z");
  });
});

describe("publication timing", () => {
  it("is Published when released any time before the deadline, including immediately after the cutoff", () => {
    expect(publicationStatus({ calculationDate: D, publishedAt: "2026-09-14T00:03:00Z", producible: true })).toBe("published");
    expect(publicationStatus({ calculationDate: D, publishedAt: "2026-09-14T23:59:59Z", producible: true })).toBe("published");
  });

  it("is Delayed when released at or after the deadline, or not yet released", () => {
    expect(publicationStatus({ calculationDate: D, publishedAt: "2026-09-15T00:00:00Z", producible: true })).toBe("delayed");
    expect(publicationStatus({ calculationDate: D, publishedAt: null, producible: true })).toBe("delayed");
  });

  it("is Unavailable when the value cannot be produced, regardless of timing", () => {
    expect(publicationStatus({ calculationDate: D, publishedAt: null, producible: false })).toBe("unavailable");
  });
});

describe("percentage change against the immediately preceding date", () => {
  it("is withheld when the previous date was Unavailable or Delayed", () => {
    expect(percentageChangeDisposition({ status: "unavailable" }, { breadth: "minimum" })).toBe("withheld");
    expect(percentageChangeDisposition({ status: "delayed" }, { breadth: "normal" })).toBe("withheld");
  });

  it("is annotated when breadth moved between Minimum and Normal or the participant set changed", () => {
    expect(percentageChangeDisposition({ status: "published", breadth: "minimum", participantSetChanged: true }, { breadth: "normal" })).toBe(
      "annotated",
    );
    expect(percentageChangeDisposition({ status: "published", breadth: "normal", participantSetChanged: true }, { breadth: "minimum" })).toBe(
      "annotated",
    );
  });

  it("is published plainly when the same participants at the same breadth continue", () => {
    expect(percentageChangeDisposition({ status: "published", breadth: "minimum", participantSetChanged: false }, { breadth: "minimum" })).toBe(
      "published",
    );
  });
});
