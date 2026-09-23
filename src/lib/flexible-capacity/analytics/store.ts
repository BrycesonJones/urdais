/**
 * Persistence for the analytical layer.
 *
 * Two shapes with two lifetimes. A run is a lifecycle and may be updated: it opens `running` and
 * closes `validated` or `failed`. A scenario result is evidence and may not: the table carries
 * `forbid_mutation`, so a figure that turns out to be wrong is superseded by calculating again,
 * never rewritten. That asymmetry is the same one the rest of the platform uses, and it is the
 * reason a later reader can trust that a stored number is what the approved rules actually
 * produced rather than what someone later wished they had produced.
 *
 * Idempotence lives on `input_digest`, which is unique. Re-asking a question that has already been
 * answered against the same evidence returns the existing row rather than writing a second one, so
 * re-running a range is free and the table does not accumulate duplicate answers.
 */

import {
  FlexibleCapacityAnalyticsError,
  type AnalyticsRunOutcome, type RunKind, type ScenarioRecord, type SkippedMarketYear,
} from "@/lib/flexible-capacity/analytics/types";

export interface FlexibleCapacitySqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Slug -> grid_areas.id, so nothing has to hard-code a UUID. */
export async function resolveGridAreaIds(
  sql: FlexibleCapacitySqlExecutor,
): Promise<Map<string, string>> {
  const { rows } = await sql.query(`select id, slug from reference.grid_areas`, []);
  return new Map(rows.map((row) => [String(row.slug), String(row.id)]));
}

export async function openRun(
  sql: FlexibleCapacitySqlExecutor,
  input: {
    methodologyVersionId: string;
    methodologyContentHash: string;
    runKind: RunKind;
    markets: readonly string[];
    localYears: readonly number[];
    alphaScenarios: readonly number[];
    startedAt: string;
  },
): Promise<string> {
  const { rows } = await sql.query(
    `insert into pipeline.flexible_capacity_analytics_runs
       (methodology_version_id, methodology_content_hash, run_kind, run_status,
        markets, local_years, alpha_scenarios, started_at)
     values ($1, $2, $3, 'running', $4, $5, $6, $7::timestamptz)
     returning id`,
    [input.methodologyVersionId, input.methodologyContentHash, input.runKind,
      input.markets, input.localYears, input.alphaScenarios, input.startedAt],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new FlexibleCapacityAnalyticsError("persistence", "the run row was not created");
  return String(id);
}

export async function closeRunValidated(
  sql: FlexibleCapacitySqlExecutor,
  runId: string,
  input: {
    scenariosStored: number;
    scenariosReused: number;
    skipped: readonly SkippedMarketYear[];
    completedAt: string;
  },
): Promise<void> {
  await sql.query(
    `update pipeline.flexible_capacity_analytics_runs
        set run_status = 'validated', scenarios_stored = $2, scenarios_reused = $3,
            market_years_skipped = $4::jsonb, completed_at = $5::timestamptz
      where id = $1`,
    [runId, input.scenariosStored, input.scenariosReused, JSON.stringify(input.skipped), input.completedAt],
  );
}

export async function closeRunFailed(
  sql: FlexibleCapacitySqlExecutor,
  runId: string,
  input: { phase: string; errorClass: string; detail: string; completedAt: string },
): Promise<void> {
  await sql.query(
    `update pipeline.flexible_capacity_analytics_runs
        set run_status = 'failed', failed_phase = $2, error_class = $3, error_detail = $4,
            completed_at = $5::timestamptz
      where id = $1`,
    [runId, input.phase, input.errorClass, input.detail.slice(0, 4000), input.completedAt],
  );
}

export type ScenarioWrite = "inserted" | "reused";

/**
 * Store one scenario result, or recognise that it is already stored.
 *
 * `on conflict (input_digest) do nothing` is the whole idempotence mechanism. The digest covers
 * the observations, the methodology and its digest, the parameters that can change a number, and
 * alpha; if all of those match an existing row then the question and the evidence are identical
 * and so is the answer, and a second row would be a duplicate rather than a record of anything.
 */
export async function storeScenarioResult(
  sql: FlexibleCapacitySqlExecutor,
  input: {
    runId: string;
    gridAreaId: string;
    methodologyVersionId: string;
    record: ScenarioRecord;
  },
): Promise<ScenarioWrite> {
  const { record } = input;
  const { observed, assumptions, outcome } = record;
  const { rows } = await sql.query(
    `insert into pipeline.flexible_capacity_scenario_results (
        run_id, grid_area_id, methodology_version_id, methodology_content_hash,
        local_year, period_start, period_end, expected_observation_count,
        observations_digest, input_digest,
        peak_reference_mw, peak_reference_at, peak_region_local_date,
        peak_region_expected_hours, peak_region_present_hours,
        mean_load_mw, observation_count, missing_observation_count, coverage_ratio,
        max_contiguous_gap_hours,
        alpha, equivalent_full_load_hours, peak_reference_rule, peak_region_rule,
        rebound_model, modeled_load_shape, battery_enabled,
        minimum_annual_coverage, maximum_contiguous_gap_hours,
        headroom_mw, curtailed_energy_mwh, curtailment_budget_mwh,
        curtailment_clock_hours, curtailment_event_count,
        mean_curtailment_event_hours, max_curtailment_event_hours,
        calculated_at)
     values (
        $1, $2, $3, $4,
        $5, $6::timestamptz, $7::timestamptz, $8,
        $9, $10,
        $11::numeric, $12::timestamptz, $13::date,
        $14, $15,
        $16::numeric, $17, $18, $19::numeric,
        $20,
        $21::numeric, $22::numeric, $23, $24,
        $25, $26, $27,
        $28::numeric, $29,
        $30::numeric, $31::numeric, $32::numeric,
        $33, $34,
        $35::numeric, $36,
        $37::timestamptz)
     on conflict (input_digest) do nothing
     returning id`,
    [
      input.runId, input.gridAreaId, input.methodologyVersionId, record.methodology.documentSha256,
      record.modeledPeriod.localYear, record.modeledPeriod.startUtc, record.modeledPeriod.endUtc,
      record.modeledPeriod.expectedObservationCount,
      record.observationsDigest, record.inputDigest,
      observed.peakReferenceMw, observed.peakReferenceAtUtc, observed.peakRegionLocalDate,
      observed.peakRegionExpectedHours, observed.peakRegionPresentHours,
      observed.meanLoadMw, observed.observationCount, observed.missingObservationCount,
      observed.coverageRatio, observed.maxContiguousGapHours,
      assumptions.annualCurtailmentEnergyFraction, assumptions.equivalentFullLoadHours,
      assumptions.peakReferenceRule, assumptions.peakRegionRule,
      assumptions.reboundModel, assumptions.modeledLoadShape, assumptions.batteryEnabled,
      assumptions.minimumAnnualCoverage, assumptions.maximumContiguousGapHours,
      outcome.curtailmentEnabledHeadroomMw, outcome.curtailedEnergyMwh, outcome.curtailmentBudgetMwh,
      outcome.curtailmentClockHours, outcome.curtailmentEventCount,
      outcome.meanCurtailmentEventHours, outcome.maxCurtailmentEventHours,
      record.calculatedAt,
    ],
  );
  return rows.length > 0 ? "inserted" : "reused";
}

/** Operational invariants, as the database sees them. Expected to be empty. */
export async function flexibleCapacityViolations(
  sql: FlexibleCapacitySqlExecutor,
): Promise<{ checkName: string; detail: string; offending: number }[]> {
  const { rows } = await sql.query(`select * from pipeline.flexible_capacity_violations()`, []);
  return rows.map((row) => ({
    checkName: String(row.check_name),
    detail: String(row.detail),
    offending: Number(row.offending),
  }));
}

/** A run summary, for reporting without re-deriving anything. */
export async function readRun(
  sql: FlexibleCapacitySqlExecutor, runId: string,
): Promise<Pick<AnalyticsRunOutcome, "status" | "scenariosStored" | "scenariosReused"> | null> {
  const { rows } = await sql.query(
    `select run_status, scenarios_stored, scenarios_reused
       from pipeline.flexible_capacity_analytics_runs where id = $1`,
    [runId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    status: String(row.run_status) as AnalyticsRunOutcome["status"],
    scenariosStored: Number(row.scenarios_stored),
    scenariosReused: Number(row.scenarios_reused),
  };
}
