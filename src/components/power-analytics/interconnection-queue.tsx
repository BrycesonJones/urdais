import Link from "next/link";

import { SectionHeading } from "@/components/analytics/section-heading";
import { metricAcrossMarkets, type MetricValue, type QueueAnalyticsReadModel }
  from "@/lib/interconnection-queue/analytics/read";
import { formatNumber } from "@/lib/format";

/**
 * Interconnection Queue: what is waiting to connect, how long it has waited, and how much of it
 * historically made it through.
 *
 * Ordered by the questions a reader actually has. How many projects are waiting, what are they,
 * how old is the queue, how many make it, how long that takes, and what is moving in and out.
 * Completion is the outcome metric and is given the most room, because it is the only figure here
 * that says whether the queue works.
 *
 * Three things this section will not do. It shows no cross-market MW total, because none exists:
 * no quantity kind is published by all seven markets. It shows no number where a metric has a
 * status instead, because an absence rendered as zero is a wrong answer. And SPP never appears
 * with values — its terms exclude commercial publication, so it is named as excluded rather than
 * quietly dropped from a "U.S. queue" claim.
 */

const YEARS = (value: number) => `${value.toFixed(1)} yr`;
const PERCENT = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Why a metric has no number, in a reader's words rather than a status code. */
function statusNote(metric: MetricValue): string {
  switch (metric.status) {
    case "not_available": return "not published by this market";
    case "insufficient_sample": return `too few projects (${metric.sampleSize})`;
    case "insufficient_maturity": return "cohorts too recent to judge";
    case "methodology_deferred": return "deferred";
    case "rights_blocked": return "not available for public display";
    case "source_unavailable": return "source unavailable";
    default: return "unavailable";
  }
}

const find = (metrics: MetricValue[], metric: string, dimension?: string) =>
  metrics.find((value) => value.metric === metric
    && (dimension === undefined ? value.dimension === null : value.dimension?.value === dimension));

/**
 * Technology composition, aggregated for display from the rows the API already serves.
 *
 * Two things make this less obvious than a pie chart. A project that names solar and a battery is
 * counted under both — the API says so on every row (`multiLabel`) — so the technology counts sum
 * to more than the number of projects, and dividing a technology by that sum would invent a
 * denominator that double-counts hybrids. The denominator here is the number of active projects in
 * the markets that actually publish technology labels, so a share reads "this fraction of projects
 * name this technology" and the shares legitimately total more than 100%.
 *
 * The second is coverage. A market whose technology rows carry a status rather than a value
 * contributes nothing and is named, so the mix is never read as national.
 */
export type TechnologyShare = {
  technology: string;
  label: string;
  count: number;
  /** Share of active projects in the contributing markets that name this technology. */
  share: number;
};

export type TechnologyComposition = {
  rows: TechnologyShare[];
  /** Active projects in the markets that publish technology labels. The share denominator. */
  projects: number;
  contributing: string[];
  /** Markets present in the read model that published no usable technology row. */
  omitted: { marketName: string; note: string }[];
};

const TECHNOLOGY_LABELS: Record<string, string> = {
  solar: "Solar", wind: "Wind", battery_storage: "Battery storage", natural_gas: "Natural gas",
  nuclear: "Nuclear", hydro: "Hydro", geothermal: "Geothermal", biomass: "Biomass", coal: "Coal",
  other_generation: "Other generation", hybrid: "Hybrid", transmission: "Transmission",
  load: "Load", unknown: "Unknown",
};

const technologyLabel = (value: string) =>
  TECHNOLOGY_LABELS[value] ?? value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function technologyComposition(analytics: QueueAnalyticsReadModel): TechnologyComposition {
  const counts = new Map<string, number>();
  const contributing: string[] = [];
  const omitted: { marketName: string; note: string }[] = [];
  let projects = 0;

  for (const market of analytics.markets) {
    const rows = market.metrics.filter((metric) =>
      metric.metric === "active_request_count_by_technology" && metric.dimension !== null);
    // Only a live row carries a number. A status is never read as a zero.
    const live = rows.filter((row) => row.status === "live" && row.value !== null);
    if (live.length === 0) {
      // The note is the market's own reason, not a technology's sample size: ISO-NE has 28 active
      // projects, and "too few projects (6)" would read as though the market held six.
      if (rows.length > 0) {
        const active = find(market.metrics, "active_request_count")?.value;
        omitted.push({
          marketName: market.marketName,
          note: rows[0]!.status === "insufficient_sample" && active !== null && active !== undefined
            ? `${formatNumber(active, 0)} projects, below the sample floor`
            : statusNote(rows[0]!),
        });
      }
      continue;
    }
    contributing.push(market.marketName);
    // The market's own active count is the honest denominator contribution; the rows agree with it.
    projects += find(market.metrics, "active_request_count")?.value ?? live[0]!.populationSize;
    for (const row of live) {
      const key = row.dimension!.value;
      counts.set(key, (counts.get(key) ?? 0) + row.value!);
    }
  }

  const rows = [...counts.entries()]
    .map(([technology, count]) => ({
      technology, label: technologyLabel(technology), count,
      share: projects === 0 ? 0 : count / projects,
    }))
    .sort((a, b) => b.count - a.count);
  return { rows, projects, contributing, omitted };
}

export function InterconnectionQueue({ analytics }: { analytics: QueueAnalyticsReadModel }) {
  const markets = [...analytics.markets].sort((a, b) => {
    const left = find(a.metrics, "active_request_count")?.value ?? -1;
    const right = find(b.metrics, "active_request_count")?.value ?? -1;
    return right - left;
  });

  const completion = metricAcrossMarkets(analytics, "project_completion_rate")
    .filter((row) => row.value.status === "live" && row.value.dimension === null);
  const timeToOperation = metricAcrossMarkets(analytics, "time_to_operation_years", "median")
    .filter((row) => row.value.status === "live");
  const totalActive = markets.reduce((total, market) =>
    total + (find(market.metrics, "active_request_count")?.value ?? 0), 0);
  const maxActive = Math.max(1, ...markets.map((market) =>
    find(market.metrics, "active_request_count")?.value ?? 0));
  const technology = technologyComposition(analytics);

  if (markets.length === 0) {
    return (
      <section id="queues" aria-labelledby="queues-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
        <SectionHeading id="queues-heading" title="Interconnection Queue"
          subtitle="Projects waiting to connect, and how many make it through" />
        <p className="mt-4 text-sm text-neutral-400">
          No interconnection queue analytics have been calculated yet.
        </p>
      </section>
    );
  }

  return (
    <section id="queues" aria-labelledby="queues-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="queues-heading"
        title="Interconnection Queue"
        subtitle="Projects waiting to connect, and how many make it through"
        aside={
          <span className="inline-flex items-center rounded-[2px] bg-emerald-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-300">
            Live
          </span>
        }
      />

      {/* 1. How many projects are actively waiting? */}
      <p className="mt-2 text-xs text-neutral-500">
        {formatNumber(totalActive, 0)} projects actively waiting across {markets.length} markets
        {analytics.calculatedAt === null ? null : (
          <> · last calculated {new Date(analytics.calculatedAt).toLocaleDateString("en-US",
            { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</>
        )}
      </p>

      <ol className="mt-6 divide-y divide-white/[0.06]" aria-label="Active interconnection requests by market">
        <li aria-hidden="true" className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)_5rem_5.5rem_6rem] items-center gap-x-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          <span>Market</span>
          <span>Active projects</span>
          <span className="text-right">Count</span>
          <span className="text-right">Median age</span>
          <span className="text-right">Capacity</span>
        </li>
        {markets.map((market) => {
          const active = find(market.metrics, "active_request_count");
          const age = find(market.metrics, "queue_age_years", "median");
          const mw = find(market.metrics, "active_mw");
          const count = active?.value ?? 0;
          return (
            <li key={market.marketSlug}
              className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)_5rem_5.5rem_6rem] items-center gap-x-3 py-2.5 text-sm">
              <span className="min-w-0 truncate font-medium text-neutral-100">{market.marketName}</span>
              <span className="relative h-2.5 overflow-hidden rounded-[1px] bg-white/[0.04]" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 rounded-[1px] bg-[#526fe0]"
                  style={{ width: `${(count / maxActive) * 100}%` }} />
              </span>
              <span className="text-right font-medium tabular-nums text-neutral-50">
                {formatNumber(count, 0)}
                <span className="sr-only"> active projects</span>
              </span>
              <span className="text-right tabular-nums text-neutral-300">
                {age?.status === "live" && age.value !== null
                  ? YEARS(age.value)
                  : <span className="text-xs text-neutral-600">{statusNote(age ?? { status: "not_available" } as MetricValue)}</span>}
              </span>
              <span className="text-right tabular-nums text-neutral-300">
                {mw?.status === "live" && mw.value !== null
                  ? <>{formatNumber(mw.value / 1000, 1)}<span className="text-xs text-neutral-500"> GW</span></>
                  : <span className="text-xs text-neutral-600">{statusNote(mw ?? { status: "not_available" } as MetricValue)}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Capacity is market-specific and never totalled. */}
      <p className="mt-3 text-xs text-neutral-500">
        Capacity is shown only where a market publishes one unambiguous figure, and is never added
        across markets: each publisher measures a different thing.{" "}
        {markets.filter((market) => find(market.metrics, "active_mw")?.status === "live")
          .map((market) => `${market.marketName} reports ${find(market.metrics, "active_mw")!.nativeField}`)
          .join("; ")}.
      </p>


      {/* 2. What is waiting to connect? Project counts, never MW, and hybrids counted under each. */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-neutral-100">Technology composition</h3>
        <p className="mt-1 text-xs text-neutral-500">
          What is waiting to connect, by number of projects.
        </p>
        {technology.rows.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            No market currently publishes a technology breakdown that meets the sample floor.
          </p>
        ) : (
          <>
            <ol className="mt-3 divide-y divide-white/[0.06]"
              aria-label="Active interconnection requests by technology">
              {technology.rows.map((row) => (
                <li key={row.technology}
                  className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)_4.5rem_4rem] items-center gap-x-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-neutral-300">{row.label}</span>
                  <span className="relative h-2.5 overflow-hidden rounded-[1px] bg-white/[0.04]" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-[1px] bg-[#7a8de8]"
                      style={{ width: `${Math.min(100, row.share * 100)}%` }} />
                  </span>
                  <span className="text-right font-medium tabular-nums text-neutral-50">
                    {formatNumber(row.count, 0)}
                    <span className="sr-only"> projects</span>
                  </span>
                  <span className="text-right tabular-nums text-xs text-neutral-500">
                    {PERCENT(row.share)}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-neutral-500">
              Counts are projects, not megawatts. A project that names more than one technology is
              counted under each, so the shares total more than 100%: they read as the share of the{" "}
              {formatNumber(technology.projects, 0)} active projects in{" "}
              {technology.contributing.join(", ")} that name each technology.
              {technology.omitted.length === 0 ? null : (
                <> Not included: {technology.omitted
                  .map((market) => `${market.marketName} (${market.note})`).join("; ")}.</>
              )}
              {analytics.excludedMarkets.length === 0 ? null : (
                <> {analytics.excludedMarkets.map((market) => market.marketName).join(", ")}{" "}
                  {analytics.excludedMarkets.length === 1 ? "is" : "are"} not shown at all. This is the
                  mix of the markets Urdais may publish, not of the United States.</>
              )}
            </p>
          </>
        )}
      </div>

      {/* 4 and 5. How many make it through, and how long does that take? */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[3px] border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-neutral-100">Project completion rate</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Share of projects in sufficiently mature entry cohorts that reached operation.
          </p>
          {completion.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">No market has cohorts mature enough to report.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {completion.map((row) => {
                const coverage = row.value.coverage as { cohortYears?: number[]; operated?: number };
                const years = coverage.cohortYears ?? [];
                return (
                  <li key={row.marketSlug}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-neutral-300">{row.marketName}</span>
                      <span className="text-lg font-medium tabular-nums text-neutral-50">
                        {PERCENT(row.value.value!)}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {years.length > 0 ? `${years[0]}–${years[years.length - 1]} cohorts · ` : null}
                      {formatNumber(row.value.sampleSize, 0)} projects entered
                      {coverage.operated === undefined ? null : `, ${formatNumber(coverage.operated, 0)} reached operation`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-neutral-600">
            Only cohorts old enough to have resolved are counted, so recent years are excluded
            rather than shown as near-zero. This describes projects that entered years ago, not a
            forecast for today&rsquo;s entrants.
          </p>
        </div>

        <div className="rounded-[3px] border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-neutral-100">Median time to operation</h3>
          <p className="mt-1 text-xs text-neutral-500">
            From the request date to the date the project actually began operating.
          </p>
          {timeToOperation.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">No market publishes both dates.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {timeToOperation.map((row) => {
                const market = analytics.markets.find((entry) => entry.marketSlug === row.marketSlug)!;
                const p90 = find(market.metrics, "time_to_operation_years", "p90");
                return (
                  <li key={row.marketSlug}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-neutral-300">{row.marketName}</span>
                      <span className="text-lg font-medium tabular-nums text-neutral-50">
                        {YEARS(row.value.value!)}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {formatNumber(row.value.sampleSize, 0)} completed projects
                      {p90?.status === "live" && p90.value !== null ? ` · 90th percentile ${YEARS(p90.value)}` : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-neutral-600">
            A projected date is never treated as operation. Markets that publish no actual
            operation date report none of this.
          </p>
        </div>
      </div>

      {/* 6. What is entering and leaving? */}
      <QueueFlows analytics={analytics} />

      {/* What is not shown, and why. */}
      <details className="mt-6 rounded-[3px] border border-white/10 bg-white/[0.02] p-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-200">
          Coverage and what is not shown
        </summary>
        <p className="mt-3 text-xs text-neutral-400">{analytics.notes[0]}</p>
        {analytics.excludedMarkets.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Markets not shown</p>
            <ul className="mt-1 space-y-1">
              {analytics.excludedMarkets.map((market) => (
                <li key={market.marketSlug} className="text-xs text-neutral-400">
                  <span className="font-medium text-neutral-300">{market.marketName}</span>
                  {" — "}Unavailable for public display: {market.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {analytics.deferredMetrics.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Metrics deferred</p>
            <ul className="mt-1 space-y-1">
              {analytics.deferredMetrics.map((metric) => (
                <li key={metric.metric} className="text-xs text-neutral-400">
                  <span className="font-medium text-neutral-300">{metric.label}</span>
                  {" — "}{metric.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>

      <p className="mt-4 text-xs text-neutral-500">
        {markets.map((market) => market.sourceName).filter((name) => name !== "").join(" · ")}
        {" · "}
        <Link href={analytics.methodology.documentPath}
          className="text-neutral-300 underline decoration-neutral-600 underline-offset-2 hover:text-neutral-100">
          Methodology {analytics.methodology.version}
        </Link>
      </p>
    </section>
  );
}

/** Entries and withdrawals, with the basis each market's entry figure rests on. */
function QueueFlows({ analytics }: { analytics: QueueAnalyticsReadModel }) {
  const rows = analytics.markets.map((market) => {
    const entries = market.metrics
      .filter((metric) => metric.metric === "annual_entries" && metric.status === "live"
        && metric.dimension?.kind === "period_year")
      .sort((a, b) => Number(b.dimension!.value) - Number(a.dimension!.value));
    const withdrawals = market.metrics.find((metric) =>
      metric.metric === "annual_withdrawals" && metric.dimension === null);
    const recent = entries[0];
    return { market, recent, withdrawals, basis: recent?.basis ?? null };
  }).filter((row) => row.recent !== undefined || row.withdrawals?.status === "live");

  if (rows.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-sm font-medium text-neutral-100">Entering and leaving</h3>
      <ul className="mt-3 divide-y divide-white/[0.06]">
        {rows.map(({ market, recent, withdrawals, basis }) => (
          <li key={market.marketSlug} className="grid grid-cols-[minmax(6rem,9rem)_1fr_1fr] items-baseline gap-x-3 py-2 text-sm">
            <span className="truncate text-neutral-300">{market.marketName}</span>
            <span className="tabular-nums text-neutral-400">
              {recent === undefined ? <span className="text-xs text-neutral-600">no entry data</span> : (
                <>
                  {formatNumber(recent.value!, 0)} entered in {recent.dimension!.value}
                  {basis === "snapshot_first_seen" && (
                    <span className="block text-[11px] text-neutral-600">
                      first observed in an Urdais snapshot, not an application date
                    </span>
                  )}
                </>
              )}
            </span>
            <span className="tabular-nums text-neutral-400">
              {withdrawals?.status === "live"
                ? <>{formatNumber(withdrawals.value!, 0)} withdrawn to date</>
                : <span className="text-xs text-neutral-600">{statusNote(withdrawals ?? { status: "not_available" } as MetricValue)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
