/**
 * Reading and writing UEPI's operational state.
 *
 * Two queries and one insert, over tables that already exist. `pipeline.uepi_ingestion_runs` was
 * created by the UEPI-1 foundation for exactly this purpose -- its own comment says it is "what
 * the freshness monitor and the unattended-rollover closeout gate read" -- and until now nothing
 * wrote to it, because the thirteen-month activation was driven by an operator at a terminal.
 *
 * The separation between the two halves is the point of the whole phase. The run ledger records
 * what the scheduler *did*. Freshness is computed from the released daily values -- what the
 * product actually *has*. Nothing in the freshness path reads the ledger, so a run that
 * succeeded while a source published nothing cannot make a stale market look fresh.
 */

import {
  evaluateUepiFreshness,
  type UepiFreshnessReport,
  type UepiFreshnessInput,
} from "@/lib/uepi/ops/freshness";
import type { ScheduledRunResult } from "@/lib/uepi/ops/scheduled-run";
import type { SqlExecutor } from "@/lib/uepi/store";
import { isUepiSeriesId, type UepiSeriesId } from "@/lib/uepi/types";

/**
 * The newest released operating day per series.
 *
 * `max(operating_date)` over current rows, which is the head of the series and the only thing
 * freshness may be computed from. Deliberately not `max(released_at)`, `max(created_at)` or
 * anything else a job can touch: a backfill re-run that writes nothing must not move this, and a
 * row rewritten for an unrelated reason must not either.
 *
 * Historical holes are invisible here by construction -- ERCOT's missing 2026-03-07 and MISO's
 * withheld 2026-05-19 are behind the head, and a maximum does not see them.
 */
export async function loadLatestOperatingDates(
  sql: SqlExecutor,
): Promise<Partial<Record<UepiSeriesId, string | null>>> {
  const { rows } = await sql.query(
    `select b.slug, to_char(max(d.operating_date), 'YYYY-MM-DD') as latest
       from pipeline.uepi_daily_values d
       join reference.power_price_benchmarks b on b.id = d.benchmark_id
      where d.superseded_by_id is null
      group by b.slug`,
    [],
  );
  const latest: Partial<Record<UepiSeriesId, string | null>> = {};
  for (const row of rows) {
    const slug = String(row.slug);
    if (isUepiSeriesId(slug)) latest[slug] = row.latest === null ? null : String(row.latest);
  }
  return latest;
}

/** Every series' freshness, read from the released values and an injected clock. */
export async function loadUepiFreshness(
  sql: SqlExecutor,
  asOf: Date,
  thresholds?: UepiFreshnessInput["thresholds"],
): Promise<UepiFreshnessReport> {
  return evaluateUepiFreshness({
    asOf,
    latestOperatingDate: await loadLatestOperatingDates(sql),
    ...(thresholds === undefined ? {} : { thresholds }),
  });
}

/**
 * Record one scheduled run.
 *
 * The ledger is written whatever the outcome, including a run in which nothing happened. A
 * ledger that only records the interesting mornings cannot answer the question an operator
 * actually has after an incident -- "did it run at all?" -- and silence would be
 * indistinguishable from a scheduler that never fired.
 *
 * `detail` carries the per-market breakdown, because one row per run with six markets collapsed
 * into a count would hide exactly the case this phase exists to expose: five markets advancing
 * and one frozen.
 */
export async function recordScheduledRun(
  sql: SqlExecutor,
  run: ScheduledRunResult,
  freshness: UepiFreshnessReport | null,
): Promise<void> {
  const requestedStart = run.markets.reduce<string | null>(
    (earliest, market) => (earliest === null || market.requestedFrom < earliest ? market.requestedFrom : earliest),
    null,
  );
  const requestedEnd = run.markets.reduce<string | null>(
    (latest, market) => (latest === null || market.requestedTo > latest ? market.requestedTo : latest),
    null,
  );
  // A run that attempted no market still gets a row, keyed to the day it ran.
  const fallback = run.startedAt.slice(0, 10);

  await sql.query(
    `insert into pipeline.uepi_ingestion_runs
       (trigger_kind, requested_start, requested_end, started_at, completed_at, outcome,
        retrieval_count, raw_record_count, observation_inserts,
        days_released, days_withheld, days_superseded, detail)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      run.trigger,
      requestedStart ?? fallback,
      requestedEnd ?? fallback,
      run.startedAt,
      run.completedAt,
      run.outcome,
      // Retrievals and raw records are counted by the evidence tables themselves; this ledger
      // records what the run decided, and inflating these from day counts would invent figures
      // that disagree with `pipeline.source_retrievals`.
      0,
      0,
      0,
      run.released,
      run.withheld,
      // Supersession is reported by the store per day; a scheduled head-advance produces none,
      // and claiming otherwise from this vantage point would be a guess.
      0,
      JSON.stringify({
        markets: run.markets.map((market) => ({
          seriesId: market.seriesId,
          status: market.status,
          operatingDateLocal: market.operatingDateLocal,
          requested: { from: market.requestedFrom, to: market.requestedTo },
          released: market.released,
          withheld: market.withheld,
          failed: market.failed,
          skipped: market.skipped,
          advancedTo: market.advancedTo,
          notable: market.notable,
          detail: market.detail,
        })),
        // The freshness verdict as it stood after the run, so the ledger row answers "was the
        // product current afterwards?" and not merely "did the job finish?".
        freshness:
          freshness === null
            ? null
            : {
                worstStatus: freshness.worstStatus,
                series: freshness.series.map((series) => ({
                  seriesId: series.seriesId,
                  status: series.status,
                  latestOperatingDate: series.latestOperatingDate,
                  lagDays: series.lagDays,
                })),
              },
      }),
    ],
  );
}
