/**
 * The Grid Buildout freshness gate.
 *
 * What this measures, and what it deliberately does not.
 *
 * It measures **time since the pipeline last successfully published**. It does not measure the age
 * of the source artifact, which for this product would be a useless health signal: ERCOT publishes
 * TPIT three times a year and CAISO publishes its forum workbook twice, so a hundred-day-old
 * ERCOT vintage is perfectly current and says nothing about whether anything is broken. Source
 * vintage is reported alongside as context, never as the gate.
 *
 * It also never keys on a request, a render, or an attempt. A cron that fired and failed five
 * minutes ago must not make a three-week-old publication look fresh; that is precisely the
 * confusion an unattended pipeline has to avoid.
 */

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

/**
 * How often the scheduler runs. Chosen against the sources rather than against appetite: ERCOT
 * TPIT is triannual and CAISO TDF semiannual, so daily is already far more often than either can
 * change. It is affordable because an unchanged artifact is a true no-op — snapshot identity is
 * checked before any work — and it bounds how long a genuinely new vintage stays unnoticed to one
 * day.
 */
export const SCHEDULED_CADENCE_HOURS = 24;

/**
 * When Grid Buildout stops counting as current.
 *
 * Three scheduled runs. A single missed or failed run is ordinary — a transient network failure, a
 * publisher serving a bad gateway for an hour, a deploy landing mid-window — and should not flip a
 * healthy product to stale. Three consecutive failures is not transient, and by then someone
 * should be looking.
 *
 * Deliberately not tied to source cadence. A threshold of one publication interval would be ~122
 * days for ERCOT, which would let the pipeline be broken for four months while the product still
 * claimed to be current.
 */
export const STALE_AFTER_HOURS = SCHEDULED_CADENCE_HOURS * 3;

export type FreshnessStatus = "current" | "stale" | "unavailable";

export type Freshness = {
  status: FreshnessStatus;
  /** When the pipeline last completed a run that left a validated publication current. */
  lastPublishedAt: string | null;
  /** When the scheduler last attempted a run, successful or not. Never drives the status. */
  lastAttemptedAt: string | null;
  /** Status of that latest attempt, so a failing pipeline is visible beside a valid publication. */
  lastAttemptStatus: string | null;
  ageHours: number | null;
  staleAfterHours: number;
  /** The analytics run currently serving the public product. */
  publishedRunId: string | null;
  /** Plain reason, present whenever the status is not `current`. */
  reason: string | null;
};

export function unavailableFreshness(): Freshness {
  return {
    status: "unavailable",
    lastPublishedAt: null, lastAttemptedAt: null, lastAttemptStatus: null,
    ageHours: null, staleAfterHours: STALE_AFTER_HOURS, publishedRunId: null,
    reason: "no Grid Buildout calculation has been published",
  };
}

/**
 * Derive the gate from the ledger.
 *
 * Two independent questions, asked separately on purpose: when did we last publish, and what
 * happened on the last attempt. The first decides the status; the second is reported so that a
 * pipeline failing repeatedly against a still-valid publication is visible rather than silent.
 */
export async function gridBuildoutFreshness(
  sql: CapacitySqlExecutor,
  options: { now?: Date } = {},
): Promise<Freshness> {
  const now = options.now ?? new Date();

  // Two sources for "when did we last publish", in priority order.
  //
  // The ledger is preferred because it knows when the run *completed*. But a publication can
  // legitimately exist without a ledger row -- the analytics runner can be invoked directly, and
  // the first production activation does exactly that -- so the validated analytics run is the
  // fallback. Without it, a perfectly good publication made outside the scheduler would read as
  // "never published", which is both wrong and would fail the read model's own contract.
  const published = await sql.query(
    `select completed_at, analytics_run_id from pipeline.buildout_job_runs
      where published order by completed_at desc limit 1`,
    [],
  );
  const fallback = published.rows[0] !== undefined ? { rows: [] } : await sql.query(
    `select r.calculated_at as completed_at, r.id as analytics_run_id
       from pipeline.buildout_analytics_runs r
       join reference.methodology_versions mv on mv.id = r.methodology_version_id
      where r.run_status = 'validated' and mv.status = 'approved'
      order by r.calculated_at desc limit 1`,
    [],
  );
  const attempted = await sql.query(
    `select started_at, status
       from pipeline.buildout_job_runs
      order by started_at desc
      limit 1`,
    [],
  );

  const asIso = (value: unknown): string | null =>
    value === null || value === undefined
      ? null
      : value instanceof Date ? value.toISOString() : String(value);

  const attempt = attempted.rows[0];
  const lastAttemptedAt = attempt === undefined ? null : asIso(attempt.started_at);
  const lastAttemptStatus = attempt === undefined ? null : String(attempt.status);

  const row = published.rows[0] ?? fallback.rows[0];
  if (row === undefined) {
    return { ...unavailableFreshness(), lastAttemptedAt, lastAttemptStatus };
  }

  const lastPublishedAt = asIso(row.completed_at);
  const publishedRunId = asIso(row.analytics_run_id);
  if (lastPublishedAt === null) {
    return { ...unavailableFreshness(), lastAttemptedAt, lastAttemptStatus, publishedRunId };
  }

  const ageHours = (now.getTime() - Date.parse(lastPublishedAt)) / 3_600_000;
  const stale = ageHours > STALE_AFTER_HOURS;

  return {
    status: stale ? "stale" : "current",
    lastPublishedAt, lastAttemptedAt, lastAttemptStatus,
    ageHours: Math.round(ageHours * 10) / 10,
    staleAfterHours: STALE_AFTER_HOURS,
    publishedRunId,
    reason: stale
      ? `the last successful publication is ${Math.round(ageHours)} hours old, beyond the `
        + `${STALE_AFTER_HOURS}-hour threshold`
      : null,
  };
}
