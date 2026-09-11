"use client";

import { useMemo, useState } from "react";
import type { PointerEvent } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { useContainerSize } from "@/components/charts/use-container-size";
import { UTILIZATION_RANKING, UTILIZATION_SERIES } from "@/data/mock/compute-analytics";
import { formatNumber, formatTimestamp } from "@/lib/format";

// Icy-blue primary plus the comparison palette and a neutral silver; every series is named in the legend and readout.
const SERIES_COLORS = ["#b6c7ff", "#d4a56a", "#9c6fd0", "#3e9c94", "#c9ccd6"];
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const CROSSHAIR = "#aab2c5";
const SURFACE = "#0a0a0a";
const PADDING = { top: 16, right: 48, bottom: 30, left: 8 };
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Fleet Utilization: rented ÷ available GPUs for every accelerator over the
 * trailing year, on a fixed 0–100% axis, with the current ranking beside
 * the chart. Colour is assigned by UCPI order; names carry the identity.
 */
export function FleetUtilizationChart() {
  const { ref, size } = useContainerSize<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const times = UTILIZATION_SERIES[0]!.points.map((point) => point.time);

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const tMin = times[0]!;
    const tMax = times[times.length - 1]!;
    const x = (time: number) => plotLeft + ((time - tMin) / (tMax - tMin)) * (plotRight - plotLeft);
    const y = (percent: number) => plotBottom - (percent / 100) * (plotBottom - plotTop);
    const paths = UTILIZATION_SERIES.map((series) => `M${series.points.map((point) => `${x(point.time).toFixed(1)},${y(point.value).toFixed(1)}`).join("L")}`);
    const months: { time: number; label: string }[] = [];
    const first = new Date(tMin * 1000);
    let year = first.getUTCFullYear();
    let month = first.getUTCMonth() + 1;
    for (;;) {
      const time = Date.UTC(year, month, 1) / 1000;
      if (time > tMax) break;
      const date = new Date(time * 1000);
      if (date.getUTCMonth() % 2 === 0) months.push({ time, label: date.getUTCMonth() === 0 ? String(date.getUTCFullYear()) : MONTH_SHORT[date.getUTCMonth()]! });
      month++;
      if (month >= 12) { year++; month = 0; }
    }
    return { plotLeft, plotRight, plotTop, plotBottom, x, y, paths, months, tMin, tMax };
  }, [size, times]);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = Math.min(Math.max(event.clientX - rect.left, geometry.plotLeft), geometry.plotRight);
    const time = geometry.tMin + ((px - geometry.plotLeft) / (geometry.plotRight - geometry.plotLeft)) * (geometry.tMax - geometry.tMin);
    let best = 0;
    times.forEach((candidate, index) => { if (Math.abs(candidate - time) < Math.abs(times[best]! - time)) best = index; });
    setHoverIndex(best);
  }

  const description = `Fleet utilization over the trailing year, rented GPUs divided by available GPUs. Current: ${UTILIZATION_RANKING.map((series) => `${series.label} ${formatNumber(series.currentPercent, 0)}%`).join(", ")}.`;

  return (
    <section id="utilization" aria-labelledby="utilization-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading id="utilization-heading" title="Fleet Utilization" subtitle="Share of available compute rented, by accelerator" aside={<p className="text-xs text-neutral-500">Utilization = rented GPUs ÷ available GPUs · trailing year, weekly</p>} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400">
            {UTILIZATION_SERIES.map((series, index) => (
              <li key={series.instrumentId} className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-[2px] w-4 rounded-full" style={{ backgroundColor: SERIES_COLORS[index] }} />
                <span className="text-neutral-200">{series.label}</span>
              </li>
            ))}
          </ul>
          <div ref={ref} className="relative mt-3 h-[280px] sm:h-[340px]">
            {geometry && size && (
              <svg role="img" aria-label="Fleet utilization by accelerator over the trailing year" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} className="block select-none" onPointerMove={handlePointerMove} onPointerLeave={() => setHoverIndex(null)}>
                <title>Fleet utilization by accelerator over the trailing year</title>
                <desc>{description}</desc>
                {[0, 25, 50, 75, 100].map((tick) => (
                  <g key={tick}>
                    <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                    <text x={geometry.plotRight + 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} dominantBaseline="middle" className="tabular-nums">{tick}%</text>
                  </g>
                ))}
                {geometry.months.map((tick) => (
                  <text key={tick.time} x={geometry.x(tick.time)} y={size.height - 10} fill={AXIS_TEXT} fontSize={11} textAnchor="middle">{tick.label}</text>
                ))}
                {geometry.paths.map((path, index) => (
                  <path key={UTILIZATION_SERIES[index]!.instrumentId} d={path} fill="none" stroke={SERIES_COLORS[index]} strokeWidth={index === 0 ? 2 : 1.5} strokeLinejoin="round" />
                ))}
                {hoverIndex !== null && (
                  <g pointerEvents="none">
                    <line x1={geometry.x(times[hoverIndex]!)} x2={geometry.x(times[hoverIndex]!)} y1={geometry.plotTop} y2={geometry.plotBottom} stroke={CROSSHAIR} strokeOpacity={0.6} strokeDasharray="6 4" />
                    {UTILIZATION_SERIES.map((series, index) => (
                      <circle key={series.instrumentId} cx={geometry.x(times[hoverIndex]!)} cy={geometry.y(series.points[hoverIndex]!.value)} r={4} fill={SURFACE} stroke={SERIES_COLORS[index]} strokeWidth={1.5} />
                    ))}
                  </g>
                )}
              </svg>
            )}
            {geometry && hoverIndex !== null && size && (
              <div className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs shadow-lg shadow-black/40" style={{ top: geometry.plotTop + 4, ...(geometry.x(times[hoverIndex]!) > size.width * 0.55 ? { right: size.width - geometry.x(times[hoverIndex]!) + 12 } : { left: geometry.x(times[hoverIndex]!) + 12 }) }}>
                <p className="whitespace-nowrap text-neutral-400">{formatTimestamp(times[hoverIndex]!, false)}</p>
                <ul className="mt-1.5 flex flex-col gap-1 tabular-nums">
                  {UTILIZATION_SERIES.map((series, index) => (
                    <li key={series.instrumentId} className="flex items-center gap-3">
                      <span aria-hidden="true" className="inline-block h-[2px] w-4 shrink-0 rounded-full" style={{ backgroundColor: SERIES_COLORS[index] }} />
                      <span className="flex-1 text-neutral-400">{series.label}</span>
                      <span className="font-medium text-neutral-50">{formatNumber(series.points[hoverIndex]!.value, 1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <ol className="divide-y divide-white/[0.06] self-start" aria-label="Current utilization, highest first">
          {UTILIZATION_RANKING.map((series, rank) => {
            const colorIndex = UTILIZATION_SERIES.findIndex((candidate) => candidate.instrumentId === series.instrumentId);
            return (
              <li key={series.instrumentId} className="flex items-center gap-3 py-2.5 text-sm tabular-nums">
                <span className="font-mono text-xs text-neutral-600">{String(rank + 1).padStart(2, "0")}</span>
                <span aria-hidden="true" className="inline-block h-[2px] w-3 shrink-0 rounded-full" style={{ backgroundColor: SERIES_COLORS[colorIndex] }} />
                <span className="flex-1 text-neutral-200">{series.label}</span>
                <span className="font-medium text-neutral-50">{formatNumber(series.currentPercent, 0)}%</span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-3 text-xs text-neutral-500">Higher utilization indicates a tighter available compute fleet.</p>
    </section>
  );
}
