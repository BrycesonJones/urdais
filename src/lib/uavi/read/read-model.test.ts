import { describe, expect, it } from "vitest";

import {
  unconfiguredUaviReadModel,
  UAVI_SYMBOL,
  validatePublicUavi,
  validatePublicUaviSeries,
} from "@/lib/uavi/read/read-model";

function live(overrides: Record<string, unknown> = {}) {
  return {
    ...unconfiguredUaviReadModel(),
    lifecycle: "live",
    publicReason: "",
    level: 31.42,
    previousLevel: 28.9,
    change: 2.52,
    changePercent: 8.72,
    observationDate: "2026-09-18",
    publishedAt: "2026-09-18T20:00:00.000Z",
    coverage: {
      coveredParentWeight: 0.84,
      coveredIssuerCount: 27,
      uncoveredIssuerCount: 4,
      maxConstituentWeight: 0.11,
      effectiveIssuerCount: 18.2,
    },
    ...overrides,
  };
}

describe("the public UAVI contract", () => {
  it("passes the unconfigured not-initialized model", () => {
    const model = unconfiguredUaviReadModel();
    expect(validatePublicUavi(JSON.parse(JSON.stringify(model)))).toEqual([]);
    expect(model.level).toBeNull();
    expect(model.changePercent).toBeNull();
    expect(model.publicReason).not.toBe("");
  });

  it("passes a live model carrying its coverage", () => {
    expect(validatePublicUavi(live())).toEqual([]);
  });

  it("refuses a non-live state carrying a level", () => {
    const reasons = validatePublicUavi({ ...unconfiguredUaviReadModel(), level: 30 });
    expect(reasons.some((r) => r.includes("non-null level"))).toBe(true);
  });

  it("refuses a zero standing in for an absent level", () => {
    // "0.00" on a volatility index reads as a market expecting no volatility at all, which is not
    // something anyone said and has never been true.
    const reasons = validatePublicUavi({
      ...unconfiguredUaviReadModel(),
      level: 0,
      change: 0,
      changePercent: 0,
    });
    expect(reasons.length).toBeGreaterThan(0);
  });

  it("refuses a change percent with no previous level", () => {
    const reasons = validatePublicUavi(live({ previousLevel: null, change: null, changePercent: 0 }));
    expect(reasons).toContain("a change percent exists with no previous level to change from");
  });

  it("refuses a live model that publishes no coverage", () => {
    // Coverage is part of what the level means: twenty-seven constituents at 84% of parent weight
    // and twenty-seven at 30% are different measurements.
    const reasons = validatePublicUavi(live({ coverage: null }));
    expect(reasons).toContain("a live state publishes no coverage");
  });

  it("refuses any option-level field crossing the public boundary", () => {
    // The boundary where a licence breach would be invisible until somebody else noticed it.
    for (const field of ["quotes", "contracts", "strike", "bid", "ask", "forward", "k0", "termVariance", "components"]) {
      const reasons = validatePublicUavi(live({ [field]: "anything" }));
      expect(reasons.some((r) => r.includes(field)), field).toBe(true);
    }
  });

  it("refuses a response that is not UAVI", () => {
    expect(validatePublicUavi(live({ symbol: "UGAI" }))).toContain("the response is not UAVI");
  });
});

describe("the public UAVI series contract", () => {
  it("passes an empty series on an uninitialized index", () => {
    expect(validatePublicUaviSeries({ symbol: UAVI_SYMBOL, lifecycle: "not_initialized", points: [] })).toEqual([]);
  });

  it("refuses series points on an uninitialized index", () => {
    // The rule that stops a chart existing before the index does.
    const reasons = validatePublicUaviSeries({
      symbol: UAVI_SYMBOL,
      lifecycle: "not_initialized",
      points: [{ date: "2026-09-18", level: 30 }],
    });
    expect(reasons).toContain("an uninitialized index served series points");
  });

  it("passes real published points on a live index", () => {
    expect(
      validatePublicUaviSeries({
        symbol: UAVI_SYMBOL,
        lifecycle: "live",
        points: [
          { date: "2026-09-17", level: 28.9 },
          { date: "2026-09-18", level: 31.42 },
        ],
      }),
    ).toEqual([]);
  });

  it("refuses a point with no usable level or no calendar date", () => {
    expect(
      validatePublicUaviSeries({ symbol: UAVI_SYMBOL, lifecycle: "live", points: [{ date: "2026-09-18", level: 0 }] }),
    ).toContain("a series point carries no usable level");
    expect(
      validatePublicUaviSeries({ symbol: UAVI_SYMBOL, lifecycle: "live", points: [{ date: "September", level: 30 }] }),
    ).toContain("a series point carries no calendar date");
  });
});
