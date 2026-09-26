/**
 * The public UEPI API contract.
 *
 * The assertions that matter most here are absences. Production holds released daily values for
 * MISO, SPP and ISO-NE, and this API is the surface between those values and the internet. A
 * test that only checked ERCOT came back would pass just as happily with all six exposed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_BENCHMARKS, consecutiveDays, fakeReadDatabase } from "@/lib/uepi/read/read-fixtures";
import type { FakeBenchmarkRow, FakeDayRow } from "@/lib/uepi/read/read-fixtures";
import { SPECIFICATION_DIGEST } from "@/lib/uepi/methodology";
import { validatePublicUepi } from "@/lib/uepi/read/read-model";

const ended = vi.fn();
let benchmarks: FakeBenchmarkRow[] = ALL_BENCHMARKS;
let days: FakeDayRow[] = [];
let failWith: Error | null = null;

vi.mock("@/lib/tokens/read/database", () => ({
  createTokenSqlExecutor: async () => {
    if (failWith) throw failWith;
    const sql = fakeReadDatabase(benchmarks, days);
    return { ...sql, end: ended };
  },
}));

const DAYS: FakeDayRow[] = [
  ...consecutiveDays("uepi-ercot", "2026-09-21", ["38.000000", "36.400000", "37.250000"]),
  ...consecutiveDays("uepi-caiso", "2026-09-21", ["48.100000", "48.750000", "47.900000"]),
  ...consecutiveDays("uepi-nyiso", "2026-09-21", ["46.200000", "47.900000", "48.010000"]),
  ...consecutiveDays("uepi-miso", "2026-09-21", ["33.100000", "34.200000", "34.900000"]),
  ...consecutiveDays("uepi-spp", "2026-09-21", ["29.100000", "30.150000", "30.400000"]),
  ...consecutiveDays("uepi-iso-ne", "2026-09-21", ["51.100000", "52.300000", "52.800000"]),
];

const ORIGINAL_URL = process.env.DATABASE_URL;

beforeEach(() => {
  benchmarks = ALL_BENCHMARKS;
  days = DAYS;
  failWith = null;
  ended.mockClear();
  process.env.DATABASE_URL = "postgres://fake/urdais";
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  vi.resetModules();
});

async function get() {
  const { GET } = await import("@/app/api/uepi/route");
  return GET();
}

describe("GET /api/uepi", () => {
  it("serves the three publishable markets and satisfies its own contract", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.series.map((series: { seriesId: string }) => series.seriesId)).toEqual([
      "uepi-ercot",
      "uepi-caiso",
      "uepi-nyiso",
    ]);
    expect(validatePublicUepi(body)).toEqual([]);
  });

  it("exposes no internal-only market, by id, symbol or value", async () => {
    const serialized = JSON.stringify(await (await get()).json());
    for (const hidden of ["uepi-miso", "uepi-spp", "uepi-iso-ne", "uepi-pjm", "MISO", "SPP", "ISO-NE", "PJM"]) {
      expect(serialized, hidden).not.toContain(hidden);
    }
    // And not by value either: a market absent from the ids but present in the numbers is
    // still exposed.
    for (const hidden of ["34.2", "30.15", "52.3"]) expect(serialized, hidden).not.toContain(hidden);
  });

  it("publishes no headline level, because §C.14 forbids a composite", async () => {
    const body = await (await get()).json();
    expect(body.family.hasCompositeLevel).toBe(false);
    expect(body.family).not.toHaveProperty("value");
    expect(body.family).not.toHaveProperty("level");
  });

  it("names the frozen specification on the family and on every value", async () => {
    const body = await (await get()).json();
    expect(body.family.specificationVersion).toBe("1.0.0");
    expect(body.family.specificationDigest).toBe(SPECIFICATION_DIGEST);
    for (const series of body.series) {
      expect(series.methodologyVersion, series.seriesId).toBe("1.0.0");
      expect(series.methodologyDigest, series.seriesId).toBe(SPECIFICATION_DIGEST);
    }
  });

  it("carries each series' §I.2 metadata and its rights notice", async () => {
    const body = await (await get()).json();
    const caiso = body.series.find((series: { seriesId: string }) => series.seriesId === "uepi-caiso");
    expect(caiso.unit).toBe("$/MWh");
    expect(caiso.priceConstruct).toBe("system_energy_component");
    expect(caiso.excludes.length).toBeGreaterThan(0);
    expect(caiso.notice.attribution).toContain("California ISO");
    expect(caiso.notice.unresolvedIssue).not.toBeNull();
    expect(caiso.knownLimitations.length).toBeGreaterThan(0);
    expect(caiso.methodologyHref).toBe("/docs/methodology/uepi");
  });

  it("serves exact released values, not rounded display figures", async () => {
    days = [{ seriesId: "uepi-ercot", operatingDate: "2026-09-23", value: "69.505833" }];
    benchmarks = [{ seriesId: "uepi-ercot" }];
    const body = await (await get()).json();
    expect(body.series[0].latest.valueUsdPerMwh).toBe(69.505833);
    expect(JSON.stringify(body)).toContain("69.505833");
  });

  it("answers 200 with a reason, not an error, when no database is configured", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.URDAIS_DATABASE_URL;
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.series).toEqual([]);
    expect(body.unavailableReason).toMatch(/no database/);
  });

  it("answers 500 rather than serving a payload that fails its own contract", async () => {
    // A methodology version that is not the frozen one. The loader would happily return it;
    // this gate is the reason it never reaches a reader.
    days = [{ seriesId: "uepi-ercot", operatingDate: "2026-09-23", value: "36.400000", methodologyVersion: "9.9.9" }];
    benchmarks = [{ seriesId: "uepi-ercot" }];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(500);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("answers 500 and closes the connection when the read fails", async () => {
    failWith = new Error("connection terminated unexpectedly");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(500);
    error.mockRestore();
  });

  it("closes the executor on the success path", async () => {
    await get();
    expect(ended).toHaveBeenCalledTimes(1);
  });
});
