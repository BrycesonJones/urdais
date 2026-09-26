/**
 * The per-series UEPI API contract.
 *
 * The 404 on a withheld series is the assertion to read first. `uepi-miso` names a real series
 * with 396 released daily values in production, and the response must be indistinguishable from
 * the one a typo gets -- otherwise the API confirms the existence of data the publication gate
 * exists to withhold.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_BENCHMARKS, consecutiveDays, fakeReadDatabase } from "@/lib/uepi/read/read-fixtures";
import type { FakeBenchmarkRow, FakeDayRow } from "@/lib/uepi/read/read-fixtures";
import { changeReasons } from "@/lib/uepi/read/read-model";

const ended = vi.fn();
let benchmarks: FakeBenchmarkRow[] = ALL_BENCHMARKS;
let days: FakeDayRow[] = [];

vi.mock("@/lib/tokens/read/database", () => ({
  createTokenSqlExecutor: async () => ({ ...fakeReadDatabase(benchmarks, days), end: ended }),
}));

/** Four hundred consecutive days, so every horizon is available. */
function year(seriesId: FakeDayRow["seriesId"], lastDate: string, value = "40.000000"): FakeDayRow[] {
  const end = new Date(`${lastDate}T00:00:00Z`).getTime();
  const first = new Date(end - 399 * 86_400_000).toISOString().slice(0, 10);
  return consecutiveDays(seriesId, first, Array.from({ length: 400 }, () => value));
}

const ORIGINAL_URL = process.env.DATABASE_URL;

beforeEach(() => {
  benchmarks = ALL_BENCHMARKS;
  days = [
    ...year("uepi-ercot", "2026-09-23"),
    ...consecutiveDays("uepi-miso", "2026-09-21", ["33.100000", "34.200000", "34.900000"]),
  ];
  ended.mockClear();
  process.env.DATABASE_URL = "postgres://fake/urdais";
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  vi.resetModules();
});

async function get(seriesId: string, query = "") {
  const { GET } = await import("@/app/api/uepi/[seriesId]/route");
  return GET(new Request(`https://urdais.test/api/uepi/${seriesId}${query}`), {
    params: Promise.resolve({ seriesId }),
  });
}

describe("GET /api/uepi/[seriesId]", () => {
  it("serves a publishable series with its history and per-horizon changes", async () => {
    const response = await get("uepi-ercot");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.seriesId).toBe("uepi-ercot");
    expect(body.points).toHaveLength(400);
    expect(body.range).toBe("ALL");
    expect(body.rangeChanges.map((entry: { range: string }) => entry.range)).toEqual([
      "1D", "1W", "1M", "3M", "6M", "1Y",
    ]);
    for (const entry of body.rangeChanges) expect(changeReasons(entry.range, entry.change)).toEqual([]);
  });

  it("answers 404 for a withheld series exactly as for an unknown one", async () => {
    const withheld = await get("uepi-miso");
    const unknown = await get("uepi-atlantis");
    expect(withheld.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await withheld.json()).toEqual(await unknown.json());
  });

  it("lists only publishable ids as the alternatives, so the 404 leaks nothing", async () => {
    const body = await (await get("uepi-miso")).json();
    expect(body.available).toEqual(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]);
    expect(JSON.stringify(body)).not.toContain("miso");
  });

  it("answers 404 for a retired demo instrument id", async () => {
    expect((await get("power-ercot")).status).toBe(404);
  });

  it("narrows the points to the requested window without narrowing the horizons", async () => {
    const body = await (await get("uepi-ercot", "?range=1M")).json();
    expect(body.range).toBe("1M");
    expect(body.points.length).toBeLessThan(40);
    // A 1Y change computed from a 1M slice would be a 1M change wearing a 1Y label.
    expect(body.rangeChanges.find((entry: { range: string }) => entry.range === "1Y").change.basis)
      .not.toBe("unavailable");
    // Latest and the day-over-day change describe the whole series, not the window.
    expect(body.latest.operatingDate).toBe("2026-09-23");
  });

  it("rejects a range it does not offer rather than quietly serving another", async () => {
    const response = await get("uepi-ercot", "?range=5Y");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("unknown_range");
  });

  it("withholds the percentage and keeps the amount on a negative-price horizon", async () => {
    days = [
      ...consecutiveDays("uepi-ercot", "2026-04-01", Array.from({ length: 10 }, () => "-2.000000")),
      { seriesId: "uepi-ercot", operatingDate: "2026-04-11", value: "-0.108300" },
    ];
    const body = await (await get("uepi-ercot")).json();
    const week = body.rangeChanges.find((entry: { range: string }) => entry.range === "1W").change;
    expect(week.basis).toBe("absolute");
    expect(week.percentChange).toBeNull();
    expect(week.reason).toBe("base_negative");
    expect(week.direction).toBe("up");
  });

  it("answers 503 when no database is configured, which is not the same as a 500", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.URDAIS_DATABASE_URL;
    const response = await get("uepi-ercot");
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("unavailable");
  });

  it("closes the executor on every path that opened one", async () => {
    await get("uepi-ercot");
    expect(ended).toHaveBeenCalledTimes(1);
    await get("uepi-miso");
    expect(ended).toHaveBeenCalledTimes(2);
  });
});
