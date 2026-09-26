/**
 * The publication gate, and what a released value looks like once it has passed it.
 *
 * The gate is the whole point of this file. Production holds 2,380 released daily values across
 * six markets and Urdais may show three of them; the other three exist, are complete, are
 * verified, and must not appear on a public surface. Every test here that asserts an absence is
 * asserting that a real number stayed where it belongs.
 */

import { describe, expect, it } from "vitest";

import { SPECIFICATION_DIGEST } from "@/lib/uepi/methodology";
import {
  loadPublishableSeries,
  loadReleasedDays,
  loadUepiReadModel,
  loadUepiSeries,
  seriesViewFrom,
} from "@/lib/uepi/read/load";
import { validatePublicUepi } from "@/lib/uepi/read/read-model";
import { ALL_BENCHMARKS, consecutiveDays, fakeReadDatabase } from "@/lib/uepi/read/read-fixtures";

const THREE_DAYS = [
  ...consecutiveDays("uepi-ercot", "2026-09-21", ["38.000000", "36.400000", "37.250000"]),
  ...consecutiveDays("uepi-caiso", "2026-09-21", ["48.100000", "48.750000", "47.900000"]),
  ...consecutiveDays("uepi-nyiso", "2026-09-21", ["46.200000", "47.900000", "48.010000"]),
  // Stored, complete, and not publishable. Each of these is a real production posture.
  ...consecutiveDays("uepi-miso", "2026-09-21", ["33.100000", "34.200000", "34.900000"]),
  ...consecutiveDays("uepi-spp", "2026-09-21", ["29.100000", "30.150000", "30.400000"]),
  ...consecutiveDays("uepi-iso-ne", "2026-09-21", ["51.100000", "52.300000", "52.800000"]),
];

describe("which series may be shown", () => {
  it("serves exactly the three markets production publishes, flagship first", async () => {
    const sql = fakeReadDatabase(ALL_BENCHMARKS, THREE_DAYS);
    const series = await loadPublishableSeries(sql);
    // Product order, not the query's alphabetical one: ERCOT is UEPI's headline benchmark, and
    // the page opens on whichever series comes first.
    expect(series.map((row) => row.seriesId)).toEqual(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]);
  });

  it("withholds MISO, SPP and PJM on their terms, not on a hardcoded list", async () => {
    // Their postures are internal_only *and* their terms are unsuitable_without_permission.
    // Flipping only the posture must not publish them: the terms are the independent gate.
    const sql = fakeReadDatabase(
      ALL_BENCHMARKS.map((row) =>
        ["uepi-miso", "uepi-spp", "uepi-pjm"].includes(row.seriesId)
          ? { ...row, publicationPosture: "publishable" as const }
          : row,
      ),
      THREE_DAYS,
    );
    const served = (await loadPublishableSeries(sql)).map((row) => row.seriesId);
    for (const blocked of ["uepi-miso", "uepi-spp", "uepi-pjm"]) expect(served, blocked).not.toContain(blocked);
  });

  it("withholds ISO-NE on its posture, although its terms would allow it", async () => {
    // The reverse case, and the reason both gates exist. ISO-NE's classification is ambiguous,
    // which the platform publishes under founder-accepted risk; it is internal_only because
    // Urdais decided not to show it, and that decision alone must be sufficient.
    const sql = fakeReadDatabase(ALL_BENCHMARKS, THREE_DAYS);
    expect((await loadPublishableSeries(sql)).map((row) => row.seriesId)).not.toContain("uepi-iso-ne");

    const opened = fakeReadDatabase(
      ALL_BENCHMARKS.map((row) =>
        row.seriesId === "uepi-iso-ne" ? { ...row, publicationPosture: "publishable" as const } : row,
      ),
      THREE_DAYS,
    );
    expect((await loadPublishableSeries(opened)).map((row) => row.seriesId)).toContain("uepi-iso-ne");
  });

  it("follows the database's posture, not the code's mirror of it", async () => {
    // An operator withdrawing a series in production must take effect without a deploy.
    const sql = fakeReadDatabase(
      ALL_BENCHMARKS.map((row) =>
        row.seriesId === "uepi-ercot" ? { ...row, publicationPosture: "internal_only" as const } : row,
      ),
      THREE_DAYS,
    );
    expect((await loadPublishableSeries(sql)).map((row) => row.seriesId)).not.toContain("uepi-ercot");
  });

  it("withholds a series with no rights determination at all", async () => {
    const sql = fakeReadDatabase(
      ALL_BENCHMARKS.map((row) =>
        row.seriesId === "uepi-ercot" ? { ...row, rightsClassification: null } : row,
      ),
      THREE_DAYS,
    );
    expect((await loadPublishableSeries(sql)).map((row) => row.seriesId)).not.toContain("uepi-ercot");
  });

  it("carries an ambiguous source's unresolved issue through rather than resolving it", async () => {
    const sql = fakeReadDatabase(ALL_BENCHMARKS, THREE_DAYS);
    const model = await loadUepiReadModel(sql);
    const caiso = model.series.find((series) => series.seriesId === "uepi-caiso")!;
    expect(caiso.notice.rightsClassification).toBe("ambiguous_requires_legal_review");
    expect(caiso.notice.unresolvedIssue).not.toBeNull();
    // Published under founder-accepted risk, with the attribution its determination requires.
    expect(caiso.notice.attribution).toContain("California ISO");
  });
});

describe("the released values themselves", () => {
  it("never loads a day for a series it will not serve", async () => {
    const sql = fakeReadDatabase(ALL_BENCHMARKS, THREE_DAYS);
    const model = await loadUepiReadModel(sql, { includePoints: true });
    const serialized = JSON.stringify(model);
    for (const withheld of ["33.1", "34.2", "29.1", "30.15", "51.1", "52.3"]) {
      expect(serialized, withheld).not.toContain(withheld);
    }
    expect(validatePublicUepi(model)).toEqual([]);
  });

  it("preserves the stored decimal exactly", async () => {
    // The production MISO value that a guess put at 42.700833 and an independent recomputation
    // put at 69.505833. Whatever the read model does to a value, it must not be arithmetic.
    const sql = fakeReadDatabase([{ seriesId: "uepi-ercot" }], [
      { seriesId: "uepi-ercot", operatingDate: "2026-09-23", value: "69.505833" },
    ]);
    const days = (await loadReleasedDays(sql, ["uepi-ercot"])).get("uepi-ercot")!;
    expect(days[0]!.valueUsdPerMwh).toBe("69.505833");
    expect(String(seriesViewFrom(
      (await loadPublishableSeries(sql))[0]!, days, { includePoints: true },
    ).latest!.valueUsdPerMwh)).toBe("69.505833");
  });

  it("serves a negative released value rather than filtering it", async () => {
    // SPP's North Hub daily mean was -$0.11/MWh on 12 April 2026. A negative price is what the
    // market cleared at, not a bad row.
    const sql = fakeReadDatabase([{ seriesId: "uepi-ercot" }], [
      { seriesId: "uepi-ercot", operatingDate: "2026-04-11", value: "2.500000" },
      { seriesId: "uepi-ercot", operatingDate: "2026-04-12", value: "-0.108300" },
    ]);
    const model = await loadUepiReadModel(sql, { includePoints: true });
    const series = model.series[0]!;
    expect(series.latest!.valueUsdPerMwh).toBe(-0.1083);
    expect(series.change1d.basis).toBe("absolute");
    expect(series.change1d.percentChange).toBeNull();
    expect(series.change1d.reason).toBe("new_not_positive");
    expect(series.change1d.direction).toBe("down");
    expect(validatePublicUepi(model)).toEqual([]);
  });

  it("refuses a day-over-day change across a hole in the series", async () => {
    // ERCOT has no 2026-03-07: the source published no records for any settlement point. The
    // next day's "today" move must not silently become a two-day move.
    const sql = fakeReadDatabase([{ seriesId: "uepi-ercot" }], [
      { seriesId: "uepi-ercot", operatingDate: "2026-03-06", value: "30.000000" },
      { seriesId: "uepi-ercot", operatingDate: "2026-03-08", value: "33.000000", expectedObservationCount: 23 },
    ]);
    const model = await loadUepiReadModel(sql);
    expect(model.series[0]!.change1d.basis).toBe("unavailable");
    expect(model.series[0]!.change1d.reason).toBe("no_base_observation");
  });

  it("fabricates nothing for a missing or withheld operating date", async () => {
    const sql = fakeReadDatabase([{ seriesId: "uepi-ercot" }], [
      { seriesId: "uepi-ercot", operatingDate: "2026-03-06", value: "30.000000" },
      { seriesId: "uepi-ercot", operatingDate: "2026-03-08", value: "33.000000", expectedObservationCount: 23 },
    ]);
    const model = await loadUepiReadModel(sql, { includePoints: true });
    const dates = model.series[0]!.points.map((point) => point.operatingDate);
    expect(dates).toEqual(["2026-03-06", "2026-03-08"]);
    // No null row, no zero, no interpolation between them.
    expect(model.series[0]!.points.every((point) => Number.isFinite(point.valueUsdPerMwh))).toBe(true);
  });

  it("says a series has no value rather than omitting it, when it publishes but has released nothing", async () => {
    const sql = fakeReadDatabase([{ seriesId: "uepi-ercot" }], []);
    const model = await loadUepiReadModel(sql);
    expect(model.series[0]!.latest).toBeNull();
    expect(model.series[0]!.unavailableReason).toBe("no released value for this series");
    expect(model.unavailableReason).toBe("no UEPI series has a released value");
  });

  it("stamps every value with the frozen specification", async () => {
    const sql = fakeReadDatabase(ALL_BENCHMARKS, THREE_DAYS);
    const model = await loadUepiReadModel(sql);
    for (const series of model.series) {
      expect(series.methodologyVersion, series.seriesId).toBe("1.0.0");
      expect(series.methodologyDigest, series.seriesId).toBe(SPECIFICATION_DIGEST);
    }
  });

  it("publishes the §I.2 metadata every series is required to fill", async () => {
    const sql = fakeReadDatabase(ALL_BENCHMARKS, THREE_DAYS);
    const caiso = (await loadUepiReadModel(sql)).series.find((row) => row.seriesId === "uepi-caiso")!;
    expect(caiso.displaySymbol).toBe("UEPI-CAISO");
    expect(caiso.unit).toBe("$/MWh");
    expect(caiso.priceConstruct).toBe("system_energy_component");
    // A system energy component that does not say what it leaves out overclaims.
    expect(caiso.excludes).toContain("marginal congestion (MCC)");
    expect(caiso.excludes).toContain("the marginal greenhouse-gas component (MGHG)");
    expect(caiso.dailyAggregation).toBe("arithmetic_mean_of_valid_hours");
    expect(caiso.provenance).toBe("production");
    expect(caiso.knownLimitations.join(" ")).toContain("not an index published by the ISO or RTO");
  });
});

describe("addressing one series", () => {
  it("returns null for a series Urdais does not publish, exactly as for one that does not exist", async () => {
    const sql = fakeReadDatabase(ALL_BENCHMARKS, THREE_DAYS);
    expect(await loadUepiSeries(sql, "uepi-miso")).toBeNull();
    expect(await loadUepiSeries(sql, "uepi-nonesuch")).toBeNull();
    expect(await loadUepiSeries(sql, "power-ercot")).toBeNull();
  });

  it("returns the full released history for one it does", async () => {
    const sql = fakeReadDatabase(ALL_BENCHMARKS, THREE_DAYS);
    const series = (await loadUepiSeries(sql, "uepi-ercot"))!;
    expect(series.points.map((point) => point.valueUsdPerMwh)).toEqual([38, 36.4, 37.25]);
  });
});
