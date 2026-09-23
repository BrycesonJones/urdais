import { describe, expect, it } from "vitest";

import type { UmpiPoint } from "@/lib/umpi/read/read-model";
import {
  formatReferenceMonth,
  monthOrdinal,
  monthStartUtc,
  umpiAsOf,
  umpiAvailableRanges,
  umpiHasGaps,
  umpiRangeReturnPercent,
  umpiSegments,
  umpiTimeSeries,
  umpiWindowPoints,
  UMPI_RANGES,
} from "@/lib/umpi/read/months";

const point = (referenceMonth: string, level: number): UmpiPoint => ({
  referenceMonth,
  level,
  change: null,
  changeWithheldReason: null,
  tradeUnitValueUsdPerKg: null,
});

/** Series A as production publishes it: eight consecutive months, Jan–Aug 2026. */
const consecutive = [
  point("2026-01", 247.68),
  point("2026-02", 267.0),
  point("2026-03", 317.4),
  point("2026-04", 437.49),
  point("2026-05", 478.98),
  point("2026-06", 496.84),
  point("2026-07", 538.74),
  point("2026-08", 553.02),
];

/** Series B as production publishes it: the 2020 base year, a five-year hole, then Jan-Aug 2026. */
const sparse = [
  ...Array.from({ length: 12 }, (_, i) => point(`2020-${String(i + 1).padStart(2, "0")}`, 90 + i)),
  ...Array.from({ length: 8 }, (_, i) => point(`2026-${String(i + 1).padStart(2, "0")}`, 400 + i * 40)),
];

/** The same hole with only a short tail after it: three months resumed, and nothing since 2020. */
const shortTail = [
  ...Array.from({ length: 12 }, (_, i) => point(`2020-${String(i + 1).padStart(2, "0")}`, 90 + i)),
  point("2026-06", 579.664327),
  point("2026-07", 674.999771),
  point("2026-08", 687.048079),
];

describe("a month is an identity, not an instant", () => {
  it("renders a month without inventing a day", () => {
    expect(formatReferenceMonth("2026-08")).toBe("Aug 2026");
    expect(formatReferenceMonth("2020-01")).toBe("Jan 2020");
    // The failure this guards: a monthly index rendered as "Aug 1, 2026" reads as a daily one.
    expect(formatReferenceMonth("2026-08")).not.toMatch(/\d{1,2},/);
  });

  it("spaces months by elapsed months, so a gap has a real width", () => {
    expect(monthOrdinal("2026-02") - monthOrdinal("2026-01")).toBe(1);
    expect(monthOrdinal("2026-01") - monthOrdinal("2020-12")).toBe(61);
    expect(monthStartUtc("2026-08")).toBe(Date.UTC(2026, 7, 1) / 1000);
  });

  it("measures horizons from the latest published month, never from the clock", () => {
    // A series published through August is not stale in December, and must not lose a window
    // because time passed without a new observation.
    expect(umpiAsOf(consecutive)).toBe(monthStartUtc("2026-08"));
    expect(umpiTimeSeries(consecutive).map((p) => p.value)).toEqual(consecutive.map((p) => p.level));
  });
});

describe("gaps stay gaps", () => {
  it("draws a consecutive history as one unbroken run", () => {
    expect(umpiSegments(consecutive)).toHaveLength(1);
    expect(umpiHasGaps(consecutive)).toBe(false);
  });

  it("splits a history at every unpublished stretch", () => {
    const segments = umpiSegments(sparse);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.map((p) => p.referenceMonth)).toEqual(sparse.slice(0, 12).map((p) => p.referenceMonth));
    expect(segments[1]!.map((p) => p.referenceMonth)).toEqual(sparse.slice(12).map((p) => p.referenceMonth));
    expect(umpiHasGaps(sparse)).toBe(true);
  });

  it("never joins across a hole, however small", () => {
    // One missing month is enough. The join would be the only drawn part never observed.
    expect(umpiSegments([point("2026-01", 1), point("2026-03", 2)])).toHaveLength(2);
    expect(umpiSegments([point("2026-01", 1), point("2026-02", 2)])).toHaveLength(1);
  });

  it("invents no point when windowing", () => {
    // Whatever the window, the months returned are months that were published.
    const published = new Set(sparse.map((p) => p.referenceMonth));
    for (const range of [...UMPI_RANGES, "ALL" as const]) {
      for (const p of umpiWindowPoints(sparse, range)) {
        expect(published.has(p.referenceMonth)).toBe(true);
      }
    }
  });
});

describe("ranges are read off the published months", () => {
  it("offers no window at all until there are two points to draw between", () => {
    expect(umpiAvailableRanges([])).toEqual([]);
    expect(umpiAvailableRanges([point("2026-08", 553.02)])).toEqual([]);
  });

  it("never offers a daily or weekly horizon on a monthly index", () => {
    for (const points of [consecutive, sparse]) {
      const ranges = umpiAvailableRanges(points);
      expect(ranges).not.toContain("1D");
      expect(ranges).not.toContain("1W");
    }
    // Not merely unavailable: absent from the offered set by construction.
    expect(UMPI_RANGES as readonly string[]).not.toContain("1D");
    expect(UMPI_RANGES as readonly string[]).not.toContain("1W");
  });

  it("offers only the windows eight months of history can fill", () => {
    // 1Y is withheld: the history does not reach back a year, so the window would either be
    // empty or silently measure a shorter span while claiming a year.
    expect(umpiAvailableRanges(consecutive)).toEqual(["3M", "6M", "ALL"]);
  });

  it("refuses a year window whose only older data sits across a five-year hole", () => {
    // The trap this covers: 2020 points are "before" the 1Y window start, so a naive base
    // lookup would find one and call 1Y available -- then measure 2020 against 2026 as if it
    // were a year's movement. The shared base-within-one-further-window rule refuses it.
    const ranges = umpiAvailableRanges(sparse);
    expect(ranges).not.toContain("1Y");
    expect(ranges).toEqual(["3M", "6M", "ALL"]);
  });

  it("offers only ALL when the months since the hole cannot fill even the shortest window", () => {
    // Three resumed months cannot fill a three-month window whose base would land inside the
    // hole. Every fixed horizon is refused and only the published history remains offerable.
    expect(umpiAvailableRanges(shortTail)).toEqual(["ALL"]);
  });

  it("never reaches back across the hole for a base, even on a window it refuses", () => {
    // The specific defect: slicing from "the last point at or before the window start" pulls
    // 2020-12 into a three-month window and silently makes it a five-year one.
    expect(umpiWindowPoints(shortTail, "3M").map((p) => p.referenceMonth)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(umpiRangeReturnPercent(shortTail, "3M")).toBeNull();
  });

  it("windows the recent months without dragging the old block in", () => {
    const window = umpiWindowPoints(sparse, "3M");
    expect(window.map((p) => p.referenceMonth)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(umpiHasGaps(window)).toBe(false);
    // ALL keeps the whole published history, gap included, because that is what exists.
    expect(umpiWindowPoints(sparse, "ALL")).toHaveLength(sparse.length);
    expect(umpiHasGaps(umpiWindowPoints(sparse, "ALL"))).toBe(true);
  });

  it("measures a window's own change, and reports none where there is nothing to measure", () => {
    const threeMonth = umpiRangeReturnPercent(consecutive, "3M");
    // May 478.98 -> Aug 553.02.
    expect(threeMonth).toBeCloseTo(((553.02 - 478.98) / 478.98) * 100, 6);
    expect(umpiRangeReturnPercent([point("2026-08", 553.02)], "ALL")).toBeNull();
  });

  it("keeps the window change distinct from the headline MoM", () => {
    // The headline is MoM by definition. A range control measures the window and must never be
    // able to redefine what the index's published change means.
    const allChange = umpiRangeReturnPercent(consecutive, "ALL");
    expect(allChange).toBeCloseTo(((553.02 - 247.68) / 247.68) * 100, 6);
    const mom = ((553.02 - 538.74) / 538.74) * 100;
    expect(allChange).not.toBeCloseTo(mom, 2);
  });
});
