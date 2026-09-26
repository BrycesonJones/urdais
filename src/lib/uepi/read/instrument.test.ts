/**
 * The UEPI market surface, and the demo path it replaced.
 *
 * The retirement is the half worth testing hardest. Seven seeded random walks used to render as
 * wholesale power prices on a live page, and the failure mode being closed here is not that they
 * were wrong -- they were labelled -- but that the hydration could silently fall back to them
 * the first time a production read returned nothing.
 */

import { describe, expect, it } from "vitest";

import { findMarket } from "@/data/mock/market-detail";
import { loadPublishableSeries, loadReleasedDays, seriesViewFrom } from "@/lib/uepi/read/load";
import {
  uepiInstrumentsFrom,
  withWholesalePowerInstruments,
  WHOLESALE_POWER_FAMILY_ID,
  type UepiInstrumentInput,
} from "@/lib/uepi/read/instrument";
import { uepiIndexSnapshot } from "@/lib/uepi/read/surface";
import { RETIRED_DEMO_INSTRUMENT_IDS } from "@/lib/uepi/read/read-model";
import { ALL_BENCHMARKS, consecutiveDays, fakeReadDatabase } from "@/lib/uepi/read/read-fixtures";
import type { FakeDayRow } from "@/lib/uepi/read/read-fixtures";

const DAYS: FakeDayRow[] = [
  ...consecutiveDays("uepi-ercot", "2026-09-19", ["38.000000", "37.000000", "36.400000", "36.400000", "37.250000"]),
  ...consecutiveDays("uepi-caiso", "2026-09-19", ["48.100000", "48.200000", "48.750000", "48.750000", "47.900000"]),
  ...consecutiveDays("uepi-nyiso", "2026-09-19", ["46.200000", "46.800000", "47.900000", "47.900000", "48.010000"]),
  ...consecutiveDays("uepi-miso", "2026-09-19", ["33.100000", "33.500000", "34.200000", "34.200000", "34.900000"]),
];

async function inputs(days: readonly FakeDayRow[] = DAYS): Promise<UepiInstrumentInput[]> {
  const sql = fakeReadDatabase(ALL_BENCHMARKS, days);
  const series = await loadPublishableSeries(sql);
  const released = await loadReleasedDays(sql, series.map((row) => row.seriesId));
  return series.map((row) => {
    const rows = released.get(row.seriesId) ?? [];
    return { series: row, days: rows, change1d: seriesViewFrom(row, rows, { includePoints: false }).change1d };
  });
}

describe("the released UEPI instruments", () => {
  it("uses the public series id as the instrument id, so §I.1 holds everywhere", async () => {
    const instruments = uepiInstrumentsFrom(await inputs());
    expect(instruments.map((row) => row.id)).toEqual(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]);
    for (const id of RETIRED_DEMO_INSTRUMENT_IDS) {
      expect(instruments.map((row) => row.id), id).not.toContain(id);
    }
  });

  it("reads as UEPI-ERCOT rather than UEPI-UEPI-ERCOT", async () => {
    const ercot = (await inputs()).find((row) => row.series.seriesId === "uepi-ercot")!;
    expect(uepiInstrumentsFrom([ercot])[0]!.benchmarkCode).toBe("ERCOT");
  });

  it("labels every instrument production, never demo", async () => {
    for (const instrument of uepiInstrumentsFrom(await inputs())) {
      expect(instrument.provenance, instrument.id).toBe("production");
    }
  });

  it("carries the released value and its day-over-day change", async () => {
    const ercot = uepiInstrumentsFrom(await inputs()).find((row) => row.id === "uepi-ercot")!;
    expect(ercot.snapshot.value).toBe(37.25);
    expect(ercot.snapshot.absoluteChange).toBe(0.85);
    expect(ercot.snapshot.changeBasis).toBe("percent");
    expect(ercot.snapshot.asOf).toBe(Date.UTC(2026, 8, 23) / 1000);
    expect(ercot.series.daily).toHaveLength(5);
  });

  it("has no intraday tail and does not manufacture one", async () => {
    // Copying daily points into the intraday array would light up 1D and 1W by inventing
    // observations, which §E.2 prohibits.
    for (const instrument of uepiInstrumentsFrom(await inputs())) {
      expect(instrument.series.intraday, instrument.id).toEqual([]);
    }
  });

  it("omits a publishable series that has released nothing rather than giving it a zero", async () => {
    const instruments = uepiInstrumentsFrom(
      await inputs(DAYS.filter((row) => row.seriesId !== "uepi-caiso")),
    );
    expect(instruments.map((row) => row.id)).toEqual(["uepi-ercot", "uepi-nyiso"]);
    expect(instruments.every((row) => row.snapshot.value !== 0)).toBe(true);
  });

  it("contains no value from a market Urdais does not publish", async () => {
    const serialized = JSON.stringify(uepiInstrumentsFrom(await inputs()));
    expect(serialized).not.toContain("MISO");
    expect(serialized).not.toContain("34.9");
  });
});

describe("replacing the family", () => {
  it("fills the wholesale power family and opens the page on the flagship", async () => {
    const market = withWholesalePowerInstruments(findMarket("uepi")!, uepiInstrumentsFrom(await inputs()));
    const family = market.families.find((candidate) => candidate.id === WHOLESALE_POWER_FAMILY_ID)!;
    expect(family.instruments.map((row) => row.id)).toEqual(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]);
    expect(family.defaultInstrumentId).toBe("uepi-ercot");
    expect(market.defaultInstrumentId).toBe("uepi-ercot");
  });

  it("empties the family when production has nothing, rather than falling back to demo data", async () => {
    // The rule that separates this from the compute hydration. A fabricated $36.40/MWh where
    // ERCOT's real day-ahead hub average belongs is a wrong number, not a sketch of a product.
    const market = withWholesalePowerInstruments(findMarket("uepi")!, []);
    const family = market.families.find((candidate) => candidate.id === WHOLESALE_POWER_FAMILY_ID)!;
    expect(family.instruments).toEqual([]);
    expect(family.defaultInstrumentId).toBe("");
  });

  it("leaves a market without a wholesale power family untouched", async () => {
    const ucpi = findMarket("ucpi")!;
    expect(withWholesalePowerInstruments(ucpi, uepiInstrumentsFrom(await inputs()))).toMatchObject({
      families: ucpi.families.map((family) => ({ id: family.id })),
    });
  });
});

describe("the static dataset after the retirement", () => {
  it("ships no UEPI instrument and no generated wholesale power series", () => {
    const market = findMarket("uepi")!;
    expect(market.families.flatMap((family) => family.instruments)).toEqual([]);
    expect(market.families.map((family) => family.id)).toEqual([WHOLESALE_POWER_FAMILY_ID]);
  });

  it("keeps the family shell and its Power Analytics link", () => {
    const family = findMarket("uepi")!.families[0]!;
    expect(family.label).toBe("Wholesale Power");
    expect(family.explore?.href).toContain("power-analytics");
  });

  it("names the flagship by its public series id, not its retired demo id", () => {
    expect(findMarket("uepi")!.defaultInstrumentId).toBe("uepi-ercot");
  });
});

describe("the homepage row", () => {
  it("carries no number, because UEPI publishes no composite (§C.14)", async () => {
    const row = uepiIndexSnapshot(uepiInstrumentsFrom(await inputs()))!;
    expect(row.symbol).toBe("UEPI");
    expect(row.provenance).toBe("multi_series");
    expect(row.changePercent).toBeNull();
    // Read off what actually published, so a posture change cannot leave the rail claiming a
    // count nobody updated.
    expect(row.seriesCount).toBe(3);
  });

  it("is absent entirely when nothing is published", () => {
    expect(uepiIndexSnapshot([])).toBeNull();
  });
});
