/**
 * The unattended UMPI check.
 *
 * One entrypoint the scheduler calls, running the whole chain for both series: read a narrow
 * recent window from each official source, ingest only what is new or revised, derive only when
 * canonical observations actually changed, then evaluate freshness and record what happened.
 *
 * Three decisions shape it.
 *
 * **A month that is not out yet is not a failure.** ECOS answers a request for an unpublished
 * month with `INFO-200`, a well-formed reply meaning "no such data". Treating that as an outage
 * would put the product in a failed state for most of every month and train an operator to ignore
 * the alarm. It is recorded as a reachable check that found nothing new. Korea Customs says the
 * same thing by returning zero rows.
 *
 * **Derivation follows evidence, not the calendar.** It runs when a source check actually wrote
 * or revised an observation. A day on which nothing moved does no derivation work and records
 * `success_no_change`, which for a monthly product is the ordinary outcome on most days.
 *
 * **One series' failure does not become the other's.** The Bank of Korea being unreachable says
 * nothing about Korea Customs, so each series is checked, derived and evaluated independently and
 * the run's outcome summarises without flattening.
 *
 * The clock is injected throughout. A freshness state machine whose transitions depend on an
 * ambient clock can only be tested by waiting.
 */

import { randomUUID } from "node:crypto";

import { deriveSeries } from "@/lib/umpi/derive/run";
import { runUmpiSource, type UmpiSourceKey } from "@/lib/umpi/ingest/run";
import type { UmpiSourceAdapter } from "@/lib/umpi/ingest/types";
import type { UmpiSqlExecutor } from "@/lib/umpi/ingest/store";
import {
  evaluateFreshness,
  summariseFreshness,
  type UmpiFreshness,
  type UmpiFreshnessState,
} from "@/lib/umpi/ops/freshness";
import { checkWindow, UMPI_RELEASE_POLICIES, type UmpiReleasePolicy } from "@/lib/umpi/ops/policy";
import type { UmpiSeriesCode } from "@/lib/umpi/types";

/** ECOS's own code for "the series exists, that month does not". Not an outage. */
export const ECOS_NO_DATA_CODE = "INFO-200";

export type UmpiCheckOutcome = {
  seriesCode: UmpiSeriesCode;
  reachable: boolean;
  requestedFrom: string;
  requestedTo: string;
  sourceLatestMonth: string | null;
  observationsWritten: number;
  observationsRevised: number;
  derivationRan: boolean;
  publicationsWritten: number;
  publishedMonth: string | null;
  freshness: UmpiFreshness;
  failure: { stage: string; class: string; detail: string } | null;
};

export type UmpiOperationalResult = {
  runId: string | null;
  outcome: "success_no_change" | "success_changed" | "partial_failure" | "failed";
  freshnessState: UmpiFreshnessState;
  checks: UmpiCheckOutcome[];
  skippedReason: string | null;
};

export type UmpiOpsOptions = {
  asOf?: Date;
  trigger?: "cron" | "manual";
  /** Skip the advisory lock. Only for a single-threaded test against its own database. */
  withoutLock?: boolean;
  /**
   * Injected in tests so a fixture can stand in for the network, per source. The next real
   * monthly rollover cannot be waited for, so it is proved with a controlled clock and a
   * controlled source answering exactly as the agency will.
   */
  adapters?: Partial<Record<UmpiSourceKey, UmpiSourceAdapter<string>>>;
};

/** Truncate and strip anything that could carry a credential into the operational record. */
function sanitize(detail: string): string {
  return detail
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/(api[_-]?key|serviceKey|authKey|password|cookie|token)=[^\s&]+/gi, "$1=[redacted]")
    .slice(0, 500);
}

const MONTH = (value: string) => `${value}-01`;

/**
 * The newest reference month, as `YYYY-MM`.
 *
 * Formatted in SQL rather than in JavaScript. The driver hands back a `Date` for a `date` column,
 * and stringifying that yields "Sat Aug 01 2026 ..." -- whose first seven characters are "Sat Aug",
 * which then reaches a date parameter and fails. Postgres already knows how to write a month.
 */
async function latestMonth(sql: UmpiSqlExecutor, query: string, seriesCode: string): Promise<string | null> {
  const result = await sql.query(query, [seriesCode]);
  const value = result.rows[0]?.month;
  return value === null || value === undefined ? null : String(value);
}

const PUBLISHED_MONTH_SQL = `
  select to_char(max(p.reference_month), 'YYYY-MM') as month
    from pipeline.umpi_publications p
    join reference.umpi_series s on s.id = p.series_id
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
   where s.series_code = $1
     and p.superseded_by_id is null
     and p.publication_state = 'published'
     and mv.status = 'approved'
     and mv.effective_from <= current_date`;

const OBSERVED_MONTH_SQL = `
  select to_char(max(o.reference_month), 'YYYY-MM') as month
    from pipeline.umpi_observations o
    join reference.umpi_series s on s.id = o.series_id
   where s.series_code = $1 and o.superseded_by_id is null`;

/** The release policy as stored, falling back to the compiled default if a monitor is missing. */
async function policyFor(sql: UmpiSqlExecutor, seriesCode: UmpiSeriesCode): Promise<UmpiReleasePolicy> {
  const stored = await sql.query(
    `select m.release_day_of_month, m.grace_days, m.revision_lookback_months,
            m.max_check_age_hours, m.rationale
       from reference.umpi_source_monitors m
       join reference.umpi_series s on s.id = m.series_id
      where s.series_code = $1`,
    [seriesCode],
  );
  const row = stored.rows[0];
  if (!row) return UMPI_RELEASE_POLICIES[seriesCode];
  return {
    releaseDayOfMonth: Number(row.release_day_of_month),
    graceDays: Number(row.grace_days),
    revisionLookbackMonths: Number(row.revision_lookback_months),
    maxCheckAgeHours: Number(row.max_check_age_hours),
    rationale: String(row.rationale),
  };
}

const SOURCE_FOR: Readonly<Record<UmpiSeriesCode, UmpiSourceKey>> = {
  "UMPI-KR-DRAM-PPI": "bok",
  "UMPI-KR-DRAM-EXPORT-UV": "customs",
};

async function checkSeries(
  sql: UmpiSqlExecutor,
  seriesCode: UmpiSeriesCode,
  asOf: Date,
  adapter: UmpiSourceAdapter<string> | undefined,
): Promise<UmpiCheckOutcome> {
  const policy = await policyFor(sql, seriesCode);
  const window = checkWindow(asOf, policy);
  const source = SOURCE_FOR[seriesCode];

  let reachable = true;
  let failure: UmpiCheckOutcome["failure"] = null;
  let written = 0;
  let revised = 0;
  let sourceLatestMonth: string | null = null;

  const ingest = await runUmpiSource(sql, source, {
    fromMonth: window.fromMonth,
    toMonth: window.toMonth,
    // A scheduled check is an ordinary production retrieval; the operational run record is what
    // distinguishes it from a hand-run one, not a separate ingestion run kind.
    runKind: "production",
    ...(adapter === undefined ? {} : { adapter }),
  });

  if (ingest.status === "ingested") {
    written = ingest.rowsInserted;
    revised = ingest.rowsRevised;
  } else if (ingest.status === "failed") {
    // The one reply that is not a fault: the agency confirming it has not published that month.
    if (ingest.providerCode === ECOS_NO_DATA_CODE) {
      reachable = true;
    } else {
      reachable = false;
      failure = {
        stage: ingest.kind === "parse" ? "parse" : ingest.kind === "provider" ? "source" : "ingest",
        class: ingest.kind,
        detail: sanitize(ingest.error),
      };
    }
  }

  // What the source actually holds, as evidenced by what is now stored. A month Urdais could not
  // store is not a month the source "has" for freshness purposes -- claiming otherwise would let
  // a parse failure read as the source being ahead.
  const observedMonth = await latestMonth(sql, OBSERVED_MONTH_SQL, seriesCode);
  if (reachable) sourceLatestMonth = observedMonth;

  // Derive only when the canonical inputs moved.
  let derivationRan = false;
  let publicationsWritten = 0;
  if (written > 0 || revised > 0) {
    derivationRan = true;
    const derived = await deriveSeries(sql, seriesCode);
    if (derived.status === "derived") {
      publicationsWritten = derived.written;
    } else if (derived.status === "failed") {
      failure = failure ?? { stage: "derive", class: "derivation", detail: sanitize(String(derived.error ?? derived.status)) };
    }
  }

  const publishedMonth = await latestMonth(sql, PUBLISHED_MONTH_SQL, seriesCode);
  const freshness = evaluateFreshness({
    asOf,
    policy,
    publishedMonth,
    sourceMonth: sourceLatestMonth,
    observedMonth,
    // This check is itself the evidence: it just ran.
    lastCheckAt: asOf,
    lastCheckReachable: reachable,
  });

  return {
    seriesCode,
    reachable,
    requestedFrom: window.fromMonth,
    requestedTo: window.toMonth,
    sourceLatestMonth,
    observationsWritten: written,
    observationsRevised: revised,
    derivationRan,
    publicationsWritten,
    publishedMonth,
    freshness,
    failure,
  };
}

/**
 * Run the scheduled check.
 *
 * Takes an advisory lock first and returns without doing anything if another run holds it. Two
 * overlapping runs would race the same source sessions and could supersede each other's
 * observations; a skipped run is recorded as skipped rather than as a check, so it can never be
 * mistaken for evidence that the source was looked at.
 */
export async function runUmpiOperations(
  sql: UmpiSqlExecutor,
  options: UmpiOpsOptions = {},
): Promise<UmpiOperationalResult> {
  const asOf = options.asOf ?? new Date();
  const trigger = options.trigger ?? "cron";

  if (!options.withoutLock) {
    const lock = await sql.query(`select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired`, ["umpi:operations"]);
    if (lock.rows[0]?.acquired !== true) {
      const runId = randomUUID();
      await sql.query(
        `insert into pipeline.umpi_operational_runs (id, trigger, started_at, skipped_reason)
         values ($1, $2, $3::timestamptz, $4)`,
        [runId, trigger, asOf.toISOString(), "another UMPI operational run holds the lock"],
      );
      return {
        runId,
        outcome: "success_no_change",
        freshnessState: "unknown",
        checks: [],
        skippedReason: "another UMPI operational run holds the lock",
      };
    }
  }

  const runId = randomUUID();
  await sql.query(
    `insert into pipeline.umpi_operational_runs (id, trigger, started_at) values ($1, $2, $3::timestamptz)`,
    [runId, trigger, asOf.toISOString()],
  );

  const checks: UmpiCheckOutcome[] = [];
  try {
    for (const seriesCode of ["UMPI-KR-DRAM-PPI", "UMPI-KR-DRAM-EXPORT-UV"] as const) {
      // A thrown error in one series must not abandon the other, nor the run record.
      let check: UmpiCheckOutcome;
      try {
        check = await checkSeries(sql, seriesCode, asOf, options.adapters?.[SOURCE_FOR[seriesCode]]);
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        const policy = UMPI_RELEASE_POLICIES[seriesCode];
        check = {
          seriesCode,
          reachable: false,
          requestedFrom: checkWindow(asOf, policy).fromMonth,
          requestedTo: checkWindow(asOf, policy).toMonth,
          sourceLatestMonth: null,
          observationsWritten: 0,
          observationsRevised: 0,
          derivationRan: false,
          publicationsWritten: 0,
          publishedMonth: null,
          freshness: evaluateFreshness({
            asOf, policy, publishedMonth: null, sourceMonth: null, observedMonth: null,
            lastCheckAt: asOf, lastCheckReachable: false,
          }),
          failure: { stage: "source", class: "unhandled", detail: sanitize(detail) },
        };
      }
      checks.push(check);

      const seriesId = await sql.query(`select id, ($1)::text as code from reference.umpi_series where series_code = $1`, [seriesCode]);
      const interfaceRow = await sql.query(
        `select ss.source_interface_id from reference.umpi_source_series ss
           join reference.umpi_series s on s.id = ss.series_id where s.series_code = $1`,
        [seriesCode],
      );
      await sql.query(
        `insert into pipeline.umpi_source_checks
           (operational_run_id, series_id, source_interface_id, checked_at, reachable,
            requested_from_month, requested_to_month, source_latest_month,
            observations_written, observations_revised, derivation_ran, publications_written,
            published_month, freshness_state, freshness_reason,
            failure_stage, failure_class, failure_detail)
         values ($1,$2,$3,$4::timestamptz,$5,$6::date,$7::date,$8::date,$9,$10,$11,$12,$13::date,$14,$15,$16,$17,$18)`,
        [
          runId, seriesId.rows[0]?.id, interfaceRow.rows[0]?.source_interface_id,
          asOf.toISOString(), check.reachable,
          MONTH(check.requestedFrom), MONTH(check.requestedTo),
          check.sourceLatestMonth === null ? null : MONTH(check.sourceLatestMonth),
          check.observationsWritten, check.observationsRevised, check.derivationRan,
          check.publicationsWritten,
          check.publishedMonth === null ? null : MONTH(check.publishedMonth),
          check.freshness.state, check.freshness.reason,
          check.failure?.stage ?? null, check.failure?.class ?? null, check.failure?.detail ?? null,
        ],
      );
    }

    const failures = checks.filter((check) => check.failure !== null).length;
    const changed = checks.some((check) => check.observationsWritten > 0 || check.observationsRevised > 0);
    const outcome = failures === checks.length && failures > 0
      ? "failed"
      : failures > 0
        ? "partial_failure"
        : changed
          ? "success_changed"
          : "success_no_change";
    const freshnessState = summariseFreshness(checks.map((check) => check.freshness.state));

    await sql.query(
      `update pipeline.umpi_operational_runs
          set completed_at = now(), outcome = $2, freshness_state = $3 where id = $1`,
      [runId, outcome, freshnessState],
    );
    return { runId, outcome, freshnessState, checks, skippedReason: null };
  } catch (error) {
    // The run record must close even when the orchestration itself fails, or the next run reads
    // an open row and concludes the scheduler is still going.
    await sql.query(
      `update pipeline.umpi_operational_runs
          set completed_at = now(), outcome = 'failed', freshness_state = 'unknown' where id = $1`,
      [runId],
    );
    throw error;
  } finally {
    if (!options.withoutLock) {
      await sql.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, ["umpi:operations"]);
    }
  }
}
