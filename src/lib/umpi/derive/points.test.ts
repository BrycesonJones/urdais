import { describe, expect, it } from "vitest";

import { derivePoints, publicationDigest } from "./points";
import type { CurrentObservation, StoredBase } from "./types";
import { UMPI_BASE_LABEL, UMPI_CALCULATION_VERSION } from "./types";

const bok = (m: string, level: number, over: Partial<CurrentObservation> = {}): CurrentObservation => ({
  observationId: `bok-${m}`,
  seriesId: "s-a",
  sourceSeriesId: "ss-a",
  referenceMonth: m,
  vintageOrdinal: 1,
  methodologyVersionId: "mv-1",
  indexLevel: level,
  indexBaseLabel: "2020=100",
  exportValueUsd: null,
  exportWeightKg: null,
  ...over,
});

const kcs = (m: string, usd: number, kg: number, over: Partial<CurrentObservation> = {}): CurrentObservation => ({
  observationId: `kcs-${m}`,
  seriesId: "s-b",
  sourceSeriesId: "ss-b",
  referenceMonth: m,
  vintageOrdinal: 1,
  methodologyVersionId: "mv-1",
  indexLevel: null,
  indexBaseLabel: null,
  exportValueUsd: usd,
  exportWeightKg: kg,
  ...over,
});

/** A base of exactly 100 USD/kg, so a rebased level reads as a percentage of it. */
const base: StoredBase = {
  indexBaseId: "base-1",
  baseLabel: UMPI_BASE_LABEL,
  baseValueUsd: 12_000_000,
  baseWeightKg: 120_000,
  baseUnitValue: 100,
  monthCount: 12,
  inputsDigest: "b".repeat(64),
};

const deriveA = (observations: CurrentObservation[]) =>
  derivePoints({
    seriesCode: "UMPI-KR-DRAM-PPI",
    observations,
    base: null,
    baseLabel: "2020=100",
    indexBaseId: null,
    publicationMethodologyVersionId: "mv-1",
  });

const deriveB = (observations: CurrentObservation[], withBase: StoredBase | null = base) =>
  derivePoints({
    seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
    observations,
    base: withBase,
    baseLabel: UMPI_BASE_LABEL,
    indexBaseId: withBase?.indexBaseId ?? null,
    publicationMethodologyVersionId: "mv-1",
  });

describe("Series A passes the official level through", () => {
  it("publishes the Bank of Korea level unchanged", () => {
    const points = deriveA([bok("2026-06", 496.84), bok("2026-07", 538.74)]);
    expect(points.map((p) => p.publishedLevel)).toEqual([496.84, 538.74]);
  });

  it("never rebases, never rescales, and produces no unit value", () => {
    const points = deriveA([bok("2026-06", 496.84)]);
    expect(points[0]!.publishedLevel).toBe(496.84);
    expect(points[0]!.unitValueUsdPerKg).toBeNull();
    expect(points[0]!.indexBaseId).toBeNull();
    // A level of 496.84 must not come back as 100 or as any fraction of a base.
    expect(points[0]!.publishedLevel).not.toBe(100);
  });
});

describe("Series B derivation", () => {
  it("computes USD per kg and rebases it", () => {
    // 1,000,000 USD over 5,000 kg is 200 USD/kg; against a base of 100 that is an index of 200.
    const points = deriveB([kcs("2026-06", 1_000_000, 5_000)]);
    expect(points[0]!.unitValueUsdPerKg).toBe(200);
    expect(points[0]!.publishedLevel).toBe(200);
  });

  it("puts a month at exactly the base unit value at 100", () => {
    expect(deriveB([kcs("2026-06", 1_000_000, 10_000)])[0]!.publishedLevel).toBe(100);
  });

  it("does not repeat the thousand-USD conversion", () => {
    // The parser already multiplied by 1000. A second multiplication here would put this month
    // three orders of magnitude out, which is exactly the failure mode worth a test.
    const points = deriveB([kcs("2026-06", 11_175_623_000, 149_633)]);
    expect(points[0]!.unitValueUsdPerKg).toBeCloseTo(74_686.887, 3);
    expect(points[0]!.unitValueUsdPerKg).toBeLessThan(1_000_000);
  });

  it("publishes nothing at all without a base", () => {
    expect(deriveB([kcs("2026-06", 1_000_000, 5_000)], null)).toHaveLength(0);
  });

  it("skips a month with no positive weight instead of dividing by it", () => {
    expect(deriveB([kcs("2026-06", 1_000_000, 0)])).toHaveLength(0);
  });
});

describe("month over month", () => {
  it("is computed between consecutive calendar months", () => {
    const points = deriveA([bok("2026-06", 100), bok("2026-07", 110)]);
    expect(points[1]!.momChange).toBeCloseTo(0.1, 12);
    expect(points[1]!.previousObservationId).toBe("bok-2026-06");
    expect(points[1]!.momWithheldReason).toBeNull();
  });

  it("is withheld for the first month, with no comparison recorded", () => {
    const points = deriveA([bok("2026-06", 100)]);
    expect(points[0]!.momChange).toBeNull();
    expect(points[0]!.momWithheldReason).toBe("no_prior_month");
    expect(points[0]!.previousObservationId).toBeNull();
  });

  it("is withheld across a gap, and never falls back to the last available month", () => {
    // June and August are present; July is not. The change is refused rather than measured
    // across two months and called a monthly change.
    const points = deriveA([bok("2026-06", 100), bok("2026-08", 121)]);
    const august = points.find((p) => p.referenceMonth === "2026-08")!;
    expect(august.momChange).toBeNull();
    expect(august.momWithheldReason).toBe("prior_month_missing");
    expect(august.previousObservationId).toBeNull();
  });

  it("is withheld across a methodology boundary between the two observations", () => {
    // The boundary that matters for a change is whether the two months were *measured* under
    // the same rules, which is the observation's methodology, not the one the publication is
    // governed by today.
    const points = deriveA([bok("2026-06", 100, { methodologyVersionId: "mv-0" }), bok("2026-07", 110)]);
    expect(points[1]!.momWithheldReason).toBe("methodology_boundary");
  });

  it("publishes every point under the series' current methodology, whatever the observations carried", () => {
    // Approval regenerates rather than relabels: the publication methodology enters the digest,
    // so pointing the series at a new version changes every point's identity.
    const points = deriveA([bok("2026-06", 100, { methodologyVersionId: "mv-0" })]);
    expect(points[0]!.methodologyVersionId).toBe("mv-1");

    const underNewVersion = derivePoints({
      seriesCode: "UMPI-KR-DRAM-PPI",
      observations: [bok("2026-06", 100, { methodologyVersionId: "mv-0" })],
      base: null,
      baseLabel: "2020=100",
      indexBaseId: null,
      publicationMethodologyVersionId: "mv-2",
    });
    expect(underNewVersion[0]!.inputsDigest).not.toBe(points[0]!.inputsDigest);
  });

  it("is withheld across a source boundary", () => {
    const points = deriveA([bok("2026-06", 100, { sourceSeriesId: "other" }), bok("2026-07", 110)]);
    expect(points[1]!.momWithheldReason).toBe("source_boundary");
  });

  it("publishes no point for a month with weight but no value, and withholds the next change", () => {
    // The admission layer accepts such a month as real evidence; an index level of zero is not
    // a measurement of price, so it is stored and not published. The following month therefore
    // has no published predecessor and its change is withheld rather than measured against one.
    const points = deriveB([kcs("2026-06", 0, 10_000), kcs("2026-07", 1_000_000, 10_000)]);
    expect(points.map((p) => p.referenceMonth)).toEqual(["2026-07"]);
    expect(points[0]!.momChange).toBeNull();
    expect(points[0]!.momWithheldReason).toBe("prior_month_missing");
  });

  it("crosses a year boundary correctly", () => {
    const points = deriveA([bok("2025-12", 100), bok("2026-01", 110)]);
    expect(points[1]!.momChange).toBeCloseTo(0.1, 12);
  });
});

describe("the publication digest", () => {
  const args = {
    seriesCode: "UMPI-KR-DRAM-PPI" as const,
    referenceMonth: "2026-06",
    observationId: "obs-1",
    vintageOrdinal: 1,
    level: 496.84,
    previousObservationId: null,
    momChange: null,
    momWithheldReason: "no_prior_month",
    indexBaseDigest: null,
    methodologyVersionId: "mv-1",
    calculationVersion: UMPI_CALCULATION_VERSION,
  };

  it("is stable for identical inputs", () => {
    expect(publicationDigest(args)).toBe(publicationDigest({ ...args }));
    expect(publicationDigest(args)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the level, the vintage or the calculation version changes", () => {
    expect(publicationDigest({ ...args, level: 496.85 })).not.toBe(publicationDigest(args));
    expect(publicationDigest({ ...args, vintageOrdinal: 2 })).not.toBe(publicationDigest(args));
    expect(publicationDigest({ ...args, calculationVersion: "2.0.0" })).not.toBe(publicationDigest(args));
  });

  it("changes when the base changes, which is what propagates a rebuilt base", () => {
    // Series B's dependency on the base is carried here: a new base digest means every point
    // derived from it gets a new publication digest and is recalculated.
    const withBase = { ...args, indexBaseDigest: "a".repeat(64) };
    expect(publicationDigest({ ...withBase, indexBaseDigest: "c".repeat(64) })).not.toBe(publicationDigest(withBase));
  });

  it("does not depend on the order observations were read in", () => {
    const ascending = deriveA([bok("2026-06", 100), bok("2026-07", 110)]);
    const descending = deriveA([bok("2026-07", 110), bok("2026-06", 100)]);
    expect(descending.map((p) => p.inputsDigest)).toEqual(ascending.map((p) => p.inputsDigest));
    expect(descending.map((p) => p.referenceMonth)).toEqual(["2026-06", "2026-07"]);
  });
});
