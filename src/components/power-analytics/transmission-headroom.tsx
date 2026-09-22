import Link from "next/link";

import { SectionHeading } from "@/components/analytics/section-heading";
import { formatNumber } from "@/lib/format";
import type {
  PublicMarket, PublicMetric, TransmissionReadModel,
} from "@/lib/transmission-headroom/analytics/read";

/**
 * Transmission Headroom: how far the power actually flowing is from the limit the operator was
 * enforcing, at the instants each source publishes.
 *
 * The layout is two separate market sections, and that separation is the product decision rather
 * than a styling choice. NYISO measures a directional margin on the interfaces it publishes;
 * ERCOT measures an oriented margin on whichever constraints dispatch happened to be tracking. A
 * shared card, a shared axis or a combined total would imply a comparison neither source supports,
 * so there is none of any of them here.
 *
 * Three other things this section will not do. It shows no count of interfaces at their limit,
 * because a scheduled HVDC tie sitting at its rating is routine operation and the source gives no
 * way to tell it from congestion. It applies no green/amber/red banding, because the methodology
 * defines no such thresholds. And it renders every absent value as the reason it is absent rather
 * than as a dash or a zero.
 */

const PERCENT = (value: number) => `${value.toFixed(1)}%`;
const MW = (value: number) => `${formatNumber(value, value > -10 && value < 10 ? 1 : 0)} MW`;

function metricOf(market: PublicMarket, code: string): PublicMetric | undefined {
  return market.summary.find((metric) => metric.metric === code);
}

/** A summary card. Sample size is never hidden: a percentile over sixteen entities says so. */
function Card({ metric, format }: { metric: PublicMetric | undefined; format: (v: number) => string }) {
  if (metric === undefined) return null;
  return (
    <div className="rounded-[3px] border border-white/10 bg-white/[0.02] p-4">
      <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">{metric.label}</h4>
      {metric.status === "live" && metric.value !== null ? (
        <>
          <p className="mt-2 text-2xl font-medium tabular-nums text-neutral-50">
            {format(metric.value)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            n&nbsp;=&nbsp;{formatNumber(metric.sampleSize, 0)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          {metric.status === "insufficient_sample"
            ? `Too few entities to publish (n = ${formatNumber(metric.sampleSize, 0)})`
            : metric.status === "source_stale" ? "Source stale"
            : "Not available"}
        </p>
      )}
    </div>
  );
}

function SourceFooter({ market, methodology }: {
  market: PublicMarket; methodology: TransmissionReadModel["methodology"];
}) {
  const stamp = (value: string | null) =>
    value === null ? null : new Date(value).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
      timeZone: "UTC", timeZoneName: "short",
    });
  return (
    <p className="mt-4 text-xs text-neutral-500">
      {market.attribution}
      {market.latestObservationAt === null ? null : <> · Data through {stamp(market.latestObservationAt)}</>}
      {market.retrievedAt === null ? null : <> · Retrieved {stamp(market.retrievedAt)}</>}
      {" · "}
      <Link href={methodology.documentPath} className="underline underline-offset-2 hover:text-neutral-300">
        Methodology v{methodology.version}
      </Link>
    </p>
  );
}

/** One market's entity table. Sorted by lowest headroom, which is a fact rather than a judgement. */
function EntityTable({ market }: { market: PublicMarket }) {
  const isErcot = market.marketSlug === "ercot";
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">
          {market.marketName} {market.productLabel} by {isErcot ? "tracked constraint" : "interface"},
          lowest headroom first
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
            <th scope="col" className="py-2 pr-3 font-normal">{isErcot ? "Constraint" : "Interface"}</th>
            {isErcot ? <th scope="col" className="py-2 pr-3 font-normal">Contingency</th> : null}
            <th scope="col" className="py-2 pr-3 text-right font-normal">
              {isErcot ? "Margin" : "Headroom"}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">Utilization</th>
            {isErcot ? <th scope="col" className="py-2 text-right font-normal">Binding</th> : null}
          </tr>
        </thead>
        <tbody>
          {market.entities.map((entity) => (
            <tr key={entity.entityId} className="border-b border-white/[0.06]">
              <th scope="row" className="max-w-[14rem] truncate py-2.5 pr-3 text-left font-medium text-neutral-100">
                {entity.name}
              </th>
              {isErcot ? (
                <td className="max-w-[10rem] truncate py-2.5 pr-3 text-neutral-400">
                  {entity.contingencyName ?? "—"}
                  {entity.contingencyKind === "base_case" ? (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-neutral-600">base case</span>
                  ) : null}
                </td>
              ) : null}
              <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-50">
                {entity.status === "live" && entity.headroomMw !== null
                  ? MW(entity.headroomMw)
                  : <span className="text-xs text-neutral-500">{entity.statusReason}</span>}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-300">
                {entity.utilizationPct === null
                  ? <span className="text-xs text-neutral-600">—</span>
                  : PERCENT(entity.utilizationPct)}
              </td>
              {isErcot ? (
                <td className="py-2.5 text-right text-xs text-neutral-400">
                  {entity.binding === null ? "—" : entity.binding ? "Binding" : "Not binding"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {market.entities.some((entity) => (entity.headroomMw ?? 0) < 0) ? (
        <p className="mt-3 text-xs text-neutral-500">
          A negative value means observed flow exceeded the applicable source limit for that
          observation. The publishers do not call this an overload or a violation, and neither does
          Urdais.
        </p>
      ) : null}
    </div>
  );
}

function MarketSection({ market, methodology }: {
  market: PublicMarket; methodology: TransmissionReadModel["methodology"];
}) {
  const isErcot = market.marketSlug === "ercot";
  return (
    <div className="mt-10 border-t border-white/[0.06] pt-6 first:mt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-medium text-neutral-100">
          {market.marketName} — {market.productLabel}
        </h3>
        {market.sourceStatus === "current" ? null : (
          <span className="rounded-[2px] border border-[#d4a56a]/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#e2c08d]">
            Source stale
          </span>
        )}
      </div>

      {/* The population limit belongs on the page, not only in the methodology. */}
      <p className="mt-2 max-w-3xl text-xs text-neutral-500">{market.populationDescription}</p>

      <p className="mt-2 text-xs text-neutral-500">
        {formatNumber(market.entitiesEligible, 0)} of {formatNumber(market.entitiesObserved, 0)}{" "}
        {isErcot ? "tracked constraints" : "interfaces"} carry a current value
        {market.entitiesUnavailable > 0
          ? <> · {formatNumber(market.entitiesUnavailable, 0)} unavailable</> : null}
        {isErcot && market.contingencySplit !== null ? (
          <> · {formatNumber(market.contingencySplit.baseCase, 0)} base case,{" "}
            {formatNumber(market.contingencySplit.postContingency, 0)} post-contingency</>
        ) : null}
        {isErcot && (market.implausibleLimitExcluded ?? 0) > 0 ? (
          <> · {formatNumber(market.implausibleLimitExcluded ?? 0, 0)} excluded for an implausible
            source limit</>
        ) : null}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isErcot ? (
          <>
            <Card metric={metricOf(market, "constraint_margin_median_mw")} format={MW} />
            <Card metric={metricOf(market, "constraint_margin_p10_mw")} format={MW} />
            <Card metric={metricOf(market, "constraint_utilization_median_pct")} format={PERCENT} />
            <Card metric={metricOf(market, "binding_tracked_constraints")}
              format={(v) => formatNumber(v, 0)} />
          </>
        ) : (
          <>
            <Card metric={metricOf(market, "interface_headroom_median_mw")} format={MW} />
            <Card metric={metricOf(market, "interface_headroom_p10_mw")} format={MW} />
            <Card metric={metricOf(market, "interface_headroom_p25_mw")} format={MW} />
            <Card metric={metricOf(market, "interface_utilization_median_pct")} format={PERCENT} />
          </>
        )}
      </div>

      {isErcot ? (
        <p className="mt-3 text-xs text-neutral-500">
          Binding is taken from ERCOT&rsquo;s own shadow price, never from a margin of zero, and
          counts only constraints in this tracked population.
        </p>
      ) : null}

      <EntityTable market={market} />

      {market.deferredMetrics.length === 0 ? null : (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
            Not published
          </p>
          <ul className="mt-1 space-y-1">
            {market.deferredMetrics.map((metric) => (
              <li key={metric.metric} className="max-w-3xl text-xs text-neutral-500">
                <span className="text-neutral-400">{metric.label}</span> — {metric.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SourceFooter market={market} methodology={methodology} />
    </div>
  );
}

export function TransmissionHeadroom({ analytics }: { analytics: TransmissionReadModel }) {
  const markets = [analytics.markets.nyiso, analytics.markets.ercot]
    .filter((market): market is PublicMarket => market !== null);

  return (
    <section id="headroom" aria-labelledby="headroom-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="headroom-heading"
        title="Transmission Headroom"
        subtitle="Operational margin between published flow and the limit in force"
        aside={markets.length === 0 ? undefined : (
          <span className="inline-flex items-center rounded-[2px] bg-emerald-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-300">
            Live
          </span>
        )}
      />

      {markets.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-400">
          Transmission Headroom data is temporarily unavailable.
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-3xl text-xs text-neutral-500">
            How far the power actually flowing is from the limit the operator was enforcing, at the
            instants each source publishes. {analytics.notes[0]}
          </p>
          {markets.map((market) => (
            <MarketSection key={market.marketSlug} market={market} methodology={analytics.methodology} />
          ))}
        </>
      )}
    </section>
  );
}
