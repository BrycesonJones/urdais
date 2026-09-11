"use client";

import { useMemo, useState } from "react";
import type { PointerEvent } from "react";

import { useContainerSize } from "@/components/charts/use-container-size";
import { SectionHeading } from "@/components/analytics/section-heading";
import { DELIVERY_SERIES, HORIZON_DELIVERY_GAP, TODAY_POINT } from "@/data/mock/power-analytics";
import type { DeliveryPoint } from "@/data/mock/power-analytics";
import { formatNumber, formatQuarter } from "@/lib/format";

const LOAD_LINE = "#b6c7ff";
const CAPACITY_LINE = "#d4a56a";
const GAP_FILL = "#c96b6b";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const TODAY_LINE = "#aab2c5";
const SURFACE = "#0a0a0a";
const PADDING = { top: 20, right: 56, bottom: 30, left: 8 };
/** Below this width the chart labels every other year. */
const NARROW_CHART_WIDTH = 560;

/**
 * Power Delivery Gap: observed load as a solid line up to today, forecast
 * demand as a dashed continuation, deliverable grid capacity as a second
 * line, and a restrained shaded band wherever forecast demand exceeds what
 * the grid can deliver. A vertical "today" marker separates history from
 * forecast, and the headline quotes the gap at the horizon year.
 */
export function PowerDeliveryGapChart() {
  const { ref, size } = useContainerSize<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const series = DELIVERY_SERIES;
    const tMin = series[0]!.time;
    const tMax = series[series.length - 1]!.time;
    const values = series.flatMap((point) => [point.actualLoadGw ?? 0, point.forecastLoadGw ?? 0, point.deliverableCapacityGw]);
    const step = 100;
    const yMin = Math.floor((Math.min(...values.filter((value) => value > 0)) * 0.94) / step) * step;
    const yMax = Math.ceil((Math.max(...values) * 1.04) / step) * step;
    const x = (time: number) => plotLeft + ((time - tMin) / (tMax - tMin)) * (plotRight - plotLeft);
    const y = (value: number) => plotBottom - ((value - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
    const path = (pick: (point: DeliveryPoint) => number | null) => {
      const points = series.filter((point) => pick(point) !== null);
      return `M${points.map((point) => `${x(point.time).toFixed(1)},${y(pick(point)!).toFixed(1)}`).join("L")}`;
    };
    // The forecast starts from the last observed point so the line is continuous.
    const forecastPoints = [TODAY_POINT, ...series.filter((point) => point.forecastLoadGw !== null)];
    const forecastPath = `M${forecastPoints.map((point) => `${x(point.time).toFixed(1)},${y(point.forecastLoadGw ?? point.actualLoadGw!).toFixed(1)}`).join("L")}`;
    const gapPoints = series.filter((point) => point.forecastLoadGw !== null && point.deliveryGapGw !== null && point.deliveryGapGw > 0);
    const gapPath =
      gapPoints.length > 1
        ? `M${gapPoints.map((point) => `${x(point.time).toFixed(1)},${y(point.forecastLoadGw!).toFixed(1)}`).join("L")}L${[...gapPoints]
            .reverse()
            .map((point) => `${x(point.time).toFixed(1)},${y(point.deliverableCapacityGw).toFixed(1)}`)
            .join("L")}Z`
        : null;
    const yTicks: number[] = [];
    for (let value = yMin; value <= yMax; value += step) yTicks.push(value);
    const years = [...new Set(series.map((point) => new Date(point.time * 1000).getUTCFullYear()))];
    return { plotLeft, plotRight, plotTop, plotBottom, x, y, yTicks, years, actualPath: path((point) => point.actualLoadGw), forecastPath, capacityPath: path((point) => point.deliverableCapacityGw), gapPath, tMin, tMax };
  }, [size]);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = Math.min(Math.max(event.clientX - rect.left, geometry.plotLeft), geometry.plotRight);
    const time = geometry.tMin + ((px - geometry.plotLeft) / (geometry.plotRight - geometry.plotLeft)) * (geometry.tMax - geometry.tMin);
    let best = 0;
    DELIVERY_SERIES.forEach((point, index) => {
      if (Math.abs(point.time - time) < Math.abs(DELIVERY_SERIES[best]!.time - time)) best = index;
    });
    setHoverIndex(best);
  }

  const hovered = hoverIndex === null ? null : DELIVERY_SERIES[hoverIndex]!;
  const description = `Aggregate peak load across seven U.S. power markets, ${formatQuarter(DELIVERY_SERIES[0]!.time)} to ${formatQuarter(
    DELIVERY_SERIES[DELIVERY_SERIES.length - 1]!.time,
  )}: observed load ${formatNumber(TODAY_POINT.actualLoadGw!, 0)} GW at ${formatQuarter(TODAY_POINT.time)}, forecast demand ${formatNumber(
    HORIZON_DELIVERY_GAP.forecastLoadGw,
    0,
  )} GW against ${formatNumber(HORIZON_DELIVERY_GAP.deliverableCapacityGw, 0)} GW of deliverable capacity by the end of ${HORIZON_DELIVERY_GAP.year}, a delivery gap of ${formatNumber(
    HORIZON_DELIVERY_GAP.gapGw,
    0,
  )} GW.`;

  return (
    <section id="delivery" aria-labelledby="delivery-heading" className="scroll-mt-24">
      <SectionHeading
        id="delivery-heading"
        title="Power Delivery Gap"
        subtitle="Actual load, forecast demand, and the grid capacity available to serve it"
        aside={
          <p className="tabular-nums">
            <span className="block font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">{HORIZON_DELIVERY_GAP.year} delivery gap</span>
            <span className="mt-1 block text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">
              {formatNumber(HORIZON_DELIVERY_GAP.gapGw, 0)} <span className="text-base font-normal text-neutral-400">GW</span>
            </span>
            <span className="block text-xs text-neutral-500">
              forecast {formatNumber(HORIZON_DELIVERY_GAP.forecastLoadGw, 0)} GW vs deliverable {formatNumber(HORIZON_DELIVERY_GAP.deliverableCapacityGw, 0)} GW
            </span>
          </p>
        }
      />

      <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-[2.5px] w-4 rounded-full" style={{ backgroundColor: LOAD_LINE }} /><span className="text-neutral-200">Actual load</span></li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: LOAD_LINE }} /><span className="text-neutral-200">Forecast demand</span></li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-[1.5px] w-4 rounded-full" style={{ backgroundColor: CAPACITY_LINE }} /><span className="text-neutral-200">Deliverable capacity</span></li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3 rounded-[1px]" style={{ backgroundColor: GAP_FILL, opacity: 0.35 }} /><span className="text-neutral-200">Delivery gap</span></li>
        <li className="text-neutral-500">GW, seven U.S. markets combined</li>
      </ul>

      <div ref={ref} className="relative mt-3 h-[320px] sm:h-[380px] lg:h-[420px]">
        {geometry && size && (
          <svg
            role="img"
            aria-label="Power Delivery Gap: actual load, forecast demand, and deliverable capacity"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            className="block select-none"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <title>Power Delivery Gap: actual load, forecast demand, and deliverable capacity</title>
            <desc>{description}</desc>
            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                <text x={geometry.plotRight + 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} dominantBaseline="middle" className="tabular-nums">{formatNumber(tick, 0)}</text>
              </g>
            ))}
            {/* Every year fits at desktop widths; narrow charts label every other year so the labels never collide. */}
            {geometry.years.filter((_, index) => size.width >= NARROW_CHART_WIDTH || index % 2 === 0).map((year, index) => (
              <text
                key={year}
                x={geometry.x(Date.UTC(year, 0, 1) / 1000)}
                y={size.height - 10}
                fill={AXIS_TEXT}
                fontSize={11}
                textAnchor={index === 0 ? "start" : "middle"}
              >
                {year}
              </text>
            ))}
            {geometry.gapPath && <path d={geometry.gapPath} fill={GAP_FILL} fillOpacity={0.22} />}
            <path d={geometry.capacityPath} fill="none" stroke={CAPACITY_LINE} strokeWidth={1.5} strokeLinejoin="round" />
            <path d={geometry.forecastPath} fill="none" stroke={LOAD_LINE} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
            <path d={geometry.actualPath} fill="none" stroke={LOAD_LINE} strokeWidth={2} strokeLinejoin="round" />
            {/* Today: the boundary between observed and forecast. */}
            <line x1={geometry.x(TODAY_POINT.time)} x2={geometry.x(TODAY_POINT.time)} y1={geometry.plotTop} y2={geometry.plotBottom} stroke={TODAY_LINE} strokeOpacity={0.6} strokeDasharray="2 3" />
            <text x={geometry.x(TODAY_POINT.time) + 6} y={geometry.plotTop + 10} fill={TODAY_LINE} fontSize={10} className="font-mono uppercase tracking-[0.2em]">Today</text>
            <circle cx={geometry.x(TODAY_POINT.time)} cy={geometry.y(TODAY_POINT.actualLoadGw!)} r={4} fill={LOAD_LINE} stroke={SURFACE} strokeWidth={2} />
            {hovered && (
              <g pointerEvents="none">
                <line x1={geometry.x(hovered.time)} x2={geometry.x(hovered.time)} y1={geometry.plotTop} y2={geometry.plotBottom} stroke={TODAY_LINE} strokeOpacity={0.7} strokeDasharray="6 4" />
                {(hovered.actualLoadGw ?? hovered.forecastLoadGw) !== null && (
                  <circle cx={geometry.x(hovered.time)} cy={geometry.y((hovered.actualLoadGw ?? hovered.forecastLoadGw)!)} r={4.5} fill={SURFACE} stroke={LOAD_LINE} strokeWidth={2} />
                )}
                <circle cx={geometry.x(hovered.time)} cy={geometry.y(hovered.deliverableCapacityGw)} r={4} fill={SURFACE} stroke={CAPACITY_LINE} strokeWidth={1.5} />
              </g>
            )}
          </svg>
        )}
        {geometry && hovered && size && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs shadow-lg shadow-black/40"
            style={{ top: geometry.plotTop + 4, ...(geometry.x(hovered.time) > size.width * 0.55 ? { right: size.width - geometry.x(hovered.time) + 12 } : { left: geometry.x(hovered.time) + 12 }) }}
          >
            <p className="whitespace-nowrap text-neutral-400">{formatQuarter(hovered.time)}{hovered.forecastLoadGw !== null ? " · forecast" : ""}</p>
            <ul className="mt-1.5 flex flex-col gap-1 tabular-nums">
              <li className="flex justify-between gap-4"><span className="text-neutral-400">{hovered.actualLoadGw !== null ? "Actual load" : "Forecast demand"}</span><span className="font-medium text-neutral-50">{formatNumber((hovered.actualLoadGw ?? hovered.forecastLoadGw)!, 0)} GW</span></li>
              <li className="flex justify-between gap-4"><span className="text-neutral-400">Deliverable capacity</span><span className="font-medium text-neutral-50">{formatNumber(hovered.deliverableCapacityGw, 0)} GW</span></li>
              {hovered.deliveryGapGw !== null && <li className="flex justify-between gap-4 border-t border-white/10 pt-1"><span className="text-neutral-400">Delivery gap</span><span className="font-medium text-neutral-50">{formatNumber(hovered.deliveryGapGw, 0)} GW</span></li>}
            </ul>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Deliverable capacity is what transmission, substations, and interconnection can physically serve, not generation capacity. Forecast demand includes large loads now waiting in the queue.
      </p>
    </section>
  );
}
