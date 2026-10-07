/**
 * The public read model for queue analytics.
 *
 * One rule shapes this file: a market whose terms block publication never reaches a caller. The
 * filter is `publication_state = 'publishable'` applied in SQL, not a field a renderer is trusted
 * to check, so an SPP figure cannot be serialised into a page, a prop, a tooltip or a JSON
 * response by anybody forgetting to filter.
 *
 * The second rule is that an absent value is never a zero. Every metric arrives with a status,
 * and only `live` carries a number.
 */

import {
  METHODOLOGY_SLUG, METHODOLOGY_VERSION, mayPublishMarketMetric,
} from "@/lib/interconnection-queue/analytics/methodology";
import type { MetricStatus } from "@/lib/interconnection-queue/analytics/calculate";
import {
  assessFreshness, FRESHNESS_CHECK_JOINS, FRESHNESS_COLUMNS, freshnessInputsFromRow,
  type FreshnessBasis, type FreshnessCondition,
} from "@/lib/interconnection-queue/monitor";
import type { CurrentnessStatus } from "@/lib/interconnection-queue/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type MetricValue = {
  metric: string;
  label: string;
  family: string;
  comparability: "A" | "B" | "C" | "none";
  dimension: { kind: string; value: string } | null;
  status: MetricStatus;
  value: number | null;
  unit: string;
  /** The publisher's own field, where the value came from one. Required for any MW figure. */
  nativeField: string | null;
  basis: string | null;
  sampleSize: number;
  populationSize: number;
  coverage: Record<string, unknown>;
};

export type MarketAnalytics = {
  marketSlug: string;
  marketName: string;
  sourceName: string;
  attribution: string | null;
  metrics: MetricValue[];
};

/**
 * How old the source behind one published market is, independent of when the analytics last ran.
 *
 * A daily recalculation over a fortnight-old snapshot is a fortnight old. `calculatedAt` alone
 * cannot say that, so each published market carries the age of its own latest snapshot, measured
 * against that source's own threshold.
 *
 * `status` is the verdict the badge uses; `condition` says why, and keeps apart a source that could
 * not be reached, one whose publisher data is old, and a continuously refreshed one that answered
 * today with content unchanged for longer than expected (current, with a warning).
 */
export type MarketSourceFreshness = {
  marketSlug: string;
  /** When the content last changed: the latest snapshot's `observed_at`. */
  observedAt: string | null;
  sourcePublishedAt: string | null;
  /** The period the publisher says the snapshot describes, for sources that state one. */
  reportPeriod: string | null;
  /** Content age. */
  ageHours: number | null;
  staleAfterHours: number | null;
  status: CurrentnessStatus;
  condition: FreshnessCondition;
  basis: FreshnessBasis | null;
  lastCheckedAt: string | null;
  lastSuccessfulCheckAt: string | null;
  contentUnchangedWarning: boolean;
  publicationAgeHours: number | null;
};

export type QueueAnalyticsReadModel = {
  methodology: { slug: string; version: string; documentPath: string; title: string };
  calculatedAt: string | null;
  inputDigest: string | null;
  snapshotCount: number;
  markets: MarketAnalytics[];
  /** One entry per published market. A blocked market has none. */
  sourceFreshness: MarketSourceFreshness[];
  /** The most recent source check the scheduled refresh recorded, if it has ever run. */
  lastCheckedAt: string | null;
  /** Markets held internally and never published, named so an omission is visible. */
  excludedMarkets: { marketSlug: string; marketName: string; reason: string }[];
  /** Metrics the methodology names but does not approve. Named, never blank. */
  deferredMetrics: { metric: string; label: string; reason: string }[];
  notes: string[];
};

export const CROSS_MARKET_MW_NOTE =
  "MW figures are market-specific and are never added together: no quantity kind is published by "
  + "all seven markets, and the two best-covered reach four. Project counts are the cross-market "
  + "comparable.";

export function unavailableQueueAnalytics(): QueueAnalyticsReadModel {
  return {
    methodology: {
      slug: METHODOLOGY_SLUG, version: METHODOLOGY_VERSION,
      documentPath: "/docs/methodology/interconnection-queue-analytics",
      title: "Urdais Interconnection Queue Analytics",
    },
    calculatedAt: null, inputDigest: null, snapshotCount: 0,
    markets: [], sourceFreshness: [], lastCheckedAt: null, excludedMarkets: [], deferredMetrics: [],
    notes: [CROSS_MARKET_MW_NOTE],
  };
}

/**
 * The latest validated run, with every publishable result.
 *
 * Returns the unavailable model rather than throwing when nothing has been calculated: a surface
 * that has not been activated yet is not an outage.
 */
export async function loadQueueAnalytics(
  sql: CapacitySqlExecutor | null,
  options: { now?: Date } = {},
): Promise<QueueAnalyticsReadModel> {
  if (sql === null) return unavailableQueueAnalytics();

  const runResult = await sql.query(
    `select r.id, r.calculated_at::text as calculated_at, r.input_digest,
            coalesce(array_length(r.snapshot_ids, 1), 0)::int as snapshots,
            mv.version, m.slug, m.name, mv.document_path
       from pipeline.interconnection_analytics_runs r
       join reference.methodology_versions mv on mv.id = r.methodology_version_id
       join reference.methodologies m on m.id = mv.methodology_id
      where r.run_status = 'validated'
      order by r.calculated_at desc limit 1`,
    [],
  );
  const run = runResult.rows[0];
  if (run === undefined) return unavailableQueueAnalytics();

  // Publishable results only. The filter is here, in SQL, so nothing downstream can forget it.
  const rows = await sql.query(
    `select a.slug as market_slug, a.display_name as market_name,
            si.name as source_name, d.code as metric, d.label, d.family, d.comparability,
            res.dimension_kind, res.dimension_value, res.status, res.value::text as value,
            res.unit, res.native_field, res.basis, res.sample_size, res.population_size, res.coverage,
            (select sup.attribution_text from reference.source_use_permissions sup
              where sup.source_interface_id = si.id
                and sup.purpose_code = 'public_interconnection_queue_derived_metric_display'
              limit 1) as attribution
       from pipeline.interconnection_metric_results res
       join reference.interconnection_metric_definitions d on d.code = res.metric_code
       join reference.grid_areas a on a.id = res.grid_area_id
       left join lateral (
         select s.id, s.name from reference.source_interfaces s
          join pipeline.interconnection_requests r2 on r2.source_interface_id = s.id
         where r2.grid_area_id = res.grid_area_id limit 1) si on true
      where res.run_id = $1 and res.publication_state = 'publishable'
      order by a.slug, d.code, res.dimension_value nulls first`,
    [String(run.id)],
  );

  const markets = new Map<string, MarketAnalytics>();
  for (const row of rows.rows) {
    const slug = String(row.market_slug);
    if (!markets.has(slug)) {
      markets.set(slug, {
        marketSlug: slug, marketName: String(row.market_name),
        sourceName: row.source_name == null ? "" : String(row.source_name),
        attribution: row.attribution == null ? null : String(row.attribution),
        metrics: [],
      });
    }
    markets.get(slug)!.metrics.push({
      metric: String(row.metric), label: String(row.label), family: String(row.family),
      comparability: String(row.comparability) as MetricValue["comparability"],
      dimension: row.dimension_kind == null ? null
        : { kind: String(row.dimension_kind), value: String(row.dimension_value) },
      status: String(row.status) as MetricStatus,
      // Text to number only where a number exists. A non-live status carries null, never zero.
      value: row.value == null ? null : Number(row.value),
      unit: String(row.unit),
      nativeField: row.native_field == null ? null : String(row.native_field),
      basis: row.basis == null ? null : String(row.basis),
      sampleSize: Number(row.sample_size), populationSize: Number(row.population_size),
      coverage: (row.coverage ?? {}) as Record<string, unknown>,
    });
  }

  // Markets computed but never published, named so the omission is visible rather than silent.
  const excluded = await sql.query(
    `select distinct a.slug, a.display_name, res.rights_reason
       from pipeline.interconnection_metric_results res
       join reference.grid_areas a on a.id = res.grid_area_id
      where res.run_id = $1 and res.publication_state = 'internal_only'
      order by a.slug`,
    [String(run.id)],
  );

  // Source age for the published markets only: a blocked market's freshness is not served either.
  const published = [...markets.keys()].filter(mayPublishMarketMetric);
  const freshness = await sql.query(
    `select distinct on (a.slug) a.slug as market_slug, s.slug as source_slug, ${FRESHNESS_COLUMNS},
            q.report_period::text as report_period
       from pipeline.interconnection_queue_snapshots q
       join reference.grid_areas a on a.id = q.grid_area_id
       join reference.source_interfaces s on s.id = q.source_interface_id
       join reference.interconnection_source_monitors m on m.source_interface_id = q.source_interface_id
       ${FRESHNESS_CHECK_JOINS}
      where q.is_latest and a.slug = any($1::text[])
      order by a.slug, q.observed_at desc`,
    [published],
  );
  const now = options.now ?? new Date();
  const sourceFreshness: MarketSourceFreshness[] = published.map((slug) => {
    const row = freshness.rows.find((candidate) => String(candidate.market_slug) === slug);
    if (row === undefined || row.observed_at == null) {
      return { marketSlug: slug, observedAt: null, sourcePublishedAt: null, reportPeriod: null,
        ageHours: null, staleAfterHours: row === undefined ? null : Number(row.stale_after_hours),
        status: "unavailable", condition: "unavailable", basis: null, lastCheckedAt: null,
        lastSuccessfulCheckAt: null, contentUnchangedWarning: false, publicationAgeHours: null };
    }
    // The same rule the scheduled refresh gates on, so the page and the cron cannot disagree.
    const input = freshnessInputsFromRow(String(row.source_slug ?? slug), row);
    const assessed = assessFreshness(input, now);
    return {
      marketSlug: slug, observedAt: assessed.latestContentObservedAt,
      sourcePublishedAt: assessed.sourcePublishedAt,
      reportPeriod: row.report_period == null ? null : String(row.report_period),
      ageHours: assessed.contentAgeHours, staleAfterHours: input.staleAfterHours,
      status: assessed.status, condition: assessed.condition, basis: assessed.basis,
      lastCheckedAt: assessed.lastCheckedAt, lastSuccessfulCheckAt: assessed.lastSuccessfulCheckAt,
      contentUnchangedWarning: assessed.contentUnchangedWarning,
      publicationAgeHours: assessed.publicationAgeHours,
    };
  });

  const checked = await sql.query(
    `select max(checked_at)::text as checked_at from pipeline.interconnection_source_checks`, [],
  );
  const lastCheckedAt = checked.rows[0]?.checked_at == null ? null : String(checked.rows[0].checked_at);

  const deferred = await sql.query(
    `select code, label, deferred_reason from reference.interconnection_metric_definitions
      where not is_live order by code`, [],
  );

  return {
    methodology: {
      slug: String(run.slug), version: String(run.version),
      documentPath: "/docs/methodology/interconnection-queue-analytics",
      title: String(run.name),
    },
    calculatedAt: String(run.calculated_at),
    inputDigest: String(run.input_digest),
    snapshotCount: Number(run.snapshots),
    markets: [...markets.values()],
    sourceFreshness,
    lastCheckedAt,
    excludedMarkets: excluded.rows.map((row) => ({
      marketSlug: String(row.slug), marketName: String(row.display_name),
      reason: row.rights_reason == null
        ? "the source terms exclude commercial publication"
        : String(row.rights_reason),
    })),
    deferredMetrics: deferred.rows.map((row) => ({
      metric: String(row.code), label: String(row.label),
      reason: String(row.deferred_reason),
    })),
    notes: [CROSS_MARKET_MW_NOTE],
  };
}

/** One metric across the markets that publish it, for a caller that wants a single comparison. */
export function metricAcrossMarkets(
  model: QueueAnalyticsReadModel, metric: string, dimensionValue?: string,
): { marketSlug: string; marketName: string; value: MetricValue }[] {
  return model.markets.flatMap((market) => market.metrics
    .filter((value) => value.metric === metric
      && (dimensionValue === undefined || value.dimension?.value === dimensionValue))
    .map((value) => ({ marketSlug: market.marketSlug, marketName: market.marketName, value })));
}

/**
 * The read model's own contract, checked before it is served.
 *
 * A response that fails this is a bug worth a 500 rather than a page of wrong numbers.
 */
export function validatePublicQueueAnalytics(model: QueueAnalyticsReadModel): string[] {
  const problems: string[] = [];
  if (model.markets.length === 0) return problems;

  if (model.methodology.version !== METHODOLOGY_VERSION) {
    problems.push(`methodology version is ${model.methodology.version}, expected ${METHODOLOGY_VERSION}`);
  }
  for (const market of model.markets) {
    if (market.marketSlug === "spp") problems.push("a market blocked from publication reached the read model");
    if (!model.sourceFreshness.some((entry) => entry.marketSlug === market.marketSlug)) {
      problems.push(`${market.marketSlug} is published without the age of its source`);
    }
    for (const metric of market.metrics) {
      if ((metric.status === "live") !== (metric.value !== null)) {
        problems.push(`${market.marketSlug}/${metric.metric} has status ${metric.status} and ${metric.value === null ? "no" : "a"} value`);
      }
      if (metric.unit === "MW" && metric.status === "live" && metric.nativeField === null) {
        problems.push(`${market.marketSlug}/${metric.metric} publishes MW without naming its source field`);
      }
      if (metric.unit === "MW" && metric.comparability !== "C") {
        problems.push(`${market.marketSlug}/${metric.metric} claims MW comparability beyond market-specific`);
      }
    }
  }
  for (const entry of model.sourceFreshness) {
    if (!mayPublishMarketMetric(entry.marketSlug)) {
      problems.push(`${entry.marketSlug} is blocked from publication and its source freshness was served`);
    }
  }
  if (model.deferredMetrics.length === 0) {
    problems.push("no deferred metric is named; a deferred metric must be visible, not absent");
  }
  return problems;
}
