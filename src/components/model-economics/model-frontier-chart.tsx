"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { SELECTOR_FOCUS, SELECTOR_SURFACE } from "@/components/market-detail/select-menu";
import { useContainerSize } from "@/components/charts/use-container-size";
import { configurationLabel } from "@/lib/frontier/read/derive";
import { formatNumber } from "@/lib/format";
import type { ModelFrontierView } from "@/lib/frontier/read/surface";

// The identity the detailed chart uses: icy blue on near-black, cool-gray guides.
const POINT_FILL = "#8ca4ff";
const FRONTIER_LINE = "#aab2c5";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const SURFACE = "#0a0a0a";
const LABEL_TEXT = "#c9ccd6";

const PADDING = { top: 20, right: 28, bottom: 46, left: 48 };
const RADIUS = 5;
const FRONTIER_RADIUS = 6.5;
const PRICE_TICKS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
const NARROW_CHART_WIDTH = 560;

/**
 * Model Frontier: benchmark capability against provider list price per 1M tokens.
 *
 * Four properties of this chart are load bearing rather than decorative.
 *
 * **A point is a configuration, not a model.** Epoch identifies a run as a model plus a
 * reasoning effort, and those are never collapsed — so `gpt-6-astra` appears once per effort
 * level the source published, at the same x. Choosing one would mean choosing which score
 * speaks for the model, and there is no non-arbitrary way to choose.
 *
 * **Which is why the cost boundary sits under the chart, not in the methodology.** Per-token
 * price does not move with effort; token consumption does. Two points at one x are two prices
 * per token, not two equal-cost options, and where one dominates the other it bought that
 * capability with tokens this chart does not count.
 *
 * **The model is the primary label and the configuration is secondary.** Effort variants are
 * one purchasable product observed under settings, and must never read as separate SKUs.
 *
 * **Points are neutral.** The demo distinguished open-weight from proprietary; that
 * classification does not exist in production yet and inferring it from a model's name is
 * exactly what the identity rules forbid, so every point is drawn the same until the
 * evidence-backed access class is built.
 */
export function ModelFrontierChart({ view = null }: { view?: ModelFrontierView | null }) {
  const [selected, setSelected] = useState(0);
  const { ref: containerRef, size } = useContainerSize<HTMLDivElement>();
  const [activeId, setActiveId] = useState<string | null>(null);

  const benchmark = view?.benchmarks[selected] ?? null;
  const points = useMemo(() => benchmark?.points ?? [], [benchmark]);

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0 || points.length === 0) return null;
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;

    const prices = points.map((point) => point.blendedPrice);
    const xMin = Math.log10(Math.min(...prices) / 1.4);
    const xMax = Math.log10(Math.max(...prices) * 1.4);
    const scores = points.map((point) => point.score);
    const lo = Math.max(0, Math.min(...scores) - 0.05);
    const hi = Math.min(1, Math.max(...scores) + 0.05);

    const x = (price: number) => plotLeft + ((Math.log10(price) - xMin) / (xMax - xMin)) * (plotRight - plotLeft);
    const y = (score: number) => plotBottom - ((score - lo) / (hi - lo || 1)) * (plotBottom - plotTop);

    const yTicks: number[] = [];
    for (let value = Math.ceil(lo * 10) / 10; value <= hi + 1e-9; value += 0.1) yTicks.push(Number(value.toFixed(1)));
    const xTicks = PRICE_TICKS.filter((price) => Math.log10(price) >= xMin && Math.log10(price) <= xMax);

    const frontier = points.filter((point) => point.onFrontier);
    const path = `M${frontier.map((point) => `${x(point.blendedPrice).toFixed(1)},${y(point.score).toFixed(1)}`).join("L")}`;

    return { plotLeft, plotRight, plotTop, plotBottom, x, y, xTicks, yTicks, path };
  }, [size, points]);

  if (view === null || benchmark === null) {
    return (
      <section id="frontier" aria-labelledby="frontier-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
        <SectionHeading id="frontier-heading" title="Model Frontier" subtitle="Capability against price" />
        <p className="mt-5 max-w-2xl text-sm text-neutral-400">
          No frontier is published. Model Frontier derives from published benchmark results joined to
          Urdais Token Price, and no substitute is shown.
        </p>
      </section>
    );
  }

  const active = activeId === null ? null : points.find((point) => point.id === activeId) ?? null;
  const narrow = size ? size.width < NARROW_CHART_WIDTH : false;
  const excluded = benchmark.exclusions;
  const totalExcluded = excluded.unmapped + excluded.ambiguous + excluded.not_applicable + excluded.no_eligible_price;

  return (
    <section id="frontier" aria-labelledby="frontier-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="frontier-heading"
        title="Model Frontier"
        subtitle={view.claim}
        aside={
          <div
            role="group"
            aria-label="Benchmark"
            className={`inline-flex items-center self-start p-0.5 ${SELECTOR_SURFACE} hover:bg-[#111111]`}
          >
            {view.benchmarks.map((entry, index) => (
              <button
                key={entry.slug}
                type="button"
                aria-pressed={index === selected}
                onClick={() => {
                  setSelected(index);
                  setActiveId(null);
                }}
                className={`flex h-full items-center justify-center rounded-[2px] px-3 text-sm font-medium transition-colors ${
                  index === selected ? "bg-white/[0.09] text-neutral-50" : "text-neutral-500 hover:text-neutral-200"
                } ${SELECTOR_FOCUS}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        }
      />

      <p className="mt-4 text-xs text-neutral-500 tabular-nums">
        {benchmark.points.length} configurations across {benchmark.distinctModelCount} models ·{" "}
        {benchmark.frontierCount} on the frontier · prices as of {benchmark.priceAsOf}
        {benchmark.capabilityAsOfRange && (
          <> · scores evaluated {benchmark.capabilityAsOfRange.first} to {benchmark.capabilityAsOfRange.last}</>
        )}
      </p>

      <div ref={containerRef} className="relative mt-5 h-[360px] sm:h-[420px]">
        {geometry && size && (
          <svg
            role="group"
            aria-label={`Model Frontier: ${benchmark.label} score against blended token price`}
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            className="block select-none"
            onPointerLeave={() => setActiveId(null)}
          >
            <title>{`Model Frontier: ${benchmark.label} score against blended token price`}</title>
            <desc>
              {`${points.length} model configurations plotted by ${benchmark.label} score against blended price in USD per 1M tokens. ${benchmark.frontierCount} are on the frontier.`}
            </desc>

            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                <text x={geometry.plotLeft - 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} textAnchor="end" dominantBaseline="middle" className="tabular-nums">
                  {Math.round(tick * 100)}%
                </text>
              </g>
            ))}
            {geometry.xTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.x(tick)} x2={geometry.x(tick)} y1={geometry.plotTop} y2={geometry.plotBottom} stroke={GRID_LINE} />
                <text x={geometry.x(tick)} y={geometry.plotBottom + 16} fill={AXIS_TEXT} fontSize={11} textAnchor="middle" className="tabular-nums">
                  ${tick < 1 ? tick.toFixed(2) : tick}
                </text>
              </g>
            ))}
            <text x={geometry.plotRight} y={size.height - 6} fill={AXIS_TEXT} fontSize={10} textAnchor="end">
              Blended list price, USD per 1M tokens (log scale) →
            </text>
            <text
              x={12}
              y={geometry.plotTop}
              fill={AXIS_TEXT}
              fontSize={10}
              textAnchor="end"
              transform={`rotate(-90 12 ${geometry.plotTop})`}
            >
              {benchmark.label} score →
            </text>

            <path d={geometry.path} fill="none" stroke={FRONTIER_LINE} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" />

            {points.map((point) => {
              const cx = geometry.x(point.blendedPrice);
              const cy = geometry.y(point.score);
              const isActive = point.id === activeId;
              const label = `${point.displayName} (${point.providerName}), ${configurationLabel(point.configuration)}: ${benchmark.label} ${formatNumber(point.score * 100, 1)} %, $${formatNumber(point.blendedPrice, 2)} per 1M tokens${point.onFrontier ? ", on the frontier" : ""}`;
              return (
                <g key={point.id} role="img" aria-label={label} onPointerEnter={() => setActiveId(point.id)} className="cursor-default">
                  <title>{label}</title>
                  <circle cx={cx} cy={cy} r={14} fill="transparent" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={point.onFrontier ? FRONTIER_RADIUS : RADIUS}
                    fill={point.onFrontier ? POINT_FILL : SURFACE}
                    fillOpacity={point.onFrontier ? (isActive ? 1 : 0.9) : 1}
                    stroke={POINT_FILL}
                    strokeWidth={point.onFrontier ? 1 : isActive ? 2.25 : 1.5}
                    strokeOpacity={point.onFrontier ? 1 : 0.75}
                  />
                  {point.onFrontier && !narrow && (
                    <text x={cx + FRONTIER_RADIUS + 5} y={cy} fill={LABEL_TEXT} fontSize={11} dominantBaseline="middle">
                      {point.displayName}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {geometry && active && size && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs shadow-lg shadow-black/40"
            style={{
              top: Math.max(0, geometry.y(active.score) - 132),
              ...(geometry.x(active.blendedPrice) > size.width * 0.6
                ? { right: size.width - geometry.x(active.blendedPrice) + 16 }
                : { left: geometry.x(active.blendedPrice) + 16 }),
            }}
          >
            {/* Model primary, configuration secondary: one product observed under settings. */}
            <p className="font-semibold text-neutral-50">{active.displayName}</p>
            <p className="text-neutral-400">
              {active.providerName} · {configurationLabel(active.configuration)}
              {active.onFrontier ? " · frontier" : ""}
            </p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 tabular-nums">
              <dt className="text-neutral-500">{benchmark.label}</dt>
              <dd className="text-right font-medium text-neutral-50">{formatNumber(active.score * 100, 1)}%</dd>
              <dt className="text-neutral-500">Score dated</dt>
              <dd className="text-right text-neutral-300">{active.capabilityAsOf}</dd>
              <dt className="text-neutral-500">Blended price</dt>
              <dd className="text-right font-medium text-neutral-50">${formatNumber(active.blendedPrice, 2)} / 1M</dd>
              <dt className="text-neutral-500">Price dated</dt>
              <dd className="text-right text-neutral-300">{active.priceAsOf}</dd>
            </dl>
            <p className="mt-1.5 border-t border-white/10 pt-1.5 font-mono text-[10px] text-neutral-500">
              {active.sourceModelIdentifier}
            </p>
          </div>
        )}
      </div>

      {/* The boundary that makes configuration-level plotting honest. Beside the chart, not
          behind a link, because it is the thing most likely to be misread. */}
      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-neutral-400">{view.costBoundary}</p>

      {totalExcluded > 0 && (
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-neutral-500">
          Not plotted on {benchmark.label}: {excluded.unmapped} scored models Urdais has not linked to a
          priced product, {excluded.ambiguous} whose identity is ambiguous, and {excluded.no_eligible_price}{" "}
          linked models with no comparable standard list price. They are excluded rather than estimated.
        </p>
      )}

      <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-neutral-500">
        Capability: {view.attribution.citation} Licensed under{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
          rel="noreferrer noopener"
          target="_blank"
        >
          CC BY 4.0
        </a>
        . Price: Urdais Token Price, a 500k input plus 500k output workload weighted evenly. Methodology{" "}
        <Link
          href="/docs/methodology/model-frontier"
          className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
        >
          Model Frontier {view.methodologyVersion}
        </Link>
        . A point is one model under one source-declared configuration; capability and price carry
        different dates and are not reconciled.
      </p>
    </section>
  );
}
