"use client";

import { useMemo, useState } from "react";

import { useContainerSize } from "@/components/charts/use-container-size";
import { SectionHeading } from "@/components/analytics/section-heading";
import { SELECTOR_FOCUS, SELECTOR_SURFACE } from "@/components/market-detail/select-menu";
import { BUILDOUT_METRICS, findBuildoutMetric } from "@/data/mock/power-analytics";
import { formatNumber, formatPercent } from "@/lib/format";
import type { BuildoutMetricId } from "@/types/power-analytics";

const BAR_FILL = "#526fe0";
const BAR_LATEST = "#8ca4ff";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const PADDING = { top: 16, right: 48, bottom: 28, left: 8 };

/**
 * Grid Buildout Velocity: one measure at a time, by year, as columns. The
 * four measures use different units, so switching replaces the axis, unit,
 * headline, and description rather than overlaying them. Transformer lead
 * time is the one where lower is better, and the copy says so.
 */
export function GridBuildoutChart() {
  const [metricId, setMetricId] = useState<BuildoutMetricId>("transfer-capacity");
  const metric = findBuildoutMetric(metricId);
  const { ref, size } = useContainerSize<HTMLDivElement>();
  const latest = metric.points[metric.points.length - 1]!;
  const previous = metric.points[metric.points.length - 2]!;
  const changePercent = ((latest.value - previous.value) / previous.value) * 100;
  const improving = metric.lowerIsBetter ? changePercent < 0 : changePercent > 0;

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const metric = findBuildoutMetric(metricId);
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const max = Math.max(...metric.points.map((point) => point.value));
    const rough = max / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((n) => n * magnitude).find((candidate) => candidate >= rough) ?? magnitude;
    const yMax = Math.ceil((max * 1.05) / step) * step;
    const y = (value: number) => plotBottom - (value / yMax) * (plotBottom - plotTop);
    const slot = (plotRight - plotLeft) / metric.points.length;
    const barWidth = Math.min(slot * 0.55, 48);
    const x = (index: number) => plotLeft + slot * index + (slot - barWidth) / 2;
    const yTicks: number[] = [];
    for (let value = 0; value <= yMax; value += step) yTicks.push(value);
    return { plotLeft, plotRight, plotBottom, y, x, barWidth, yTicks, decimals: step < 1 ? 1 : 0 };
  }, [size, metricId]);

  const description = `${metric.label}, ${metric.unit}, ${metric.points[0]!.year} to ${latest.year}: ${metric.points
    .map((point) => `${point.year} ${formatNumber(point.value, 1)}`)
    .join(", ")}. ${metric.lowerIsBetter ? "Lower is better." : ""}`;

  return (
    <section id="buildout" aria-labelledby="buildout-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="buildout-heading"
        title="Grid Buildout Velocity"
        subtitle="How quickly the physical network is expanding"
        aside={
          <div role="group" aria-label="Buildout measure" className={`inline-flex flex-wrap items-center self-start p-0.5 ${SELECTOR_SURFACE} h-auto min-h-9 hover:bg-[#111111]`}>
            {BUILDOUT_METRICS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === metricId}
                onClick={() => setMetricId(option.id)}
                className={`flex h-8 items-center justify-center rounded-[2px] px-3 text-xs font-medium uppercase tracking-wide transition-colors ${
                  option.id === metricId ? "bg-white/[0.09] text-neutral-50" : "text-neutral-500 hover:text-neutral-200"
                } ${SELECTOR_FOCUS}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      <p className="mt-5 flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className="text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">{formatNumber(latest.value, metric.id === "circuit-miles" ? 0 : 1)}</span>{" "}
        <span className="text-sm text-neutral-400">{metric.unit}</span>{" "}
        <span className={`text-sm font-medium ${improving ? "text-emerald-500" : "text-red-400"}`}>
          {formatPercent(changePercent, 1)} vs {previous.year}
        </span>{" "}
        <span className="text-xs text-neutral-500">{latest.year}{metric.lowerIsBetter ? " · lower is better" : ""}</span>
      </p>
      <p className="mt-1 text-xs text-neutral-500">{metric.description}</p>

      <div ref={ref} className="relative mt-4 h-[260px] sm:h-[300px]">
        {geometry && size && (
          <svg role="img" aria-label={`Grid buildout: ${metric.label} by year`} width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} className="block select-none">
            <title>{`Grid buildout: ${metric.label} by year`}</title>
            <desc>{description}</desc>
            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                <text x={geometry.plotRight + 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} dominantBaseline="middle" className="tabular-nums">{formatNumber(tick, geometry.decimals)}</text>
              </g>
            ))}
            {metric.points.map((point, index) => {
              const isLatest = index === metric.points.length - 1;
              return (
                <g key={point.year}>
                  <title>{`${point.year}: ${formatNumber(point.value, 1)} ${metric.unit}`}</title>
                  <rect x={geometry.x(index)} y={geometry.y(point.value)} width={geometry.barWidth} height={geometry.plotBottom - geometry.y(point.value)} fill={isLatest ? BAR_LATEST : BAR_FILL} fillOpacity={isLatest ? 1 : 0.7} />
                  <text x={geometry.x(index) + geometry.barWidth / 2} y={geometry.y(point.value) - 6} fill={isLatest ? "#e5e7eb" : AXIS_TEXT} fontSize={10} textAnchor="middle" className="tabular-nums">{formatNumber(point.value, metric.id === "circuit-miles" ? 0 : 1)}</text>
                  <text x={geometry.x(index) + geometry.barWidth / 2} y={size.height - 8} fill={AXIS_TEXT} fontSize={11} textAnchor="middle">{point.year}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </section>
  );
}
