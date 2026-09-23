/**
 * The unattended Grid Buildout run.
 *
 * Sequence: claim a lock, open a ledger row, ingest both sources, run the approved analytics, close
 * the ledger out. Every stage is an existing, reviewed runner; nothing here calculates a metric or
 * interprets a source, and the methodology guard is the same registry-backed one the read model
 * and the analytics runner already use. There is no scheduler exception to it.
 *
 * The rule this file exists to enforce is that a failed attempt can never displace a good
 * publication. `published` is set only when the analytics runner returns a validated run, so an
 * ingest failure, a guard failure, a validation failure or a crash all leave the previous
 * publication exactly where it was — authoritative, and ageing under the freshness gate until
 * someone looks. A pipeline that overwrote its last good answer whenever a workbook went missing
 * would turn one bad morning into a broken public product.
 */

import { runBuildoutAnalytics } from "@/lib/grid-buildout/analytics/run";
import { runBuildoutIngest } from "@/lib/grid-buildout/ingest/run";
import { GBV_SOURCE_KEYS, type GbvSourceKey } from "@/lib/grid-buildout/types";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

/** One advisory lock for the whole product, so two invocations cannot interleave. */
const LOCK_KEY = "urdais:grid-buildout:scheduled-run";

export type FailedPhase = "ingest" | "methodology_guard" | "analytics" | "validation" | "persistence";

export type ScheduledRunOutcome = {
  jobRunId: string | null;
  status: "succeeded" | "failed" | "skipped_locked";
  published: boolean;
  analyticsRunId: string | null;
  /** `created` when this attempt produced new numbers, `existing` when nothing moved. */
  analyticsRun: "created" | "existing" | null;
  methodologyVersion: string | null;
  failedPhase: FailedPhase | null;
  errorClass: string | null;
  errorDetail: string | null;
  sources: {
    source: string; status: string; snapshot: string | null;
    rawRecords: number; projects: number; deferrals: number;
  }[];
  elapsedMs: number;
};

/**
 * Classify a failure coarsely, for alerting that survives a reworded message.
 *
 * The guard is separated from other analytics failures deliberately: an unapproved or
 * digest-mismatched methodology is an authorisation event, not a computation bug, and wants a
 * different response from an operator.
 */
function classify(error: string, where: FailedPhase): { phase: FailedPhase; klass: string } {
  // The phase is where the failure actually happened, never inferred from the message. A corrupt
  // workbook raises a ZIP error with no Grid Buildout vocabulary in it at all; attributing that to
  // analytics because the text did not match an ingest pattern would send an operator to the wrong
  // half of the pipeline.
  if (/MethodologyRegistrationError|not approved|not registered|registered digest/i.test(error)) {
    return { phase: "methodology_guard", klass: "methodology_not_approved" };
  }
  if (/BuildoutOutputError|output contract/i.test(error)) {
    return { phase: "validation", klass: "output_contract_failed" };
  }
  if (/BuildoutDomainError|domain violation/i.test(error)) {
    return { phase: "validation", klass: "domain_violation" };
  }
  if (/BuildoutSourceShapeError|ZipFormatError|ZipIntegrityError|XlsxFormatError|no sheet|expected ERCOT Project Number|vintage history/i.test(error)) {
    return { phase: where, klass: "source_shape_changed" };
  }
  if (/HTTP \d|fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|socket hang up/i.test(error)) {
    return { phase: where, klass: "source_unavailable" };
  }
  if (/duplicate key|constraint|violates/i.test(error)) {
    return { phase: "persistence", klass: "persistence_conflict" };
  }
  return { phase: where, klass: "unexpected" };
}

export async function runScheduledGridBuildout(
  sql: CapacitySqlExecutor,
  options: {
    trigger?: "scheduled" | "manual";
    /** Test and replay hook: supply artifacts instead of fetching. */
    artifacts?: Partial<Record<GbvSourceKey, RetrievedArtifact>>;
    calculatedAt?: string;
  } = {},
): Promise<ScheduledRunOutcome> {
  const startedAt = Date.now();
  const trigger = options.trigger ?? "scheduled";
  const base: ScheduledRunOutcome = {
    jobRunId: null, status: "failed", published: false, analyticsRunId: null, analyticsRun: null,
    methodologyVersion: null, failedPhase: null, errorClass: null, errorDetail: null,
    sources: [], elapsedMs: 0,
  };

  // Session-level lock, not transaction-level: the run spans several transactions, and two
  // overlapping invocations must not both ingest the same artifact or race the publication.
  const lock = await sql.query(`select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired`, [LOCK_KEY]);
  if (lock.rows[0]?.acquired !== true) {
    // A second invocation collapses into a no-op rather than failing loudly: overlapping schedules
    // are an ordinary condition, not an incident.
    const skipped = await sql.query(
      `insert into pipeline.buildout_job_runs
         (trigger, status, completed_at, notes)
       values ($1, 'skipped_locked', now(), 'another run held the lock') returning id`,
      [trigger],
    );
    return {
      ...base, status: "skipped_locked",
      jobRunId: String(skipped.rows[0]!.id), elapsedMs: Date.now() - startedAt,
    };
  }

  const claimed = await sql.query(
    `insert into pipeline.buildout_job_runs (trigger, status) values ($1, 'running') returning id`,
    [trigger],
  );
  const jobRunId = String(claimed.rows[0]!.id);

  const close = async (
    fields: {
      status: "succeeded" | "failed"; published: boolean; analyticsRunId: string | null;
      failedPhase: FailedPhase | null; errorClass: string | null; errorDetail: string | null;
      methodologyVersion: string | null; ingestSummary: unknown;
    },
  ): Promise<void> => {
    await sql.query(
      `update pipeline.buildout_job_runs
          set status = $2, completed_at = now(), published = $3, analytics_run_id = $4,
              failed_phase = $5, error_class = $6, error_detail = $7,
              methodology_version = $8, ingest_summary = $9::jsonb
        where id = $1`,
      [
        jobRunId, fields.status, fields.published, fields.analyticsRunId,
        fields.failedPhase, fields.errorClass,
        // Truncated: a ledger is for diagnosis, not for storing a stack trace verbatim.
        fields.errorDetail === null ? null : fields.errorDetail.slice(0, 2000),
        fields.methodologyVersion, JSON.stringify(fields.ingestSummary ?? {}),
      ],
    );
  };

  try {
    const sources: ScheduledRunOutcome["sources"] = [];
    let ingestFailure: string | null = null;

    for (const source of GBV_SOURCE_KEYS) {
      const artifact = options.artifacts?.[source];
      const outcome = await runBuildoutIngest(
        sql, source, artifact === undefined ? {} : { artifact });
      if (outcome.status === "failed") {
        ingestFailure = `${source}: ${outcome.error}`;
        sources.push({ source, status: "failed", snapshot: null, rawRecords: 0, projects: 0, deferrals: 0 });
        break;
      }
      sources.push({
        source, status: outcome.snapshot, snapshot: outcome.snapshotId,
        rawRecords: outcome.rawRecordsInserted, projects: outcome.projectsInserted,
        deferrals: outcome.deferrals,
      });
    }

    if (ingestFailure !== null) {
      // Analytics is not attempted. Publishing numbers derived from a half-ingested vintage would
      // be worse than publishing nothing new, and the previous publication stays current.
      const { phase, klass } = classify(ingestFailure, "ingest");
      await close({
        status: "failed", published: false, analyticsRunId: null,
        failedPhase: phase, errorClass: klass, errorDetail: ingestFailure,
        methodologyVersion: null, ingestSummary: { sources },
      });
      return {
        ...base, jobRunId, status: "failed", failedPhase: phase, errorClass: klass,
        errorDetail: ingestFailure, sources, elapsedMs: Date.now() - startedAt,
      };
    }

    const analytics = await runBuildoutAnalytics(
      sql, options.calculatedAt === undefined ? {} : { calculatedAt: options.calculatedAt });

    if (analytics.status !== "calculated") {
      const detail = analytics.status === "failed" ? analytics.error : "analytics returned a dry run";
      const { phase, klass } = classify(detail, "analytics");
      await close({
        status: "failed", published: false, analyticsRunId: null,
        failedPhase: phase, errorClass: klass, errorDetail: detail,
        methodologyVersion: null, ingestSummary: { sources },
      });
      return {
        ...base, jobRunId, status: "failed", failedPhase: phase, errorClass: klass,
        errorDetail: detail, sources, elapsedMs: Date.now() - startedAt,
      };
    }

    // Only here does anything become published: the analytics runner validated the output against
    // its contract and persisted it under an approved methodology.
    await close({
      status: "succeeded", published: true, analyticsRunId: analytics.runId,
      failedPhase: null, errorClass: null, errorDetail: null,
      methodologyVersion: analytics.methodologyVersion, ingestSummary: { sources },
    });

    return {
      jobRunId, status: "succeeded", published: true,
      analyticsRunId: analytics.runId, analyticsRun: analytics.run,
      methodologyVersion: analytics.methodologyVersion,
      failedPhase: null, errorClass: null, errorDetail: null,
      sources, elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const { phase, klass } = classify(detail, "analytics");
    try {
      await close({
        status: "failed", published: false, analyticsRunId: null,
        failedPhase: phase, errorClass: klass, errorDetail: detail,
        methodologyVersion: null, ingestSummary: {},
      });
    } catch {
      // The ledger write itself failed. Nothing further can be recorded, and the previous
      // publication is still intact, which is the outcome that matters.
    }
    return {
      ...base, jobRunId, status: "failed", failedPhase: phase, errorClass: klass,
      errorDetail: detail, elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await sql.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, [LOCK_KEY]);
  }
}
