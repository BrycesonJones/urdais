/**
 * UBWI percentage-change semantics.
 *
 * The convention across Urdais is a *relative* percentage return: `periodReturn` in
 * @/lib/market-ranges computes `(last - first) / first * 100`, and every movement surface
 * renders the result with `formatPercent` at two decimals.
 *
 * Until this phase the UBWI read path computed `latest - previous` instead -- a difference
 * in percentage *points* -- and returned it under the name `changePercent`. Because UBWI
 * is itself quoted in percent and sits near 0.27, the two are not close: the tests below
 * pin the difference, including the case that makes it a real defect rather than a
 * rounding quibble.
 */
import { describe, expect, it } from "vitest";

import { formatPercent } from "@/lib/format";
import { periodReturn } from "@/lib/market-ranges";
import { ubwiChangePercent } from "./publication-store";

const REGIME = { methodologyVersion: "1.2.0", residualModelVersion: "1.0.0" };

describe("the UBWI percentage change", () => {
  it("is a relative percentage return, not a percentage-point difference", () => {
    // The real production level on 2026-09-15, moving to 0.2700.
    const change = ubwiChangePercent(
      { valuePercent: 0.27, ...REGIME },
      { valuePercent: 0.2672, ...REGIME },
    );
    expect(change).not.toBeNull();
    expect(change!).toBeCloseTo(1.047904, 5);

    // The behaviour this replaces: a percentage-point difference of 0.0028, which the
    // product's own formatter renders as no movement at all. A genuine one-percent day
    // would have displayed as "+0.00%" on the market page and on the homepage row.
    const percentagePointDifference = 0.27 - 0.2672;
    expect(formatPercent(percentagePointDifference)).toBe("+0.00%");
    expect(formatPercent(change!)).toBe("+1.05%");
  });

  it("agrees with the convention the rest of the product already uses", () => {
    const asOf = Math.floor(Date.parse("2026-09-16T06:00:00.000Z") / 1000);
    // Forty flat daily closes at 0.2672 and a last one at 0.2700, so the generic monthly
    // window measures exactly the move the UBWI change measures.
    const daily = Array.from({ length: 41 }, (_, index) => ({
      time: asOf - (40 - index) * 86_400,
      value: index === 40 ? 0.27 : 0.2672,
    }));
    const generic = periodReturn({ daily, intraday: [] }, "1M", asOf);
    expect(generic).not.toBeNull();
    const ubwi = ubwiChangePercent(
      { valuePercent: 0.27, ...REGIME },
      { valuePercent: 0.2672, ...REGIME },
    );
    expect(ubwi).toBeCloseTo(generic!, 12);
  });

  it("is negative for a fall, and symmetric in the same way a return is", () => {
    const down = ubwiChangePercent(
      { valuePercent: 0.2672, ...REGIME },
      { valuePercent: 0.27, ...REGIME },
    );
    expect(down!).toBeCloseTo(-1.037037, 5);
    expect(formatPercent(down!)).toBe("−1.04%");
  });

  it("is null with one point, and is never a fabricated zero", () => {
    expect(ubwiChangePercent({ valuePercent: 0.26716309468662236, ...REGIME }, undefined)).toBeNull();
  });

  it("is null across a methodology boundary", () => {
    expect(
      ubwiChangePercent(
        { valuePercent: 0.27, ...REGIME },
        { valuePercent: 0.2672, methodologyVersion: "1.1.0", residualModelVersion: "1.0.0" },
      ),
    ).toBeNull();
  });

  it("is null across a residual-model boundary", () => {
    expect(
      ubwiChangePercent(
        { valuePercent: 0.27, ...REGIME },
        { valuePercent: 0.2672, methodologyVersion: "1.2.0", residualModelVersion: "0.9.0" },
      ),
    ).toBeNull();
  });

  it("is null rather than infinite when the base is zero or unreadable", () => {
    expect(ubwiChangePercent({ valuePercent: 0.27, ...REGIME }, { valuePercent: 0, ...REGIME })).toBeNull();
    expect(
      ubwiChangePercent({ valuePercent: 0.27, ...REGIME }, { valuePercent: Number.NaN, ...REGIME }),
    ).toBeNull();
  });

  it("reports a real zero as zero when two points genuinely have the same level", () => {
    // Not a fabricated zero: the index really did not move. Distinct from null.
    expect(ubwiChangePercent({ valuePercent: 0.2672, ...REGIME }, { valuePercent: 0.2672, ...REGIME })).toBe(0);
  });
});
