/**
 * Deterministic historical ingestion for one market and one date range.
 *
 * The shape follows from what goes wrong with backfills. A year of days is a long enough run that
 * something will fail in the middle of it, so: one market at a time, one day at a time, failures
 * isolated to the day that failed, a polite pause between requests, an optional cap on how many
 * days a single invocation will touch, and a re-run that writes nothing for days already stored.
 * Nothing here is a cron, and nothing here decides whether a value may be displayed.
 *
 * Dry run is the default posture of the caller, not a special mode of this module: it still
 * retrieves, parses, normalizes and calculates, because those are the steps that prove a source
 * is readable. It simply does not write.
 */

import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { normalizeOperatingDay } from "@/lib/uepi/normalize";
import { operatingDayWindow } from "@/lib/uepi/operating-day";
import { evaluateRelease, type ReleaseBlockReason } from "@/lib/uepi/release";
import { retrieveArtifacts, type RetrieveOptions } from "@/lib/uepi/source/retrieve";
import { adapterFor } from "@/lib/uepi/source/registry";
import { UepiSourceError, type SourceFailureReason } from "@/lib/uepi/source/types";
import { storeOperatingDay, type SqlExecutor } from "@/lib/uepi/store";
import type { ReleaseKind, UepiSeriesId } from "@/lib/uepi/types";

export type DayOutcome = {
  operatingDate: string;
  status: "released" | "withheld" | "failed" | "skipped";
  /** The daily value, where one was calculated. Present on a dry run too. */
  valueUsdPerMwh: string | null;
  observationCount: number | null;
  expectedObservationCount: number;
  /** Why the day was not released, or why it failed. */
  reason: ReleaseBlockReason | SourceFailureReason | null;
  detail: string | null;
  warnings: string[];
  /** Null on a dry run, because nothing was written. */
  wrote: { observationsInserted: number; observationsSuperseded: number; dailyValue: string } | null;
};

export type BackfillResult = {
  seriesId: UepiSeriesId;
  from: string;
  to: string;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  requested: number;
  released: number;
  withheld: number;
  failed: number;
  skipped: number;
  days: DayOutcome[];
};

export type BackfillOptions = {
  seriesId: UepiSeriesId;
  from: string;
  to: string;
  /** False writes to the database. The caller decides; this module has no opinion about targets. */
  dryRun: boolean;
  /** Most operating days this invocation will touch, so one run cannot become an archive project. */
  limit?: number;
  /** Milliseconds between source requests. Restraint against a public service with no SLA. */
  pauseMs?: number;
  /** Required unless `dryRun`. */
  sql?: SqlExecutor;
  releaseKind?: ReleaseKind;
  retrieve?: RetrieveOptions;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Called after each day, so a long run is observable while it is running. */
  onDay?: (outcome: DayOutcome) => void;
};

const DAY_MS = 86_400_000;

export function operatingDatesBetween(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new Error(`'${from}'..'${to}' is not a date range`);
  if (end < start) throw new Error(`${to} is before ${from}`);
  const dates: string[] = [];
  for (let ms = start; ms <= end; ms += DAY_MS) dates.push(new Date(ms).toISOString().slice(0, 10));
  return dates;
}

/** Whether a day is already stored with a released value, so a re-run can skip its network call. */
async function alreadyReleased(sql: SqlExecutor, seriesId: string, operatingDate: string): Promise<boolean> {
  const result = await sql.query(
    `select 1 from pipeline.uepi_daily_values v
       join reference.power_price_benchmarks b on b.id = v.benchmark_id
      where b.slug = $1 and v.operating_date = $2 and v.superseded_by_id is null`,
    [seriesId, operatingDate]);
  return result.rows.length > 0;
}

export async function backfill(options: BackfillOptions): Promise<BackfillResult> {
  const { seriesId, from, to, dryRun } = options;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pauseMs = options.pauseMs ?? 1_000;
  const releaseKind: ReleaseKind = options.releaseKind ?? "backfill";

  if (!dryRun && options.sql === undefined) {
    throw new Error("a writing backfill needs a database; pass sql, or run with dryRun");
  }

  const adapter = adapterFor(seriesId);
  const benchmark = benchmarkFor(seriesId);
  const dates = operatingDatesBetween(from, to);
  const planned = options.limit === undefined ? dates : dates.slice(0, options.limit);

  const startedAt = now().toISOString();
  const days: DayOutcome[] = [];

  for (const [index, operatingDate] of planned.entries()) {
    const window = operatingDayWindow(benchmark, operatingDate);
    let outcome: DayOutcome;

    try {
      // Resume: a day already released is not re-fetched. `--force` is deliberately absent; a
      // deliberate re-ingestion is a narrower range, not a flag that re-reads a year.
      if (!dryRun && options.sql !== undefined && await alreadyReleased(options.sql, seriesId, operatingDate)) {
        outcome = {
          operatingDate, status: "skipped", valueUsdPerMwh: null, observationCount: null,
          expectedObservationCount: window.expectedIntervalCount,
          reason: null, detail: "already released", warnings: [], wrote: null,
        };
        days.push(outcome);
        options.onDay?.(outcome);
        continue;
      }

      const artifacts = await retrieveArtifacts(seriesId, adapter.artifactsFor(operatingDate), options.retrieve);
      const parsed = adapter.parse(operatingDate, artifacts);
      const { hours, crossChecks, warnings } = normalizeOperatingDay(benchmark, window, parsed);
      const decision = evaluateRelease({
        benchmark, window, hours, crossChecks,
        specificationApproved: true,
        now: now(),
        intent: "internal_release",
      });

      if (!decision.released) {
        outcome = {
          operatingDate, status: "withheld", valueUsdPerMwh: null,
          observationCount: hours.length, expectedObservationCount: window.expectedIntervalCount,
          reason: decision.reason, detail: decision.detail, warnings, wrote: null,
        };
      } else {
        const calculation = decision.calculation;
        let wrote: DayOutcome["wrote"] = null;
        if (!dryRun && options.sql !== undefined) {
          const stored = await storeOperatingDay(options.sql, {
            adapter, benchmark, operatingDate,
            artifacts: [...artifacts.values()],
            parsed, hours, calculation, qualityChecks: decision.checks,
            releaseKind, now: now(),
          });
          wrote = {
            observationsInserted: stored.observationsInserted,
            observationsSuperseded: stored.observationsSuperseded,
            dailyValue: stored.dailyValue,
          };
        }
        outcome = {
          operatingDate, status: "released", valueUsdPerMwh: calculation.valueUsdPerMwh,
          observationCount: calculation.observationCount,
          expectedObservationCount: window.expectedIntervalCount,
          reason: null, detail: null, warnings, wrote,
        };
      }
    } catch (error) {
      // Isolated to this day. A 404 in the middle of a year does not end the run.
      outcome = {
        operatingDate, status: "failed", valueUsdPerMwh: null, observationCount: null,
        expectedObservationCount: window.expectedIntervalCount,
        // A source that could not be read and a write that failed are different operational
        // events, and an operator reading the ledger has to be able to tell which happened.
        reason: error instanceof UepiSourceError ? error.reason : "PERSISTENCE_FAILED",
        detail: error instanceof Error ? error.message : String(error),
        warnings: [], wrote: null,
      };
    }

    days.push(outcome);
    options.onDay?.(outcome);
    if (index < planned.length - 1 && pauseMs > 0) await sleep(pauseMs);
  }

  return {
    seriesId, from, to, dryRun,
    startedAt, completedAt: now().toISOString(),
    requested: planned.length,
    released: days.filter((day) => day.status === "released").length,
    withheld: days.filter((day) => day.status === "withheld").length,
    failed: days.filter((day) => day.status === "failed").length,
    skipped: days.filter((day) => day.status === "skipped").length,
    days,
  };
}
