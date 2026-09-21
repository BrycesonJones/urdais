"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { useContainerSize } from "@/components/charts/use-container-size";
import { formatNumber, formatSigned } from "@/lib/format";
import type { DeliveryGapReadModel } from "@/lib/power-delivery/gap/read";

const SUMMER = "#d4a56a";
const WINTER = "#8ca4ff";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const ZERO_LINE = "rgba(255,255,255,0.35)";
const PADDING = { top: 24, right: 62, bottom: 34, left: 8 };

const SEASON_COLOR: Record<string, string> = { summer: SUMMER, winter: WINTER };
const seasonLabel = (season: string) => season.charAt(0).toUpperCase() + season.slice(1);

/** A megawatt figure as the product shows it: whole numbers, grouped. */
const mw = (value: number) => `${formatNumber(value, 0)} MW`;

/**
 * The ERCOT Power Delivery Gap: forecast peak demand minus approved planning capacity, one bar
 * per season and forecast year, around a zero line that is always drawn.
 *
 * Bars rather than a continuous line, because the underlying data is ten discrete seasonal
 * statements and not a time series. Nothing is interpolated between them, and nothing is clipped:
 * a negative gap means approved capacity exceeds forecast demand and belongs below the axis,
 * which is a real and currently common state in the early forecast years.
 */
export function PowerDeliveryGapChart({ model }: { model: DeliveryGapReadModel }) {
  const { ref, size } = useContainerSize<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const series = model.series;
  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0 || series.length === 0) return null;
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;

    const values = series.map((point) => point.gapMw);
    const step = 10_000;
    // Zero is always inside the range, so the axis is never implied off-screen.
    const yMin = Math.min(0, Math.floor((Math.min(...values) * 1.08) / step) * step);
    const yMax = Math.max(0, Math.ceil((Math.max(...values) * 1.08) / step) * step);
    const y = (value: number) => plotBottom - ((value - yMin) / (yMax - yMin)) * (plotBottom - plotTop);

    const slot = (plotRight - plotLeft) / series.length;
    const barWidth = Math.max(6, Math.min(34, slot * 0.62));
    const x = (index: number) => plotLeft + slot * (index + 0.5);

    const yTicks: number[] = [];
    for (let value = yMin; value <= yMax; value += step) yTicks.push(value);
    const years = [...new Set(series.map((point) => point.targetYear))];
    return { plotLeft, plotRight, plotTop, plotBottom, x, y, yTicks, slot, barWidth, years, zero: y(0) };
  }, [size, series]);

  const hovered = hoverIndex === null ? null : series[hoverIndex] ?? null;
  const latest = series.at(-1) ?? null;

  const description = series.length === 0
    ? `ERCOT Power Delivery Gap: ${model.reason}`
    : `ERCOT Power Delivery Gap by season, ${series[0]!.targetYear} to ${series.at(-1)!.targetYear}. `
      + series.map((point) => `${seasonLabel(point.season)} ${point.targetYear}: ${formatSigned(point.gapMw, 0)} MW`).join("; ");

  return (
    <section aria-labelledby="delivery" className="scroll-mt-24">
      <SectionHeading
        id="delivery"
        title="ERCOT Power Delivery Gap"
        subtitle="Planning forecast peak demand minus approved planning capacity, by season and forecast year."
        badge={<LifecycleBadge model={model} />}
        aside={latest === null ? undefined : (
          <p className="tabular-nums">
            <span className="block font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              {seasonLabel(latest.season)} {latest.targetYear} gap
            </span>
            <span className="mt-1 block text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">
              {formatSigned(latest.gapMw, 0)} <span className="text-base font-normal text-neutral-400">MW</span>
            </span>
            <span className="block text-xs text-neutral-500">
              demand {mw(latest.demandMw)} − capacity {mw(latest.capacityMw)}
            </span>
          </p>
        )}
      />

      {series.length === 0 ? (
        <UnavailableNotice model={model} />
      ) : (
        <>
          <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400">
            {["summer", "winter"].map((season) => (
              <li key={season} className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block size-3 rounded-[1px]" style={{ backgroundColor: SEASON_COLOR[season] }} />
                <span className="text-neutral-200">{seasonLabel(season)}</span>
              </li>
            ))}
            <li className="text-neutral-500">
              MW · positive means forecast demand exceeds approved planning capacity
            </li>
          </ul>

          {/*
            The series in words, always present. The chart itself can only be drawn once the
            container has been measured, and a reader using a screen reader should not depend on
            that having happened.
          */}
          <p className="sr-only" data-testid="gap-series-summary">{description}</p>

          <div ref={ref} className="relative mt-3 h-[320px] sm:h-[380px] lg:h-[420px]">
            {geometry && size && (
              <svg
                role="img"
                aria-label="ERCOT Power Delivery Gap by season and forecast year"
                width={size.width}
                height={size.height}
                viewBox={`0 0 ${size.width} ${size.height}`}
                className="block select-none"
                onPointerMove={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const offset = event.clientX - bounds.left - geometry.plotLeft;
                  const index = Math.floor(offset / geometry.slot);
                  setHoverIndex(index >= 0 && index < series.length ? index : null);
                }}
                onPointerLeave={() => setHoverIndex(null)}
              >
                <title>ERCOT Power Delivery Gap by season and forecast year</title>
                <desc>{description}</desc>
                {geometry.yTicks.map((tick) => (
                  <g key={tick}>
                    <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                    <text x={geometry.plotRight + 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} dominantBaseline="middle" className="tabular-nums">
                      {formatNumber(tick / 1000, 0)}k
                    </text>
                  </g>
                ))}
                {/* Zero is drawn explicitly: the sign of this number is the whole point. */}
                <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.zero} y2={geometry.zero} stroke={ZERO_LINE} strokeWidth={1} />

                {series.map((point, index) => {
                  const top = point.gapMw >= 0 ? geometry.y(point.gapMw) : geometry.zero;
                  const height = Math.max(1, Math.abs(geometry.y(point.gapMw) - geometry.zero));
                  return (
                    <rect
                      key={`${point.season}-${point.targetYear}`}
                      x={geometry.x(index) - geometry.barWidth / 2}
                      y={top}
                      width={geometry.barWidth}
                      height={height}
                      fill={SEASON_COLOR[point.season] ?? SUMMER}
                      fillOpacity={hoverIndex === null || hoverIndex === index ? 0.85 : 0.35}
                    />
                  );
                })}

                {geometry.years.map((year) => {
                  const first = series.findIndex((point) => point.targetYear === year);
                  const count = series.filter((point) => point.targetYear === year).length;
                  return (
                    <text
                      key={year}
                      x={geometry.x(first) + (geometry.slot * (count - 1)) / 2}
                      y={size.height - 12}
                      fill={AXIS_TEXT}
                      fontSize={11}
                      textAnchor="middle"
                    >
                      {year}
                    </text>
                  );
                })}
              </svg>
            )}
            {geometry && hovered && size && hoverIndex !== null && (
              <div
                className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs shadow-lg shadow-black/40"
                style={{
                  top: geometry.plotTop,
                  ...(geometry.x(hoverIndex) > size.width * 0.55
                    ? { right: size.width - geometry.x(hoverIndex) + 14 }
                    : { left: geometry.x(hoverIndex) + 14 }),
                }}
              >
                <p className="whitespace-nowrap text-neutral-400">
                  {seasonLabel(hovered.season)} {hovered.targetYear}
                </p>
                {/* The subtraction, legible: demand − capacity = gap. */}
                <ul className="mt-1.5 flex flex-col gap-1 tabular-nums">
                  <li className="flex justify-between gap-4"><span className="text-neutral-400">Forecast demand</span><span className="font-medium text-neutral-50">{mw(hovered.demandMw)}</span></li>
                  <li className="flex justify-between gap-4"><span className="text-neutral-400">Approved capacity</span><span className="font-medium text-neutral-50">− {mw(hovered.capacityMw)}</span></li>
                  <li className="flex justify-between gap-4 border-t border-white/10 pt-1"><span className="text-neutral-400">Delivery gap</span><span className="font-medium text-neutral-50">{formatSigned(hovered.gapMw, 0)} MW</span></li>
                </ul>
                <p className="mt-1.5 whitespace-nowrap text-[11px] text-neutral-500">
                  {hovered.demandScenarioLabel} · {hovered.capacityScenarioLabel} · {hovered.capacityBasis}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <GapFootnotes model={model} />
    </section>
  );
}

function LifecycleBadge({ model }: { model: DeliveryGapReadModel }) {
  const tone = model.lifecycle === "live"
    ? "border-emerald-700/60 text-emerald-300"
    : model.lifecycle === "stale"
      ? "border-amber-700/60 text-amber-300"
      : "border-neutral-700 text-neutral-400";
  const label = model.lifecycle === "live" ? "Live"
    : model.lifecycle === "stale" ? "Stale"
      : model.lifecycle === "blocked" ? "Not published" : "Not initialized";
  return (
    <span title={model.reason} className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>
      {label}
    </span>
  );
}

/** What the section shows when there is nothing to plot. Never an empty chart. */
function UnavailableNotice({ model }: { model: DeliveryGapReadModel }) {
  return (
    <div className="mt-5 rounded-md border border-white/10 bg-white/[0.02] px-4 py-5">
      <p className="text-sm text-neutral-300">No delivery gap is published for ERCOT right now.</p>
      <p className="mt-1 text-sm text-neutral-500">{model.reason}</p>
    </div>
  );
}

function GapFootnotes({ model }: { model: DeliveryGapReadModel }) {
  const updated = model.calculatedAt === null
    ? null
    : new Date(model.calculatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 text-xs text-neutral-500">
      <p className="text-neutral-400">
        Positive means forecast demand exceeds approved planning capacity; negative means approved
        planning capacity exceeds forecast demand.
      </p>

      {/* Mandatory, and kept to one line with the detail behind the methodology link. */}
      <p className="text-neutral-400">
        <span className="text-neutral-300">Not ERCOT&rsquo;s reserve margin.</span>{" "}
        Urdais measures against the full ERCOT Adjusted forecast peak; ERCOT&rsquo;s reserve margin uses
        firm peak load.{" "}
        <Link
          href="/docs/methodology/power-delivery-gap"
          className="text-neutral-300 underline decoration-neutral-600 underline-offset-2 hover:text-neutral-100"
        >
          Methodology {model.methodology.version}
        </Link>
      </p>

      <p>
        {model.demandSource === null || model.capacitySource === null
          ? "Sources unavailable."
          : `Sources: ${model.demandSource.sourceName} and ${model.capacitySource.sourceName} (ERCOT). ${model.attributionNote}`}
        {updated === null ? "" : ` Last calculated ${updated}.`}
      </p>

      <MarketCoverage model={model} />
    </div>
  );
}

/**
 * The six markets that produce no gap, named with their reasons.
 *
 * They are listed rather than hidden because the alternative reads as a product that covers seven
 * markets and happens to be missing six, which is the opposite of what is true.
 */
function MarketCoverage({ model }: { model: DeliveryGapReadModel }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-neutral-400 hover:text-neutral-200">
        <span className="underline decoration-neutral-700 underline-offset-2">
          Why only ERCOT? ({model.otherMarkets.length} markets unavailable)
        </span>
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5 border-l border-white/10 pl-3">
        {model.otherMarkets.map((market) => (
          <li key={market.marketSlug} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-neutral-400 sm:w-16 sm:shrink-0">
              {market.marketSlug}
            </span>
            <span className="text-neutral-500">{market.blocker}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
