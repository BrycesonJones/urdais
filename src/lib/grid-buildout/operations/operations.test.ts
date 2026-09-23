/**
 * Grid Buildout unattended operation.
 *
 * The distinction every test here exists to protect is between the **latest attempt** and the
 * **latest successful publication**. An unattended pipeline that conflates them turns one bad
 * workbook or one transient parser failure into a broken public product, so a failed run must be
 * loudly observable and completely unable to displace the last good answer.
 */

import { describe, expect, it } from "vitest";

import {
  STALE_AFTER_HOURS, SCHEDULED_CADENCE_HOURS, gridBuildoutFreshness, unavailableFreshness,
} from "@/lib/grid-buildout/operations/freshness";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

type Rows = Record<string, unknown>[];

/** A stub answering the gate's three queries by the table each names. */
function gateExecutor(state: { published?: Rows; fallback?: Rows; attempted?: Rows }): CapacitySqlExecutor {
  return {
    query: async (text: string) => {
      if (text.includes("buildout_job_runs") && text.includes("where published")) {
        return { rows: state.published ?? [] };
      }
      if (text.includes("buildout_analytics_runs")) return { rows: state.fallback ?? [] };
      if (text.includes("buildout_job_runs")) return { rows: state.attempted ?? [] };
      return { rows: [] };
    },
    end: async () => {},
  } as unknown as CapacitySqlExecutor;
}

const NOW = new Date("2026-09-23T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

describe("the freshness threshold", () => {
  it("is three scheduled runs, so one transient failure does not flip a healthy product", () => {
    expect(SCHEDULED_CADENCE_HOURS).toBe(24);
    expect(STALE_AFTER_HOURS).toBe(72);
  });
});

describe("the freshness gate", () => {
  it("reports current for a recent publication", async () => {
    const freshness = await gridBuildoutFreshness(gateExecutor({
      published: [{ completed_at: hoursAgo(5), analytics_run_id: "run-1" }],
      attempted: [{ started_at: hoursAgo(5), status: "succeeded" }],
    }), { now: NOW });
    expect(freshness.status).toBe("current");
    expect(freshness.ageHours).toBe(5);
    expect(freshness.publishedRunId).toBe("run-1");
    expect(freshness.reason).toBeNull();
  });

  it("holds at the threshold and tips just past it", async () => {
    const at = await gridBuildoutFreshness(gateExecutor({
      published: [{ completed_at: hoursAgo(STALE_AFTER_HOURS), analytics_run_id: "run-1" }],
    }), { now: NOW });
    expect(at.status).toBe("current");

    const past = await gridBuildoutFreshness(gateExecutor({
      published: [{ completed_at: hoursAgo(STALE_AFTER_HOURS + 0.5), analytics_run_id: "run-1" }],
    }), { now: NOW });
    expect(past.status).toBe("stale");
    expect(past.reason).toMatch(/beyond the 72-hour threshold/);
  });

  it("reports unavailable only when nothing has ever been published", async () => {
    const freshness = await gridBuildoutFreshness(gateExecutor({}), { now: NOW });
    expect(freshness.status).toBe("unavailable");
    expect(freshness.lastPublishedAt).toBeNull();
    expect(freshness.publishedRunId).toBeNull();
  });

  it("does not let a recent failed attempt make an old publication look fresh", async () => {
    // The exact confusion an unattended pipeline has to avoid: the cron ran five minutes ago and
    // failed, against a publication that is a week old.
    const freshness = await gridBuildoutFreshness(gateExecutor({
      published: [{ completed_at: hoursAgo(168), analytics_run_id: "run-old" }],
      attempted: [{ started_at: hoursAgo(0.08), status: "failed" }],
    }), { now: NOW });
    expect(freshness.status).toBe("stale");
    expect(freshness.ageHours).toBeGreaterThan(160);
    // The failing attempt is still reported, so the cause is visible beside the symptom.
    expect(freshness.lastAttemptStatus).toBe("failed");
  });

  it("a successful new publication restores freshness", async () => {
    const freshness = await gridBuildoutFreshness(gateExecutor({
      published: [{ completed_at: hoursAgo(1), analytics_run_id: "run-new" }],
      attempted: [{ started_at: hoursAgo(1), status: "succeeded" }],
    }), { now: NOW });
    expect(freshness.status).toBe("current");
    expect(freshness.publishedRunId).toBe("run-new");
  });

  it("falls back to a validated analytics run when no ledger row exists", async () => {
    // The first production activation publishes through the analytics runner directly. That is a
    // real publication and must not read as "never published".
    const freshness = await gridBuildoutFreshness(gateExecutor({
      fallback: [{ completed_at: hoursAgo(2), analytics_run_id: "run-manual" }],
    }), { now: NOW });
    expect(freshness.status).toBe("current");
    expect(freshness.publishedRunId).toBe("run-manual");
  });

  it("prefers the ledger over the fallback when both exist", async () => {
    const freshness = await gridBuildoutFreshness(gateExecutor({
      published: [{ completed_at: hoursAgo(1), analytics_run_id: "run-ledger" }],
      fallback: [{ completed_at: hoursAgo(99), analytics_run_id: "run-old" }],
    }), { now: NOW });
    expect(freshness.publishedRunId).toBe("run-ledger");
  });

  it("never derives its status from request or render time", async () => {
    const unavailable = unavailableFreshness();
    expect(unavailable.lastPublishedAt).toBeNull();
    expect(unavailable.ageHours).toBeNull();
    // There is no field on the gate that could carry "now".
    expect(Object.keys(unavailable)).not.toContain("generatedAt");
    expect(Object.keys(unavailable)).not.toContain("renderedAt");
  });
});

describe("cron authorization", () => {
  it("refuses every request when no secret is configured", async () => {
    const { cronRequestAuthorized } = await import("@/app/api/cron/grid-buildout/route");
    expect(cronRequestAuthorized("Bearer anything", undefined)).toBe(false);
    expect(cronRequestAuthorized("Bearer anything", "")).toBe(false);
    expect(cronRequestAuthorized("Bearer anything", "   ")).toBe(false);
    expect(cronRequestAuthorized(null, undefined)).toBe(false);
  });

  it("accepts only the exact bearer secret", async () => {
    const { cronRequestAuthorized } = await import("@/app/api/cron/grid-buildout/route");
    expect(cronRequestAuthorized("Bearer s3cret-value-long", "s3cret-value-long")).toBe(true);
    expect(cronRequestAuthorized("Bearer s3cret-value-lonG", "s3cret-value-long")).toBe(false);
    // A prefix must not pass, which is what the length check before timingSafeEqual is for.
    expect(cronRequestAuthorized("Bearer s3cret", "s3cret-value-long")).toBe(false);
    expect(cronRequestAuthorized("Bearer s3cret-value-long-extra", "s3cret-value-long")).toBe(false);
  });

  it("requires the Bearer scheme and rejects a bare secret", async () => {
    const { cronRequestAuthorized } = await import("@/app/api/cron/grid-buildout/route");
    expect(cronRequestAuthorized("s3cret-value-long", "s3cret-value-long")).toBe(false);
    expect(cronRequestAuthorized("Basic s3cret-value-long", "s3cret-value-long")).toBe(false);
    expect(cronRequestAuthorized("", "s3cret-value-long")).toBe(false);
  });

  it("uses the same shared cron secret as the other scheduled products", async () => {
    const gbv = await import("@/app/api/cron/grid-buildout/route");
    const ucpi = await import("@/app/api/cron/ucpi/route");
    const secret = "shared-secret-value";
    expect(gbv.cronRequestAuthorized(`Bearer ${secret}`, secret))
      .toBe(ucpi.cronRequestAuthorized(`Bearer ${secret}`, secret));
  });
});

describe("the scheduled run is registered on the production schedule", () => {
  it("runs daily, clear of every other job's minute", async () => {
    const vercel = await import("../../../../vercel.json");
    const crons = (vercel.default as { crons: { path: string; schedule: string }[] }).crons;
    const gbv = crons.find((cron) => cron.path === "/api/cron/grid-buildout");
    expect(gbv).toBeDefined();
    expect(gbv!.schedule).toBe("15 11 * * *");
    // Nothing else shares that slot: a stacked minute is how two heavy jobs starve each other.
    expect(crons.filter((cron) => cron.schedule === gbv!.schedule)).toHaveLength(1);
  });
});

/**
 * A stub database for the scheduled runner. It records what was asked, so a test can assert on the
 * ledger writes the runner made rather than on its return value alone.
 */
function runnerExecutor(options: {
  lockAcquired?: boolean;
} = {}) {
  const writes: { sql: string; params: unknown[] }[] = [];
  const executor = {
    query: async (text: string, params: unknown[] = []) => {
      writes.push({ sql: text, params });
      if (text.includes("pg_try_advisory_lock")) {
        return { rows: [{ acquired: options.lockAcquired ?? true }] };
      }
      if (text.includes("pg_advisory_unlock")) return { rows: [{}] };
      if (text.includes("insert into pipeline.buildout_job_runs")) {
        return { rows: [{ id: "job-1" }] };
      }
      return { rows: [] };
    },
    end: async () => {},
  };
  return { executor: executor as unknown as CapacitySqlExecutor, writes };
}

describe("the scheduled runner", () => {
  it("collapses into a no-op when another run holds the lock", async () => {
    const { runScheduledGridBuildout } = await import("@/lib/grid-buildout/operations/scheduled-run");
    const { executor, writes } = runnerExecutor({ lockAcquired: false });
    const outcome = await runScheduledGridBuildout(executor, { trigger: "scheduled" });

    expect(outcome.status).toBe("skipped_locked");
    expect(outcome.published).toBe(false);
    // Overlapping schedules are ordinary, so the skip is recorded rather than raised.
    expect(writes.some((w) => w.sql.includes("skipped_locked"))).toBe(true);
    // And nothing was ingested or calculated.
    expect(writes.some((w) => w.sql.includes("buildout_snapshots"))).toBe(false);
  });

  it("claims the lock and opens a running ledger row before any work", async () => {
    const { runScheduledGridBuildout } = await import("@/lib/grid-buildout/operations/scheduled-run");
    const { executor, writes } = runnerExecutor();
    await runScheduledGridBuildout(executor, { trigger: "scheduled" });

    const lockAt = writes.findIndex((w) => w.sql.includes("pg_try_advisory_lock"));
    const claimAt = writes.findIndex((w) => w.sql.includes("values ($1, 'running')"));
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(claimAt).toBeGreaterThan(lockAt);
  });

  it("always releases the lock, including when the run fails", async () => {
    const { runScheduledGridBuildout } = await import("@/lib/grid-buildout/operations/scheduled-run");
    const { executor, writes } = runnerExecutor();
    const outcome = await runScheduledGridBuildout(executor, { trigger: "scheduled" });
    // This stub cannot complete an ingest, so the run fails — and must still unlock.
    expect(outcome.status).toBe("failed");
    expect(writes.some((w) => w.sql.includes("pg_advisory_unlock"))).toBe(true);
  });

  it("never marks a failed attempt as published", async () => {
    const { runScheduledGridBuildout } = await import("@/lib/grid-buildout/operations/scheduled-run");
    const { executor, writes } = runnerExecutor();
    const outcome = await runScheduledGridBuildout(executor, { trigger: "scheduled" });

    expect(outcome.status).toBe("failed");
    expect(outcome.published).toBe(false);
    // The ledger close-out carries published = false, so the last good publication stands.
    const close = writes.find((w) => w.sql.includes("update pipeline.buildout_job_runs"));
    expect(close).toBeDefined();
    expect(close!.params[2]).toBe(false);
  });

  it("records the phase a failure happened in, not one inferred from its wording", async () => {
    const { runScheduledGridBuildout } = await import("@/lib/grid-buildout/operations/scheduled-run");
    const { executor } = runnerExecutor();
    const outcome = await runScheduledGridBuildout(executor, { trigger: "scheduled" });
    // The stub fails inside ingestion; a corrupt workbook raises a ZIP error carrying no Grid
    // Buildout vocabulary at all, and must still be attributed to ingest.
    expect(outcome.failedPhase).toBe("ingest");
    expect(outcome.errorClass).not.toBeNull();
  });

  it("does not attempt analytics after an ingestion failure", async () => {
    const { runScheduledGridBuildout } = await import("@/lib/grid-buildout/operations/scheduled-run");
    const { executor, writes } = runnerExecutor();
    await runScheduledGridBuildout(executor, { trigger: "scheduled" });
    // Publishing numbers derived from a half-ingested vintage is worse than publishing nothing new.
    expect(writes.some((w) => w.sql.includes("insert into pipeline.buildout_analytics_runs"))).toBe(false);
  });

  it("truncates an error detail rather than storing an unbounded trace", async () => {
    const { runScheduledGridBuildout } = await import("@/lib/grid-buildout/operations/scheduled-run");
    const { executor, writes } = runnerExecutor();
    await runScheduledGridBuildout(executor, { trigger: "scheduled" });
    const close = writes.find((w) => w.sql.includes("update pipeline.buildout_job_runs"));
    const detail = close!.params[6];
    expect(detail === null || String(detail).length <= 2000).toBe(true);
  });
});
