"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { formatNumber } from "@/lib/format";
import type {
  FlexibleCapacityReadModel, IneligibilityReason, MarketView, MarketYearView, ScenarioView,
} from "@/lib/flexible-capacity/analytics/read";

/**
 * Flexible Capacity: how much additional flat load a balancing authority could have carried below
 * its own observed peak, for a stated annual curtailment-energy allowance.
 *
 * This component renders the read model and decides nothing. Every figure arrived already solved
 * and validated under methodology 1.1.0; the only computation here is choosing which stored
 * scenario the reader asked to see. The solver is not shipped to the browser, and a published
 * number is always one that was calculated server-side and stored.
 *
 * Three things it will not do.
 *
 * It never hides a refused market-year. Methodology 1.1.0 declines a year whose data has a gap
 * longer than an hour, whose peak day is incomplete, or whose maximum is not a peak any publisher
 * can have meant. Those years stay in the selector, carry their reason, and show no figure --
 * because a year selector with silent holes implies the years shown are the only ones that exist.
 *
 * It never blends years. FC-3 measured year-over-year swings of 40 to 76%, so an average across
 * them would be a number about no year at all.
 *
 * It never presents the equivalent full-load hours as though they were hours of interruption.
 * They are an energy equivalence; the clock-hour figure is separate and is usually several times
 * larger, because most curtailed hours are shallow.
 */

const HEADROOM_LINE = "#b6c7ff";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const SURFACE = "#0a0a0a";
const PADDING = { top: 20, right: 56, bottom: 34, left: 12 };

const REFUSAL_LABEL: Record<IneligibilityReason, string> = {
  contiguous_gap_too_long: "Data gap exceeds the methodology limit",
  peak_day_incomplete: "The peak day is incomplete",
  peak_implausible: "Implausible source peak",
  annual_coverage_below_floor: "Insufficient annual coverage",
  gap_threshold_unresolved: "Gap rule unresolved",
  series_empty: "No observations",
  not_modelled: "Not modelled",
};

const REFUSAL_DETAIL: Record<IneligibilityReason, string> = {
  contiguous_gap_too_long:
    "A run of consecutive hours is missing from the source series. Beyond one hour, an absent run "
    + "can materially overstate headroom, so the year is excluded rather than modelled.",
  peak_day_incomplete:
    "Hours are missing from the local calendar day that holds the observed maximum, so the peak "
    + "reference cannot be trusted to be the year's real peak.",
  peak_implausible:
    "Source data contained an extreme peak inconsistent with the surrounding distribution; the "
    + "year was excluded rather than corrected.",
  annual_coverage_below_floor:
    "Too much of the year is absent from the source series for the annual energy budget to mean "
    + "anything.",
  gap_threshold_unresolved:
    "The methodology's contiguous-gap rule is not settled, so no year may be judged eligible.",
  series_empty: "No hourly demand is held for this market-year.",
  not_modelled: "This market-year has not been modelled.",
};

const percent = (value: number): string => `${formatNumber(value * 100, 2)}%`;

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[3px] border border-white/10 bg-white/[0.02] p-3">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</h4>
      <p className="mt-1.5 text-lg font-medium tabular-nums text-neutral-50">{value}</p>
      {hint !== undefined && <p className="mt-1 text-[11px] leading-snug text-neutral-500">{hint}</p>}
    </div>
  );
}

function Selector<T extends string | number>({
  label, value, options, onChange, describe,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (next: T) => void;
  describe?: (value: T) => string;
}) {
  const id = `fc-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        onChange={(event) => {
          const next = options.find((option) => String(option.value) === event.target.value);
          if (next !== undefined) onChange(next.value);
        }}
        className="rounded-[3px] border border-white/15 bg-[#111] px-2 py-1.5 text-sm text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
      {describe !== undefined && (
        <p className="text-[11px] text-neutral-500">{describe(value)}</p>
      )}
    </div>
  );
}

/** Headroom against allowance, for one market-year. Discrete points, because alpha is discrete. */
function ScenarioChart({ scenarios, selectedAlpha }: {
  scenarios: readonly ScenarioView[];
  selectedAlpha: number;
}) {
  const width = 640;
  const height = 220;
  const plotLeft = PADDING.left;
  const plotRight = width - PADDING.right;
  const plotTop = PADDING.top;
  const plotBottom = height - PADDING.bottom;

  const ordered = [...scenarios].sort((left, right) => left.alpha - right.alpha);
  const maxGw = Math.max(...ordered.map((entry) => entry.curtailmentEnabledHeadroomGw), 0.001);
  const vMax = Math.ceil(maxGw * 1.15 * 10) / 10;
  const alphaMin = ordered[0]?.alpha ?? 0;
  const alphaMax = ordered[ordered.length - 1]?.alpha ?? 1;

  const x = (alpha: number): number => alphaMax === alphaMin
    ? (plotLeft + plotRight) / 2
    : plotLeft + ((alpha - alphaMin) / (alphaMax - alphaMin)) * (plotRight - plotLeft);
  const y = (gw: number): number => plotBottom - (gw / vMax) * (plotBottom - plotTop);

  const path = ordered
    .map((entry, index) => `${index === 0 ? "M" : "L"}${x(entry.alpha).toFixed(1)},${y(entry.curtailmentEnabledHeadroomGw).toFixed(1)}`)
    .join("");

  const ticks = [0, vMax / 2, vMax];
  const description = `Curtailment-enabled headroom against annual curtailment allowance: ${ordered
    .map((entry) => `${percent(entry.alpha)} allowance, ${formatNumber(entry.curtailmentEnabledHeadroomGw, 2)} gigawatts`)
    .join("; ")}.`;

  return (
    <div className="mt-4 overflow-x-auto">
      <svg
        role="img"
        aria-label="Curtailment-enabled headroom against annual curtailment energy allowance"
        viewBox={`0 0 ${width} ${height}`}
        className="block h-[220px] w-full min-w-[420px] select-none"
      >
        <title>Curtailment-enabled headroom against annual curtailment energy allowance</title>
        <desc>{description}</desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={plotLeft} x2={plotRight} y1={y(tick)} y2={y(tick)} stroke={GRID_LINE} />
            <text x={plotRight + 8} y={y(tick)} fill={AXIS_TEXT} fontSize={11} dominantBaseline="middle" className="tabular-nums">
              {formatNumber(tick, 1)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke={HEADROOM_LINE} strokeWidth={2} strokeLinejoin="round" />
        {ordered.map((entry) => {
          const selected = entry.alpha === selectedAlpha;
          return (
            <g key={entry.alpha}>
              <circle
                cx={x(entry.alpha)}
                cy={y(entry.curtailmentEnabledHeadroomGw)}
                r={selected ? 5.5 : 3.5}
                fill={selected ? HEADROOM_LINE : SURFACE}
                stroke={HEADROOM_LINE}
                strokeWidth={1.5}
              />
              <text x={x(entry.alpha)} y={height - 16} fill={AXIS_TEXT} fontSize={11} textAnchor="middle">
                {percent(entry.alpha)}
              </text>
            </g>
          );
        })}
        <text x={plotLeft} y={height - 2} fill={AXIS_TEXT} fontSize={10}>
          Annual curtailment energy allowance
        </text>
        <text x={plotRight + 8} y={plotTop - 8} fill={AXIS_TEXT} fontSize={10}>GW</text>
      </svg>
    </div>
  );
}

function RefusedYear({ year }: { year: MarketYearView }) {
  const reason = year.eligibility.reason ?? "not_modelled";
  return (
    <div className="mt-4 rounded-[3px] border border-amber-500/25 bg-amber-500/[0.04] p-4">
      <p className="text-sm font-medium text-amber-200">Scenario unavailable for this market-year</p>
      <p className="mt-1 text-sm text-neutral-300">{REFUSAL_LABEL[reason]}</p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-400">{REFUSAL_DETAIL[reason]}</p>
      {year.eligibility.detail !== null && (
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-neutral-500">{year.eligibility.detail}</p>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        The source observations are kept exactly as the publisher reported them. A refused year is
        excluded, never corrected or filled in.
      </p>
    </div>
  );
}

export function FlexibleCapacityChart({ analytics }: { analytics: FlexibleCapacityReadModel }) {
  const markets = analytics.markets;
  const defaultMarket = markets.find((market) => market.slug === "ercot") ?? markets[0] ?? null;
  const [marketSlug, setMarketSlug] = useState<string | null>(defaultMarket?.slug ?? null);

  const market: MarketView | null = useMemo(
    () => markets.find((entry) => entry.slug === marketSlug) ?? defaultMarket,
    [markets, marketSlug, defaultMarket]);

  // The newest eligible year, falling back to the newest modelled one so a market whose latest
  // year was refused still opens on something rather than on nothing.
  const defaultYear = market?.latestEligibleYear ?? market?.latestModelledYear ?? null;
  const [yearChoice, setYearChoice] = useState<number | null>(null);
  const year: MarketYearView | null = useMemo(() => {
    if (market === null) return null;
    return market.years.find((entry) => entry.year === yearChoice)
      ?? market.years.find((entry) => entry.year === defaultYear)
      ?? market.years[0] ?? null;
  }, [market, yearChoice, defaultYear]);

  const [alphaChoice, setAlphaChoice] = useState<number | null>(null);
  const scenario: ScenarioView | null = useMemo(() => {
    if (year === null || year.scenarios.length === 0) return null;
    return year.scenarios.find((entry) => entry.alpha === alphaChoice)
      ?? year.scenarios.find((entry) => entry.alpha === analytics.assumptions.defaultAlpha)
      ?? year.scenarios[0] ?? null;
  }, [year, alphaChoice, analytics.assumptions.defaultAlpha]);

  const unavailable = analytics.availability.state === "unavailable" || market === null || year === null;

  return (
    <section id="flexibility" aria-labelledby="flexibility-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="flexibility-heading"
        title="Flexible Capacity"
        subtitle="Curtailment-enabled headroom: additional flat load that stays below the year's observed peak"
        badge={
          <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
            Scenario model
          </span>
        }
        aside={
          scenario !== null && year !== null && market !== null ? (
            <p className="tabular-nums">
              <span className="mt-1 block text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">
                {formatNumber(scenario.curtailmentEnabledHeadroomGw, 2)}{" "}
                <span className="text-base font-normal text-neutral-400">GW</span>
              </span>
              <span className="block text-xs text-neutral-400">Curtailment-enabled headroom</span>
              <span className="block text-xs text-neutral-500">
                {market.name} · {year.year} · {percent(scenario.alpha)} annual curtailment allowance
              </span>
            </p>
          ) : undefined
        }
      />

      <p className="mt-4 max-w-3xl rounded-[3px] border border-white/10 bg-white/[0.02] p-3 text-sm leading-relaxed text-neutral-300">
        <span className="font-medium text-neutral-100">Scenario model, not observed available capacity.</span>{" "}
        Estimates how much additional flat electrical load could have remained below the modelled
        year&apos;s observed peak if that new load accepted the selected annual curtailment-energy
        allowance. It is electrical load headroom, not compute capacity, and represents generation
        adequacy only.
      </p>

      {analytics.availability.state === "unavailable" && (
        <div className="mt-4 rounded-[3px] border border-white/10 bg-white/[0.02] p-4">
          <p className="text-sm text-neutral-300">No Flexible Capacity scenario has been published yet.</p>
          <p className="mt-1 text-xs text-neutral-500">
            {analytics.availability.reason === "no_database_configured"
              ? "This environment has no analytical database configured."
              : analytics.availability.reason === "methodology_not_approved"
                ? "The methodology is not approved for publication."
                : analytics.availability.reason === "publication_not_authorized"
                  ? "Publication is blocked: a methodology parameter is unresolved."
                  : "No validated analytical run has produced a scenario for an eligible market-year."}
          </p>
        </div>
      )}

      {!unavailable && market !== null && year !== null && (
        <>
          <div className="mt-5 flex flex-wrap items-start gap-4">
            <Selector
              label="Market"
              value={market.slug}
              options={markets.map((entry) => ({ value: entry.slug, label: entry.name }))}
              onChange={(next) => { setMarketSlug(next); setYearChoice(null); }}
            />
            <Selector
              label="Modelled year"
              value={year.year}
              options={market.years.map((entry) => ({
                value: entry.year,
                label: entry.eligibility.state === "eligible" ? String(entry.year) : `${entry.year} — unavailable`,
              }))}
              onChange={(next) => setYearChoice(next)}
            />
            {year.scenarios.length > 0 && scenario !== null && (
              <Selector
                label="Curtailment allowance"
                value={scenario.alpha}
                options={year.scenarios.map((entry) => ({ value: entry.alpha, label: percent(entry.alpha) }))}
                onChange={(next) => setAlphaChoice(next)}
                describe={() => `${formatNumber(scenario.equivalentFullLoadHours, 1)} equivalent full-load hours`}
              />
            )}
          </div>

          {market.latestModelledYear !== null && market.latestEligibleYear !== null
            && market.latestModelledYear > market.latestEligibleYear && (
            <p className="mt-3 text-xs text-amber-300/90">
              The newest modelled year for {market.name} ({market.latestModelledYear}) was refused by
              the methodology. {market.latestEligibleYear} is the most recent year with a scenario.
            </p>
          )}

          {year.eligibility.state === "ineligible" ? (
            <RefusedYear year={year} />
          ) : (
            <>
              {scenario !== null && <ScenarioChart scenarios={year.scenarios} selectedAlpha={scenario.alpha} />}

              {year.observed !== null && (
                <div className="mt-5">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                    Observed basis
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric
                      label="Observed peak"
                      value={`${formatNumber(year.observed.peakMw, 0)} MW`}
                      hint={`${year.observed.peakAtLocal} local`}
                    />
                    <Metric
                      label="Annual coverage"
                      value={percent(year.observed.coverageRatio)}
                      hint={`${formatNumber(year.observed.observationCount, 0)} of ${formatNumber(year.observed.expectedObservationCount, 0)} hours`}
                    />
                    <Metric
                      label="Longest data gap"
                      value={`${formatNumber(year.observed.maximumContiguousGapHours, 0)} h`}
                      hint={`Limit ${analytics.assumptions.maximumContiguousGapHours ?? "—"} h`}
                    />
                    <Metric
                      label="Source"
                      value="EIA-930"
                      hint="Observed hourly actual demand"
                    />
                  </div>
                </div>
              )}

              {scenario !== null && (
                <div className="mt-5">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                    What the allowance buys
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <Metric
                      label="Equivalent full-load hours"
                      value={formatNumber(scenario.equivalentFullLoadHours, 1)}
                      hint="Energy equivalence, not hours of interruption"
                    />
                    <Metric
                      label="Hours with curtailment"
                      value={formatNumber(scenario.clockHours, 0)}
                      hint="Clock hours touched, usually far more"
                    />
                    <Metric label="Events" value={formatNumber(scenario.eventCount, 0)} />
                    <Metric
                      label="Mean event"
                      value={`${formatNumber(scenario.meanEventDurationHours, 1)} h`}
                    />
                    <Metric
                      label="Longest event"
                      value={`${formatNumber(scenario.maxEventDurationHours, 0)} h`}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <details className="mt-5 rounded-[3px] border border-white/10 bg-white/[0.02]">
        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-neutral-300">
          What this figure is not
        </summary>
        <ul className="list-disc space-y-1.5 px-8 pb-4 text-xs leading-relaxed text-neutral-400">
          {analytics.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </details>

      <p className="mt-3 text-xs text-neutral-500">
        {analytics.notes[1] ?? ""}{" "}
        <Link href={analytics.methodology.documentPath} className="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-300">
          Methodology {analytics.methodology.version}
        </Link>
        {analytics.calculatedAt !== null && (
          <> · calculated {new Date(analytics.calculatedAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
          })}</>
        )}
      </p>
    </section>
  );
}
