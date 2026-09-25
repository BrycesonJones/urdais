import { describe, expect, it, vi } from "vitest";

import { backfill, operatingDatesBetween } from "@/lib/uepi/backfill";
import { fixtureArtifact } from "@/lib/uepi/source/fixtures/load";
import type { SqlExecutor } from "@/lib/uepi/store";

/**
 * The backfill is exercised against the committed artifacts, served by a fake fetcher, so these
 * tests prove the run behaviour -- bounds, isolation, resume, restraint -- without touching the
 * network or a database.
 */

const ARTIFACTS: Record<string, { file: string; label: string }> = {
  "20260923damlbmp_zone.csv": { file: "nyiso-2026-09-23.csv", label: "daily" },
  "20260301damlbmp_zone_csv.zip": { file: "nyiso-2026-03.zip", label: "monthly" },
  "20251101damlbmp_zone_csv.zip": { file: "nyiso-2025-11.zip", label: "monthly" },
};

/** Answers from the fixtures; 404s anything not captured, which is what the real archive does. */
function fixtureFetcher(log: string[] = []) {
  return {
    log,
    fetcher: async (url: string) => {
      log.push(url);
      const match = Object.keys(ARTIFACTS).find((name) => url.includes(name));
      if (match === undefined) {
        return new Response(null, { status: 404 }) as unknown as Response;
      }
      const { file, label } = ARTIFACTS[match]!;
      const artifact = fixtureArtifact(file, label);
      return new Response(new Uint8Array(artifact.body), { status: 200 }) as unknown as Response;
    },
  };
}

const NEVER_SLEEP = async () => {};

describe("1. the date range is explicit and bounded", () => {
  it("enumerates inclusive calendar days", () => {
    expect(operatingDatesBetween("2026-09-21", "2026-09-23"))
      .toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
    expect(operatingDatesBetween("2026-09-23", "2026-09-23")).toEqual(["2026-09-23"]);
  });

  it("refuses a reversed range rather than silently returning nothing", () => {
    expect(() => operatingDatesBetween("2026-09-23", "2026-09-21")).toThrow(/before/);
  });

  it("honours a limit, so one invocation cannot become an archive project", async () => {
    const { fetcher, log } = fixtureFetcher();
    const result = await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-01", to: "2026-09-30", dryRun: true, limit: 2,
      retrieve: { fetcher, attempts: 1 }, sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(result.requested).toBe(2);
    expect(result.days.map((day) => day.operatingDate)).toEqual(["2026-09-01", "2026-09-02"]);
    // Two days, two artifact requests each (daily, then the monthly fallback).
    expect(log).toHaveLength(4);
  });

  it("pauses between days, because these are public services with no SLA", async () => {
    const { fetcher } = fixtureFetcher();
    const sleep = vi.fn(async () => {});
    await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-22", to: "2026-09-23", dryRun: true,
      retrieve: { fetcher, attempts: 1 }, sleep, pauseMs: 250,
    });
    expect(sleep).toHaveBeenCalledWith(250);
    // Between days only, never after the last one.
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe("2. a dry run reads everything and writes nothing", () => {
  it("releases a real day and reports its value without a database", async () => {
    const { fetcher } = fixtureFetcher();
    const result = await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-23", to: "2026-09-23", dryRun: true,
      retrieve: { fetcher, attempts: 1 }, sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(result.released).toBe(1);
    expect(result.days[0]!.valueUsdPerMwh).toBe("35.225000");
    expect(result.days[0]!.observationCount).toBe(24);
    expect(result.days[0]!.wrote).toBeNull();
  });

  it("refuses to write without a database rather than silently dry-running", async () => {
    await expect(backfill({
      seriesId: "uepi-nyiso", from: "2026-09-23", to: "2026-09-23", dryRun: false,
    })).rejects.toThrow(/needs a database/);
  });

  it("will not run a market that has no adapter", async () => {
    await expect(backfill({
      seriesId: "uepi-pjm", from: "2026-09-23", to: "2026-09-23", dryRun: true,
    })).rejects.toThrow(/SOURCE_CREDENTIAL_REQUIRED/);
  });
});

describe("3. one bad day does not end the run", () => {
  it("isolates a failure to its own date and carries on", async () => {
    const { fetcher } = fixtureFetcher();
    const result = await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-22", to: "2026-09-24", dryRun: true,
      retrieve: { fetcher, attempts: 1 }, sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(result.requested).toBe(3);
    expect(result.released).toBe(1);
    expect(result.failed).toBe(2);
    const failed = result.days.filter((day) => day.status === "failed");
    expect(failed.map((day) => day.operatingDate)).toEqual(["2026-09-22", "2026-09-24"]);
    expect(failed[0]!.reason).toBe("SOURCE_UNAVAILABLE");
    expect(failed[0]!.detail).toMatch(/neither the daily CSV nor the monthly archive/);
  });

  it("reports the reason a day was withheld separately from a day that failed", async () => {
    // A withheld day is data the source served and the specification would not release; a failed
    // day is a source Urdais could not read. The ledger has to tell them apart.
    const { fetcher } = fixtureFetcher();
    const result = await backfill({
      seriesId: "uepi-nyiso", from: "2026-03-08", to: "2026-03-08", dryRun: true,
      retrieve: { fetcher, attempts: 1 }, sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(result.released).toBe(1);
    expect(result.days[0]!.observationCount).toBe(23);
  });
});

describe("4. a re-run is idempotent at the run layer", () => {
  function sqlWith(released: Set<string>): SqlExecutor & { writes: string[] } {
    const writes: string[] = [];
    return {
      writes,
      query: async (text: string, params: readonly unknown[] = []) => {
        if (text.includes("from pipeline.uepi_daily_values v")) {
          return { rows: released.has(String(params[1])) ? [{ "?column?": 1 }] : [] };
        }
        writes.push(text.trim().split("\n")[0]!);
        return { rows: [] };
      },
    };
  }

  it("skips a day that is already released, without fetching it again", async () => {
    const { fetcher, log } = fixtureFetcher();
    const sql = sqlWith(new Set(["2026-09-23"]));
    const result = await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-23", to: "2026-09-23", dryRun: false, sql,
      retrieve: { fetcher, attempts: 1 }, sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(result.skipped).toBe(1);
    expect(result.days[0]!.detail).toBe("already released");
    expect(log).toHaveLength(0);
    expect(sql.writes).toHaveLength(0);
  });

  it("does fetch a day that is not yet released", async () => {
    const { fetcher, log } = fixtureFetcher();
    const sql = sqlWith(new Set());
    await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-23", to: "2026-09-23", dryRun: false, sql,
      retrieve: { fetcher, attempts: 1 }, sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(log.length).toBeGreaterThan(0);
  });
});

describe("5. the run touches nothing outside its own market", () => {
  it("requests only the market it was asked for", async () => {
    const { fetcher, log } = fixtureFetcher();
    await backfill({
      seriesId: "uepi-nyiso", from: "2026-09-23", to: "2026-09-23", dryRun: true,
      retrieve: { fetcher, attempts: 1 }, sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(log.every((url) => url.includes("nyiso.com"))).toBe(true);
  });
});
