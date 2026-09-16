/**
 * The scheduled UTVI run, and the historical backfill.
 *
 * One invocation does two things, and the second is the one that is easy to leave out. It
 * reads the day that just closed, which is the new point. Then it re-reads the day before
 * that, which should have stopped moving, and only calls it final once the source has said so
 * twice. Assuming settlement instead of confirming it would cost nothing today — the drift
 * Phase 1A measured on older days was exactly zero — and would silently stop catching a late
 * revision the moment one happened.
 *
 * The run never reads the current UTC day. It cannot: the endpoint clamps `end_date` down to
 * the last completed day and rejects a request for today outright, so the completed-day rule
 * is enforced by the source rather than chosen here.
 */

import { calculateUtvi, canCalculate } from "@/lib/utvi/calculate";
import { snapshotsFromResponse } from "@/lib/utvi/normalize";
import { lastCompletedUtcDate, settlementStateFor, settlementTargetDate } from "@/lib/utvi/settlement";
import {
  applySnapshot,
  coveredDates,
  publishCalculation,
  recordCalculation,
  recordRetrieval,
  resolveLineage,
  type SnapshotOutcome,
  type SqlExecutor,
  type UtviLineage,
} from "@/lib/utvi/store";
import { fetchDailyRankings, type DatasetClientOptions } from "@/lib/utvi/source/client";
import { planBackfill, verifyCoverage } from "@/lib/utvi/windows";
import {
  UTVI_UNIVERSE_DESCRIPTOR,
  type DailySnapshot,
  type RetrievalResult,
} from "@/lib/utvi/types";

export const UTVI_COLLECTOR_IDENTITY = "utvi-openrouter-collector/1" as const;

export type DateOutcome = {
  observationDate: string;
  snapshot: SnapshotOutcome["kind"];
  calculation: "recorded" | "skipped_no_coverage" | "skipped_unchanged" | "failed";
  calculationDetail?: string;
  publication:
    | "published"
    | "superseded"
    | "refused_methodology_not_approved"
    | "refused_no_change"
    | "not_attempted";
  publicationDetail?: string;
  totalTokens?: string;
  settlementState?: string;
};

export type UtviRunResult = {
  /** The day that just closed: the new point. */
  collectionDate: string;
  /** The day being confirmed as settled. */
  settlementDate: string;
  retrievals: {
    requestedStart: string;
    requestedEnd: string;
    actualStart: string | null;
    actualEnd: string | null;
    outcome: RetrievalResult["outcome"];
    detail: string | null;
    rowCount: number | null;
  }[];
  dates: DateOutcome[];
  methodologyVersion: string;
  methodologyStatus: string;
  ok: boolean;
};

export type UtviRunOptions = {
  now?: () => Date;
  client?: DatasetClientOptions;
  /** Skip the settlement re-read. Used by the backfill, which settles as it goes. */
  skipSettlementRecheck?: boolean;
};

/**
 * Read one window, persist every date in it, and calculate and publish where permitted.
 *
 * Returns per-date outcomes rather than a single status, because the interesting states are
 * per date: one day can be created while another is confirmed and a third is revised, and a
 * caller reading a log needs to see which.
 */
async function ingestWindow(
  sql: SqlExecutor,
  lineage: UtviLineage,
  startDate: string,
  endDate: string,
  now: Date,
  clientOptions: DatasetClientOptions | undefined,
  result: UtviRunResult,
  publish: boolean,
): Promise<void> {
  const retrieval = await fetchDailyRankings({ startDate, endDate }, clientOptions);
  const recorded = await recordRetrieval(sql, lineage, retrieval, UTVI_COLLECTOR_IDENTITY);

  result.retrievals.push({
    requestedStart: retrieval.requestedStartDate,
    requestedEnd: retrieval.requestedEndDate,
    actualStart: retrieval.actualStartDate,
    actualEnd: retrieval.actualEndDate,
    outcome: retrieval.outcome,
    detail: retrieval.outcomeDetail,
    rowCount: retrieval.rowCount,
  });

  if (retrieval.outcome !== "succeeded" || retrieval.response === null || retrieval.sourceAsOf === null) {
    // A failed read leaves those dates without coverage, which is the correct state: no
    // point, no zero, and a retry next run. The failure itself is recorded above.
    result.ok = false;
    return;
  }

  // Snapshots are built from the window the source says it served, which is the only window
  // the response actually describes. A requested end date on the current UTC day is clamped
  // silently, so trusting the request here would invent a date.
  const snapshots = snapshotsFromResponse(retrieval.response, (date) => settlementStateFor(date, now));

  for (const snapshot of snapshots) {
    result.dates.push(
      await ingestDate(sql, lineage, recorded.utviRetrievalId, snapshot, retrieval.sourceAsOf, publish),
    );
  }
}

async function ingestDate(
  sql: SqlExecutor,
  lineage: UtviLineage,
  utviRetrievalId: string,
  snapshot: DailySnapshot,
  sourceAsOf: string,
  publish: boolean,
): Promise<DateOutcome> {
  const applied = await applySnapshot(sql, lineage, utviRetrievalId, snapshot, sourceAsOf);
  const outcome: DateOutcome = {
    observationDate: snapshot.observationDate,
    snapshot: applied.kind,
    calculation: "skipped_no_coverage",
    publication: "not_attempted",
    settlementState: snapshot.settlementState,
  };

  if (applied.kind === "no_rows") return outcome;

  // A confirmation changed nothing, so there is nothing new to calculate. Recording a second
  // identical calculation would grow the ledger without adding a fact.
  if (applied.kind === "confirmed") {
    outcome.calculation = "skipped_unchanged";
    return outcome;
  }

  if (!canCalculate(snapshot)) return outcome;

  try {
    const calculation = calculateUtvi(snapshot);
    const calculationId = await recordCalculation(
      sql,
      lineage,
      applied.snapshotId,
      calculation,
      UTVI_COLLECTOR_IDENTITY,
    );
    outcome.calculation = "recorded";
    outcome.totalTokens = calculation.totalObservedTokens.toString();

    if (!publish) return outcome;

    const published = await publishCalculation(
      sql,
      lineage,
      calculationId,
      calculation,
      UTVI_UNIVERSE_DESCRIPTOR,
      sourceAsOf,
      UTVI_COLLECTOR_IDENTITY,
    );
    if (published.kind === "published") outcome.publication = "published";
    else if (published.kind === "superseded") outcome.publication = "superseded";
    else {
      outcome.publication =
        published.refusal.reason === "methodology_not_approved"
          ? "refused_methodology_not_approved"
          : "refused_no_change";
      outcome.publicationDetail = published.refusal.detail;
    }
  } catch (error) {
    outcome.calculation = "failed";
    outcome.calculationDetail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  return outcome;
}

/**
 * The daily run.
 *
 * Two reads: the day that just closed, and the day before it. Two of the source's five
 * hundred daily requests, which leaves the budget essentially untouched and satisfies the
 * source's own preference for cached, infrequent access.
 */
export async function runDailyUtvi(sql: SqlExecutor, options: UtviRunOptions = {}): Promise<UtviRunResult> {
  const now = (options.now ?? (() => new Date()))();
  const lineage = await resolveLineage(sql);
  const collectionDate = lastCompletedUtcDate(now);
  const settlementDate = settlementTargetDate(now);

  const result: UtviRunResult = {
    collectionDate,
    settlementDate,
    retrievals: [],
    dates: [],
    methodologyVersion: lineage.methodologyVersion,
    methodologyStatus: lineage.methodologyStatus,
    ok: true,
  };

  // The new point.
  await ingestWindow(sql, lineage, collectionDate, collectionDate, now, options.client, result, true);

  // The settlement confirmation. Skipped only by the backfill, which walks history in order
  // and settles each date as it passes.
  if (!options.skipSettlementRecheck && settlementDate < collectionDate) {
    await ingestWindow(sql, lineage, settlementDate, settlementDate, now, options.client, result, true);
  }

  return result;
}

export type UtviBackfillResult = {
  requestedStart: string;
  requestedEnd: string;
  servableStart: string | null;
  servableEnd: string | null;
  windowCount: number;
  requestCount: number;
  datesExpected: number;
  datesCovered: number;
  snapshotsCreated: number;
  snapshotsConfirmed: number;
  snapshotsRevised: number;
  snapshotsSettled: number;
  datesWithoutRows: number;
  calculationsRecorded: number;
  coverage: ReturnType<typeof verifyCoverage>;
  dates: DateOutcome[];
  ok: boolean;
};

/**
 * Backfill history, splitting into windows the source will serve.
 *
 * Idempotent by construction rather than by a flag: a second run re-reads the same dates,
 * finds the same content hashes, and confirms them. No duplicate snapshot, no duplicate
 * calculation, no duplicate publication. A date whose rows genuinely changed since the first
 * run is revised, which is the same path a late revision takes and is the behaviour that
 * makes running it twice a useful test rather than a risk.
 */
export async function backfillUtvi(
  sql: SqlExecutor,
  requestedStart: string,
  requestedEnd: string,
  options: UtviRunOptions & { publish?: boolean } = {},
): Promise<UtviBackfillResult> {
  const now = (options.now ?? (() => new Date()))();
  const lineage = await resolveLineage(sql);
  const plan = planBackfill(requestedStart, requestedEnd, now);

  const base: UtviBackfillResult = {
    requestedStart,
    requestedEnd,
    servableStart: plan?.startDate ?? null,
    servableEnd: plan?.endDate ?? null,
    windowCount: plan?.windows.length ?? 0,
    requestCount: 0,
    datesExpected: plan?.expectedDates.length ?? 0,
    datesCovered: 0,
    snapshotsCreated: 0,
    snapshotsConfirmed: 0,
    snapshotsRevised: 0,
    snapshotsSettled: 0,
    datesWithoutRows: 0,
    calculationsRecorded: 0,
    coverage: { complete: false, missing: [], sourceReturnedNoRows: [], duplicated: [], unexpected: [] },
    dates: [],
    ok: plan !== null,
  };

  if (plan === null) return base;

  const shell: UtviRunResult = {
    collectionDate: plan.endDate,
    settlementDate: plan.endDate,
    retrievals: [],
    dates: [],
    methodologyVersion: lineage.methodologyVersion,
    methodologyStatus: lineage.methodologyStatus,
    ok: true,
  };

  for (const window of plan.windows) {
    await ingestWindow(
      sql,
      lineage,
      window.startDate,
      window.endDate,
      now,
      options.client,
      shell,
      options.publish ?? true,
    );
    base.requestCount += 1;
  }

  base.dates = shell.dates;
  base.ok = shell.ok;
  for (const date of shell.dates) {
    if (date.snapshot === "created") base.snapshotsCreated += 1;
    else if (date.snapshot === "confirmed") base.snapshotsConfirmed += 1;
    else if (date.snapshot === "revised") base.snapshotsRevised += 1;
    else if (date.snapshot === "settled") base.snapshotsSettled += 1;
    else if (date.snapshot === "no_rows") base.datesWithoutRows += 1;
    if (date.calculation === "recorded") base.calculationsRecorded += 1;
  }

  // Verified against what the database actually holds, not against what the loop believes it
  // wrote. Dates the source served empty are passed in so they are accounted for rather than
  // counted as gaps: the source's own dataset has two such dates in its history, and reporting
  // them as failures every run would train an operator to ignore the check.
  const covered = await coveredDates(sql, plan.startDate, plan.endDate);
  const sourceEmpty = shell.dates.filter((d) => d.snapshot === "no_rows").map((d) => d.observationDate);
  base.datesCovered = covered.length;
  base.coverage = verifyCoverage(plan.expectedDates, covered, sourceEmpty);
  if (!base.coverage.complete) base.ok = false;

  return base;
}

/** A compact summary for a cron log. Carries no secret and no raw source row. */
export function utviRunSummary(result: UtviRunResult): Record<string, unknown> {
  const counts = result.dates.reduce<Record<string, number>>((acc, date) => {
    acc[date.snapshot] = (acc[date.snapshot] ?? 0) + 1;
    return acc;
  }, {});
  return {
    collectionDate: result.collectionDate,
    settlementDate: result.settlementDate,
    methodologyVersion: result.methodologyVersion,
    methodologyStatus: result.methodologyStatus,
    retrievals: result.retrievals.map((r) => ({ outcome: r.outcome, actualEnd: r.actualEnd, rows: r.rowCount })),
    snapshots: counts,
    calculations: result.dates.filter((d) => d.calculation === "recorded").length,
    publications: result.dates.filter((d) => d.publication === "published" || d.publication === "superseded").length,
    publicationRefusals: result.dates
      .filter((d) => d.publication.startsWith("refused"))
      .map((d) => ({ date: d.observationDate, reason: d.publication })),
    ok: result.ok,
  };
}
