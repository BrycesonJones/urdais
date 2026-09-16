import { describe, expect, it } from "vitest";

import { coverageGapsIn, utviInstrumentFrom } from "@/lib/utvi/read/instrument";
import { windowPoints } from "@/lib/market-ranges";
import { buildReadModel, type PublicationRow } from "@/lib/utvi/read/read-model";

const AS_OF = "2026-09-16T01:00:33.578Z";
const CITATION = `Source: OpenRouter (openrouter.ai/rankings), as of ${AS_OF}.`;
const UNIVERSE =
  "Token volume exposed by OpenRouter's rankings-daily dataset for the traffic included by that dataset. " +
  "Urdais makes no claim about inclusion of BYOK or hidden/private application traffic unless OpenRouter " +
  "explicitly documents it.";

function publication(date: string, value: string, overrides: Partial<PublicationRow> = {}): PublicationRow {
  return {
    calculationDate: date,
    valueTokensPerDay: value,
    settlementState: "final",
    revisionNumber: 1,
    methodologyVersion: "1.0.0",
    universeDescriptor: UNIVERSE,
    sourceAttribution: CITATION,
    publishedAt: "2026-09-16T02:00:00.000Z",
    sourceAsOf: AS_OF,
    ...overrides,
  };
}

describe("coverage gaps", () => {
  it("finds a missing date inside the span", () => {
    // The real pair: the source returns no rows for these two dates.
    expect(coverageGapsIn(["2025-06-14", "2025-06-16"])).toEqual(["2025-06-15"]);
  });

  it("reports both known gaps from a span that contains them", () => {
    const dates = ["2025-06-14", "2025-06-16", "2025-07-14", "2025-07-16"];
    expect(coverageGapsIn(dates)).toContain("2025-06-15");
    expect(coverageGapsIn(dates)).toContain("2025-07-15");
  });

  it("finds none in a contiguous span, and none in a span of one", () => {
    expect(coverageGapsIn(["2026-09-13", "2026-09-14", "2026-09-15"])).toEqual([]);
    expect(coverageGapsIn(["2026-09-15"])).toEqual([]);
  });
});

describe("available ranges", () => {
  /** A continuous daily series of published points ending on 2026-09-15. */
  const contiguous = (days: number) =>
    Array.from({ length: days }, (_, i) =>
      new Date(Date.parse("2026-09-15T00:00:00Z") - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    ).map((date, i) => publication(date, String(1_000 + i)));

  it("offers only the ranges the published history actually spans", () => {
    const view = utviInstrumentFrom(buildReadModel(contiguous(15)))!;
    expect(view.instrument.availableRanges).toEqual(["1D", "1W"]);
  });

  it("offers every range once the history spans a year", () => {
    const view = utviInstrumentFrom(
      buildReadModel([...contiguous(2), publication("2025-01-01", "10")]),
    )!;
    expect(view.instrument.availableRanges).toEqual(["1D", "1W", "1M", "3M", "6M", "1Y"]);
  });

  it("offers nothing when a single point cannot fill any window", () => {
    const view = utviInstrumentFrom(buildReadModel([publication("2026-09-15", "100")]))!;
    expect(view.instrument.availableRanges).toEqual([]);
  });

  it("offers no range the chart cannot then fill with more than one point", () => {
    // The defect this guards: availability was computed one way and the window another, so
    // 1D and 1W were offered and then drawn with a single point and no line.
    const view = utviInstrumentFrom(buildReadModel(contiguous(40)))!;
    for (const range of view.instrument.availableRanges) {
      const points = windowPoints(view.instrument.series, range, view.instrument.snapshot.asOf);
      expect(points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("draws 1D as two points and 1W as eight on a continuous series", () => {
    const view = utviInstrumentFrom(buildReadModel(contiguous(40)))!;
    const asOf = view.instrument.snapshot.asOf;
    expect(windowPoints(view.instrument.series, "1D", asOf)).toHaveLength(2);
    expect(windowPoints(view.instrument.series, "1W", asOf)).toHaveLength(8);
  });
});

describe("the instrument", () => {
  it("is null when nothing is published, so the section can say so rather than draw an empty chart", () => {
    expect(utviInstrumentFrom(buildReadModel([]))).toBeNull();
  });

  it("carries the symbol, name and unit, and never a base-100 level", () => {
    const view = utviInstrumentFrom(buildReadModel([publication("2026-09-15", "17750400225262")]))!;
    expect(view.instrument).toMatchObject({
      id: "utvi",
      symbol: "UTVI",
      name: "Observed Token Volume Index",
      unit: "tokens/day",
    });
    expect(view.instrument.snapshot.value).toBe(17_750_400_225_262);
  });

  it("synthesises no intraday tail, because the source serves completed days only", () => {
    const view = utviInstrumentFrom(buildReadModel([publication("2026-09-15", "100")]))!;
    expect(view.instrument.series.intraday).toEqual([]);
  });

  it("leaves a coverage gap absent from the series rather than inserting a zero", () => {
    const view = utviInstrumentFrom(
      buildReadModel([
        publication("2025-06-14", "1000"),
        publication("2025-06-16", "1200"),
      ]),
    )!;
    expect(view.instrument.series.daily).toHaveLength(2);
    expect(view.instrument.series.daily.some((p) => p.value === 0)).toBe(false);
    expect(view.coverageGaps).toEqual(["2025-06-15"]);
    // Nothing in the data names the missing day, so no tooltip can report one.
    const times = view.instrument.series.daily.map((p) => p.time);
    expect(times).not.toContain(Math.floor(Date.parse("2025-06-15T00:00:00Z") / 1000));
  });

  it("takes its period changes from the read model, not from the chart's window walk", () => {
    // The chart's own periodReturn compares the first and last points inside a window, which
    // across a gap answers a different question. These are calendar-anchored and null when the
    // anchor has no published point.
    const view = utviInstrumentFrom(
      buildReadModel([publication("2026-09-14", "16730791173422"), publication("2026-09-15", "18120484812487")]),
    )!;
    expect(view.changePercent["1D"]).toBeCloseTo(8.3062, 3);
    expect(view.changePercent["1W"]).toBeNull();
    expect(view.changePercent["1Y"]).toBeNull();
    expect(view.instrument.snapshot.changePercent).toBe(view.changePercent["1D"]);
  });

  it("exposes the settlement state so only the latest provisional value can be labelled", () => {
    const view = utviInstrumentFrom(
      buildReadModel([publication("2026-09-15", "100", { settlementState: "provisional" })]),
    )!;
    expect(view.settlementState).toBe("provisional");
  });

  it("carries the frozen universe and the required citation to the surface", () => {
    const view = utviInstrumentFrom(buildReadModel([publication("2026-09-15", "100")]))!;
    expect(view.universe).toBe(UNIVERSE);
    expect(view.universe).toContain("makes no claim about inclusion of BYOK");
    expect(view.attribution.citation).toBe(CITATION);
    expect(view.attribution.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(view.methodologyVersion).toBe("1.0.0");
  });

  it("never describes itself as global or total consumption", () => {
    const view = utviInstrumentFrom(buildReadModel([publication("2026-09-15", "100")]))!;
    const words = `${view.instrument.name} ${view.universe}`.toLowerCase();
    for (const forbidden of ["global token", "total ai", "worldwide", "total market"]) {
      expect(words).not.toContain(forbidden);
    }
  });
});
