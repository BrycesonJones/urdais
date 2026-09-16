/**
 * The historical-horizon contract, stated once for every surface that shows a range.
 *
 * A horizon is real when the series holds an observation at or before the window start and
 * that observation is within reach of it. Nothing is synthesised, nothing is padded, and the
 * oldest point is never pressed into service as a base merely because it exists.
 *
 * These are deliberately not anchored to today. Every case fixes its own UTC instant, so the
 * suite means the same thing in six months as it does the day it was written.
 */

import { describe, expect, it } from "vitest";

import {
  availableRanges,
  isRangeAvailable,
  lowFrequencyAvailableRanges,
  lowFrequencyPeriodPerformance,
  lowFrequencyPeriodReturn,
  periodPerformance,
  periodReturn,
  rangeStart,
  windowPoints,
} from "@/lib/market-ranges";
import { listedInstrumentsFrom, type ListedChildState } from "@/lib/ucpi/read/load";
import { benchmarkInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import { withListedComputeInstruments } from "@/lib/ucpi/read/load";
import { findMarket, DEFAULT_MARKET_SYMBOL } from "@/data/mock/market-detail";
import { DETAIL_RANGES } from "@/types/market";
import type { DetailRange, DetailedSeries, TimeSeriesPoint } from "@/types/market";
import type { UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import type { PublicTokenBenchmarkSeries } from "@/lib/tokens/read/api-contract";

const DAY = 86_400;
/** A fixed, arbitrary UTC instant. Nothing here depends on when the suite runs. */
const ASOF = Date.parse("2026-09-16T01:01:18Z") / 1000;

/** A daily series ending at `asOf`, one point per listed day-offset. */
function dailySeries(dayOffsets: readonly number[], asOf = ASOF): DetailedSeries {
  const daily = [...dayOffsets]
    .sort((a, b) => b - a)
    .map((back) => ({ time: asOf - back * DAY, value: 100 - back }));
  return { daily, intraday: [] };
}

/** `n` consecutive daily points ending at `asOf`. */
function consecutive(n: number, asOf = ASOF): DetailedSeries {
  return dailySeries(Array.from({ length: n }, (_, i) => i), asOf);
}

function ranges(series: DetailedSeries, asOf = ASOF): DetailRange[] {
  return availableRanges(series, asOf);
}

const UCPI_ATTRIBUTION = "Data: Price of Compute — priceofcompute.com";

/** A complete released UCPI series point; overrides carry the parts a case cares about. */
function ucpiPoint(over: Partial<UcpiSeriesPoint> = {}): UcpiSeriesPoint {
  return {
    instrument: "UCPI-H100-SXM-LISTED",
    displayName: "UCPI H100 SXM Listed",
    gpu: { vendor: "NVIDIA", model: "H100", formFactor: "SXM", memoryGb: 80, label: "H100 SXM" },
    observationType: "listed",
    procurementMode: "on_demand",
    regionScope: "listed_provider_wide",
    country: null,
    attributions: [UCPI_ATTRIBUTION],
    calculationDate: "2026-09-15",
    status: "published",
    priceLevel: 3.628,
    currency: "USD",
    unit: "accelerator_hour",
    percentageChange1d: null,
    changeDisposition: "withheld",
    marketBreadth: "normal",
    structuralCondition: null,
    participantCount: 4,
    contributingSourceCount: 1,
    largestSourceParticipantShare: 1,
    dispersion: null,
    reasonCodes: [],
    freshness: {
      windowStart: "2026-09-15T00:00:00.000Z",
      cutoff: "2026-09-16T00:00:00.000Z",
      allInputsWithinWindow: true,
    },
    methodologyVersion: "1.0.0",
    instrumentSpecVersion: "1.0.0",
    calculatedAt: "2026-09-16T01:01:18.507Z",
    publishedAt: "2026-09-16T01:01:18.628Z",
    ...over,
  };
}

/** Every horizon whose return is a number rather than null. */
function returned(series: DetailedSeries, asOf = ASOF): DetailRange[] {
  return periodPerformance(series, asOf)
    .filter((row) => row.returnPercent !== null)
    .map((row) => row.range);
}

describe("1. a single observation supports no horizon", () => {
  const series = consecutive(1);

  it("offers no range", () => {
    expect(ranges(series)).toEqual([]);
  });

  it("returns null for every horizon, never a fabricated zero", () => {
    for (const range of DETAIL_RANGES) {
      expect(periodReturn(series, range, ASOF)).toBeNull();
      expect(periodReturn(series, range, ASOF)).not.toBe(0);
    }
  });

  it("gives the UI an unavailable cell for every horizon", () => {
    // `PeriodPerformance` renders "—" and disables the button exactly when this is null.
    expect(periodPerformance(series, ASOF).every((row) => row.returnPercent === null)).toBe(true);
  });
});

describe("2. two and three days support 1D and nothing longer", () => {
  it("offers 1D only", () => {
    expect(ranges(consecutive(2))).toEqual(["1D"]);
    expect(ranges(consecutive(3))).toEqual(["1D"]);
  });

  it("withholds every longer horizon", () => {
    for (const range of ["1W", "1M", "3M", "6M", "1Y"] as const) {
      expect(isRangeAvailable(consecutive(3), range, ASOF)).toBe(false);
      expect(periodReturn(consecutive(3), range, ASOF)).toBeNull();
    }
  });
});

describe("3. eight days support 1W but not 1M", () => {
  const series = consecutive(8);

  it("offers 1D and 1W", () => {
    expect(ranges(series)).toEqual(["1D", "1W"]);
  });

  it("refuses 1M, which the old UCPI span rule granted at seven days", () => {
    expect(isRangeAvailable(series, "1M", ASOF)).toBe(false);
    expect(periodReturn(series, "1M", ASOF)).toBeNull();
  });
});

describe("4. twenty days do not support 1M", () => {
  it("offers nothing beyond 1W", () => {
    expect(ranges(consecutive(20))).toEqual(["1D", "1W"]);
    expect(periodReturn(consecutive(20), "1M", ASOF)).toBeNull();
  });
});

describe("5. forty days support 1M but not 3M", () => {
  const series = consecutive(40);

  it("offers 1M", () => {
    expect(ranges(series)).toEqual(["1D", "1W", "1M"]);
    expect(periodReturn(series, "1M", ASOF)).not.toBeNull();
  });

  it("refuses 3M", () => {
    expect(periodReturn(series, "3M", ASOF)).toBeNull();
  });
});

describe("6. calendar boundaries for 3M, 6M and 1Y", () => {
  it("shifts by calendar months, not by 30- or 90-day approximations", () => {
    const aug15 = Date.parse("2026-08-15T00:00:00Z") / 1000;
    // Three calendar months is 15 May; ninety days would be 17 May.
    expect(new Date(rangeStart("3M", aug15) * 1000).toISOString()).toBe("2026-05-15T00:00:00.000Z");
    // Six calendar months is 15 February; 180 days would be 16 February.
    expect(new Date(rangeStart("6M", aug15) * 1000).toISOString()).toBe("2026-02-15T00:00:00.000Z");
    // One calendar year keeps the day of month exactly.
    expect(new Date(rangeStart("1Y", aug15) * 1000).toISOString()).toBe("2025-08-15T00:00:00.000Z");
  });

  it("carries a month-end date forward where the target month is shorter", () => {
    // 31 May less three months is "31 February", which does not exist. The shift resolves
    // it forward into March rather than clamping back to the 28th, so the window is never
    // silently lengthened. Same convention at every month end.
    const may31 = Date.parse("2026-05-31T00:00:00Z") / 1000;
    expect(new Date(rangeStart("3M", may31) * 1000).toISOString()).toBe("2026-03-03T00:00:00.000Z");
  });

  it("turns a horizon on the day history reaches its calendar boundary, and not before", () => {
    // 1Y from 2026-09-16 is 2025-09-16. A point on 2025-09-17 is one day short.
    const short = dailySeries([0, 1, 364]);
    const exact = dailySeries([0, 1, 365]);
    expect(isRangeAvailable(short, "1Y", ASOF)).toBe(false);
    expect(isRangeAvailable(exact, "1Y", ASOF)).toBe(true);
  });

  it("handles a leap day without drifting", () => {
    const leap = Date.parse("2028-02-29T00:00:00Z") / 1000;
    // No 2027-02-29 exists; the shift lands on the first of March rather than inventing one.
    expect(new Date(rangeStart("1Y", leap) * 1000).toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });

  it("handles a month-end shift from the 31st", () => {
    const mar31 = Date.parse("2026-03-31T00:00:00Z") / 1000;
    // February has no 31st, so the shift resolves forward into March rather than clamping.
    expect(new Date(rangeStart("1M", mar31) * 1000).toISOString()).toBe("2026-03-03T00:00:00.000Z");
  });
});

describe("7. irregular observations", () => {
  it("uses the last real observation before the target when none sits on it", () => {
    // Points at 9 and 2 days back: the 1W base is the 9-day point, the closest at-or-before.
    const series = dailySeries([0, 2, 9]);
    expect(isRangeAvailable(series, "1W", ASOF)).toBe(true);
    const window = windowPoints(series, "1W", ASOF);
    expect(window[0]!.time).toBe(ASOF - 9 * DAY);
    const expected = ((window[window.length - 1]!.value - window[0]!.value) / window[0]!.value) * 100;
    expect(periodReturn(series, "1W", ASOF)).toBeCloseTo(expected, 10);
  });

  it("refuses the range when every observation is newer than the target", () => {
    const series = dailySeries([0, 1, 2]);
    expect(isRangeAvailable(series, "1W", ASOF)).toBe(false);
    expect(periodReturn(series, "1W", ASOF)).toBeNull();
  });

  it("refuses a horizon whose only candidate base is far older than the window", () => {
    // The defect this guards: two points 400 days apart used to make every horizon
    // available, each reporting the same figure, so "1 day" measured 400 days.
    const gapped = dailySeries([0, 400]);
    expect(ranges(gapped)).toEqual(["1Y"]);
    expect(periodReturn(gapped, "1D", ASOF)).toBeNull();
    expect(periodReturn(gapped, "6M", ASOF)).toBeNull();
    // The one horizon it can honestly measure is the one whose window the point sits near.
    expect(periodReturn(gapped, "1Y", ASOF)).not.toBeNull();
  });

  it("does not let a single-day coverage gap disqualify a horizon", () => {
    // A daily series missing one interior day is still a daily series.
    const withGap = dailySeries([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(ranges(withGap)).toEqual(["1D", "1W"]);
  });
});

describe("8. production token benchmarks expose only what they can measure", () => {
  function benchmark(history: readonly { time: string; priceUsdPer1m: number }[]): PublicTokenBenchmarkSeries {
    const latest = history[history.length - 1]!;
    return {
      seriesId: "urdais-token-price-anthropic",
      providerSlug: "anthropic",
      providerName: "Anthropic",
      benchmarkName: "Urdais Token Price",
      benchmarkModelId: "claude-sonnet-5",
      benchmarkModelName: "Claude Sonnet 5",
      methodologyVersion: "1.2.0",
      priceUsdPer1m: latest.priceUsdPer1m,
      currency: "USD",
      unit: "USD / 1M tokens",
      updatedAt: latest.time,
      percentageChange: null,
      history: [...history],
    };
  }

  it("offers no horizon on the single frozen point production holds today", () => {
    const [instrument] = benchmarkInstrumentsFromSeries([
      benchmark([{ time: "2026-09-14T12:03:02.000Z", priceUsdPer1m: 6 }]),
    ]);
    expect(instrument!.availableRanges).toEqual([]);
    expect(periodPerformance(instrument!.series, instrument!.snapshot.asOf).every((r) => r.returnPercent === null)).toBe(true);
  });

  it("offers 1W but not 1M on eight days of benchmark history", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      time: new Date((ASOF - (7 - i) * DAY) * 1000).toISOString(),
      priceUsdPer1m: 6 + i * 0.1,
    }));
    const [instrument] = benchmarkInstrumentsFromSeries([benchmark(history)]);
    expect(instrument!.availableRanges).toEqual(["1D", "1W"]);
    expect(returned(instrument!.series, instrument!.snapshot.asOf)).toEqual(["1D", "1W"]);
  });

  it("does not light up every horizon when collection resumes after a long pause", () => {
    // The shape an ingestion gap produces: one old point, then fresh ones. Guards the
    // token surface specifically, whose collection stopped on 2026-09-14.
    const history = [
      { time: new Date((ASOF - 400 * DAY) * 1000).toISOString(), priceUsdPer1m: 3 },
      { time: new Date((ASOF - DAY) * 1000).toISOString(), priceUsdPer1m: 6 },
      { time: new Date(ASOF * 1000).toISOString(), priceUsdPer1m: 6.1 },
    ];
    const [instrument] = benchmarkInstrumentsFromSeries([benchmark(history)]);
    expect(instrument!.availableRanges).not.toContain("1W");
    expect(instrument!.availableRanges).not.toContain("1M");
    expect(instrument!.availableRanges).not.toContain("6M");
    expect(instrument!.availableRanges).toContain("1D");
  });
});

describe("9. production UCPI exposes only what it can measure", () => {
  /** `n` consecutive released daily points, the newest published at `ASOF`. */
  function child(n: number): ListedChildState {
    const points = Array.from({ length: n }, (_, i) =>
      ucpiPoint({
        calculationDate: `d${i}`,
        priceLevel: 3.5 + i * 0.01,
        publishedAt: new Date((ASOF - (n - 1 - i) * DAY) * 1000).toISOString(),
      }),
    );
    return {
      symbol: "UCPI-H100-SXM-LISTED",
      displayName: "UCPI H100 SXM Listed",
      gpuLabel: "H100 SXM",
      specVersion: "1.0.0",
      latest: points[points.length - 1]!,
      points,
    };
  }

  it("offers nothing on the one released point production holds today", () => {
    expect(listedInstrumentsFrom([child(1)])[0]!.availableRanges).toEqual([]);
  });

  it("offers 1D on two released days", () => {
    expect(listedInstrumentsFrom([child(2)])[0]!.availableRanges).toEqual(["1D"]);
  });

  it("does NOT offer 1M merely because seven days exist", () => {
    // The precise defect in the replaced UCPI rule: at a seven-day span it returned
    // ["1W", "1M"], claiming a month of history that did not exist.
    const instrument = listedInstrumentsFrom([child(8)])[0]!;
    expect(instrument.availableRanges).toEqual(["1D", "1W"]);
    expect(instrument.availableRanges).not.toContain("1M");
    expect(periodReturn(instrument.series, "1M", instrument.snapshot.asOf)).toBeNull();
  });

  it("earns 1M at a month and 3M only at three, which the old rule never offered at all", () => {
    expect(listedInstrumentsFrom([child(40)])[0]!.availableRanges).toEqual(["1D", "1W", "1M"]);
    expect(listedInstrumentsFrom([child(100)])[0]!.availableRanges).toEqual(["1D", "1W", "1M", "3M"]);
  });

  it("agrees with the shared rule exactly, having no rule of its own", () => {
    for (const n of [1, 2, 8, 20, 40, 100, 200]) {
      const instrument = listedInstrumentsFrom([child(n)])[0]!;
      expect(instrument.availableRanges).toEqual(availableRanges(instrument.series, instrument.snapshot.asOf));
    }
  });
});

describe("10. production instruments do not inherit fixture horizons", () => {
  const latest = ucpiPoint();
  const single: ListedChildState = {
    symbol: "UCPI-H100-SXM-LISTED",
    displayName: "UCPI H100 SXM Listed",
    gpuLabel: "H100 SXM",
    specVersion: "1.0.0",
    latest,
    points: [latest],
  };

  it("the mock Compute family does offer long horizons, from its own long fixture history", () => {
    const mock = findMarket(DEFAULT_MARKET_SYMBOL)!.families.find((f) => f.id === "compute")!;
    expect(mock.instruments[0]!.availableRanges).toContain("1Y");
  });

  it("but hydrating replaces them, so the live instrument keeps none of it", () => {
    const hydrated = withListedComputeInstruments(
      findMarket(DEFAULT_MARKET_SYMBOL)!,
      listedInstrumentsFrom([single]),
    );
    const compute = hydrated.families.find((f) => f.id === "compute")!;
    expect(compute.instruments).toHaveLength(1);
    expect(compute.instruments[0]!.availableRanges).toEqual([]);
    for (const instrument of compute.instruments) {
      expect(instrument.availableRanges).not.toContain("1Y");
      expect(periodPerformance(instrument.series, instrument.snapshot.asOf).every((r) => r.returnPercent === null)).toBe(true);
    }
  });
});

describe("11. nothing is synthesised to satisfy a horizon", () => {
  it("never returns more points than the series holds", () => {
    for (const n of [1, 2, 8, 40, 100]) {
      const series = consecutive(n);
      for (const range of DETAIL_RANGES) {
        expect(windowPoints(series, range, ASOF).length).toBeLessThanOrEqual(n);
      }
    }
  });

  it("leaves the caller's series untouched", () => {
    const series = consecutive(10);
    const before = JSON.stringify(series);
    availableRanges(series, ASOF);
    periodPerformance(series, ASOF);
    for (const range of DETAIL_RANGES) windowPoints(series, range, ASOF);
    expect(JSON.stringify(series)).toBe(before);
    expect(series.intraday).toHaveLength(0);
  });

  it("every returned point is one the series actually contains", () => {
    const series = consecutive(40);
    const real = new Set(series.daily.map((p) => `${p.time}:${p.value}`));
    for (const range of DETAIL_RANGES) {
      for (const point of windowPoints(series, range, ASOF)) {
        expect(real.has(`${point.time}:${point.value}`)).toBe(true);
      }
    }
  });
});

describe("the low-frequency convention agrees with the continuously quoted one", () => {
  it("produces identical availability for daily series of every shape", () => {
    const shapes: number[][] = [
      [0],
      [0, 1],
      [0, 1, 2],
      Array.from({ length: 8 }, (_, i) => i),
      Array.from({ length: 20 }, (_, i) => i),
      Array.from({ length: 40 }, (_, i) => i),
      Array.from({ length: 200 }, (_, i) => i),
      [0, 400],
      [0, 2, 9],
    ];
    for (const shape of shapes) {
      const series = dailySeries(shape);
      expect(lowFrequencyAvailableRanges(series.daily, ASOF)).toEqual(availableRanges(series, ASOF));
    }
  });

  it("produces identical returns, so no surface reads a different number", () => {
    const series = dailySeries(Array.from({ length: 200 }, (_, i) => i));
    for (const range of DETAIL_RANGES) {
      expect(lowFrequencyPeriodReturn(series.daily, range, ASOF)).toEqual(periodReturn(series, range, ASOF));
    }
    expect(lowFrequencyPeriodPerformance(series.daily, ASOF)).toEqual(periodPerformance(series, ASOF));
  });
});

describe("the return is measured from the window's real base", () => {
  it("computes (latest - base) / base * 100 against the observation at the window start", () => {
    const points: TimeSeriesPoint[] = [
      { time: ASOF - 7 * DAY, value: 200 },
      { time: ASOF - 3 * DAY, value: 250 },
      { time: ASOF, value: 220 },
    ];
    const series: DetailedSeries = { daily: points, intraday: [] };
    // Base is the 7-day point at 200, not the 3-day point and not the minimum.
    expect(periodReturn(series, "1W", ASOF)).toBeCloseTo(((220 - 200) / 200) * 100, 10);
  });

  it("returns null rather than dividing by a zero base", () => {
    const series: DetailedSeries = {
      daily: [
        { time: ASOF - 7 * DAY, value: 0 },
        { time: ASOF, value: 5 },
      ],
      intraday: [],
    };
    expect(periodReturn(series, "1W", ASOF)).toBeNull();
  });
});
