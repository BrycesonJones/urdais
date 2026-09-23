/**
 * Is UMPI operationally healthy right now?
 *
 * Built to be answered by a machine: a deterministic report whose `healthy` flag an uptime
 * monitor, a CI job or a future alerting rule can read without interpreting prose. The command
 * that wraps it exits non-zero exactly when a person needs to do something.
 *
 * The distinction that matters most is between *late* and *waiting*. A monthly product spends
 * most of its life with nothing new to fetch, and a check that reported "unhealthy" whenever the
 * newest month was a few weeks old would fire every month and be ignored within two. So
 * `awaiting_release` is healthy: the agency is not due yet, and Urdais holding last month's
 * figure is the system working. `stale` is not: the agency should have published, the grace
 * window has passed, and a reader is looking at an old number.
 *
 * Everything else that can silently break the chain is checked too — a scheduler that stopped, a
 * methodology that fell out of force, a source that lost its production approval, a Series B base
 * that went missing, a duplicate current publication — because each of those produces a page that
 * looks fine while being wrong, which is the failure class this whole phase exists to catch.
 */

import { currentPublicationConflicts } from "@/lib/umpi/read/load";
import type { UmpiSqlExecutor } from "@/lib/umpi/ingest/store";
import { isHealthy, type UmpiFreshnessState } from "@/lib/umpi/ops/freshness";
import { loadUmpiFreshness } from "@/lib/umpi/ops/read";
import { UMPI_SERIES_CODES } from "@/lib/umpi/types";

export type UmpiFinding = {
  /** What broke: the monitoring condition, not the message. */
  code: string;
  /** Blocking findings make the product unhealthy; advisory ones are worth knowing. */
  blocking: boolean;
  detail: string;
  remedy: string;
};

export type UmpiSeriesHealth = {
  seriesCode: string;
  freshness: UmpiFreshnessState;
  expectedReferenceMonth: string;
  latestReferenceMonth: string | null;
  publishedMonth: string | null;
  observedMonth: string | null;
  lastCheckedAt: string | null;
  lastCheckReachable: boolean | null;
  methodologyVersion: string | null;
  sourceProductionApproved: boolean;
  publiclyAvailable: boolean;
  /** Series B only: whether a complete, current base backs the published levels. */
  baseValid: boolean | null;
  lastFailure: { stage: string; class: string; detail: string; at: string } | null;
};

export type UmpiProductionReport = {
  checkedAt: string;
  healthy: boolean;
  familyFreshness: UmpiFreshnessState;
  schedulerLastRunAt: string | null;
  schedulerLastOutcome: string | null;
  series: UmpiSeriesHealth[];
  findings: UmpiFinding[];
};

/** A scheduled check runs daily; two missed days is a stopped scheduler, not a slow night. */
const SCHEDULER_MAX_AGE_HOURS = 48;

export async function checkUmpiProduction(
  sql: UmpiSqlExecutor,
  asOf: Date = new Date(),
): Promise<UmpiProductionReport> {
  const findings: UmpiFinding[] = [];

  // Sequential, deliberately: these share one pooled client, and issuing them concurrently is
  // deprecated in pg and races the connection.
  const runRow = await sql.query(
    `select started_at, completed_at, outcome, freshness_state
       from pipeline.umpi_operational_runs
      where skipped_reason is null
      order by started_at desc limit 1`,
    [],
  );
  const seriesRows = await sql.query(
    `select s.series_code,
            mv.version as methodology_version,
            mv.status  as methodology_status,
            mv.effective_from,
            si.production_access_state,
            to_char(max(p.reference_month) filter (
              where p.superseded_by_id is null and p.publication_state = 'published'
            ), 'YYYY-MM') as published_month,
            to_char(max(o.reference_month) filter (where o.superseded_by_id is null), 'YYYY-MM') as observed_month,
            count(distinct b.id) filter (where b.superseded_by_id is null) as live_bases,
            s.level_is_urdais_derived
       from reference.umpi_series s
       join reference.methodology_versions mv on mv.id = s.methodology_version_id
       join reference.umpi_source_series ss on ss.series_id = s.id
       join reference.source_interfaces si on si.id = ss.source_interface_id
       left join pipeline.umpi_publications p on p.series_id = s.id
       left join pipeline.umpi_observations o on o.series_id = s.id
       left join pipeline.umpi_index_bases b on b.series_id = s.id
      group by s.series_code, mv.version, mv.status, mv.effective_from,
               si.production_access_state, s.level_is_urdais_derived`,
    [],
  );
  const checkRows = await sql.query(
    `select distinct on (c.series_id) s.series_code, c.checked_at, c.reachable,
            c.failure_stage, c.failure_class, c.failure_detail
       from pipeline.umpi_source_checks c
       join reference.umpi_series s on s.id = c.series_id
      order by c.series_id, c.checked_at desc`,
    [],
  );
  const conflicts = await currentPublicationConflicts(sql);
  const run = runRow.rows[0] ?? null;
  const schedulerLastRunAt = run?.started_at ? new Date(String(run.started_at)).toISOString() : null;
  const schedulerLastOutcome = run?.outcome ? String(run.outcome) : null;

  // A. The scheduler itself. Everything downstream is evidence gathered by it, so a stopped
  // schedule makes the rest unverifiable rather than merely unrefreshed.
  if (schedulerLastRunAt === null) {
    findings.push({
      code: "scheduler_never_ran",
      blocking: true,
      detail: "no UMPI operational run has been recorded",
      remedy: "run `npm run umpi:ops`, and confirm the /api/cron/umpi schedule and CRON_SECRET are configured",
    });
  } else {
    const ageHours = (asOf.getTime() - Date.parse(schedulerLastRunAt)) / 3_600_000;
    if (ageHours > SCHEDULER_MAX_AGE_HOURS) {
      findings.push({
        code: "scheduler_missed",
        blocking: true,
        detail: `the last UMPI operational run was ${Math.floor(ageHours)}h ago, beyond the ${SCHEDULER_MAX_AGE_HOURS}h daily schedule`,
        remedy: "check the Vercel cron for /api/cron/umpi and its CRON_SECRET, then run `npm run umpi:ops`",
      });
    }
    if (schedulerLastOutcome === "failed" || schedulerLastOutcome === "partial_failure") {
      findings.push({
        code: "scheduler_last_run_failed",
        blocking: false,
        detail: `the last operational run finished as ${schedulerLastOutcome}`,
        remedy: "read pipeline.umpi_source_checks for that run to see which stage failed",
      });
    }
  }

  const publishedMonths: Record<string, string | null> = {};
  for (const row of seriesRows.rows) {
    publishedMonths[String(row.series_code)] = row.published_month === null ? null : String(row.published_month);
  }
  const freshness = await loadUmpiFreshness(sql, publishedMonths, asOf);
  const checkBy = new Map(checkRows.rows.map((row) => [String(row.series_code), row]));
  const seriesBy = new Map(seriesRows.rows.map((row) => [String(row.series_code), row]));

  const series: UmpiSeriesHealth[] = [];
  for (const code of UMPI_SERIES_CODES) {
    const row = seriesBy.get(code);
    const check = checkBy.get(code);
    const state = freshness.series[code]?.state ?? "unknown";
    const derived = row?.level_is_urdais_derived === true;
    const liveBases = Number(row?.live_bases ?? 0);
    const publishedMonth = publishedMonths[code] ?? null;

    // G. A reference month that should exist and does not.
    if (state === "stale") {
      findings.push({
        code: "reference_month_stale",
        blocking: true,
        detail: `${code}: ${freshness.series[code]?.reason ?? "overdue"}`,
        remedy: "run `npm run umpi:ops` and read the resulting source check; if the agency has published, the failure is in ingestion or derivation",
      });
    }
    // B/C. The source did not answer, or did not parse.
    if (state === "source_unavailable") {
      findings.push({
        code: "source_unavailable",
        blocking: true,
        detail: `${code}: the last check could not reach or parse the official source`,
        remedy: "check the source transport; the last failure detail is on pipeline.umpi_source_checks",
      });
    }
    // D/E/F. Input arrived and no current publication came out of it.
    if (state === "derivation_failed") {
      findings.push({
        code: "publication_did_not_advance",
        blocking: true,
        detail: `${code}: ${freshness.series[code]?.reason ?? "a source month has no current publication"}`,
        remedy: "run `npm run umpi:derive` and read the outcome; a blocked derivation names its reason",
      });
    }
    if (state === "unknown") {
      findings.push({
        code: "freshness_unknown",
        blocking: true,
        detail: `${code}: ${freshness.series[code]?.reason ?? "no operational evidence"}`,
        remedy: "run `npm run umpi:ops` to produce a check for this series",
      });
    }

    // J. The gate closing for a reason unrelated to the data.
    const methodologyInForce = row?.methodology_status === "approved"
      && row?.effective_from !== null
      && new Date(String(row.effective_from)) <= asOf;
    if (row && !methodologyInForce) {
      findings.push({
        code: "methodology_not_in_force",
        blocking: true,
        detail: `${code} is bound to methodology ${String(row.methodology_version)} (${String(row.methodology_status)}), which is not in force`,
        remedy: "a published series must cite an approved, effective methodology version",
      });
    }
    if (row && String(row.production_access_state) !== "production_approved") {
      findings.push({
        code: "source_not_production_approved",
        blocking: true,
        detail: `${code}: its source interface is ${String(row.production_access_state)}`,
        remedy: "a scheduled retrieval requires a production-approved source on both rights axes",
      });
    }

    // I. Series B's base is the whole series: without it there is no level to publish.
    let baseValid: boolean | null = null;
    if (derived) {
      baseValid = liveBases === 1;
      if (!baseValid) {
        findings.push({
          code: liveBases === 0 ? "base_missing" : "base_ambiguous",
          blocking: true,
          detail: `${code} has ${liveBases} live index bases; exactly one is required`,
          remedy: liveBases === 0
            ? "ingest the base period and run `npm run umpi:derive`"
            : "two live bases means a supersession did not complete; inspect pipeline.umpi_index_bases",
        });
      }
    }

    series.push({
      seriesCode: code,
      freshness: state,
      expectedReferenceMonth: freshness.series[code]?.expectedReferenceMonth ?? "",
      latestReferenceMonth: freshness.series[code]?.latestReferenceMonth ?? null,
      publishedMonth,
      observedMonth: row?.observed_month === null || row?.observed_month === undefined ? null : String(row.observed_month),
      lastCheckedAt: check?.checked_at ? new Date(String(check.checked_at)).toISOString() : null,
      lastCheckReachable: check === undefined ? null : check.reachable === true,
      methodologyVersion: row?.methodology_version ? String(row.methodology_version) : null,
      sourceProductionApproved: String(row?.production_access_state ?? "") === "production_approved",
      publiclyAvailable: publishedMonth !== null,
      baseValid,
      lastFailure: check?.failure_stage
        ? {
            stage: String(check.failure_stage),
            class: String(check.failure_class),
            detail: String(check.failure_detail ?? ""),
            at: new Date(String(check.checked_at)).toISOString(),
          }
        : null,
    });
  }

  // H. The invariant a public read depends on.
  for (const conflict of conflicts) {
    findings.push({
      code: "duplicate_current_publication",
      blocking: true,
      detail: conflict,
      remedy: "two live rows for one series-month makes the public read ambiguous; supersede one",
    });
  }

  return {
    checkedAt: asOf.toISOString(),
    healthy: findings.every((finding) => !finding.blocking)
      && series.every((entry) => isHealthy(entry.freshness)),
    familyFreshness: freshness.family,
    schedulerLastRunAt,
    schedulerLastOutcome,
    series,
    findings,
  };
}
