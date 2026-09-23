import Link from "next/link";

import { SectionHeading } from "@/components/analytics/section-heading";
import { formatNumber } from "@/lib/format";
import type { GridBuildoutReadModel } from "@/lib/grid-buildout/analytics/read";
import type { WorksCharacter } from "@/lib/grid-buildout/analytics/types";

/**
 * Grid Buildout Velocity: how quickly tracked transmission reaches service, and how far delivery
 * schedules have moved.
 *
 * Two market sections, and the separation is the product decision rather than a styling choice.
 * ERCOT publishes an actual in-service date and can say how many projects were energised; CAISO
 * publishes none, and its value is fifteen dated revisions of every expected date. A shared axis
 * or a combined total would imply a comparison neither source supports, so there is neither.
 *
 * This component renders the read model and decides nothing. Every figure, classification and
 * exclusion arrived already calculated and validated under methodology 1.0.0; nothing here
 * recomputes a metric, and the only transformation applied is choosing words for enum values.
 *
 * Three things it will not do. It never shows a reported zero as missing, because the publisher
 * saying "no mileage" is data. It never presents M4's published population as though it were the
 * whole portfolio, because 74 of 214 CAISO projects cannot enter that distribution. And it never
 * falls back to a figure when the live read fails.
 */

/** Plain language for the canonical enum. The enum itself is never renamed, only labelled. */
const WORKS_LABEL: Record<WorksCharacter, string> = {
  new: "New line mileage",
  rebuilt_or_reconductored: "Rebuilt or reconductored",
  both: "New and rebuilt",
  none_reported_zero: "No line mileage reported",
  unknown_unclassified: "Mileage not reported",
};

const WORKS_HINT: Record<WorksCharacter, string> = {
  new: "The publisher reported new circuit mileage and no rebuilt mileage.",
  rebuilt_or_reconductored: "The publisher reported rebuilt or reconductored mileage and no new mileage.",
  both: "The publisher reported both.",
  none_reported_zero:
    "The publisher reported zero on both mileage columns: substation, transformer, breaker and "
    + "reactive work. This is a reported value, not a gap.",
  unknown_unclassified:
    "At least one mileage column was left empty, so the project cannot be classified. An empty "
    + "cell is not read as a zero.",
};

const LIFECYCLE_LABEL: Record<string, string> = {
  under_construction: "Under construction",
  planned: "Planned",
  proposed: "Proposed",
  unknown: "Not classified",
};

function days(value: number): string {
  return `${formatNumber(value, 0)} d`;
}

function stamp(value: string | null): string | null {
  return value === null ? null : new Date(value).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "UTC", timeZoneName: "short",
  });
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[3px] border border-white/10 bg-white/[0.02] p-4">
      <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</h4>
      <p className="mt-2 text-2xl font-medium tabular-nums text-neutral-50">{value}</p>
      {hint !== undefined ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

/**
 * A count bar. Deliberately not a chart library: these are small categorical counts, and a bar
 * whose width is its share carries the same information with a textual value beside it, so the
 * figure never depends on reading a colour or a pixel length.
 */
function CountBar({ label, count, total, hint }: {
  label: string; count: number; total: number; hint?: string;
}) {
  const share = total === 0 ? 0 : count / total;
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-neutral-300">
          {label}
          {hint !== undefined ? <span className="sr-only"> — {hint}</span> : null}
        </span>
        <span className="font-mono text-sm tabular-nums text-neutral-100">
          {formatNumber(count, 0)}
          <span className="ml-2 text-xs text-neutral-500">{(share * 100).toFixed(1)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-[1px] bg-white/[0.06]">
        <div className="h-full bg-[#526fe0]" style={{ width: `${Math.max(share * 100, count > 0 ? 1 : 0)}%` }} />
      </div>
      {hint !== undefined ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </li>
  );
}

function SourceFooter({ market, methodology }: {
  market: NonNullable<GridBuildoutReadModel["markets"]["ercot"]>;
  methodology: GridBuildoutReadModel["methodology"];
}) {
  return (
    <p className="mt-4 text-xs text-neutral-500">
      {market.attribution}{" "}
      Vintage {market.snapshotKey}, retrieved {stamp(market.retrievedAt)}.{" "}
      <Link href={methodology.documentPath} className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300">
        Methodology {methodology.version}
      </Link>
      .
    </p>
  );
}

export function GridBuildoutChart({ analytics }: { analytics: GridBuildoutReadModel }) {
  const { metrics, markets, methodology } = analytics;
  const published = metrics.m1 !== null || metrics.m2 !== null || metrics.m4 !== null;

  return (
    <section id="buildout" aria-labelledby="buildout-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="buildout-heading"
        title="Grid Buildout Velocity"
        subtitle="How quickly tracked transmission reaches service, and how far schedules move"
      />

      <p className="mt-5 max-w-3xl text-sm text-neutral-400">
        {analytics.product.summary} ERCOT publishes an actual in-service date and can report
        completions; CAISO publishes none, and reports how far its approved schedules have moved.
        The two are separate measurements and are never combined.
      </p>

      {!published ? (
        <p className="mt-6 rounded-[3px] border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400">
          No Grid Buildout calculation has been published yet. Nothing is shown rather than a
          placeholder figure.
        </p>
      ) : analytics.freshness.status === "stale" ? (
        // Stale keeps the last valid figures on screen and says so, which is the convention the
        // other Power Analytics products follow. Withdrawing a still-valid publication because the
        // pipeline missed a few runs would lose more than it protects.
        <p
          role="status"
          className="mt-6 rounded-[3px] border border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm text-amber-200/90"
        >
          <span className="font-medium">These figures may be out of date.</span>{" "}
          The last successful calculation was{" "}
          {analytics.freshness.lastPublishedAt === null
            ? "some time ago"
            : stamp(analytics.freshness.lastPublishedAt)}
          {analytics.freshness.ageHours === null
            ? null
            : `, ${formatNumber(Math.round(analytics.freshness.ageHours / 24), 0)} day(s) ago`}
          , beyond the {formatNumber(analytics.freshness.staleAfterHours / 24, 0)}-day freshness
          window. The values shown are the last validated publication and remain unchanged; nothing
          has been substituted.
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- ERCOT */}
      {markets.ercot !== null && (metrics.m1 !== null || metrics.m2 !== null || metrics.m3 !== null) ? (
        <div className="mt-8">
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-300">
            ERCOT — Completions and backlog
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-neutral-500">{markets.ercot.role}.</p>

          {metrics.m1 !== null ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card
                  label="Projects entering service"
                  value={formatNumber(metrics.m1.total, 0)}
                  hint={`Across ${metrics.m1.periods.length} reported ${metrics.m1.periods.length === 1 ? "year" : "years"}`}
                />
                {metrics.m1.periods.map((period) => (
                  <Card key={period.period} label={String(period.period)} value={formatNumber(period.count, 0)} hint="Projects energised" />
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                {metrics.m1.caveat}
                {metrics.m1.excludedSentinelDate > 0 ? (
                  <>
                    {" "}A further {formatNumber(metrics.m1.excludedSentinelDate, 0)} completed
                    {metrics.m1.excludedSentinelDate === 1 ? " project carries" : " projects carry"} no
                    usable date and cannot be placed in a year. They remain in service, and are counted
                    in the backlog view below.
                  </>
                ) : null}
              </p>
            </>
          ) : null}

          {metrics.m2 !== null ? (
            <div className="mt-6">
              <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Active backlog — {formatNumber(metrics.m2.total, 0)} projects
              </h4>
              <p className="mt-1 text-xs text-neutral-500">
                A point-in-time count as of {stamp(metrics.m2.asOf)}, not a rate.
              </p>
              <ul className="mt-3 divide-y divide-white/5">
                {metrics.m2.byLifecycle.map((item) => (
                  <CountBar
                    key={item.lifecycle}
                    label={LIFECYCLE_LABEL[item.lifecycle] ?? item.lifecycle}
                    count={item.count}
                    total={metrics.m2!.total}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {metrics.m3 !== null ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Completions by service level
                </h4>
                <ul className="mt-3 divide-y divide-white/5">
                  {metrics.m3.byServiceLevelKv.map((item) => (
                    <CountBar key={item.kv} label={`${formatNumber(item.kv, 0)} kV`} count={item.count} total={metrics.m3!.population} />
                  ))}
                </ul>
                {metrics.m3.suppressedKvClasses > 0 ? (
                  <p className="mt-2 text-xs text-neutral-500">
                    {formatNumber(metrics.m3.suppressedKvClasses, 0)} voltage
                    {metrics.m3.suppressedKvClasses === 1 ? " class" : " classes"} with fewer than five
                    completions {metrics.m3.suppressedKvClasses === 1 ? "is" : "are"} suppressed,
                    covering {formatNumber(metrics.m3.suppressedKvProjects, 0)} projects.
                  </p>
                ) : null}
              </div>
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Completions by works character
                </h4>
                <ul className="mt-3 divide-y divide-white/5">
                  {metrics.m3.byWorksCharacter.map((item) => (
                    <CountBar
                      key={item.character}
                      label={WORKS_LABEL[item.character] ?? item.character}
                      hint={WORKS_HINT[item.character]}
                      count={item.count}
                      total={metrics.m3!.population}
                    />
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <SourceFooter market={markets.ercot} methodology={methodology} />
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- CAISO */}
      {markets.caiso !== null && (metrics.m4 !== null || metrics.m5 !== null) ? (
        <div className="mt-10 border-t border-white/5 pt-8">
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-300">
            CAISO — Schedule slip
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-neutral-500">
            How far each approved project&rsquo;s expected in-service date has moved from the date
            recorded when the transmission plan was approved. Positive is later than approved; a
            negative value is a project now expected earlier.
          </p>

          {metrics.m4 !== null && metrics.m4.published && metrics.m4.distribution !== null ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Card label="Median slip" value={days(metrics.m4.distribution.median)} hint={`n = ${formatNumber(metrics.m4.distribution.count, 0)}`} />
                <Card label="Lower quartile" value={days(metrics.m4.distribution.q1)} />
                <Card label="Upper quartile" value={days(metrics.m4.distribution.q3)} />
                <Card label="Earliest" value={days(metrics.m4.distribution.min)} hint="Ahead of the approved date" />
                <Card label="Latest" value={days(metrics.m4.distribution.max)} />
              </div>
              <p className="mt-3 max-w-3xl text-xs text-neutral-500">
                Measured over {formatNumber(metrics.m4.distribution.count, 0)} of{" "}
                {formatNumber(markets.caiso.analyticalProjects, 0)} CAISO projects.{" "}
                {formatNumber(metrics.m4.excludedYearPrecision, 0)} are excluded because the
                publisher gave an endpoint only to the year, which cannot produce a slip in days
                without inventing one;{" "}
                {formatNumber(metrics.m4.excludedMissingEndpoint, 0)} are missing an endpoint
                date and {formatNumber(metrics.m4.excludedCancelled, 0)} are cancelled. Those
                projects remain part of the analytical universe.
              </p>
            </>
          ) : metrics.m4 !== null ? (
            <p className="mt-4 rounded-[3px] border border-white/10 bg-white/[0.02] p-4 text-sm text-neutral-400">
              No slip distribution is published: {metrics.m4.withheldReason ?? "below the sample floor"}.
            </p>
          ) : null}

          {metrics.m5 !== null ? (
            <div className="mt-6">
              <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Cancellations — {formatNumber(metrics.m5.cancelled, 0)}
              </h4>
              {metrics.m5.reasons.length > 0 ? (
                <ul className="mt-3 divide-y divide-white/5">
                  {metrics.m5.reasons.map((item) => (
                    <li key={item.nativeId} className="py-2">
                      <p className="font-mono text-xs text-neutral-400">{item.nativeId}</p>
                      <p className="mt-0.5 text-sm text-neutral-300">{item.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">No cancellation reasons were published.</p>
              )}
              <p className="mt-3 max-w-3xl text-xs text-neutral-500">
                Reasons are reproduced exactly as CAISO published them.{" "}
                {formatNumber(metrics.m5.unmappedStatusCount, 0)} projects carry a status this
                methodology does not map to a canonical state — CAISO&rsquo;s status field is
                uncontrolled free text. That is not a count of active projects, and no on-hold
                figure is published at version {methodology.version}.
              </p>
            </div>
          ) : null}

          <SourceFooter market={markets.caiso} methodology={methodology} />
        </div>
      ) : null}

      {analytics.coverage !== null ? (
        <p className="mt-8 max-w-3xl text-xs text-neutral-500">
          {analytics.notes.join(" ")}{" "}
          {analytics.coverage.caisoDuplicateGroups > 0 ? (
            <>
              {formatNumber(analytics.coverage.caisoDuplicateGroups, 0)} CAISO project identifiers
              appear on more than one transmission owner&rsquo;s sheet and are counted once,
              resolving {formatNumber(analytics.coverage.caisoOccurrencesResolvedAway, 0)} duplicate
              occurrences; every original record is retained.{" "}
            </>
          ) : null}
          {analytics.calculatedAt !== null ? <>Calculated {stamp(analytics.calculatedAt)}.</> : null}
          {analytics.freshness.status === "current" ? " Currency confirmed by the daily refresh." : null}
        </p>
      ) : null}
    </section>
  );
}
