import { describe, expect, it, vi } from "vitest";

import { backfill } from "@/lib/uepi/backfill";
import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { calculateDailyValue } from "@/lib/uepi/calculate";
import { compareDecimal, absoluteDifferenceDecimal } from "@/lib/uepi/decimal";
import { ConnectionTerminatedError, FakeDatabase } from "@/lib/uepi/fake-database";
import { normalizeOperatingDay } from "@/lib/uepi/normalize";
import { operatingDayWindow } from "@/lib/uepi/operating-day";
import { evaluateRelease } from "@/lib/uepi/release";
import { nyisoAdapter } from "@/lib/uepi/source/adapters/nyiso";
import { fixtureArtifact, fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";
import { isConnectionFailure, storeOperatingDay } from "@/lib/uepi/store";

/**
 * The two defects a production backfill found, and the behaviour that replaces them.
 *
 * Both were discovered writing real history to UrdaisProd: nine batches of CAISO died when the
 * pooler culled an idle connection, and two NYISO days were withheld because a one-cent spread is
 * 0.020000000000003126 in binary floating point. Neither was visible in any local run.
 */

const NYISO = benchmarkFor("uepi-nyiso");

function dayInput(operatingDate = "2026-09-23") {
  const window = operatingDayWindow(NYISO, operatingDate);
  const parsed = nyisoAdapter.parse(operatingDate, fixtureArtifacts("nyiso-2026-09-23.csv", "daily"));
  const { hours } = normalizeOperatingDay(NYISO, window, parsed);
  return {
    adapter: nyisoAdapter, benchmark: NYISO, operatingDate,
    artifacts: [fixtureArtifact("nyiso-2026-09-23.csv", "daily")],
    parsed, hours,
    calculation: calculateDailyValue(NYISO, window, hours),
    qualityChecks: [], releaseKind: "backfill" as const, now: new Date("2026-09-25T00:00:00Z"),
  };
}

describe("1. a connection that dies between retrieval and persistence", () => {
  it("leaves nothing behind when it dies mid-write", async () => {
    const database = new FakeDatabase();
    database.failNext(/insert into pipeline.uepi_daily_values/i);
    await expect(storeOperatingDay(database.executor(), dayInput())).rejects.toThrow(/Connection terminated/);
    // The transaction went with the connection: no half-written day is visible to a reader.
    expect(database.current()).toEqual({ observations: 0, daily: 0, retrievals: 0, raw: 0 });
  });

  it("writes exactly one copy of the day when the caller reconnects and retries", async () => {
    const database = new FakeDatabase();
    database.failNext(/insert into pipeline.uepi_daily_values/i);
    const input = dayInput();
    await expect(storeOperatingDay(database.executor(), input)).rejects.toThrow();
    // A reconnection is a new client over the same data.
    const outcome = await storeOperatingDay(database.executor(), input);
    expect(outcome.observationsInserted).toBe(24);
    expect(outcome.observationsSuperseded).toBe(0);
    expect(outcome.dailyValue).toBe("inserted");
    expect(database.current()).toEqual({ observations: 24, daily: 1, retrievals: 1, raw: 24 });
  });

  it("writes nothing on a retry of a day that had already committed", async () => {
    // The other half of the same question: if the drop happened *after* the commit, the retry must
    // recognise the day rather than duplicate it.
    const database = new FakeDatabase();
    const input = dayInput();
    await storeOperatingDay(database.executor(), input);
    const again = await storeOperatingDay(database.executor(), input);
    expect(again.observationsInserted).toBe(0);
    expect(again.observationsUnchanged).toBe(24);
    expect(again.dailyValue).toBe("unchanged");
    expect(database.current()).toEqual({ observations: 24, daily: 1, retrievals: 1, raw: 24 });
  });

  it("recovers inside the backfill, one day retried rather than the batch lost", async () => {
    const database = new FakeDatabase();
    database.failNext(/insert into pipeline.uepi_daily_values/i);
    const reconnect = vi.fn(async () => database.executor());
    const result = await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-23", to: "2026-09-23", dryRun: false,
      sql: database.executor(), reconnect,
      retrieve: {
        attempts: 1,
        fetcher: async () => {
          const artifact = fixtureArtifact("nyiso-2026-09-23.csv", "daily");
          return new Response(new Uint8Array(artifact.body), { status: 200 }) as unknown as Response;
        },
      },
      sleep: async () => {}, pauseMs: 0,
    });
    expect(result.released).toBe(1);
    expect(result.failed).toBe(0);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(database.current().daily).toBe(1);
    expect(database.current().observations).toBe(24);
  });
});

describe("2. the retry is bounded and hides nothing", () => {
  it("gives up after its attempts and reports the failure", async () => {
    const database = new FakeDatabase();
    database.failNext(/insert into pipeline.uepi_daily_values/i, 99);
    const reconnect = vi.fn(async () => database.executor());
    const result = await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-23", to: "2026-09-23", dryRun: false,
      sql: database.executor(), reconnect, persistenceAttempts: 3,
      retrieve: {
        attempts: 1,
        fetcher: async () => {
          const artifact = fixtureArtifact("nyiso-2026-09-23.csv", "daily");
          return new Response(new Uint8Array(artifact.body), { status: 200 }) as unknown as Response;
        },
      },
      sleep: async () => {}, pauseMs: 0,
    });
    expect(result.released).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.days[0]!.reason).toBe("PERSISTENCE_FAILED");
    expect(result.days[0]!.detail).toMatch(/Connection terminated/);
    expect(reconnect).toHaveBeenCalledTimes(2);   // attempts - 1
    expect(database.current().daily).toBe(0);
  });

  it("does not retry a failure that is not the connection", async () => {
    // A constraint violation will fail again identically. Retrying it would turn a clear error
    // into a slow one and, worse, make a real refusal look intermittent.
    const database = new FakeDatabase();
    const violation = () => Object.assign(new Error("new row violates check constraint"), { code: "23514" });
    database.failNext(/insert into pipeline.uepi_daily_values/i, 99, violation);
    const reconnect = vi.fn(async () => database.executor());
    const result = await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-23", to: "2026-09-23", dryRun: false,
      sql: database.executor(), reconnect, persistenceAttempts: 3,
      retrieve: {
        attempts: 1,
        fetcher: async () => {
          const artifact = fixtureArtifact("nyiso-2026-09-23.csv", "daily");
          return new Response(new Uint8Array(artifact.body), { status: 200 }) as unknown as Response;
        },
      },
      sleep: async () => {}, pauseMs: 0,
    });
    expect(result.failed).toBe(1);
    expect(result.days[0]!.detail).toMatch(/check constraint/);
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("classifies connection failures by code and by message, and nothing else", () => {
    expect(isConnectionFailure(new ConnectionTerminatedError())).toBe(true);
    expect(isConnectionFailure({ code: "08006" })).toBe(true);
    expect(isConnectionFailure({ code: "57P01" })).toBe(true);
    expect(isConnectionFailure(new Error("socket hang up"))).toBe(true);
    expect(isConnectionFailure(new Error("ECONNRESET"))).toBe(true);
    expect(isConnectionFailure({ code: "23514" })).toBe(false);
    expect(isConnectionFailure(new Error("new row violates check constraint"))).toBe(false);
    expect(isConnectionFailure(new Error("a partial day was released"))).toBe(false);
  });
});

describe("3. the uniformity tolerance is decimal, not floating-point luck", () => {
  /** The exact pair from the production log: two cent-denominated prices a cent apart. */
  const CARRIER = "35.67";
  const CROSS_CHECK = "35.65";

  it("is the case that withheld two real production days", () => {
    // The measurement that refused them, reproduced.
    expect(Number(CARRIER) - Number(CROSS_CHECK)).toBe(0.020000000000003126);
    expect(Number(CARRIER) - Number(CROSS_CHECK) <= 0.02).toBe(false);
    // And the same measurement in exact decimal.
    expect(absoluteDifferenceDecimal(CARRIER, CROSS_CHECK)).toBe("0.02");
  });

  function decide(spread: string, tolerance = "0.02") {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const parsed = nyisoAdapter.parse("2026-09-23", fixtureArtifacts("nyiso-2026-09-23.csv", "daily"));
    const { hours } = normalizeOperatingDay(NYISO, window, parsed);
    return evaluateRelease({
      benchmark: NYISO, window, hours,
      crossChecks: [{ check: "system_component_uniformity", maxAbsoluteSpread: spread, tolerance,
        detail: "lambda at a second internal zone" }],
      specificationApproved: true, now: new Date("2026-09-25T00:00:00Z"), intent: "internal_release",
    });
  }

  it("releases a day whose spread is exactly at the tolerance", () => {
    const decision = decide("0.02");
    expect(decision.released).toBe(true);
  });

  it("releases the real pair that used to be refused", () => {
    expect(decide(absoluteDifferenceDecimal(CARRIER, CROSS_CHECK)).released).toBe(true);
  });

  it("still refuses a spread just over the tolerance", () => {
    const decision = decide("0.0201");
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("quality_check_failed");
  });

  it("refuses a spread that is over by the smallest representable amount", () => {
    const decision = decide("0.020000000000000001");
    expect(decision.released).toBe(false);
  });

  it("compares exactly, at any scale, without converting to a float", () => {
    expect(compareDecimal("0.02", "0.02")).toBe(0);
    expect(compareDecimal("0.0200", "0.02")).toBe(0);
    expect(compareDecimal("0.0201", "0.02")).toBe(1);
    expect(compareDecimal("0.0199", "0.02")).toBe(-1);
    expect(compareDecimal("-0.02", "0.02")).toBe(-1);
    // A value floating point cannot represent, compared correctly.
    expect(compareDecimal("0.1", "0.3")).toBe(-1);
    expect(compareDecimal("0.30000000000000004", "0.3")).toBe(1);
    // 0.1 + 0.2 > 0.3 in a float world; not here.
    expect(compareDecimal(absoluteDifferenceDecimal("0.3", "0.1"), "0.2")).toBe(0);
  });

  it("gives the same answer whatever the scale of the inputs", () => {
    for (const [a, b] of [["35.67", "35.65"], ["35.670", "35.650"], ["135.67", "135.65"]] as const) {
      expect(absoluteDifferenceDecimal(a, b), `${a}-${b}`).toMatch(/^0\.020*$/);
      expect(compareDecimal(absoluteDifferenceDecimal(a, b), "0.02"), `${a}-${b}`).toBe(0);
    }
  });
});
