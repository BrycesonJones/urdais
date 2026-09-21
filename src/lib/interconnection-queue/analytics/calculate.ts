/**
 * The derived analytics engine.
 *
 * One calculation path, and it asks `methodology.ts` every question it has about eligibility.
 * Nothing here decides which lifecycle stages count, which subtypes are excluded, which MW field
 * a market uses, whether a cohort is mature or whether a market may be published — it looks all
 * of that up. That is the point: IQ-5 settled the math, and an engine that re-derived any of it
 * would let the two drift.
 *
 * Every metric returns either a value with the sample it rests on, or a status saying why there
 * is none. There is no third option and no zero: the database refuses a live result with no
 * value and a non-live result with one.
 */

import { createHash } from "node:crypto";

import {
  ACTIVE_STAGES, AI_LOAD_END_USE, ELIGIBLE_SUBTYPES, ERCOT_FIRST_SEEN_SERIES_BEGINS,
  MARKET_ENTRY_BASIS, MARKET_MW_FIELD, METHODOLOGY_SLUG, METHODOLOGY_VERSION,
  MINIMUM_SAMPLES, mayPublishMarketMetric, meetsSampleFloor, projectCompletionRate,
} from "@/lib/interconnection-queue/analytics/methodology";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export const ANALYTICS_MARKETS = ["pjm", "miso", "caiso", "ercot", "nyiso", "iso-ne", "spp"] as const;

export type MetricStatus =
  | "live" | "not_available" | "insufficient_sample" | "insufficient_maturity"
  | "rights_blocked" | "methodology_deferred" | "source_unavailable";

export type MetricResult = {
  metricCode: string;
  marketSlug: string;
  dimensionKind: string | null;
  dimensionValue: string | null;
  status: MetricStatus;
  value: number | null;
  unit: "requests" | "MW" | "ratio" | "years";
  nativeField: string | null;
  basis: "source_reported_application_date" | "snapshot_first_seen" | null;
  sampleSize: number;
  populationSize: number;
  excludedCount: number;
  coverage: Record<string, unknown>;
  publicationState: "publishable" | "internal_only";
  rightsReason: string | null;
};

export type AnalyticsRun = {
  methodologyVersion: string;
  calculatedAt: string;
  inputDigest: string;
  snapshotIds: string[];
  requestCount: number;
  observationCount: number;
  results: MetricResult[];
};

/** The reference date every point-in-time metric is measured against. */
export type CalculateOptions = { asOf?: string };

const SQL_ACTIVE = ACTIVE_STAGES.map((stage) => `'${stage}'`).join(",");
const SQL_ELIGIBLE = ELIGIBLE_SUBTYPES.map((subtype) => `'${subtype}'`).join(",");
/** Generation-family classes, from the methodology. Load is never in this set. */
const SQL_GENERATION = "'generation','storage','mixed'";

/** A result that carries no number, and says why. */
function absent(
  base: Omit<MetricResult, "status" | "value">, status: MetricStatus,
): MetricResult {
  return { ...base, status, value: null };
}

function publication(marketSlug: string): Pick<MetricResult, "publicationState" | "rightsReason"> {
  return mayPublishMarketMetric(marketSlug)
    ? { publicationState: "publishable", rightsReason: null }
    : {
        publicationState: "internal_only",
        rightsReason: "the source terms exclude commercial publication; computed internally and never displayed",
      };
}

/**
 * Compute every V1 metric for every market.
 *
 * Markets are iterated rather than special-cased: a market that cannot support a metric gets a
 * status for it, which is how the API can say "ERCOT has no queue age" instead of showing a gap.
 */
export async function calculateQueueAnalytics(
  sql: CapacitySqlExecutor, options: CalculateOptions = {},
): Promise<AnalyticsRun> {
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const results: MetricResult[] = [];

  // The canonical inputs this run reads, and their digest. An unchanged digest is an unchanged
  // answer, which is what makes a rerun a no-op rather than a second copy of the same numbers.
  const fingerprint = await sql.query(
    `select coalesce(count(distinct q.id), 0)::int as snapshots,
            coalesce(count(distinct r.id), 0)::int as requests,
            coalesce(count(o.id), 0)::int as observations,
            coalesce(max(o.created_at)::text, '') as latest_observation,
            coalesce(array_agg(distinct q.id::text order by q.id::text)
                     filter (where q.id is not null), array[]::text[]) as snapshot_ids
       from pipeline.interconnection_queue_snapshots q
       left join pipeline.interconnection_requests r on r.source_interface_id = q.source_interface_id
       left join pipeline.interconnection_request_observations o on o.request_id = r.id and o.is_latest`,
    [],
  );
  const row = fingerprint.rows[0] ?? {};
  const snapshotIds = (row.snapshot_ids ?? []) as string[];
  const inputDigest = createHash("sha256").update(JSON.stringify([
    METHODOLOGY_SLUG, METHODOLOGY_VERSION, asOf,
    row.snapshots, row.requests, row.observations, row.latest_observation, snapshotIds,
  ])).digest("hex");

  for (const marketSlug of ANALYTICS_MARKETS) {
    const rights = publication(marketSlug);

    // ---------------------------------------------------------------- active stock
    const stock = await sql.query(
      `select count(*) filter (where o.lifecycle_stage in (${SQL_ACTIVE})
                                 and t.code in (${SQL_ELIGIBLE})
                                 and o.request_class in (${SQL_GENERATION}))::int as active,
              count(*)::int as population,
              count(*) filter (where o.lifecycle_stage = 'unknown')::int as unknown_stage,
              count(*) filter (where t.code not in (${SQL_ELIGIBLE}))::int as excluded_subtype,
              count(*) filter (where o.request_class = 'load')::int as load_requests
         from pipeline.interconnection_request_observations o
         join pipeline.interconnection_requests r on r.id = o.request_id
         join reference.grid_areas a on a.id = r.grid_area_id
         join reference.interconnection_request_subtypes t on t.code = o.request_subtype
        where a.slug = $1 and o.is_latest`,
      [marketSlug],
    );
    const s = stock.rows[0];
    const activeCount = Number(s?.active ?? 0);
    const population = Number(s?.population ?? 0);
    const coverage = {
      unknownStage: Number(s?.unknown_stage ?? 0),
      excludedSubtype: Number(s?.excluded_subtype ?? 0),
      loadRequests: Number(s?.load_requests ?? 0),
    };
    const stockBase = {
      metricCode: "active_request_count", marketSlug, dimensionKind: null, dimensionValue: null,
      unit: "requests" as const, nativeField: null, basis: null,
      sampleSize: activeCount, populationSize: population,
      excludedCount: population - activeCount, coverage, ...rights,
    };
    results.push(population === 0
      ? absent(stockBase, "source_unavailable")
      : { ...stockBase, status: "live", value: activeCount });

    // ---------------------------------------------------------------- technology mix
    if (activeCount > 0) {
      const gate = meetsSampleFloor(activeCount, "technologyShare");
      const mix = await sql.query(
        `select rs.technology, count(distinct r.id)::int as n
           from pipeline.interconnection_request_resources rs
           join pipeline.interconnection_request_observations o on o.id = rs.observation_id
           join pipeline.interconnection_requests r on r.id = o.request_id
           join reference.grid_areas a on a.id = r.grid_area_id
           join reference.interconnection_request_subtypes t on t.code = o.request_subtype
          where a.slug = $1 and o.is_latest
            and o.lifecycle_stage in (${SQL_ACTIVE}) and t.code in (${SQL_ELIGIBLE})
            and o.request_class in (${SQL_GENERATION})
          group by 1 order by 2 desc`,
        [marketSlug],
      );
      for (const technology of mix.rows) {
        // A project with two resources is counted once under each technology it names, never as
        // two projects. Shares therefore sum above 100% and the API says so.
        const base = {
          metricCode: "active_request_count_by_technology", marketSlug,
          dimensionKind: "technology" as const, dimensionValue: String(technology.technology),
          unit: "requests" as const, nativeField: null, basis: null,
          sampleSize: Number(technology.n), populationSize: activeCount, excludedCount: 0,
          coverage: { multiLabel: true, note: "a project is counted once per technology it names" },
          ...rights,
        };
        results.push(gate.publishable
          ? { ...base, status: "live", value: Number(technology.n) }
          : absent(base, "insufficient_sample"));
      }
    }

    // ---------------------------------------------------------------- market-specific MW
    const mwField = MARKET_MW_FIELD[marketSlug] ?? null;
    const mwBase = {
      metricCode: "active_mw", marketSlug, dimensionKind: null, dimensionValue: null,
      unit: "MW" as const, nativeField: mwField?.field ?? null, basis: null,
      sampleSize: 0, populationSize: activeCount, excludedCount: 0,
      coverage: mwField === null
        ? { deferred: "the publisher offers several MW fields and states no preference among them" }
        : { quantityKind: mwField.kind },
      ...rights,
    };
    if (mwField === null) {
      // PJM and ERCOT. Deferred by the methodology rather than resolved by picking a field.
      results.push(absent(mwBase, "methodology_deferred"));
    } else {
      const mw = await sql.query(
        `select sum(qt.value)::numeric as total, count(*)::int as n
           from pipeline.interconnection_request_quantities qt
           join pipeline.interconnection_request_observations o on o.id = qt.observation_id
           join pipeline.interconnection_requests r on r.id = o.request_id
           join reference.grid_areas a on a.id = r.grid_area_id
           join reference.interconnection_request_subtypes t on t.code = o.request_subtype
          where a.slug = $1 and o.is_latest and qt.native_field = $2
            and o.lifecycle_stage in (${SQL_ACTIVE}) and t.code in (${SQL_ELIGIBLE})
            and o.request_class in (${SQL_GENERATION})`,
        [marketSlug, mwField.field],
      );
      const total = mw.rows[0]?.total;
      const n = Number(mw.rows[0]?.n ?? 0);
      results.push(total == null || n === 0
        ? absent({ ...mwBase, sampleSize: n }, "not_available")
        : { ...mwBase, status: "live", value: Number(total), sampleSize: n });
    }

    // ---------------------------------------------------------------- queue age
    const age = await sql.query(
      `select count(*)::int as n,
              percentile_cont(0.5) within group (order by ($2::date - o.requested_on))::numeric as p50,
              percentile_cont(0.75) within group (order by ($2::date - o.requested_on))::numeric as p75,
              percentile_cont(0.9) within group (order by ($2::date - o.requested_on))::numeric as p90
         from pipeline.interconnection_request_observations o
         join pipeline.interconnection_requests r on r.id = o.request_id
         join reference.grid_areas a on a.id = r.grid_area_id
         join reference.interconnection_request_subtypes t on t.code = o.request_subtype
        where a.slug = $1 and o.is_latest and o.requested_on is not null
          and o.lifecycle_stage in (${SQL_ACTIVE}) and t.code in (${SQL_ELIGIBLE})
          and o.request_class in (${SQL_GENERATION})`,
      [marketSlug, asOf],
    );
    const ageRow = age.rows[0];
    const ageN = Number(ageRow?.n ?? 0);
    for (const [statistic, column, floor] of [
      ["median", "p50", "median"], ["p75", "p75", "p75"], ["p90", "p90", "p90"],
    ] as const) {
      const base = {
        metricCode: "queue_age_years", marketSlug,
        dimensionKind: "statistic" as const, dimensionValue: statistic,
        unit: "years" as const, nativeField: null, basis: null,
        sampleSize: ageN, populationSize: activeCount,
        excludedCount: Math.max(0, activeCount - ageN),
        coverage: { requiresRequestDate: true, activeWithoutRequestDate: Math.max(0, activeCount - ageN) },
        ...rights,
      };
      if (ageN === 0) {
        // ERCOT: the GIS report publishes no request date at all.
        results.push(absent(base, "not_available"));
        continue;
      }
      const gate = meetsSampleFloor(ageN, floor);
      const days = ageRow?.[column];
      results.push(gate.publishable && days != null
        ? { ...base, status: "live", value: Number(days) / 365.25 }
        : absent(base, "insufficient_sample"));
    }

    // ---------------------------------------------------------------- entries
    const basis = MARKET_ENTRY_BASIS[marketSlug] ?? "source_reported_application_date";
    const entries = basis === "snapshot_first_seen"
      ? await sql.query(
          `select extract(year from fs)::int as period, count(*)::int as n from (
             select rr.native_queue_id, min(qs.report_period) as fs
               from pipeline.raw_interconnection_queue_records rr
               join pipeline.interconnection_queue_snapshots qs on qs.id = rr.snapshot_id
               join reference.source_interfaces si on si.id = qs.source_interface_id
               join reference.grid_areas a on a.id = qs.grid_area_id
              where a.slug = $1 group by 1) t
            where fs >= $2::date group by 1 order by 1`,
          [marketSlug, ERCOT_FIRST_SEEN_SERIES_BEGINS])
      : await sql.query(
          `select extract(year from o.requested_on)::int as period, count(*)::int as n
             from pipeline.interconnection_request_observations o
             join pipeline.interconnection_requests r on r.id = o.request_id
             join reference.grid_areas a on a.id = r.grid_area_id
             join reference.interconnection_request_subtypes t on t.code = o.request_subtype
            where a.slug = $1 and o.is_latest and o.requested_on is not null
              and t.code in (${SQL_ELIGIBLE}) and o.request_class in (${SQL_GENERATION})
            group by 1 order by 1`,
          [marketSlug]);
    for (const period of entries.rows) {
      results.push({
        metricCode: "annual_entries", marketSlug,
        dimensionKind: "period_year", dimensionValue: String(period.period),
        status: "live", value: Number(period.n), unit: "requests",
        nativeField: null, basis,
        sampleSize: Number(period.n), populationSize: population, excludedCount: 0,
        coverage: basis === "snapshot_first_seen"
          ? { note: "first vintage in which Urdais observed the request, not an application date",
              seriesBegins: ERCOT_FIRST_SEEN_SERIES_BEGINS }
          : { note: "the publisher's own application date" },
        ...rights,
      });
    }

    // ---------------------------------------------------------------- withdrawals
    const withdrawals = await sql.query(
      `select count(*)::int as total,
              count(*) filter (where o.withdrawn_on is not null)::int as dated
         from pipeline.interconnection_request_observations o
         join pipeline.interconnection_requests r on r.id = o.request_id
         join reference.grid_areas a on a.id = r.grid_area_id
         join reference.interconnection_request_subtypes t on t.code = o.request_subtype
        where a.slug = $1 and o.is_latest and o.lifecycle_stage = 'withdrawn'
          and t.code in (${SQL_ELIGIBLE}) and o.request_class in (${SQL_GENERATION})`,
      [marketSlug],
    );
    const wTotal = Number(withdrawals.rows[0]?.total ?? 0);
    const wDated = Number(withdrawals.rows[0]?.dated ?? 0);
    const withdrawalBase = {
      metricCode: "annual_withdrawals", marketSlug, dimensionKind: null, dimensionValue: null,
      unit: "requests" as const, nativeField: null, basis: null,
      sampleSize: wTotal, populationSize: population, excludedCount: 0,
      coverage: { dated: wDated, undated: wTotal - wDated,
        note: wDated === 0 && wTotal > 0
          ? "the publisher states withdrawals without dates, so a count is available and a time series is not"
          : "source-reported withdrawals only; a request that stops appearing has not withdrawn" },
      ...rights,
    };
    results.push(wTotal === 0
      ? absent(withdrawalBase, "not_available")
      : { ...withdrawalBase, status: "live", value: wTotal });

    if (wDated > 0) {
      const flow = await sql.query(
        `select extract(year from o.withdrawn_on)::int as period, count(*)::int as n
           from pipeline.interconnection_request_observations o
           join pipeline.interconnection_requests r on r.id = o.request_id
           join reference.grid_areas a on a.id = r.grid_area_id
           join reference.interconnection_request_subtypes t on t.code = o.request_subtype
          where a.slug = $1 and o.is_latest and o.withdrawn_on is not null
            and t.code in (${SQL_ELIGIBLE}) and o.request_class in (${SQL_GENERATION})
          group by 1 order by 1`,
        [marketSlug],
      );
      for (const period of flow.rows) {
        results.push({
          metricCode: "annual_withdrawals", marketSlug,
          dimensionKind: "period_year", dimensionValue: String(period.period),
          status: "live", value: Number(period.n), unit: "requests",
          nativeField: null, basis: null,
          sampleSize: Number(period.n), populationSize: wTotal, excludedCount: 0,
          coverage: { note: "by the publisher's own withdrawal date" }, ...rights,
        });
      }
    }

    // ---------------------------------------------------------------- time to operation
    const t2o = await sql.query(
      `select count(*)::int as n,
              percentile_cont(0.5) within group (order by (o.actual_in_service_on - o.requested_on))::numeric as p50,
              percentile_cont(0.75) within group (order by (o.actual_in_service_on - o.requested_on))::numeric as p75,
              percentile_cont(0.9) within group (order by (o.actual_in_service_on - o.requested_on))::numeric as p90
         from pipeline.interconnection_request_observations o
         join pipeline.interconnection_requests r on r.id = o.request_id
         join reference.grid_areas a on a.id = r.grid_area_id
         join reference.interconnection_request_subtypes t on t.code = o.request_subtype
        where a.slug = $1 and o.is_latest and o.lifecycle_stage = 'operational'
          and o.actual_in_service_on is not null and o.requested_on is not null
          and o.actual_in_service_on >= o.requested_on
          and t.code in (${SQL_ELIGIBLE}) and o.request_class in (${SQL_GENERATION})`,
      [marketSlug],
    );
    const t2oRow = t2o.rows[0];
    const t2oN = Number(t2oRow?.n ?? 0);
    const p90Years = t2oRow?.p90 == null ? null : Number(t2oRow.p90) / 365.25;

    for (const [statistic, column, floor] of [
      ["median", "p50", "median"], ["p75", "p75", "p75"], ["p90", "p90", "p90"],
    ] as const) {
      const base = {
        metricCode: "time_to_operation_years", marketSlug,
        dimensionKind: "statistic" as const, dimensionValue: statistic,
        unit: "years" as const, nativeField: null, basis: null,
        sampleSize: t2oN, populationSize: population, excludedCount: 0,
        coverage: { requiresBothDates: true,
          note: "requires the publisher's own application date and its own actual commercial operation date" },
        ...rights,
      };
      if (t2oN === 0) {
        // ERCOT, MISO, NYISO, ISO-NE: no actual commercial operation date is published.
        results.push(absent(base, "not_available"));
        continue;
      }
      const gate = meetsSampleFloor(t2oN, floor);
      const days = t2oRow?.[column];
      results.push(gate.publishable && days != null
        ? { ...base, status: "live", value: Number(days) / 365.25 }
        : absent(base, "insufficient_sample"));
    }

    // ---------------------------------------------------------------- completion, by cohort
    const cohorts = await sql.query(
      `select extract(year from o.requested_on)::int as cohort,
              count(*)::int as entrants,
              count(*) filter (where o.lifecycle_stage = 'operational')::int as operated,
              count(*) filter (where o.lifecycle_stage not in ('operational','withdrawn'))::int as unresolved
         from pipeline.interconnection_request_observations o
         join pipeline.interconnection_requests r on r.id = o.request_id
         join reference.grid_areas a on a.id = r.grid_area_id
         join reference.interconnection_request_subtypes t on t.code = o.request_subtype
        where a.slug = $1 and o.is_latest and o.requested_on is not null
          and t.code in (${SQL_ELIGIBLE}) and o.request_class in (${SQL_GENERATION})
        group by 1 order by 1`,
      [marketSlug],
    );
    const asOfYear = Number(asOf.slice(0, 4)) + (Number(asOf.slice(5, 7)) - 0.5) / 12;
    const mature: { cohort: number; entrants: number; operated: number; unresolved: number }[] = [];

    for (const cohort of cohorts.rows) {
      const entrants = Number(cohort.entrants);
      const operated = Number(cohort.operated);
      const unresolved = Number(cohort.unresolved);
      const cohortYear = Number(cohort.cohort);
      const windowYears = asOfYear - (cohortYear + 0.5);
      const rate = projectCompletionRate({
        cohortEntrants: entrants, operated, unresolved,
        observationWindowYears: windowYears, marketP90TimeToOperationYears: p90Years,
      });
      const base = {
        metricCode: "project_completion_rate", marketSlug,
        dimensionKind: "cohort_year" as const, dimensionValue: String(cohortYear),
        unit: "ratio" as const, nativeField: null, basis: MARKET_ENTRY_BASIS[marketSlug] ?? null,
        sampleSize: entrants, populationSize: entrants, excludedCount: 0,
        coverage: {
          operated, unresolved, unresolvedShare: rate.unresolvedShare,
          observationWindowYears: Number(windowYears.toFixed(2)),
          marketP90TimeToOperationYears: p90Years === null ? null : Number(p90Years.toFixed(2)),
        },
        ...rights,
      };
      if (rate.status === "published") {
        results.push({ ...base, status: "live", value: rate.rate });
        mature.push({ cohort: cohortYear, entrants, operated, unresolved });
      } else {
        results.push(absent(base,
          rate.status === "insufficient_sample" ? "insufficient_sample" : "insufficient_maturity"));
      }
    }

    // The headline completion figure: every mature cohort pooled, or a status saying why not.
    const pooledEntrants = mature.reduce((total, cohort) => total + cohort.entrants, 0);
    const pooledOperated = mature.reduce((total, cohort) => total + cohort.operated, 0);
    const pooledBase = {
      metricCode: "project_completion_rate", marketSlug,
      dimensionKind: null, dimensionValue: null,
      unit: "ratio" as const, nativeField: null, basis: MARKET_ENTRY_BASIS[marketSlug] ?? null,
      sampleSize: pooledEntrants, populationSize: population, excludedCount: 0,
      coverage: {
        cohortYears: mature.map((cohort) => cohort.cohort),
        operated: pooledOperated,
        withdrawnOrUnresolved: pooledEntrants - pooledOperated,
        marketP90TimeToOperationYears: p90Years === null ? null : Number(p90Years.toFixed(2)),
        note: p90Years === null
          ? "no observed time to operation, so no maturity yardstick and no cohort can be judged mature"
          : "mature cohorts only: observation window at least the market p90 and unresolved share at most 15%",
      },
      ...rights,
    };
    results.push(mature.length > 0 && pooledEntrants >= MINIMUM_SAMPLES.completionRate
      ? { ...pooledBase, status: "live", value: pooledOperated / pooledEntrants }
      : absent(pooledBase, p90Years === null ? "not_available" : "insufficient_maturity"));

    // ---------------------------------------------------------------- AI data-centre load
    const ai = await sql.query(
      `select count(*)::int as n,
              sum(qt.value) filter (where qt.native_field = 'Peak MW load')::numeric as mw
         from pipeline.interconnection_request_observations o
         join pipeline.interconnection_requests r on r.id = o.request_id
         join reference.grid_areas a on a.id = r.grid_area_id
         left join pipeline.interconnection_request_quantities qt on qt.observation_id = o.id
        where a.slug = $1 and o.is_latest and o.request_class = 'load'
          and o.load_end_use = $2`,
      [marketSlug, AI_LOAD_END_USE],
    );
    const aiN = Number(ai.rows[0]?.n ?? 0);
    const aiBase = {
      metricCode: "explicit_ai_data_center_load", marketSlug,
      dimensionKind: null, dimensionValue: null,
      unit: "requests" as const, nativeField: null, basis: null,
      sampleSize: aiN, populationSize: coverage.loadRequests, excludedCount: 0,
      coverage: {
        loadMw: ai.rows[0]?.mw == null ? null : Number(ai.rows[0].mw),
        note: "from the publisher's own end-use code only; a market publishing no classification has an unknown AI load, not a zero one",
      },
      ...rights,
    };
    // A market with no load queue at all has an unknown AI load, never a zero one.
    results.push(coverage.loadRequests === 0
      ? absent(aiBase, "not_available")
      : { ...aiBase, status: "live", value: aiN });

    // ---------------------------------------------------------------- deferred by methodology
    results.push({
      metricCode: "mw_completion_rate", marketSlug, dimensionKind: null, dimensionValue: null,
      status: "methodology_deferred", value: null, unit: "ratio",
      nativeField: null, basis: null, sampleSize: 0, populationSize: population, excludedCount: 0,
      coverage: { note: "the two markets that support a project completion rate are exactly the two with no agreed MW field" },
      ...rights,
    });
  }

  // A market whose terms block publication contributes nothing publishable, whatever its status.
  for (const result of results) {
    if (!mayPublishMarketMetric(result.marketSlug)) {
      result.publicationState = "internal_only";
      if (result.status === "live") result.status = "rights_blocked";
      result.value = null;
    }
  }

  return {
    methodologyVersion: METHODOLOGY_VERSION,
    calculatedAt: new Date().toISOString(),
    inputDigest,
    snapshotIds,
    requestCount: Number(row.requests ?? 0),
    observationCount: Number(row.observations ?? 0),
    results,
  };
}
