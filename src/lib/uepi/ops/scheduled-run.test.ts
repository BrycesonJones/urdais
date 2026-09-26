/**
 * The daily orchestration.
 *
 * The pipeline itself is tested by `backfill.test.ts` and the adapter suites; what is tested
 * here is the layer above it -- which days each market is asked for, that one market's failure
 * cannot take the other five with it, and that a morning with nothing new is reported as the
 * ordinary event it is rather than as an outage.
 */

import { describe, expect, it, vi } from "vitest";

import { runScheduledUepi, type ScheduledRunOptions } from "@/lib/uepi/ops/scheduled-run";
import { IMPLEMENTED_SERIES_IDS, UNIMPLEMENTED_SERIES_IDS } from "@/lib/uepi/source/registry";
import { TRAILING_REREAD_DAYS } from "@/lib/uepi/methodology";
import type { BackfillOptions, BackfillResult, DayOutcome } from "@/lib/uepi/backfill";
import type { SqlExecutor } from "@/lib/uepi/store";

const SQL = { query: async () => ({ rows: [] }) } as SqlExecutor;
const RUN_INSTANT = new Date("2026-09-26T10:45:00Z");

function day(operatingDate: string, status: DayOutcome["status"], reason: DayOutcome["reason"] = null): DayOutcome {
  return {
    operatingDate,
    status,
    valueUsdPerMwh: status === "released" ? "36.400000" : null,
    observationCount: status === "released" ? 24 : null,
    expectedObservationCount: 24,
    reason,
    detail: null,
    warnings: [],
    wrote: status === "released" ? { observationsInserted: 24, observationsSuperseded: 0, dailyValue: "36.400000" } : null,
  };
}

function result(options: BackfillOptions, days: DayOutcome[]): BackfillResult {
  return {
    seriesId: options.seriesId,
    from: options.from,
    to: options.to,
    dryRun: false,
    startedAt: RUN_INSTANT.toISOString(),
    completedAt: RUN_INSTANT.toISOString(),
    requested: days.length,
    released: days.filter((d) => d.status === "released").length,
    withheld: days.filter((d) => d.status === "withheld").length,
    failed: days.filter((d) => d.status === "failed").length,
    skipped: days.filter((d) => d.status === "skipped").length,
    days,
  };
}

/** A window of already-stored days plus whatever the last day did. */
function typicalDays(options: BackfillOptions, last: DayOutcome): DayOutcome[] {
  const stored = Array.from({ length: TRAILING_REREAD_DAYS }, (_, i) => {
    const date = new Date(Date.parse(`${options.from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    return day(date, "skipped");
  });
  return [...stored, last];
}

function run(
  perSeries: (options: BackfillOptions) => BackfillResult | Promise<BackfillResult>,
  overrides: Partial<ScheduledRunOptions> = {},
) {
  return runScheduledUepi({
    sql: SQL,
    now: () => RUN_INSTANT,
    runSeries: async (options) => perSeries(options),
    ...overrides,
  });
}

describe("which markets run", () => {
  it("attempts every market that has an adapter", async () => {
    const attempted: string[] = [];
    await run((options) => {
      attempted.push(options.seriesId);
      return result(options, typicalDays(options, day(options.to, "released")));
    });
    expect(attempted).toEqual([...IMPLEMENTED_SERIES_IDS]);
    expect(attempted).toHaveLength(6);
  });

  it("excludes PJM, and excludes it because it has no adapter rather than by name", async () => {
    const attempted: string[] = [];
    await run((options) => {
      attempted.push(options.seriesId);
      return result(options, typicalDays(options, day(options.to, "released")));
    });
    expect(UNIMPLEMENTED_SERIES_IDS).toContain("uepi-pjm");
    expect(attempted).not.toContain("uepi-pjm");
  });

  it("covers both the published and the internal-only markets", async () => {
    const attempted: string[] = [];
    await run((options) => {
      attempted.push(options.seriesId);
      return result(options, typicalDays(options, day(options.to, "released")));
    });
    for (const seriesId of ["uepi-ercot", "uepi-caiso", "uepi-nyiso", "uepi-miso", "uepi-spp", "uepi-iso-ne"]) {
      expect(attempted, seriesId).toContain(seriesId);
    }
  });
});

describe("which days each market is asked for", () => {
  it("asks for the trailing re-read window ending at the market's own local day", async () => {
    const windows = new Map<string, { from: string; to: string }>();
    await run((options) => {
      windows.set(options.seriesId, { from: options.from, to: options.to });
      return result(options, typicalDays(options, day(options.to, "released")));
    });
    // 10:45 UTC is the same calendar date in every one of these zones, which is why §G.6 chose
    // a morning-UTC slot: one run can address day `d` for all six markets.
    expect(windows.get("uepi-ercot")).toEqual({ from: "2026-09-19", to: "2026-09-26" });
    expect(windows.get("uepi-caiso")).toEqual({ from: "2026-09-19", to: "2026-09-26" });
  });

  it("does not assume the newest day exists: it asks, and accepts a refusal for that day alone", async () => {
    const outcome = await run((options) =>
      result(options, typicalDays(options, day(options.to, "failed", "SOURCE_UNAVAILABLE"))),
    );
    const ercot = outcome.markets.find((m) => m.seriesId === "uepi-ercot")!;
    expect(ercot.released).toBe(0);
    expect(ercot.status).toBe("source_failed");
    // The earlier days in the window were still evaluated; nothing was invented for the missing one.
    expect(ercot.skipped).toBe(TRAILING_REREAD_DAYS);
  });

  it("marks scheduled points as scheduled, so the ledger distinguishes them from a backfill", async () => {
    const kinds: (string | undefined)[] = [];
    await run((options) => {
      kinds.push(options.releaseKind);
      return result(options, typicalDays(options, day(options.to, "released")));
    });
    expect(new Set(kinds)).toEqual(new Set(["scheduled"]));
  });

  it("never runs dry: a scheduled run writes", async () => {
    const dry: boolean[] = [];
    await run((options) => {
      dry.push(options.dryRun);
      return result(options, typicalDays(options, day(options.to, "released")));
    });
    expect(dry.every((value) => value === false)).toBe(true);
  });
});

describe("a morning with nothing new", () => {
  it("is reported as succeeded, not as a failure", async () => {
    // Every day in the window already stored. This is what most mornings look like before the
    // source publishes, and treating it as an error would train an operator to ignore alerts.
    const outcome = await run((options) => result(options, typicalDays(options, day(options.to, "skipped"))));
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.released).toBe(0);
    expect(outcome.markets.every((market) => market.status === "no_new_day")).toBe(true);
  });

  it("writes nothing and claims no advance", async () => {
    const outcome = await run((options) => result(options, typicalDays(options, day(options.to, "skipped"))));
    for (const market of outcome.markets) {
      expect(market.advancedTo, market.seriesId).toBeNull();
      expect(market.released, market.seriesId).toBe(0);
    }
  });

  it("is safe to run twice: the second run sees the same skips and releases nothing again", async () => {
    const perSeries = (options: BackfillOptions) => result(options, typicalDays(options, day(options.to, "skipped")));
    const first = await run(perSeries);
    const second = await run(perSeries);
    expect(first.released).toBe(0);
    expect(second.released).toBe(0);
    expect(second.outcome).toBe("succeeded");
  });
});

describe("failure isolation", () => {
  it("lets five markets advance when the sixth cannot reach its source", async () => {
    const outcome = await run((options) =>
      options.seriesId === "uepi-caiso"
        ? result(options, typicalDays(options, day(options.to, "failed", "SOURCE_UNAVAILABLE")))
        : result(options, typicalDays(options, day(options.to, "released"))),
    );
    expect(outcome.outcome).toBe("partial");
    expect(outcome.released).toBe(5);
    expect(outcome.markets.find((m) => m.seriesId === "uepi-caiso")!.status).toBe("source_failed");
    expect(outcome.markets.filter((m) => m.status === "advanced")).toHaveLength(5);
  });

  it("isolates an authentication failure to its own market", async () => {
    // ERCOT and ISO-NE are the authenticated markets; a missing credential must not silence
    // the four that need none.
    const outcome = await run((options) =>
      options.seriesId === "uepi-ercot"
        ? result(options, typicalDays(options, day(options.to, "failed", "AUTHENTICATION_REQUIRED")))
        : result(options, typicalDays(options, day(options.to, "released"))),
    );
    expect(outcome.markets.find((m) => m.seriesId === "uepi-ercot")!.status).toBe("source_failed");
    expect(outcome.released).toBe(5);
  });

  it("survives a market whose pipeline throws rather than returning an outcome", async () => {
    const outcome = await run((options) => {
      if (options.seriesId === "uepi-spp") throw new Error("adapter exploded");
      return result(options, typicalDays(options, day(options.to, "released")));
    });
    const spp = outcome.markets.find((m) => m.seriesId === "uepi-spp")!;
    expect(spp.status).toBe("source_failed");
    expect(spp.detail).toContain("adapter exploded");
    expect(outcome.markets).toHaveLength(6);
    expect(outcome.released).toBe(5);
  });

  it("distinguishes a database refusal from a source refusal", async () => {
    const outcome = await run((options) =>
      options.seriesId === "uepi-miso"
        ? result(options, typicalDays(options, day(options.to, "failed", "PERSISTENCE_FAILED")))
        : result(options, typicalDays(options, day(options.to, "released"))),
    );
    expect(outcome.markets.find((m) => m.seriesId === "uepi-miso")!.status).toBe("persistence_failed");
  });

  it("reports failed only when every market failed", async () => {
    const outcome = await run((options) =>
      result(options, typicalDays(options, day(options.to, "failed", "SOURCE_UNAVAILABLE"))),
    );
    expect(outcome.outcome).toBe("failed");
  });

  it("does not swallow a failure into a clean result", async () => {
    const outcome = await run((options) =>
      options.seriesId === "uepi-nyiso"
        ? result(options, typicalDays(options, day(options.to, "failed", "SOURCE_UNAVAILABLE")))
        : result(options, typicalDays(options, day(options.to, "released"))),
    );
    expect(outcome.outcome).not.toBe("succeeded");
    expect(outcome.markets.find((m) => m.seriesId === "uepi-nyiso")!.notable).toContainEqual({
      operatingDate: "2026-09-26",
      status: "failed",
      reason: "SOURCE_UNAVAILABLE",
    });
  });
});

describe("what a run reports", () => {
  it("names the day each market advanced to", async () => {
    const outcome = await run((options) => result(options, typicalDays(options, day(options.to, "released"))));
    for (const market of outcome.markets) {
      expect(market.advancedTo, market.seriesId).toBe("2026-09-26");
      expect(market.status, market.seriesId).toBe("advanced");
    }
  });

  it("separates a withheld day from a failed one", async () => {
    // A day held back by a quality check is not an error: MISO 2026-05-19 is the standing
    // example, and the run must say "withheld", not "failed".
    const outcome = await run((options) =>
      result(options, typicalDays(options, day(options.to, "withheld", "quality_check_failed"))),
    );
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.markets.every((market) => market.status === "withheld")).toBe(true);
    expect(outcome.withheld).toBe(6);
  });

  it("keeps a healthy run's report small by dropping the skips", async () => {
    const outcome = await run((options) => result(options, typicalDays(options, day(options.to, "released"))));
    const ercot = outcome.markets.find((m) => m.seriesId === "uepi-ercot")!;
    expect(ercot.skipped).toBe(TRAILING_REREAD_DAYS);
    expect(ercot.notable).toHaveLength(1);
  });

  it("passes the reconnect seam through, so a dropped pooled connection costs one day", async () => {
    const reconnect = vi.fn(async () => SQL);
    const seen: (BackfillOptions["reconnect"] | undefined)[] = [];
    await run(
      (options) => {
        seen.push(options.reconnect);
        return result(options, typicalDays(options, day(options.to, "released")));
      },
      { reconnect },
    );
    expect(seen.every((candidate) => candidate === reconnect)).toBe(true);
  });
});
