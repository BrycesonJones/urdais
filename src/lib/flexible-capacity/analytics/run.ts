/**
 * The analytics runner.
 *
 * Sequence: guard the methodology against the registry, open a ledger row, load each market-year's
 * canonical observations, judge eligibility, calculate every alpha for the years that pass,
 * validate the whole set, store it, close the ledger.
 *
 * Two things it deliberately does not do.
 *
 * It does not publish. A validated run leaves scenario results in the table; deciding which of
 * them a public surface serves is FC-4's problem, and `assertPublicationAuthorized` is the gate
 * that will govern it. A run succeeding is not a publication.
 *
 * It does not degrade. A market-year that fails eligibility is skipped with its reasons recorded,
 * not modelled with a caveat. A validation failure fails the whole run rather than storing the
 * results that happened to pass, because the cross-result invariants -- monotonicity in alpha,
 * one evidence set per market-year -- are properties of the set and a partial set cannot have them.
 */

import {
  METHODOLOGY_DOCUMENT_SHA256, METHODOLOGY_VERSION, assertMethodologyApproved,
} from "@/lib/flexible-capacity/methodology";
import { localYearWindow } from "@/lib/flexible-capacity/period";
import { calculateMarketYear } from "@/lib/flexible-capacity/analytics/calculate";
import { validateScenarioRecord, validateScenarioSet } from "@/lib/flexible-capacity/analytics/validate";
import {
  closeRunFailed, closeRunValidated, openRun, resolveGridAreaIds, storeScenarioResult,
  type FlexibleCapacitySqlExecutor,
} from "@/lib/flexible-capacity/analytics/store";
import {
  FlexibleCapacityAnalyticsError,
  type AnalyticsRunOutcome, type AnalyticsRunRequest, type FailedPhase, type ScenarioRecord,
  type SkippedMarketYear,
} from "@/lib/flexible-capacity/analytics/types";
import type { FlexibleCapacityMarket, HourlyLoadPoint } from "@/lib/flexible-capacity/types";

/** Coarse classes that survive rewording, as the ledger records them. */
function classify(error: unknown, where: FailedPhase): { phase: FailedPhase; klass: string } {
  if (error instanceof FlexibleCapacityAnalyticsError) {
    return { phase: error.phase, klass: error.phase === "methodology_guard" ? "methodology_not_approved" : "unexpected" };
  }
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/methodology .* is not usable|not registered|not approved/i.test(detail)) {
    return { phase: "methodology_guard", klass: "methodology_not_approved" };
  }
  if (/scenario input is invalid|coverage|peak reference|peak day/i.test(detail)) {
    return { phase: "eligibility", klass: "market_year_ineligible" };
  }
  if (/duplicate key|constraint|violates/i.test(detail)) {
    return { phase: "persistence", klass: "persistence_conflict" };
  }
  return { phase: where, klass: "unexpected" };
}

export async function loadMarketYearSeries(
  sql: FlexibleCapacitySqlExecutor,
  market: FlexibleCapacityMarket,
  startUtc: string,
  endUtc: string,
): Promise<HourlyLoadPoint[]> {
  const { rows } = await sql.query(
    `select po.period_start, po.value_mw::float8 as value_mw
       from pipeline.power_observations po
       join reference.grid_areas ga on ga.id = po.grid_area_id
       join reference.power_metrics pm on pm.id = po.power_metric_id
      where ga.slug = $1 and pm.code = 'actual_load'
        and po.superseded_by_id is null
        and po.period_start >= $2::timestamptz and po.period_start < $3::timestamptz
      order by po.period_start`,
    [market, startUtc, endUtc],
  );
  return rows.map((row) => ({
    periodStartUtc: new Date(row.period_start as string | Date).toISOString(),
    valueMw: Number(row.value_mw),
  }));
}

export async function runFlexibleCapacityAnalytics(
  sql: FlexibleCapacitySqlExecutor,
  request: AnalyticsRunRequest,
): Promise<AnalyticsRunOutcome> {
  const clock = request.now ?? (() => new Date());
  const startedAt = clock().toISOString();
  const started = Date.now();
  const base = {
    runKind: request.runKind,
    methodologyVersion: METHODOLOGY_VERSION,
    methodologyContentHash: METHODOLOGY_DOCUMENT_SHA256,
    scenariosCalculated: 0, scenariosStored: 0, scenariosReused: 0,
    marketYearsEligible: 0, marketYearsSkipped: [] as SkippedMarketYear[],
  };

  // The methodology guard runs before the ledger row, so an unapproved methodology leaves no
  // half-open run behind: there was never a run to speak of.
  let methodologyVersionId: string;
  try {
    ({ methodologyVersionId } = await assertMethodologyApproved(sql));
  } catch (error) {
    const { phase, klass } = classify(error, "methodology_guard");
    return {
      ...base, runId: null, status: "failed", failedPhase: phase, errorClass: klass,
      errorDetail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      elapsedMs: Date.now() - started,
    };
  }

  const runId = await openRun(sql, {
    methodologyVersionId,
    methodologyContentHash: METHODOLOGY_DOCUMENT_SHA256,
    runKind: request.runKind,
    markets: request.markets,
    localYears: request.localYears,
    alphaScenarios: request.alphaScenarios,
    startedAt,
  });

  try {
    const gridAreaIds = await resolveGridAreaIds(sql);
    const skipped: SkippedMarketYear[] = [];
    const records: ScenarioRecord[] = [];
    let eligible = 0;

    for (const market of request.markets) {
      if (!gridAreaIds.has(market)) {
        throw new FlexibleCapacityAnalyticsError("eligibility", `no grid area is registered for ${market}`);
      }
      for (const localYear of request.localYears) {
        const period = localYearWindow(market, localYear);
        const series = await loadMarketYearSeries(sql, market, period.startUtc, period.endUtc);
        const calculation = calculateMarketYear(market, period, series, request.alphaScenarios, {
          allowUnresolvedGapThreshold: request.allowUnresolvedGapThreshold,
          now: clock,
        });
        if (!calculation.eligibility.eligible) {
          skipped.push({
            market, localYear,
            reason: calculation.eligibility.failures.map((failure) => failure.detail).join("; "),
            failureCodes: calculation.eligibility.failures.map((failure) => failure.code),
          });
          continue;
        }
        eligible += 1;
        records.push(...calculation.scenarios);
      }
    }

    // Validation is over the whole set, so a run either stores a coherent set or stores nothing.
    const problems = [
      ...records.flatMap(validateScenarioRecord),
      ...validateScenarioSet(records),
    ];
    if (problems.length > 0) {
      throw new FlexibleCapacityAnalyticsError("validation", problems.slice(0, 10).join(" | "));
    }

    let stored = 0;
    let reused = 0;
    for (const record of records) {
      const write = await storeScenarioResult(sql, {
        runId,
        gridAreaId: gridAreaIds.get(record.market)!,
        methodologyVersionId,
        record,
      });
      if (write === "inserted") stored += 1; else reused += 1;
    }

    const completedAt = clock().toISOString();
    await closeRunValidated(sql, runId, {
      scenariosStored: stored, scenariosReused: reused, skipped, completedAt,
    });

    return {
      ...base, runId, status: "validated",
      scenariosCalculated: records.length, scenariosStored: stored, scenariosReused: reused,
      marketYearsEligible: eligible, marketYearsSkipped: skipped,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    const { phase, klass } = classify(error, "calculation");
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    await closeRunFailed(sql, runId, {
      phase, errorClass: klass, detail, completedAt: clock().toISOString(),
    });
    return {
      ...base, runId, status: "failed", failedPhase: phase, errorClass: klass, errorDetail: detail,
      elapsedMs: Date.now() - started,
    };
  }
}
