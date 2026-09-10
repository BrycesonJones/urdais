"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

import { useSvgId } from "@/components/charts/use-svg-id";
import { formatAxisValue, formatTimestamp, formatValueWithUnit } from "@/lib/format";
import type { TimeSeriesPoint } from "@/types/market";

/** One line on the chart. Points must be chronological; both series share a unit. */
export type ChartSeries = {
  id: string;
  label: string;
  points: TimeSeriesPoint[];
};

type DetailedMarketChartProps = {
  primary: ChartSeries;
  comparison?: ChartSeries | null;
  /** Whether points are intraday, which switches the axis and readout to time of day. */
  intraday: boolean;
  unit: string;
  /** Accessible name of the chart, e.g. "UCPI-H100 SXM chart, 1 month range". */
  label: string;
  className?: string;
};

// Same Urdais blue identity as the homepage snapshot; the comparison is a
// restrained muted amber that stays legible against the icy line for every
// colour-vision type. Lines are never coloured by performance.
const PRIMARY_LINE = "#b6c7ff";
const PRIMARY_AREA = "#526fe0";
const PRIMARY_MARKER = "#8ca4ff";
const PRIMARY_MARKER_TEXT = "#040f30";
const COMPARISON_LINE = "#d4a56a";
const COMPARISON_MARKER_FILL = "#1a1a1a";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const CROSSHAIR_COLOR = "#3d4c85";
const SURFACE = "#0a0a0a";

const PADDING = { top: 16, right: 68, bottom: 30, left: 8 };
const MARKER_WIDTH = PADDING.right - 8;
const MARKER_HEIGHT = 20;
/** Horizontal room per x label and vertical room per y label. */
const X_LABEL_SPACING = 96;
const Y_LABEL_SPACING = 64;

type Size = { width: number; height: number };

/**
 * Urdais-owned analytical chart for the market detail page: a large SVG
 * with a y-axis of nice ticks and hairline grid, calendar-aware x labels,
 * a subtle area wash under the primary line, an optional comparison line,
 * right-edge markers for each series' latest value, and a pointer crosshair
 * with a compact readout listing every series at that time. Numbers shown
 * here are also present as text elsewhere on the page, so the graphic is a
 * labelled illustration rather than the only source of a value.
 */
export function DetailedMarketChart({
  primary,
  comparison,
  intraday,
  unit,
  label,
  className,
}: DetailedMarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  // Hover is stored with the series it belongs to, so a range or instrument
  // change implicitly clears it without an effect.
  const [hover, setHover] = useState<{ points: TimeSeriesPoint[]; index: number } | null>(null);
  const hoverIndex = hover && hover.points === primary.points ? hover.index : null;

  const baseId = useSvgId("detail");
  const ids = { area: `${baseId}-area`, plot: `${baseId}-plot` };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current && current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const comparisonPoints = comparison && comparison.points.length >= 2 ? comparison.points : null;

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0 || primary.points.length < 2) return null;

    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const plotWidth = Math.max(plotRight - plotLeft, 1);
    const plotHeight = Math.max(plotBottom - plotTop, 1);

    const allSeries = comparisonPoints ? [primary.points, comparisonPoints] : [primary.points];
    let tMin = Infinity;
    let tMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const points of allSeries) {
      for (const point of points) {
        if (point.time < tMin) tMin = point.time;
        if (point.time > tMax) tMax = point.time;
        if (point.value < vMin) vMin = point.value;
        if (point.value > vMax) vMax = point.value;
      }
    }
    if (tMax === tMin) tMax = tMin + 1;

    // Pad the value range a little, then snap the domain to nice tick bounds
    // so the top and bottom gridlines carry clean labels.
    const pad = (vMax - vMin || Math.abs(vMax) || 1) * 0.06;
    const yTickCount = Math.max(3, Math.min(8, Math.floor(plotHeight / Y_LABEL_SPACING) + 1));
    const yAxis = niceTicks(Math.max(0, vMin - pad), vMax + pad, yTickCount);
    const yMin = yAxis.ticks[0]!;
    const yMax = yAxis.ticks[yAxis.ticks.length - 1]!;

    const x = (time: number) => plotLeft + ((time - tMin) / (tMax - tMin)) * plotWidth;
    const y = (value: number) => plotBottom - ((value - yMin) / (yMax - yMin)) * plotHeight;

    const toPath = (points: TimeSeriesPoint[]) =>
      `M${points.map((point) => `${x(point.time).toFixed(1)},${y(point.value).toFixed(1)}`).join("L")}`;
    const primaryPath = toPath(primary.points);
    const firstPrimary = primary.points[0]!;
    const lastPrimary = primary.points[primary.points.length - 1]!;
    const areaPath = `${primaryPath}L${x(lastPrimary.time).toFixed(1)},${plotBottom}L${x(firstPrimary.time).toFixed(1)},${plotBottom}Z`;
    const comparisonPath = comparisonPoints ? toPath(comparisonPoints) : null;

    // Narrow plots still get three label slots so a month is never a lone "Sep".
    const xTickCount = Math.max(3, Math.floor(plotWidth / X_LABEL_SPACING));
    const xTicks = timeTicks(tMin, tMax, xTickCount).map((tick) => ({ ...tick, x: x(tick.time) }));

    return {
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      x,
      y,
      primaryPath,
      areaPath,
      comparisonPath,
      xTicks,
      yTicks: yAxis.ticks.map((value) => ({ value, y: y(value) })),
      yDecimals: yAxis.decimals,
      tMin,
      tMax,
      vMin,
      vMax,
    };
  }, [primary.points, comparisonPoints, size]);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const fraction = (px - geometry.plotLeft) / (geometry.plotRight - geometry.plotLeft);
    const time = geometry.tMin + Math.min(Math.max(fraction, 0), 1) * (geometry.tMax - geometry.tMin);
    setHover({ points: primary.points, index: nearestIndex(primary.points, time) });
  }

  const lastPrimary = primary.points[primary.points.length - 1];
  const lastComparison = comparisonPoints ? comparisonPoints[comparisonPoints.length - 1] : null;
  const hoveredPrimary = hoverIndex === null ? null : primary.points[hoverIndex];
  // A shorter comparison history has no reading before its first point.
  const hoveredComparison = (() => {
    if (!hoveredPrimary || !comparisonPoints) return null;
    const candidate = comparisonPoints[nearestIndex(comparisonPoints, hoveredPrimary.time)];
    const tolerance = intraday ? 15 * 60 : DAY;
    return candidate && Math.abs(candidate.time - hoveredPrimary.time) <= tolerance ? candidate : null;
  })();

  const description = geometry
    ? describeChart(primary, comparison ?? null, unit, intraday, geometry.vMin, geometry.vMax)
    : label;

  // Keep the two right-edge markers from overlapping by nudging the comparison one.
  let comparisonMarkerY: number | null = null;
  if (geometry && lastPrimary && lastComparison) {
    const primaryY = geometry.y(lastPrimary.value);
    comparisonMarkerY = geometry.y(lastComparison.value);
    const gap = comparisonMarkerY - primaryY;
    if (Math.abs(gap) < MARKER_HEIGHT + 2) {
      comparisonMarkerY = primaryY + Math.sign(gap || 1) * (MARKER_HEIGHT + 2);
    }
  }

  const tooltipOnLeft = geometry && hoveredPrimary && size ? geometry.x(hoveredPrimary.time) > size.width * 0.6 : false;

  return (
    <div className={["flex min-h-0 flex-col", className].filter(Boolean).join(" ")}>
      {/* Legend: only needed once two lines share the plot. Height is reserved to avoid layout shift. */}
      <ul className="flex h-6 shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400">
        {comparison && (
          <>
            <li className="flex items-center gap-2">
              <LegendSwatch color={PRIMARY_LINE} width={2.5} />
              <span className="text-neutral-200">{primary.label}</span>
            </li>
            <li className="flex items-center gap-2">
              <LegendSwatch color={COMPARISON_LINE} width={1.5} />
              <span className="text-neutral-200">{comparison.label}</span>
              <span className="text-neutral-500">comparison</span>
            </li>
          </>
        )}
      </ul>

      <div ref={containerRef} className="relative min-h-0 flex-1">
        {geometry && size && lastPrimary && (
          <svg
            role="img"
            aria-label={label}
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            className="block select-none"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHover(null)}
          >
            <title>{label}</title>
            <desc>{description}</desc>
            <defs>
              <linearGradient id={ids.area} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={PRIMARY_AREA} stopOpacity={0.22} />
                <stop offset="1" stopColor={PRIMARY_AREA} stopOpacity={0} />
              </linearGradient>
              <clipPath id={ids.plot}>
                <rect
                  x={geometry.plotLeft}
                  y={geometry.plotTop}
                  width={geometry.plotRight - geometry.plotLeft}
                  height={geometry.plotBottom - geometry.plotTop}
                />
              </clipPath>
            </defs>

            {/* Y axis: hairline grid with right-hand labels. */}
            {geometry.yTicks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={geometry.plotLeft}
                  x2={geometry.plotRight}
                  y1={tick.y}
                  y2={tick.y}
                  stroke={GRID_LINE}
                  strokeWidth={1}
                />
                <text
                  x={geometry.plotRight + 8}
                  y={tick.y}
                  fill={AXIS_TEXT}
                  fontSize={11}
                  dominantBaseline="middle"
                  className="tabular-nums"
                >
                  {formatAxisValue(tick.value, geometry.yDecimals, unit)}
                </text>
              </g>
            ))}

            {/* X axis: calendar-aligned labels. */}
            {geometry.xTicks.map((tick) => (
              <text
                key={tick.time}
                x={tick.x}
                y={size.height - 10}
                fill={AXIS_TEXT}
                fontSize={11}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            ))}

            <g clipPath={`url(#${ids.plot})`}>
              <path d={geometry.areaPath} fill={`url(#${ids.area})`} />
              {geometry.comparisonPath && (
                <path
                  d={geometry.comparisonPath}
                  fill="none"
                  stroke={COMPARISON_LINE}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              <path
                d={geometry.primaryPath}
                fill="none"
                stroke={PRIMARY_LINE}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>

            {/* Latest values: endpoint dots and right-edge markers, primary strongest. */}
            {lastComparison && comparisonMarkerY !== null && (
              <>
                <circle
                  cx={geometry.x(lastComparison.time)}
                  cy={geometry.y(lastComparison.value)}
                  r={3}
                  fill={COMPARISON_LINE}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
                <ValueMarker
                  x={geometry.plotRight + 4}
                  y={comparisonMarkerY}
                  text={formatAxisValue(lastComparison.value, 2, unit)}
                  fill={COMPARISON_MARKER_FILL}
                  stroke={COMPARISON_LINE}
                  textColor={COMPARISON_LINE}
                />
              </>
            )}
            <circle
              cx={geometry.x(lastPrimary.time)}
              cy={geometry.y(lastPrimary.value)}
              r={4}
              fill={PRIMARY_MARKER}
              stroke={SURFACE}
              strokeWidth={2}
            />
            <ValueMarker
              x={geometry.plotRight + 4}
              y={geometry.y(lastPrimary.value)}
              text={formatAxisValue(lastPrimary.value, 2, unit)}
              fill={PRIMARY_MARKER}
              textColor={PRIMARY_MARKER_TEXT}
            />

            {hoveredPrimary && (
              <g pointerEvents="none">
                <line
                  x1={geometry.x(hoveredPrimary.time)}
                  x2={geometry.x(hoveredPrimary.time)}
                  y1={geometry.plotTop}
                  y2={geometry.plotBottom}
                  stroke={CROSSHAIR_COLOR}
                  strokeWidth={1}
                />
                {hoveredComparison && (
                  <circle
                    cx={geometry.x(hoveredComparison.time)}
                    cy={geometry.y(hoveredComparison.value)}
                    r={4}
                    fill={SURFACE}
                    stroke={COMPARISON_LINE}
                    strokeWidth={1.5}
                  />
                )}
                <circle
                  cx={geometry.x(hoveredPrimary.time)}
                  cy={geometry.y(hoveredPrimary.value)}
                  r={4.5}
                  fill={SURFACE}
                  stroke={PRIMARY_LINE}
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
        )}

        {/* Readout: a compact HTML tooltip beside the crosshair, flipping sides near the right edge. */}
        {geometry && hoveredPrimary && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs shadow-lg shadow-black/40"
            style={{
              top: geometry.plotTop + 4,
              ...(tooltipOnLeft
                ? { right: size!.width - geometry.x(hoveredPrimary.time) + 12 }
                : { left: geometry.x(hoveredPrimary.time) + 12 }),
            }}
          >
            <p className="whitespace-nowrap text-neutral-400">{formatTimestamp(hoveredPrimary.time, intraday)}</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              <TooltipRow color={PRIMARY_LINE} width={2.5} label={primary.label} value={formatValueWithUnit(hoveredPrimary.value, unit)} />
              {comparison && hoveredComparison && (
                <TooltipRow
                  color={COMPARISON_LINE}
                  width={1.5}
                  label={comparison.label}
                  value={formatValueWithUnit(hoveredComparison.value, unit)}
                />
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** One series in the readout: value leads, the name follows. */
function TooltipRow({ color, width, label, value }: { color: string; width: number; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3">
      <LegendSwatch color={color} width={width} />
      <span className="flex-1 whitespace-nowrap text-neutral-400">{label}</span>
      <span className="font-medium tabular-nums text-neutral-50">{value}</span>
    </li>
  );
}

/** Short horizontal stroke keying a series; the stroke width mirrors the line's. */
function LegendSwatch({ color, width }: { color: string; width: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-4 shrink-0 rounded-full"
      style={{ height: width, backgroundColor: color }}
    />
  );
}

function ValueMarker({
  x,
  y,
  text,
  fill,
  stroke,
  textColor,
}: {
  x: number;
  y: number;
  text: string;
  fill: string;
  stroke?: string;
  textColor: string;
}) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={0}
        y={-MARKER_HEIGHT / 2}
        width={MARKER_WIDTH}
        height={MARKER_HEIGHT}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={stroke ? 1 : 0}
      />
      <text
        x={MARKER_WIDTH / 2}
        y={0}
        fill={textColor}
        fontSize={11}
        fontWeight={500}
        textAnchor="middle"
        dominantBaseline="middle"
        className="tabular-nums"
      >
        {text}
      </text>
    </g>
  );
}

/** Index of the point whose time is closest to `time` in a chronological series. */
function nearestIndex(points: TimeSeriesPoint[], time: number): number {
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid]!.time < time) low = mid + 1;
    else high = mid;
  }
  if (low > 0 && Math.abs(points[low - 1]!.time - time) <= Math.abs(points[low]!.time - time)) return low - 1;
  return low;
}

/** Values are displayed to two decimals, so axis ticks never need more. */
const MAX_TICK_DECIMALS = 2;
const MIN_TICK_STEP = 10 ** -MAX_TICK_DECIMALS;

/**
 * Human-readable y ticks: the step is 1, 2, 2.5, or 5 times a power of ten,
 * never finer than the display precision, and the ticks extend to cover
 * [min, max] on both sides.
 */
function niceTicks(min: number, max: number, count: number): { ticks: number[]; decimals: number } {
  const span = max - min || Math.abs(max) || 1;
  const rough = Math.max(span / Math.max(count - 1, 1), MIN_TICK_STEP);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / magnitude;
  let nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  // A 2.5 step needs one more decimal than its magnitude; when that would
  // exceed the display precision, fall to whichever neighbour is closer.
  if (nice === 2.5 && magnitude < 10 ** -(MAX_TICK_DECIMALS - 1)) nice = fraction < Math.sqrt(10) ? 2 : 5;
  const step = nice * magnitude;
  const decimals = Math.min(MAX_TICK_DECIMALS, Math.max(0, -Math.floor(Math.log10(step))) + (nice === 2.5 ? 1 : 0));
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toFixed(decimals)));
  }
  return { ticks, decimals };
}

type TimeStep = { unit: "hour" | "day" | "month" | "year"; n: number; approxSeconds: number };

const HOUR = 3600;
const DAY = 86_400;
const TIME_STEPS: TimeStep[] = [
  ...[1, 2, 3, 6, 12].map((n) => ({ unit: "hour" as const, n, approxSeconds: n * HOUR })),
  ...[1, 2, 7, 14].map((n) => ({ unit: "day" as const, n, approxSeconds: n * DAY })),
  ...[1, 2, 3, 6].map((n) => ({ unit: "month" as const, n, approxSeconds: n * 30.44 * DAY })),
  ...[1, 2, 5, 10].map((n) => ({ unit: "year" as const, n, approxSeconds: n * 365.25 * DAY })),
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Calendar-aligned x ticks: the smallest step (whole hours, days, months, or
 * years, UTC) that fits within `maxCount` labels across the span. Labels
 * show only what changes at that step, with the year named at January and
 * the date named at midnight for intraday spans longer than a day.
 */
function timeTicks(tMin: number, tMax: number, maxCount: number): { time: number; label: string }[] {
  const span = tMax - tMin;
  const step = TIME_STEPS.find((candidate) => span / candidate.approxSeconds <= maxCount) ?? TIME_STEPS[TIME_STEPS.length - 1]!;
  const ticks: { time: number; label: string }[] = [];
  const multiDay = span > DAY;

  if (step.unit === "hour" || step.unit === "day") {
    const size = step.approxSeconds;
    for (let time = Math.ceil(tMin / size) * size; time <= tMax; time += size) {
      const date = new Date(time * 1000);
      const atMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0;
      const label =
        step.unit === "day" || (multiDay && atMidnight)
          ? `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`
          : `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
      ticks.push({ time, label });
    }
    return ticks;
  }

  const first = new Date(tMin * 1000);
  if (step.unit === "month") {
    let year = first.getUTCFullYear();
    let month = first.getUTCMonth();
    if (Date.UTC(year, month, 1) / 1000 < tMin) month += 1;
    while (month % step.n !== 0) month += 1;
    for (;;) {
      const time = Date.UTC(year, month, 1) / 1000;
      if (time > tMax) break;
      const date = new Date(time * 1000);
      const label = date.getUTCMonth() === 0 ? String(date.getUTCFullYear()) : MONTH_SHORT[date.getUTCMonth()]!;
      ticks.push({ time, label });
      month += step.n;
      if (month >= 12) {
        year += Math.floor(month / 12);
        month %= 12;
      }
    }
    return ticks;
  }

  let year = first.getUTCFullYear();
  if (Date.UTC(year, 0, 1) / 1000 < tMin) year += 1;
  while (year % step.n !== 0) year += 1;
  for (;;) {
    const time = Date.UTC(year, 0, 1) / 1000;
    if (time > tMax) break;
    ticks.push({ time, label: String(year) });
    year += step.n;
  }
  return ticks;
}

/** Plain-language summary for assistive technology. */
function describeChart(
  primary: ChartSeries,
  comparison: ChartSeries | null,
  unit: string,
  intraday: boolean,
  vMin: number,
  vMax: number,
): string {
  const first = primary.points[0]!;
  const last = primary.points[primary.points.length - 1]!;
  const range = `${formatTimestamp(first.time, intraday)} to ${formatTimestamp(last.time, intraday)}`;
  let text = `${primary.label} from ${range}: latest ${formatValueWithUnit(last.value, unit)}, plotted between ${formatValueWithUnit(vMin, unit)} and ${formatValueWithUnit(vMax, unit)}.`;
  if (comparison) {
    const lastComparison = comparison.points[comparison.points.length - 1];
    if (lastComparison) {
      text += ` Compared with ${comparison.label}, latest ${formatValueWithUnit(lastComparison.value, unit)}.`;
    }
  }
  return text;
}
