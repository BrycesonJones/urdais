import { describe, expect, it } from "vitest";

import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { calculateDailyValue } from "@/lib/uepi/calculate";
import { normalizeOperatingDay } from "@/lib/uepi/normalize";
import { operatingDayWindow } from "@/lib/uepi/operating-day";
import { evaluateRelease } from "@/lib/uepi/release";
import { caisoAdapter } from "@/lib/uepi/source/adapters/caiso";
import { misoAdapter } from "@/lib/uepi/source/adapters/miso";
import { nyisoAdapter } from "@/lib/uepi/source/adapters/nyiso";
import { sppAdapter } from "@/lib/uepi/source/adapters/spp";
import { fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";
import { SPECIFICATION_DIGEST, SPECIFICATION_VERSION } from "@/lib/uepi/methodology";
import { UepiSourceError } from "@/lib/uepi/source/types";

/** One real day per implemented market, carried the whole way to a released value. */
const DAYS = [
  { seriesId: "uepi-caiso", date: "2026-09-23", adapter: caisoAdapter, file: "caiso-2026-09-23.zip", label: "day", mean: "36.148589", hours: 24 },
  { seriesId: "uepi-miso", date: "2026-09-23", adapter: misoAdapter, file: "miso-2026-09-23.csv", label: "day", mean: "37.195833", hours: 24 },
  { seriesId: "uepi-nyiso", date: "2026-09-23", adapter: nyisoAdapter, file: "nyiso-2026-09-23.csv", label: "daily", mean: "35.225000", hours: 24 },
  { seriesId: "uepi-spp", date: "2026-04-12", adapter: sppAdapter, file: "spp-2026-04-12.csv", label: "day", mean: "2.778533", hours: 24 },
] as const;

function run(entry: (typeof DAYS)[number]) {
  const benchmark = benchmarkFor(entry.seriesId);
  const window = operatingDayWindow(benchmark, entry.date);
  const parsed = entry.adapter.parse(entry.date, fixtureArtifacts(entry.file, entry.label));
  const normalized = normalizeOperatingDay(benchmark, window, parsed);
  return { benchmark, window, parsed, ...normalized };
}

describe("1. a real day becomes canonical observations", () => {
  it("produces one observation per source hour, in time order", () => {
    for (const entry of DAYS) {
      const { hours } = run(entry);
      expect(hours.length, entry.seriesId).toBe(entry.hours);
      expect(hours.map((hour) => hour.hourOrdinal), entry.seriesId)
        .toEqual(Array.from({ length: entry.hours }, (_, index) => index + 1));
      const instants = hours.map((hour) => Date.parse(hour.intervalStartUtc));
      expect([...instants].sort((a, b) => a - b), entry.seriesId).toEqual(instants);
    }
  });

  it("carries the market's construct onto every observation", () => {
    expect(run(DAYS[0]).hours.every((hour) => hour.construct === "system_energy_component")).toBe(true);
    expect(run(DAYS[1]).hours.every((hour) => hour.derivation === "derived_residual")).toBe(true);
    expect(run(DAYS[1]).hours[0]!.derivationExpression).toBe("LMP - MCC - MLC");
    expect(run(DAYS[3]).hours.every((hour) => hour.derivation === "published_column")).toBe(true);
  });

  it("keeps the operating date the market means, not a UTC date", () => {
    const { hours } = run(DAYS[0]);
    expect(hours[0]!.operatingDate).toBe("2026-09-23");
    // CAISO's day begins at 07:00 UTC, so the first observation's UTC date is the same day only
    // by coincidence of the offset; the last one's is the next.
    expect(hours.at(-1)!.intervalStartUtc.startsWith("2026-09-24")).toBe(true);
    expect(hours.at(-1)!.operatingDate).toBe("2026-09-23");
  });

  it("prices in USD per MWh, signed, with no clipping", () => {
    const { hours } = run(DAYS[3]);
    const negatives = hours.filter((hour) => Number(hour.priceUsdPerMwh) < 0);
    expect(negatives).toHaveLength(10);
    expect(hours[0]!.priceUsdPerMwh).toBe("-12.4483");
    expect(hours.every((hour) => hour.qualityStatus === "accepted")).toBe(true);
  });

  it("keeps a lineage back to the source record", () => {
    const { parsed, hours } = run(DAYS[2]);
    expect(parsed.records[0]!.raw.rowOrdinal).toBeGreaterThan(0);
    expect(parsed.records[0]!.raw.nativeComponents.PTID).toBe("61752");
    expect(hours[0]!.sourceVersion).toEqual({ artifact: "daily" });
  });
});

describe("2. the cross-check the specification requires", () => {
  it("measures a second carrier and reports the spread it found", () => {
    for (const entry of DAYS) {
      const { crossChecks } = run(entry);
      expect(crossChecks, entry.seriesId).toHaveLength(1);
      const check = crossChecks[0]!;
      expect(check.check).toBe("system_component_uniformity");
      expect(check.maxAbsoluteSpread, entry.seriesId).toBeLessThanOrEqual(check.tolerance);
    }
  });

  it("holds CAISO and MISO to exact agreement and NYISO only to a cent", () => {
    expect(run(DAYS[0]).crossChecks[0]!.tolerance).toBe(0.0001);
    expect(run(DAYS[0]).crossChecks[0]!.maxAbsoluteSpread).toBe(0);
    expect(run(DAYS[1]).crossChecks[0]!.maxAbsoluteSpread).toBe(0);
    expect(run(DAYS[2]).crossChecks[0]!.tolerance).toBe(0.02);
  });
});

describe("3. the specification version survives the whole path", () => {
  it("stamps 1.0.0 and its digest onto the released value of every market", () => {
    for (const entry of DAYS) {
      const { benchmark, window, hours } = run(entry);
      const calculation = calculateDailyValue(benchmark, window, hours);
      expect(calculation.specificationVersion, entry.seriesId).toBe(SPECIFICATION_VERSION);
      expect(calculation.specificationDigest, entry.seriesId).toBe(SPECIFICATION_DIGEST);
      expect(calculation.valueUsdPerMwh, entry.seriesId).toBe(entry.mean);
      expect(calculation.construct, entry.seriesId).toBe(benchmark.construct);
    }
  });

  it("releases each day through the shared validator, with its cross-check attached", () => {
    for (const entry of DAYS) {
      const { benchmark, window, hours, crossChecks } = run(entry);
      const decision = evaluateRelease({
        benchmark, window, hours, crossChecks,
        specificationApproved: true,
        now: new Date("2026-09-25T00:00:00Z"),
        intent: "internal_release",
      });
      expect(decision.released, `${entry.seriesId}: ${decision.released ? "" : decision.detail}`).toBe(true);
      if (decision.released) {
        expect(decision.checks.some((check) => check.check === "system_component_uniformity")).toBe(true);
      }
    }
  });
});

describe("4. transition days survive normalization intact", () => {
  it("normalizes 23 and 25 hour days without inventing or dropping an hour", () => {
    const cases = [
      { seriesId: "uepi-nyiso", date: "2026-03-08", adapter: nyisoAdapter, file: "nyiso-2026-03.zip", label: "monthly", expected: 23 },
      { seriesId: "uepi-nyiso", date: "2025-11-02", adapter: nyisoAdapter, file: "nyiso-2025-11.zip", label: "monthly", expected: 25 },
      { seriesId: "uepi-spp", date: "2026-03-08", adapter: sppAdapter, file: "spp-2026-03-08.csv", label: "day", expected: 23 },
      { seriesId: "uepi-spp", date: "2025-11-02", adapter: sppAdapter, file: "spp-2025-11-02.csv", label: "day", expected: 25 },
      { seriesId: "uepi-caiso", date: "2026-03-08", adapter: caisoAdapter, file: "caiso-2026-03-08.zip", label: "day", expected: 23 },
      { seriesId: "uepi-caiso", date: "2025-11-02", adapter: caisoAdapter, file: "caiso-2025-11-02.zip", label: "day", expected: 25 },
      { seriesId: "uepi-miso", date: "2026-03-08", adapter: misoAdapter, file: "miso-2026-03-08.csv", label: "day", expected: 24 },
      { seriesId: "uepi-miso", date: "2025-11-02", adapter: misoAdapter, file: "miso-2025-11-02.csv", label: "day", expected: 24 },
    ] as const;
    for (const entry of cases) {
      const benchmark = benchmarkFor(entry.seriesId);
      const window = operatingDayWindow(benchmark, entry.date);
      const parsed = entry.adapter.parse(entry.date, fixtureArtifacts(entry.file, entry.label));
      const { hours } = normalizeOperatingDay(benchmark, window, parsed);
      expect(hours.length, `${entry.seriesId} ${entry.date}`).toBe(entry.expected);
      expect(window.expectedIntervalCount, `${entry.seriesId} ${entry.date}`).toBe(entry.expected);
      expect(new Set(hours.map((hour) => hour.intervalStartUtc)).size).toBe(entry.expected);
    }
  });
});

describe("5. normalization refuses what it cannot place", () => {
  it("refuses a parse belonging to another series", () => {
    const benchmark = benchmarkFor("uepi-spp");
    const window = operatingDayWindow(benchmark, "2026-09-23");
    const parsed = nyisoAdapter.parse("2026-09-23", fixtureArtifacts("nyiso-2026-09-23.csv", "daily"));
    expect(() => normalizeOperatingDay(benchmark, window, parsed)).toThrow(UepiSourceError);
  });

  it("refuses a parse of another operating date", () => {
    const benchmark = benchmarkFor("uepi-nyiso");
    const window = operatingDayWindow(benchmark, "2026-09-24");
    const parsed = nyisoAdapter.parse("2026-09-23", fixtureArtifacts("nyiso-2026-09-23.csv", "daily"));
    expect(() => normalizeOperatingDay(benchmark, window, parsed)).toThrow(/cannot be normalized as 2026-09-24/);
  });
});
