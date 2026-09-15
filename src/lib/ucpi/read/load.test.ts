import { describe, expect, it } from "vitest";

import { listedInstrumentsFrom, withListedComputeInstruments, LISTED_GPU_UNIT_CAPTION, type ListedChildState } from "@/lib/ucpi/read/load";
import { findMarket, DEFAULT_MARKET_SYMBOL } from "@/data/mock/market-detail";
import type { UcpiSeriesPoint } from "@/lib/ucpi/api-contract";

const ATTRIBUTION = "Data: Price of Compute — priceofcompute.com";

function point(over: Partial<UcpiSeriesPoint> = {}): UcpiSeriesPoint {
  return {
    instrument: "UCPI-H100-SXM-LISTED",
    regionScope: "listed_provider_wide",
    country: null,
    attributions: [ATTRIBUTION],
    calculationDate: "2026-09-15",
    status: "published",
    priceLevel: 3.628,
    currency: "USD",
    unit: "accelerator_hour",
    percentageChange1d: null,
    changeDisposition: "withheld",
    structuralCondition: null,
    marketBreadth: "normal",
    participantCount: 4,
    publishedAt: "2026-09-16T01:00:00.000Z",
    calculatedAt: "2026-09-16T01:00:00.000Z",
    ...over,
  } as UcpiSeriesPoint;
}

function child(over: Partial<ListedChildState> = {}): ListedChildState {
  const p = point();
  return { symbol: "UCPI-H100-SXM-LISTED", displayName: "UCPI H100 SXM Listed", gpuLabel: "H100 SXM", specVersion: "1.0.0", latest: p, points: [p], ...over };
}

describe("only released values become instruments", () => {
  it("builds an instrument from a published point, in listed units", () => {
    const [i] = listedInstrumentsFrom([child()]);
    expect(i).toMatchObject({ symbol: "UCPI-H100-SXM-LISTED", shortLabel: "H100 SXM", unit: LISTED_GPU_UNIT_CAPTION });
    expect(i!.snapshot.value).toBe(3.628);
    // The unit says listed. It must never read as an executable or clearing price.
    expect(i!.unit).toContain("listed");
    expect(i!.unit).not.toMatch(/market price|clearing/i);
  });

  it("omits a child that is Unavailable rather than inventing a zero", () => {
    const unavailable = child({
      symbol: "UCPI-H200-SXM-LISTED",
      latest: null,
      points: [point({ instrument: "UCPI-H200-SXM-LISTED", status: "unavailable", priceLevel: null, structuralCondition: "SINGLE_PARTICIPANT", participantCount: 1, publishedAt: null })],
    });
    expect(listedInstrumentsFrom([unavailable])).toEqual([]);
    // An instrument on this surface is a thing with a value; a zero here would be a price.
  });

  it("omits a child that has published nothing at all", () => {
    expect(listedInstrumentsFrom([child({ latest: null, points: [] })])).toEqual([]);
  });

  it("never renders an unreleased point, even where one is somehow present", () => {
    const blocked = point({ status: "unavailable", priceLevel: null, publishedAt: null });
    expect(listedInstrumentsFrom([child({ latest: null, points: [blocked] })])).toEqual([]);
  });
});

describe("first-point behaviour", () => {
  it("carries a null percentage change and never a fabricated zero", () => {
    const [i] = listedInstrumentsFrom([child()]);
    expect(i!.snapshot.changePercent).toBeNull();
    expect(i!.snapshot.changePercent).not.toBe(0);
  });

  it("offers no chart range on a single point, so no history is implied", () => {
    const [i] = listedInstrumentsFrom([child()]);
    expect(i!.series.daily).toHaveLength(1);
    expect(i!.availableRanges).toEqual([]);
  });

  it("passes a real one-day return through once a prior published point exists", () => {
    const yesterday = point({ calculationDate: "2026-09-15", priceLevel: 3.5, publishedAt: "2026-09-16T01:00:00.000Z" });
    const today = point({ calculationDate: "2026-09-16", priceLevel: 3.628, percentageChange1d: 3.657, changeDisposition: "published", publishedAt: "2026-09-17T01:00:00.000Z" });
    const [i] = listedInstrumentsFrom([child({ latest: today, points: [yesterday, today] })]);
    expect(i!.snapshot.changePercent).toBeCloseTo(3.657, 3);
    expect(i!.series.daily).toHaveLength(2);
    // A genuine zero stays a zero and is not confused with absence.
    const flat = point({ calculationDate: "2026-09-16", percentageChange1d: 0, changeDisposition: "published", publishedAt: "2026-09-17T01:00:00.000Z" });
    expect(listedInstrumentsFrom([child({ latest: flat, points: [yesterday, flat] })])[0]!.snapshot.changePercent).toBe(0);
  });
});

describe("hydrating the Compute family", () => {
  const market = findMarket(DEFAULT_MARKET_SYMBOL)!;

  it("leaves the market exactly as it was when production has released nothing", () => {
    // The rule that stops activation blanking a working page: no released values, no swap.
    expect(withListedComputeInstruments(market, [])).toBe(market);
  });

  it("replaces the Compute family's instruments and repoints the default once values exist", () => {
    const instruments = listedInstrumentsFrom([child()]);
    const hydrated = withListedComputeInstruments(market, instruments);
    const compute = hydrated.families.find((f) => f.id === "compute")!;
    expect(compute.instruments.map((i) => i.symbol)).toEqual(["UCPI-H100-SXM-LISTED"]);
    expect(compute.defaultInstrumentId).toBe("ucpi-h100-sxm-listed");
    expect(hydrated.defaultInstrumentId).toBe("ucpi-h100-sxm-listed");
    // Other families are untouched, so Tokens keeps whatever it was hydrated with.
    expect(hydrated.families.find((f) => f.id === "tokens")).toEqual(market.families.find((f) => f.id === "tokens"));
  });

  it("carries the source attribution on the released point", () => {
    expect(child().latest!.attributions).toContain(ATTRIBUTION);
  });
});
