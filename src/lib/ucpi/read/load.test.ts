import { describe, expect, it } from "vitest";

import { listedInstrumentsFrom, ucpiHeadlineFrom, withListedComputeInstruments, LISTED_GPU_UNIT_CAPTION, type ListedChildState } from "@/lib/ucpi/read/load";
import { findMarket, DEFAULT_MARKET_SYMBOL } from "@/data/mock/market-detail";
import { instrumentDisplaySymbol } from "@/lib/market-display";
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

describe("the homepage headline is the production series, not the fixture", () => {
  // Deliberately not the fixture's values. The fixture is frozen at 2.41 on
  // 2026-09-04T16:00Z; every assertion below would still pass if the panel were
  // rendering that, were it not for these being different numbers on a later day.
  const FIXTURE_VALUE = 2.41;
  const FIXTURE_AS_OF = Date.UTC(2026, 8, 4, 16, 0, 0) / 1000;

  it("takes value, timestamp and unit from the released point", () => {
    const headline = ucpiHeadlineFrom(listedInstrumentsFrom([child()]))!;
    expect(headline.snapshot.value).toBe(3.628);
    expect(headline.snapshot.value).not.toBe(FIXTURE_VALUE);
    // The published instant, not the calculation date and not the fixture's.
    expect(headline.snapshot.asOf).toBe(Math.floor(Date.parse("2026-09-16T01:00:00.000Z") / 1000));
    expect(headline.snapshot.asOf).toBeGreaterThan(FIXTURE_AS_OF);
    expect(headline.index.unit).toBe(LISTED_GPU_UNIT_CAPTION);
  });

  it("keeps the index's own identity, so the panel still links to the UCPI page", () => {
    const headline = ucpiHeadlineFrom(listedInstrumentsFrom([child()]))!;
    expect(headline.index.symbol).toBe("UCPI");
    expect(headline.index.name).toBe("Urdais Compute Price Index");
  });

  it("follows the freshest released point when a later one arrives", () => {
    const older = point({ calculationDate: "2026-09-15", priceLevel: 3.5, publishedAt: "2026-09-16T01:00:00.000Z" });
    const newer = point({ calculationDate: "2026-09-16", priceLevel: 3.91, publishedAt: "2026-09-17T01:00:00.000Z" });
    const headline = ucpiHeadlineFrom(listedInstrumentsFrom([child({ latest: newer, points: [older, newer] })]))!;
    expect(headline.snapshot.value).toBe(3.91);
    expect(headline.snapshot.asOf).toBe(Math.floor(Date.parse("2026-09-17T01:00:00.000Z") / 1000));
    // Both released points are in the series; the fresher one is last.
    expect(headline.series.ALL.map((p) => p.value)).toEqual([3.5, 3.91]);
  });

  it("is the same instrument the market page makes its default, so the surfaces agree", () => {
    const instruments = listedInstrumentsFrom([child()]);
    const hydrated = withListedComputeInstruments(findMarket(DEFAULT_MARKET_SYMBOL)!, instruments);
    const headline = ucpiHeadlineFrom(instruments)!;
    const shown = hydrated.families
      .find((f) => f.id === "compute")!
      .instruments.find((i) => i.id === hydrated.defaultInstrumentId)!;
    expect(headline.snapshot).toEqual(shown.snapshot);
    expect(headline.index.unit).toBe(shown.unit);
  });

  it("windows each range against the released history and synthesises nothing", () => {
    const day = 24 * 60 * 60;
    const latest = Date.parse("2026-09-16T01:00:00.000Z") / 1000;
    const points = [200, 40, 3, 0].map((back, n) =>
      point({
        calculationDate: `2026-09-${String(10 + n).padStart(2, "0")}`,
        priceLevel: 3 + n,
        publishedAt: new Date((latest - back * day) * 1000).toISOString(),
      }),
    );
    const headline = ucpiHeadlineFrom(
      listedInstrumentsFrom([child({ latest: points[3]!, points })]),
    )!;
    expect(headline.series.ALL).toHaveLength(4);
    expect(headline.series["1Y"]).toHaveLength(4);
    expect(headline.series["3M"]).toHaveLength(3);
    expect(headline.series["1M"]).toHaveLength(2);
    expect(headline.series["1D"]).toHaveLength(1);
    // No range is padded out to a length it has not earned.
    for (const range of Object.values(headline.series)) {
      expect(range.length).toBeLessThanOrEqual(4);
    }
  });

  it("is null when production has released nothing, so no caller can mistake it for a value", () => {
    expect(ucpiHeadlineFrom([])).toBeNull();
    expect(ucpiHeadlineFrom(listedInstrumentsFrom([child({ latest: null, points: [] })]))).toBeNull();
  });
});

describe("production instruments declare their provenance", () => {
  it("marks released listed children as production, so the surface cannot label them demo", () => {
    expect(listedInstrumentsFrom([child()])[0]!.provenance).toBe("production");
  });

  it("marks the mock markets demo outright, rather than leaving the label to inference", () => {
    // This used to assert `undefined` and rely on the surface inferring demo from the
    // absence of a token identity. The declaration is now explicit, which is what the
    // field is for, and it is what the watchlist rows read to decide whether to quote a
    // level at all.
    const compute = findMarket(DEFAULT_MARKET_SYMBOL)!.families.find((f) => f.id === "compute")!;
    expect(compute.instruments.length).toBeGreaterThan(0);
    for (const instrument of compute.instruments) expect(instrument.provenance).toBe("demo");
  });
});

describe("the headline reads as an index benchmark, not a doubled ticker", () => {
  it("names the child by its GPU label so the page does not read UCPI-UCPI-...", () => {
    const instruments = listedInstrumentsFrom([child()]);
    expect(instruments[0]!.benchmarkCode).toBe("H100 SXM");
    // As the page renders it: the hydrated market, where this child is the headline.
    const hydrated = withListedComputeInstruments(findMarket(DEFAULT_MARKET_SYMBOL)!, instruments);
    const shown = instrumentDisplaySymbol(hydrated, instruments[0]!);
    expect(shown).toBe("UCPI-H100 SXM");
    expect(shown).not.toContain("UCPI-UCPI");
  });
});
