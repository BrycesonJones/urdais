/**
 * Freshness at the public boundary.
 *
 * The read model already refuses to serve a value that is not current, published, and under an
 * approved methodology. What it could not previously say is whether the month it *is* serving is
 * the month a reader should be seeing — and an August figure served confidently in late October
 * is a worse failure than no figure at all, because nothing on the page suggests anything is
 * wrong.
 *
 * So the public payload gains a freshness block per series, derived here from the operational
 * record. Three rules govern what it may contain:
 *
 *   - **Historical points are never withheld.** Staleness is a statement about the newest month,
 *     not about the series. Dropping the chart because the latest month is late would destroy
 *     good data to signal a problem with one row of it.
 *   - **It fails closed.** No operational evidence means `unknown`, never `fresh`. A reader
 *     should see "we cannot vouch for this" rather than an unqualified number.
 *   - **It exposes no internals.** Reference months, states, and the due date are public facts
 *     about the product. Run identifiers, source interface rows, rights-review state and
 *     sanitized failure strings stay behind the boundary: an operator reads those from the
 *     operational tables, and a stack trace on a public page helps nobody.
 */

import type { UmpiSqlExecutor } from "@/lib/umpi/ingest/store";
import {
  evaluateFreshness,
  summariseFreshness,
  type UmpiFreshnessState,
} from "@/lib/umpi/ops/freshness";
import { UMPI_RELEASE_POLICIES, type UmpiReleasePolicy } from "@/lib/umpi/ops/policy";
import { UMPI_SERIES_CODES, type UmpiSeriesCode } from "@/lib/umpi/types";

/** What a client may know about how current a series is. Deliberately free of identifiers. */
export type UmpiSeriesFreshness = {
  state: UmpiFreshnessState;
  /** The month a reader should be seeing, under this series' release policy. */
  expectedReferenceMonth: string;
  /** The month they are seeing. */
  latestReferenceMonth: string | null;
  /** When the expected month stops being a wait and becomes a fault. */
  dueAt: string;
  /** Set only while stale. */
  staleSince: string | null;
  /** When Urdais last checked the source, whatever the outcome. */
  lastCheckedAt: string | null;
  /** A sentence a surface can render as-is. */
  reason: string;
};

export type UmpiFreshnessReadModel = {
  family: UmpiFreshnessState;
  series: Record<string, UmpiSeriesFreshness>;
};

const LATEST_CHECK_SQL = `
  select s.series_code,
         c.checked_at,
         c.reachable,
         to_char(c.source_latest_month, 'YYYY-MM') as source_month,
         to_char(c.published_month, 'YYYY-MM') as published_month
    from pipeline.umpi_source_checks c
    join reference.umpi_series s on s.id = c.series_id
   where c.checked_at = (
     select max(c2.checked_at) from pipeline.umpi_source_checks c2 where c2.series_id = c.series_id
   )`;

const OBSERVED_SQL = `
  select s.series_code, to_char(max(o.reference_month), 'YYYY-MM') as month
    from pipeline.umpi_observations o
    join reference.umpi_series s on s.id = o.series_id
   where o.superseded_by_id is null
   group by s.series_code`;

const MONITOR_SQL = `
  select s.series_code, m.release_day_of_month, m.grace_days,
         m.revision_lookback_months, m.max_check_age_hours, m.rationale
    from reference.umpi_source_monitors m
    join reference.umpi_series s on s.id = m.series_id`;

/**
 * Freshness for both series, as of an injected clock.
 *
 * `publishedMonths` comes from the caller rather than being re-queried, so the freshness a page
 * reports describes exactly the points that page is about to render. Reading it separately would
 * let the two disagree across a concurrent publication.
 */
export async function loadUmpiFreshness(
  sql: UmpiSqlExecutor,
  publishedMonths: Readonly<Record<string, string | null>>,
  asOf: Date = new Date(),
): Promise<UmpiFreshnessReadModel> {
  // Sequential, deliberately. These share the process-wide pooled executor for this url, and
  // issuing them concurrently on one client is deprecated in pg and races the connection.
  const checks = await sql.query(LATEST_CHECK_SQL, []);
  const observed = await sql.query(OBSERVED_SQL, []);
  const monitors = await sql.query(MONITOR_SQL, []);

  const checkBy = new Map(checks.rows.map((row) => [String(row.series_code), row]));
  const observedBy = new Map(observed.rows.map((row) => [String(row.series_code), row.month === null ? null : String(row.month)]));
  const monitorBy = new Map(monitors.rows.map((row) => [String(row.series_code), row]));

  const series: Record<string, UmpiSeriesFreshness> = {};
  for (const code of UMPI_SERIES_CODES) {
    const monitor = monitorBy.get(code);
    const policy: UmpiReleasePolicy = monitor
      ? {
          releaseDayOfMonth: Number(monitor.release_day_of_month),
          graceDays: Number(monitor.grace_days),
          revisionLookbackMonths: Number(monitor.revision_lookback_months),
          maxCheckAgeHours: Number(monitor.max_check_age_hours),
          rationale: String(monitor.rationale),
        }
      : UMPI_RELEASE_POLICIES[code as UmpiSeriesCode];

    const check = checkBy.get(code);
    const lastCheckAt = check?.checked_at ? new Date(String(check.checked_at)) : null;
    const evaluated = evaluateFreshness({
      asOf,
      policy,
      publishedMonth: publishedMonths[code] ?? null,
      sourceMonth: check?.source_month === null || check?.source_month === undefined ? null : String(check.source_month),
      observedMonth: observedBy.get(code) ?? null,
      lastCheckAt,
      lastCheckReachable: check?.reachable === true,
    });

    series[code] = {
      state: evaluated.state,
      expectedReferenceMonth: evaluated.expectedReferenceMonth,
      latestReferenceMonth: evaluated.latestReferenceMonth,
      dueAt: evaluated.dueAt,
      staleSince: evaluated.staleSince,
      lastCheckedAt: lastCheckAt === null ? null : lastCheckAt.toISOString(),
      reason: evaluated.reason,
    };
  }

  return {
    family: summariseFreshness(Object.values(series).map((entry) => entry.state)),
    series,
  };
}

/** The freshness a surface shows when no database is reachable: it cannot vouch for anything. */
export function unknownUmpiFreshness(asOf: Date = new Date()): UmpiFreshnessReadModel {
  const series: Record<string, UmpiSeriesFreshness> = {};
  for (const code of UMPI_SERIES_CODES) {
    const evaluated = evaluateFreshness({
      asOf,
      policy: UMPI_RELEASE_POLICIES[code as UmpiSeriesCode],
      publishedMonth: null,
      sourceMonth: null,
      observedMonth: null,
      lastCheckAt: null,
      lastCheckReachable: false,
    });
    series[code] = {
      state: "unknown",
      expectedReferenceMonth: evaluated.expectedReferenceMonth,
      latestReferenceMonth: null,
      dueAt: evaluated.dueAt,
      staleSince: null,
      lastCheckedAt: null,
      reason: "no operational evidence is available",
    };
  }
  return { family: "unknown", series };
}
