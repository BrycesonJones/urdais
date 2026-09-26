/**
 * The daily UEPI run.
 *
 * This is an **orchestrator, not a second ingestion path**. Every market goes through the same
 * `backfill()` the operator CLI uses, which means the same adapters, the same credentials, the
 * same normalization, the same release validator, the same exact-decimal arithmetic, the same
 * supersession semantics, the same connection-retry behaviour and the same content-keyed
 * idempotence. A scheduler with its own ingestion logic is a scheduler that can release a value
 * the reviewed path would have withheld.
 *
 * What this module adds is the three things a scheduler needs and the backfill has no opinion
 * about: which days to ask for, how to keep one market's failure away from the other five, and
 * how to write down what happened.
 *
 * ## Which days
 *
 * Each market is asked for the trailing window `d-7 … d`, where `d` is that market's **own local
 * operating date** and 7 is the specification's `TRAILING_REREAD_DAYS`. Not `today - 1`: a
 * day-ahead auction for day `d` clears during `d-1`, the six markets sit in four timezones, and
 * §B.2 records the publication lag of five of them as UNRESOLVED. Asking for a window and
 * letting the pipeline decide what it can actually release is the honest form of "the latest
 * complete authoritative operating day", because it makes no assumption about which day that is.
 *
 * The window is cheap. `backfill` checks whether a day is already released **before** it fetches
 * and before it paces, so a day already stored costs one query and no network call. In the
 * steady state a run performs roughly one retrieval per market; the other seven days are skips.
 *
 * The window also does the work §G.4 asks for: a day that previously failed was never released,
 * so it is retried on every run while it stays inside the window, and released the moment it
 * becomes complete.
 *
 * What the window does **not** do is re-read days that were already released, to catch a source
 * revising them (§C.11). `backfill` skips those by construction and has no re-read flag, and
 * re-fetching 42 days every morning would not survive CAISO's OASIS pacing inside a serverless
 * budget. Revision re-reads remain an operator-triggered backfill over a named range, which
 * §G.4 explicitly provides for. This is a known gap, recorded here rather than papered over.
 */

import { backfill, type BackfillResult, type DayOutcome } from "@/lib/uepi/backfill";
import { localDateOf } from "@/lib/uepi/operating-day";
import { TRAILING_REREAD_DAYS } from "@/lib/uepi/methodology";
import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";
import { IMPLEMENTED_SERIES_IDS } from "@/lib/uepi/source/registry";
import type { SqlExecutor } from "@/lib/uepi/store";
import type { UepiSeriesId } from "@/lib/uepi/types";

const DAY_MS = 86_400_000;

/**
 * Why a market produced nothing, where it produced nothing.
 *
 * `no_new_day` is the ordinary case and is **not** a failure: the source has published nothing
 * newer and the pipeline correctly wrote nothing. Conflating it with an error would make a
 * healthy quiet morning look like an outage, and -- worse -- would train an operator to ignore
 * the alert that fires every day.
 */
export type MarketRunStatus =
  /** At least one operating day was released. */
  | "advanced"
  /** The run completed and there was nothing new to release. */
  | "no_new_day"
  /** Days were attempted and every one was withheld by a release gate. */
  | "withheld"
  /** The source could not be reached, parsed, or authenticated. */
  | "source_failed"
  /** The database refused or dropped the write. */
  | "persistence_failed";

export type MarketRunResult = {
  seriesId: UepiSeriesId;
  market: string;
  status: MarketRunStatus;
  /** The market's own local operating date this run was evaluated against. */
  operatingDateLocal: string;
  requestedFrom: string;
  requestedTo: string;
  released: number;
  withheld: number;
  failed: number;
  skipped: number;
  /** The newest operating day this run released, where it released any. */
  advancedTo: string | null;
  /** Every day that did not simply skip, so a quiet run stays small and a bad one stays legible. */
  notable: readonly { operatingDate: string; status: DayOutcome["status"]; reason: string | null }[];
  detail: string | null;
};

export type ScheduledRunResult = {
  trigger: "scheduled" | "operator";
  startedAt: string;
  completedAt: string;
  /** `succeeded` when no market errored, `partial` when some did, `failed` when all did. */
  outcome: "succeeded" | "partial" | "failed";
  markets: readonly MarketRunResult[];
  released: number;
  withheld: number;
  failed: number;
  skipped: number;
};

export type ScheduledRunOptions = {
  sql: SqlExecutor;
  trigger?: "scheduled" | "operator";
  now?: () => Date;
  /** Reconnect after a dropped pooled connection, passed through to the pipeline. */
  reconnect?: () => Promise<SqlExecutor>;
  /** Milliseconds between source requests, passed through. Restraint against a public service. */
  pauseMs?: number;
  /** Which markets to run. Defaults to every market with an adapter. */
  seriesIds?: readonly UepiSeriesId[];
  /** Days of trailing window. Defaults to the specification's re-read window. */
  trailingDays?: number;
  /** Seam for tests; production always uses the real pipeline. */
  runSeries?: typeof backfill;
  onMarket?: (result: MarketRunResult) => void;
};

/** Failure reasons that mean the database, not the source, refused. */
function isPersistenceFailure(outcome: DayOutcome): boolean {
  return outcome.status === "failed" && outcome.reason === "PERSISTENCE_FAILED";
}

function summarise(seriesId: UepiSeriesId, result: BackfillResult, operatingDateLocal: string): MarketRunResult {
  const released = result.days.filter((day) => day.status === "released");
  const failures = result.days.filter((day) => day.status === "failed");
  const status: MarketRunStatus =
    released.length > 0
      ? "advanced"
      : failures.some(isPersistenceFailure)
        ? "persistence_failed"
        : failures.length > 0
          ? "source_failed"
          : result.withheld > 0
            ? "withheld"
            : "no_new_day";
  return {
    seriesId,
    market: UEPI_BENCHMARKS[seriesId].market,
    status,
    operatingDateLocal,
    requestedFrom: result.from,
    requestedTo: result.to,
    released: result.released,
    withheld: result.withheld,
    failed: result.failed,
    skipped: result.skipped,
    advancedTo: released.length === 0 ? null : released[released.length - 1]!.operatingDate,
    // Skips are the bulk of a healthy run and carry no information; everything else is kept.
    notable: result.days
      .filter((day) => day.status !== "skipped")
      .map((day) => ({ operatingDate: day.operatingDate, status: day.status, reason: day.reason })),
    detail: null,
  };
}

/**
 * Run every ingestible market, once.
 *
 * Sequential, deliberately. Six markets fanned out concurrently would put six simultaneous
 * request streams against public ISO/RTO endpoints that have no SLA and have already answered
 * HTTP 429 in this project, and would share one pooled connection between six writers.
 *
 * Each market is isolated: a thrown adapter, a dead source and a refused write are all caught
 * and recorded against that market alone, and the loop continues. One market cannot stop the
 * other five from advancing.
 */
export async function runScheduledUepi(options: ScheduledRunOptions): Promise<ScheduledRunResult> {
  const now = options.now ?? (() => new Date());
  const trigger = options.trigger ?? "scheduled";
  const seriesIds = options.seriesIds ?? IMPLEMENTED_SERIES_IDS;
  const trailingDays = options.trailingDays ?? TRAILING_REREAD_DAYS;
  const runSeries = options.runSeries ?? backfill;
  const startedAt = now().toISOString();
  const markets: MarketRunResult[] = [];

  for (const seriesId of seriesIds) {
    const benchmark = UEPI_BENCHMARKS[seriesId];
    // Each market against its own clock. One UTC date would ask CAISO for a day that has not
    // begun in California, and would ask it seven hours before MISO's day is even over.
    const operatingDateLocal = localDateOf(now().toISOString(), benchmark.operatingTimezone);
    const from = new Date(Date.parse(`${operatingDateLocal}T00:00:00Z`) - trailingDays * DAY_MS)
      .toISOString()
      .slice(0, 10);

    let result: MarketRunResult;
    try {
      result = summarise(
        seriesId,
        await runSeries({
          seriesId,
          from,
          to: operatingDateLocal,
          dryRun: false,
          sql: options.sql,
          reconnect: options.reconnect,
          pauseMs: options.pauseMs,
          // §G.4: a scheduled run's points are marked as such, so the ledger shows which path
          // produced a value and an operator backfill stays distinguishable from the cadence.
          releaseKind: "scheduled",
          now,
        }),
        operatingDateLocal,
      );
    } catch (error) {
      // The pipeline throws only for conditions it cannot attribute to one day -- a missing
      // credential, an unusable adapter. The market is recorded as failed and the loop goes on.
      result = {
        seriesId,
        market: benchmark.market,
        status: "source_failed",
        operatingDateLocal,
        requestedFrom: from,
        requestedTo: operatingDateLocal,
        released: 0,
        withheld: 0,
        failed: 0,
        skipped: 0,
        advancedTo: null,
        notable: [],
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }
    markets.push(result);
    options.onMarket?.(result);
  }

  const errored = markets.filter(
    (market) => market.status === "source_failed" || market.status === "persistence_failed",
  );
  return {
    trigger,
    startedAt,
    completedAt: now().toISOString(),
    // A market with nothing new is not an error, so a quiet morning still reports `succeeded`.
    outcome:
      errored.length === 0 ? "succeeded" : errored.length === markets.length ? "failed" : "partial",
    markets,
    released: markets.reduce((total, market) => total + market.released, 0),
    withheld: markets.reduce((total, market) => total + market.withheld, 0),
    failed: markets.reduce((total, market) => total + market.failed, 0),
    skipped: markets.reduce((total, market) => total + market.skipped, 0),
  };
}
