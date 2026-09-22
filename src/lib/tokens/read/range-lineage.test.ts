/**
 * Percentage change across a constituent boundary.
 *
 * On 22 September 2026 xAI's designated model moved from Grok 4.6 to Grok 4.7,
 * and both are published at $2 input / $6 output. The benchmark is therefore
 * $4.00 on both sides. The canonical read model withheld its `percentageChange`
 * correctly, because the two points are not the same economic object -- but the
 * range buttons under the chart computed their own change from generic
 * `{time, value}` points and rendered "1 WEEK 0.00%".
 *
 * Zero is the worst possible wrong answer here. It is not a missing number a
 * reader would question; it is a confident claim that xAI's price did not move,
 * made by comparing two different models. docs/methodology/token-price.md:
 * percentage change "is withheld across it rather than computed between two
 * different economic objects", and "is never shown as zero to fill the space".
 */

import { describe, expect, it } from "vitest";

import { periodPerformance, periodReturn } from "@/lib/market-ranges";
import { benchmarkLineageKey, benchmarkPointKey } from "@/lib/tokens/read/benchmark";
import { benchmarkLineageFromPersisted } from "@/lib/tokens/read/benchmark-store";
import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { benchmarkInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import type { PublicTokenBenchmarkSeries } from "@/lib/tokens/read/api-contract";
import type { DetailedSeries, TimeSeriesPoint } from "@/types/market";

const SEP_14 = "2026-09-14T12:03:02.002Z";
const SEP_22 = "2026-09-22T20:26:30.000Z";
const AS_OF = Math.floor(Date.parse(SEP_22) / 1000);

/** Production's two xAI rows, exactly as `pipeline.token_price_benchmarks` holds them. */
function xaiFrozenRows(): PersistedBenchmarkRow[] {
  const row = (model: string, version: string, at: string, n: number): PersistedBenchmarkRow => ({
    id: `xai-${n}`,
    providerSlug: "xai",
    methodologyVersion: version,
    benchmarkModelId: model,
    benchmarkModelName: model === "grok-4.6" ? "Grok 4.6" : "Grok 4.7",
    calculationStatus: "value",
    withheldReason: null,
    priceUsdPer1m: 4,
    inputObservationId: `in-${n}`,
    outputObservationId: `out-${n}`,
    inputPriceUsdPer1m: 2,
    outputPriceUsdPer1m: 6,
    inputObservedAt: at,
    outputObservedAt: at,
    calculatedAt: at,
  });
  return [row("grok-4.6", "1.1", SEP_14, 1), row("grok-4.7", "1.3", SEP_22, 2)];
}

function xaiSeries(): PublicTokenBenchmarkSeries {
  return {
    seriesId: "token-price:xai",
    providerSlug: "xai",
    providerName: "xAI",
    benchmarkName: "Urdais Token Price",
    benchmarkModelId: "grok-4.7",
    benchmarkModelName: "Grok 4.7",
    methodologyVersion: "1.3",
    priceUsdPer1m: 4,
    currency: "USD",
    unit: "USD / 1M tokens",
    updatedAt: SEP_22,
    percentageChange: null,
    history: [
      { time: SEP_14, priceUsdPer1m: 4 },
      { time: SEP_22, priceUsdPer1m: 4 },
    ],
  };
}

/** One provider with a single point, which is what an unchanged provider looks like. */
function singlePointSeries(providerSlug: string, price: number): PublicTokenBenchmarkSeries {
  return {
    ...xaiSeries(),
    seriesId: `token-price:${providerSlug}`,
    providerSlug,
    providerName: providerSlug,
    priceUsdPer1m: price,
    updatedAt: SEP_14,
    history: [{ time: SEP_14, priceUsdPer1m: price }],
  };
}

function daily(points: TimeSeriesPoint[]): DetailedSeries {
  return { daily: points, intraday: [] };
}

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("1. the September 2026 xAI transition withholds its window change", () => {
  it("returns no 1 WEEK percentage for the Grok 4.6 to Grok 4.7 boundary", () => {
    const lineage = benchmarkLineageFromPersisted(xaiFrozenRows());
    const [instrument] = benchmarkInstrumentsFromSeries([xaiSeries()], lineage);

    // The window genuinely spans both points, so this is not availability doing the work.
    expect(instrument!.series.daily).toHaveLength(2);
    expect(instrument!.series.daily.map((p) => p.lineage)).toEqual([
      benchmarkLineageKey("grok-4.6", "1.1"),
      benchmarkLineageKey("grok-4.7", "1.3"),
    ]);

    expect(periodReturn(instrument!.series, "1W", AS_OF)).toBeNull();
    // And emphatically not the confident zero that prompted this.
    expect(periodReturn(instrument!.series, "1W", AS_OF)).not.toBe(0);
  });

  it("renders the existing em dash for that withheld range", () => {
    // The component already prints "—" for a null return; nothing in the UI changes.
    const lineage = benchmarkLineageFromPersisted(xaiFrozenRows());
    const [instrument] = benchmarkInstrumentsFromSeries([xaiSeries()], lineage);
    const week = periodPerformance(instrument!.series, AS_OF).find((row) => row.range === "1W")!;
    expect(week.returnPercent).toBeNull();
    const rendered = week.returnPercent === null ? "—" : `${week.returnPercent}%`;
    expect(rendered).toBe("—");
  });

  it("keeps the value itself, which never was in doubt", () => {
    const lineage = benchmarkLineageFromPersisted(xaiFrozenRows());
    const [instrument] = benchmarkInstrumentsFromSeries([xaiSeries()], lineage);
    expect(instrument!.snapshot.value).toBe(4);
    expect(instrument!.name).toContain("Grok 4.7");
    expect(instrument!.series.daily.map((p) => p.value)).toEqual([4, 4]);
  });
});

describe("2. a same-lineage window still calculates", () => {
  it("computes the real percentage between two points of one designated model", () => {
    const key = benchmarkLineageKey("claude-fable-5-1", "1.2");
    const series = daily([
      { time: unix(SEP_14), value: 30, lineage: key },
      { time: unix(SEP_22), value: 33, lineage: key },
    ]);
    expect(periodReturn(series, "1W", AS_OF)).toBeCloseTo(10, 10);
  });
});

describe("3. equal values inside one lineage are a real zero", () => {
  it("reports 0% when one model's price genuinely did not move", () => {
    // This is the case the fix must not break: a provider re-verified at the same
    // price under the same designation really has moved zero percent.
    const key = benchmarkLineageKey("gpt-6-astra", "1.2");
    const series = daily([
      { time: unix(SEP_14), value: 30, lineage: key },
      { time: unix(SEP_22), value: 30, lineage: key },
    ]);
    expect(periodReturn(series, "1W", AS_OF)).toBe(0);
  });
});

describe("4. equal values across lineages are not a zero", () => {
  it("withholds rather than reporting 0% for two different models at one price", () => {
    const series = daily([
      { time: unix(SEP_14), value: 4, lineage: benchmarkLineageKey("grok-4.6", "1.1") },
      { time: unix(SEP_22), value: 4, lineage: benchmarkLineageKey("grok-4.7", "1.3") },
    ]);
    expect(periodReturn(series, "1W", AS_OF)).toBeNull();
  });

  it("withholds on a methodology-version change alone, not only a model change", () => {
    // Both halves of the comparability rule, not just the visible one: two values
    // from one model under different versions were produced by different arithmetic.
    const series = daily([
      { time: unix(SEP_14), value: 4, lineage: benchmarkLineageKey("grok-4.7", "1.2") },
      { time: unix(SEP_22), value: 4, lineage: benchmarkLineageKey("grok-4.7", "1.3") },
    ]);
    expect(periodReturn(series, "1W", AS_OF)).toBeNull();
  });

  it("does not decide lineage from the value, the date or the provider", () => {
    // Same provider, same value, same dates as the withheld case above -- and it
    // calculates, because the designation did not move. Nothing but the stated
    // lineage may drive the decision.
    const key = benchmarkLineageKey("grok-4.7", "1.3");
    const series = daily([
      { time: unix(SEP_14), value: 4, lineage: key },
      { time: unix(SEP_22), value: 4, lineage: key },
    ]);
    expect(periodReturn(series, "1W", AS_OF)).toBe(0);
  });
});

describe("5. providers with one point are untouched", () => {
  it("leaves every unchanged provider's range states exactly as they were", () => {
    const providers = ["anthropic", "openai", "google", "alibaba", "moonshot"];
    const lineage = new Map(
      providers.map((slug) => [benchmarkPointKey(`token-price:${slug}`, SEP_14), benchmarkLineageKey(`${slug}-model`, "1.2")]),
    );
    const instruments = benchmarkInstrumentsFromSeries(
      providers.map((slug) => singlePointSeries(slug, 30)),
      lineage,
    );
    expect(instruments).toHaveLength(5);
    for (const instrument of instruments) {
      expect(instrument.series.daily).toHaveLength(1);
      // One point supports no window, exactly as before: every range withheld.
      for (const row of periodPerformance(instrument.series, AS_OF)) {
        expect(row.returnPercent).toBeNull();
      }
      expect(instrument.availableRanges).toEqual([]);
    }
  });
});

describe("6. series that state no lineage are unaffected", () => {
  it("calculates exactly as before when no point carries a lineage", () => {
    // UBWI, UCPI and UTVI all go through these helpers and set nothing. Undefined
    // on both sides must stay comparable, or this change would silently blank
    // every other product's range returns.
    const series = daily([
      { time: unix(SEP_14), value: 100 },
      { time: unix(SEP_22), value: 110 },
    ]);
    expect(periodReturn(series, "1W", AS_OF)).toBeCloseTo(10, 10);
  });

  it("stays comparable when only one side states a lineage", () => {
    // A half-populated series is a mapper that has not been taught lineage yet,
    // not a stated disagreement. Withholding there would be a guess.
    const withBase = daily([
      { time: unix(SEP_14), value: 100, lineage: benchmarkLineageKey("m", "1.0") },
      { time: unix(SEP_22), value: 110 },
    ]);
    const withLast = daily([
      { time: unix(SEP_14), value: 100 },
      { time: unix(SEP_22), value: 110, lineage: benchmarkLineageKey("m", "1.0") },
    ]);
    expect(periodReturn(withBase, "1W", AS_OF)).toBeCloseTo(10, 10);
    expect(periodReturn(withLast, "1W", AS_OF)).toBeCloseTo(10, 10);
  });

  it("still carries no lineage when the instrument builder is given none", () => {
    const [instrument] = benchmarkInstrumentsFromSeries([xaiSeries()]);
    for (const point of instrument!.series.daily) expect(point.lineage).toBeUndefined();
    // Which reproduces the old behaviour exactly, including the wrong zero. The
    // lineage has to be supplied; the helper does not invent one.
    expect(periodReturn(instrument!.series, "1W", AS_OF)).toBe(0);
  });
});
