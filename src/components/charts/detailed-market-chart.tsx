"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

import { useSvgId } from "@/components/charts/use-svg-id";
import { formatAxisValue, formatPercent, formatTimestamp, formatValueWithUnit } from "@/lib/format";
import type { ComparisonBasis, TimeSeriesPoint } from "@/types/market";

/** One line on the chart. Points must be chronological. */
export type ChartSeries = {
  id: string;
  label: string;
  unit: string;
  points: TimeSeriesPoint[];
};

type DetailedMarketChartProps = {
  primary: ChartSeries;
  comparison?: ChartSeries | null;
  /**
   * How the two series share the axis. "absolute" plots raw values and
   * expects a common unit; "relative" rebases every series to percentage
   * change from its first point in the window. Ignored without a comparison.
   */
  basis?: ComparisonBasis;
  /** Whether points are intraday, which switches the axis and readout to time of day. */
  intraday: boolean;
  /** Accessible name of the chart, e.g. "UCPI-H100 SXM chart, 1 month range". */
  label: string;
  className?: string;
};

// Same Urdais blue identity as the homepage snapshot: an icy line over a
// deeper cobalt square-matrix field. The comparison is a restrained muted
// amber that stays legible against the icy line for every colour-vision
// type. Lines are never coloured by performance.
const PRIMARY_LINE = "#b6c7ff";
const PRIMARY_MATRIX = "#526fe0";
const PRIMARY_MARKER = "#8ca4ff";
const PRIMARY_MARKER_TEXT = "#040f30";
const COMPARISON_LINE = "#d4a56a";
const COMPARISON_MATRIX = "#a8834f";
const COMPARISON_MARKER_FILL = "#1a1a1a";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const ZERO_LINE = "rgba(255,255,255,0.14)";
// Crosshair: light cool-gray dashes that read clearly without competing with the line.
const CROSSHAIR_LINE = "#aab2c5";
const CROSSHAIR_OPACITY = 0.7;
const CROSSHAIR_DASH = "6 4";
const CROSSHAIR_TAG_FILL = "#262b3a";
const CROSSHAIR_TAG_TEXT = "#dfe4f5";
const SURFACE = "#0a0a0a";

// Square-matrix field beneath each line: small squares on a fixed grid,
// strongest just under the line and fading out toward the bottom. The
// comparison field uses smaller squares offset by half a cell, so where the
// two areas overlap the fields interleave instead of stacking.
const MATRIX_SPACING = 12;
const PRIMARY_SQUARE = 3;
const PRIMARY_MATRIX_TOP_OPACITY = 0.6;
const COMPARISON_SQUARE = 2;
const COMPARISON_MATRIX_TOP_OPACITY = 0.35;

const PADDING = { top: 16, right: 68, bottom: 30, left: 8 };
const MARKER_WIDTH = PADDING.right - 8;
const MARKER_HEIGHT = 20;
/** Below this chart width the readout anchors to a plot edge rather than the pointer. */
const NARROW_CHART_WIDTH = 560;
/** Horizontal room per x label and vertical room per y label. */
const X_LABEL_SPACING = 96;
const Y_LABEL_SPACING = 64;

type Size = { width: number; height: number };

/** A point with the value it is plotted at, which differs from `value` on a relative basis. */
type PlotPoint = TimeSeriesPoint & { plotted: number };

/**
 * Urdais-owned analytical chart for the market detail page: a large SVG
 * with a y-axis of nice ticks and hairline grid, calendar-aligned x labels,
 * a clipped square-matrix field fading downward under each line, an
 * optional comparison line on an absolute or rebased-percentage axis,
 * right-edge markers for each series' latest value, and a pointer crosshair
 * (vertical and horizontal guides, axis tags, intersection ring) with a
 * compact readout listing every series at that time. Numbers shown here
 * are also present as text elsewhere on the page, so the graphic is a
 * labelled illustration rather than the only source of a value.
 */
export function DetailedMarketChart({
  primary,
  comparison,
  basis = "absolute",
  intraday,
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
  const ids = {
    plot: `${baseId}-plot`,
    primaryPattern: `${baseId}-pp`,
    primaryClip: `${baseId}-pc`,
    comparisonPattern: `${baseId}-cp`,
    comparisonClip: `${baseId}-cc`,
    fade: `${baseId}-fade`,
    mask: `${baseId}-mask`,
  };

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
  const relative = basis === "relative" && comparisonPoints !== null;
  const axisUnit = relative ? "%" : primary.unit;

  // Plotted values: raw, or percentage change from the window's first point.
  const primaryPlot = useMemo(() => toPlotPoints(primary.points, relative), [primary.points, relative]);
  const comparisonPlot = useMemo(
    () => (comparisonPoints ? toPlotPoints(comparisonPoints, relative) : null),
    [comparisonPoints, relative],
  );

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0 || primaryPlot.length < 2) return null;

    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const plotWidth = Math.max(plotRight - plotLeft, 1);
    const plotHeight = Math.max(plotBottom - plotTop, 1);

    const allSeries = comparisonPlot ? [primaryPlot, comparisonPlot] : [primaryPlot];
    let tMin = Infinity;
    let tMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const points of allSeries) {
      for (const point of points) {
        if (point.time < tMin) tMin = point.time;
        if (point.time > tMax) tMax = point.time;
        if (point.plotted < vMin) vMin = point.plotted;
        if (point.plotted > vMax) vMax = point.plotted;
      }
    }
    if (tMax === tMin) tMax = tMin + 1;

    // Pad the value range a little, then snap the domain to nice tick bounds
    // so the top and bottom gridlines carry clean labels. Prices never go
    // below zero; rebased percentages can.
    const pad = (vMax - vMin || Math.abs(vMax) || 1) * 0.06;
    const yTickCount = Math.max(3, Math.min(8, Math.floor(plotHeight / Y_LABEL_SPACING) + 1));
    const yAxis = niceTicks(relative ? vMin - pad : Math.max(0, vMin - pad), vMax + pad, yTickCount);
    const yMin = yAxis.ticks[0]!;
    const yMax = yAxis.ticks[yAxis.ticks.length - 1]!;

    const x = (time: number) => plotLeft + ((time - tMin) / (tMax - tMin)) * plotWidth;
    const y = (value: number) => plotBottom - ((value - yMin) / (yMax - yMin)) * plotHeight;

    const toPath = (points: PlotPoint[]) =>
      `M${points.map((point) => `${x(point.time).toFixed(1)},${y(point.plotted).toFixed(1)}`).join("L")}`;
    const toArea = (points: PlotPoint[]) => {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      return `${toPath(points)}L${x(last.time).toFixed(1)},${plotBottom}L${x(first.time).toFixed(1)},${plotBottom}Z`;
    };
    const top = (points: PlotPoint[]) => y(Math.max(...points.map((point) => point.plotted)));

    const xTickCount = Math.max(3, Math.floor(plotWidth / X_LABEL_SPACING));
    const xTicks = timeTicks(tMin, tMax, xTickCount).map((tick) => ({ ...tick, x: x(tick.time) }));

    return {
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      x,
      y,
      primaryPath: toPath(primaryPlot),
      primaryArea: toArea(primaryPlot),
      primaryTop: top(primaryPlot),
      comparisonPath: comparisonPlot ? toPath(comparisonPlot) : null,
      comparisonArea: comparisonPlot ? toArea(comparisonPlot) : null,
      comparisonTop: comparisonPlot ? top(comparisonPlot) : null,
      xTicks,
      yTicks: yAxis.ticks.map((value) => ({ value, y: y(value) })),
      yDecimals: yAxis.decimals,
      tMin,
      tMax,
      vMin,
      vMax,
    };
  }, [primaryPlot, comparisonPlot, relative, size]);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const fraction = (px - geometry.plotLeft) / (geometry.plotRight - geometry.plotLeft);
    const time = geometry.tMin + Math.min(Math.max(fraction, 0), 1) * (geometry.tMax - geometry.tMin);
    setHover({ points: primary.points, index: nearestIndex(primary.points, time) });
  }

  const lastPrimary = primaryPlot[primaryPlot.length - 1];
  const lastComparison = comparisonPlot ? comparisonPlot[comparisonPlot.length - 1] : null;
  const hoveredPrimary = hoverIndex === null ? null : primaryPlot[hoverIndex];
  // A shorter comparison history has no reading before its first point.
  const hoveredComparison = (() => {
    if (!hoveredPrimary || !comparisonPlot) return null;
    const candidate = comparisonPlot[nearestIndex(comparisonPlot, hoveredPrimary.time)];
    const tolerance = intraday ? 15 * 60 : DAY;
    return candidate && Math.abs(candidate.time - hoveredPrimary.time) <= tolerance ? candidate : null;
  })();

  const formatPlotted = (value: number, decimals = 2) =>
    relative ? formatPercent(value, decimals) : formatAxisValue(value, decimals, axisUnit);

  const description = geometry
    ? describeChart(primary, comparison ?? null, relative, intraday, geometry.vMin, geometry.vMax, formatPlotted)
    : label;

  // Keep the two right-edge markers from overlapping by nudging the comparison one.
  let comparisonMarkerY: number | null = null;
  if (geometry && lastPrimary && lastComparison) {
    const primaryY = geometry.y(lastPrimary.plotted);
    comparisonMarkerY = geometry.y(lastComparison.plotted);
    const gap = comparisonMarkerY - primaryY;
    if (Math.abs(gap) < MARKER_HEIGHT + 2) {
      comparisonMarkerY = primaryY + Math.sign(gap || 1) * (MARKER_HEIGHT + 2);
    }
  }

  // The readout sits beside the crosshair and flips sides past the middle.
  // On narrow charts it cannot fit beside the pointer, so it anchors to the
  // plot edge opposite the pointer instead.
  const tooltipStyle = (() => {
    if (!geometry || !hoveredPrimary || !size) return {};
    const px = geometry.x(hoveredPrimary.time);
    const onLeft = px > size.width * 0.55;
    if (size.width < NARROW_CHART_WIDTH) {
      return onLeft ? { left: geometry.plotLeft } : { right: PADDING.right };
    }
    return onLeft ? { right: size.width - px + 12 } : { left: px + 12 };
  })();

  return (
    <div className={["flex min-h-0 flex-col", className].filter(Boolean).join(" ")}>
      {/* Legend: only needed once two lines share the plot. Height is reserved to avoid layout shift. */}
      <ul className="flex min-h-6 shrink-0 flex-wrap items-center gap-x-5 gap-y-1 pb-1 text-xs text-neutral-400">
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
            {relative && <li className="text-neutral-500">% change over the selected range</li>}
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
              <clipPath id={ids.plot}>
                <rect
                  x={geometry.plotLeft}
                  y={geometry.plotTop}
                  width={geometry.plotRight - geometry.plotLeft}
                  height={geometry.plotBottom - geometry.plotTop}
                />
              </clipPath>
              <pattern
                id={ids.primaryPattern}
                patternUnits="userSpaceOnUse"
                width={MATRIX_SPACING}
                height={MATRIX_SPACING}
                x={geometry.plotLeft}
                y={geometry.plotBottom}
              >
                <rect width={PRIMARY_SQUARE} height={PRIMARY_SQUARE} fill={PRIMARY_MATRIX} />
              </pattern>
              <clipPath id={ids.primaryClip}>
                <path d={geometry.primaryArea} />
              </clipPath>
              {geometry.comparisonArea && (
                <>
                  <pattern
                    id={ids.comparisonPattern}
                    patternUnits="userSpaceOnUse"
                    width={MATRIX_SPACING}
                    height={MATRIX_SPACING}
                    x={geometry.plotLeft + MATRIX_SPACING / 2}
                    y={geometry.plotBottom + MATRIX_SPACING / 2}
                  >
                    <rect width={COMPARISON_SQUARE} height={COMPARISON_SQUARE} fill={COMPARISON_MATRIX} />
                  </pattern>
                  <clipPath id={ids.comparisonClip}>
                    <path d={geometry.comparisonArea} />
                  </clipPath>
                </>
              )}
              {/* One fade for both fields: full strength at the highest line, gone at the bottom. */}
              <linearGradient
                id={ids.fade}
                gradientUnits="userSpaceOnUse"
                x1="0"
                x2="0"
                y1={Math.min(geometry.primaryTop, geometry.comparisonTop ?? geometry.primaryTop)}
                y2={geometry.plotBottom}
              >
                <stop offset="0" stopColor="#fff" stopOpacity={1} />
                <stop offset="1" stopColor="#fff" stopOpacity={0} />
              </linearGradient>
              <mask id={ids.mask} maskUnits="userSpaceOnUse">
                <rect
                  x={geometry.plotLeft}
                  y={geometry.plotTop}
                  width={geometry.plotRight - geometry.plotLeft}
                  height={geometry.plotBottom - geometry.plotTop}
                  fill={`url(#${ids.fade})`}
                />
              </mask>
            </defs>

            {/* Y axis: hairline grid with right-hand labels; the zero line is a touch stronger on a relative axis. */}
            {geometry.yTicks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={geometry.plotLeft}
                  x2={geometry.plotRight}
                  y1={tick.y}
                  y2={tick.y}
                  stroke={relative && tick.value === 0 ? ZERO_LINE : GRID_LINE}
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
                  {formatPlotted(tick.value, geometry.yDecimals)}
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
              {/* Square-matrix fields: each pattern clipped to the area under its line, fading downward. */}
              <g mask={`url(#${ids.mask})`}>
                {geometry.comparisonArea && (
                  <g clipPath={`url(#${ids.comparisonClip})`} opacity={COMPARISON_MATRIX_TOP_OPACITY}>
                    <rect
                      x={geometry.plotLeft}
                      y={geometry.plotTop}
                      width={geometry.plotRight - geometry.plotLeft}
                      height={geometry.plotBottom - geometry.plotTop}
                      fill={`url(#${ids.comparisonPattern})`}
                    />
                  </g>
                )}
                <g clipPath={`url(#${ids.primaryClip})`} opacity={PRIMARY_MATRIX_TOP_OPACITY}>
                  <rect
                    x={geometry.plotLeft}
                    y={geometry.plotTop}
                    width={geometry.plotRight - geometry.plotLeft}
                    height={geometry.plotBottom - geometry.plotTop}
                    fill={`url(#${ids.primaryPattern})`}
                  />
                </g>
              </g>

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
                  cy={geometry.y(lastComparison.plotted)}
                  r={3}
                  fill={COMPARISON_LINE}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
                <AxisTag
                  x={geometry.plotRight + 4}
                  y={comparisonMarkerY}
                  text={formatPlotted(lastComparison.plotted)}
                  fill={COMPARISON_MARKER_FILL}
                  stroke={COMPARISON_LINE}
                  textColor={COMPARISON_LINE}
                />
              </>
            )}
            <circle
              cx={geometry.x(lastPrimary.time)}
              cy={geometry.y(lastPrimary.plotted)}
              r={4}
              fill={PRIMARY_MARKER}
              stroke={SURFACE}
              strokeWidth={2}
            />
            <AxisTag
              x={geometry.plotRight + 4}
              y={geometry.y(lastPrimary.plotted)}
              text={formatPlotted(lastPrimary.plotted)}
              fill={PRIMARY_MARKER}
              textColor={PRIMARY_MARKER_TEXT}
            />

            {/* Crosshair: dashed guides through the hovered primary point, axis tags, and rings on each series. */}
            {hoveredPrimary && (
              <g pointerEvents="none">
                <g stroke={CROSSHAIR_LINE} strokeOpacity={CROSSHAIR_OPACITY} strokeWidth={1} strokeDasharray={CROSSHAIR_DASH}>
                  <line
                    x1={geometry.x(hoveredPrimary.time)}
                    x2={geometry.x(hoveredPrimary.time)}
                    y1={geometry.plotTop}
                    y2={geometry.plotBottom}
                  />
                  <line
                    x1={geometry.plotLeft}
                    x2={geometry.plotRight}
                    y1={geometry.y(hoveredPrimary.plotted)}
                    y2={geometry.y(hoveredPrimary.plotted)}
                  />
                </g>
                <AxisTag
                  x={geometry.plotRight + 4}
                  y={geometry.y(hoveredPrimary.plotted)}
                  text={formatPlotted(hoveredPrimary.plotted)}
                  fill={CROSSHAIR_TAG_FILL}
                  textColor={CROSSHAIR_TAG_TEXT}
                />
                <TimeTag
                  x={Math.min(Math.max(geometry.x(hoveredPrimary.time), geometry.plotLeft + 36), geometry.plotRight - 36)}
                  y={geometry.plotBottom + 4}
                  text={formatAxisTime(hoveredPrimary.time, intraday)}
                />
                {hoveredComparison && (
                  <circle
                    cx={geometry.x(hoveredComparison.time)}
                    cy={geometry.y(hoveredComparison.plotted)}
                    r={4}
                    fill={SURFACE}
                    stroke={COMPARISON_LINE}
                    strokeWidth={1.5}
                  />
                )}
                <circle
                  cx={geometry.x(hoveredPrimary.time)}
                  cy={geometry.y(hoveredPrimary.plotted)}
                  r={5}
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
            style={{ top: geometry.plotTop + 4, ...tooltipStyle }}
          >
            <p className="whitespace-nowrap text-neutral-400">{formatTimestamp(hoveredPrimary.time, intraday)}</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              <TooltipRow
                color={PRIMARY_LINE}
                width={2.5}
                label={primary.label}
                value={formatValueWithUnit(hoveredPrimary.value, primary.unit)}
                note={relative ? formatPercent(hoveredPrimary.plotted) : null}
              />
              {comparison && hoveredComparison && (
                <TooltipRow
                  color={COMPARISON_LINE}
                  width={1.5}
                  label={comparison.label}
                  value={formatValueWithUnit(hoveredComparison.value, comparison.unit)}
                  note={relative ? formatPercent(hoveredComparison.plotted) : null}
                />
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** One series in the readout: value leads, the name follows, with the rebased change when relevant. */
function TooltipRow({
  color,
  width,
  label,
  value,
  note,
}: {
  color: string;
  width: number;
  label: string;
  value: string;
  note: string | null;
}) {
  return (
    <li className="flex items-center gap-3">
      <LegendSwatch color={color} width={width} />
      <span className="flex-1 whitespace-nowrap text-neutral-400">{label}</span>
      <span className="font-medium tabular-nums text-neutral-50">{value}</span>
      {note && <span className="tabular-nums text-neutral-500">{note}</span>}
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

/** Right-axis tag: used for the latest values and the crosshair reading. */
function AxisTag({
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

/** Bottom-axis tag under the vertical crosshair guide, centred on x. */
function TimeTag({ x, y, text }: { x: number; y: number; text: string }) {
  const width = 72;
  return (
    <g transform={`translate(${x - width / 2}, ${y})`}>
      <rect x={0} y={0} width={width} height={18} rx={3} fill={CROSSHAIR_TAG_FILL} />
      <text
        x={width / 2}
        y={9}
        fill={CROSSHAIR_TAG_TEXT}
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

/** Raw values, or percentage change from the first point when rebasing. */
function toPlotPoints(points: TimeSeriesPoint[], relative: boolean): PlotPoint[] {
  const base = points[0]?.value ?? 0;
  return points.map((point) => ({
    ...point,
    plotted: relative && base !== 0 ? (point.value / base - 1) * 100 : point.value,
  }));
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
  const step =
    TIME_STEPS.find((candidate) => span / candidate.approxSeconds <= maxCount) ?? TIME_STEPS[TIME_STEPS.length - 1]!;
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

/** Short crosshair time label: time of day for intraday series, month and day otherwise. */
function formatAxisTime(unixSeconds: number, intraday: boolean): string {
  const date = new Date(unixSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(intraday ? { hour: "2-digit", minute: "2-digit", hour12: false } : { month: "short", day: "numeric" }),
  }).format(date);
}

/** Plain-language summary for assistive technology. */
function describeChart(
  primary: ChartSeries,
  comparison: ChartSeries | null,
  relative: boolean,
  intraday: boolean,
  vMin: number,
  vMax: number,
  formatPlotted: (value: number) => string,
): string {
  const first = primary.points[0]!;
  const last = primary.points[primary.points.length - 1]!;
  const range = `${formatTimestamp(first.time, intraday)} to ${formatTimestamp(last.time, intraday)}`;
  const axis = relative ? "percentage change" : "values";
  let text = `${primary.label} from ${range}: latest ${formatValueWithUnit(last.value, primary.unit)}, ${axis} plotted between ${formatPlotted(vMin)} and ${formatPlotted(vMax)}.`;
  if (comparison) {
    const lastComparison = comparison.points[comparison.points.length - 1];
    if (lastComparison) {
      text += ` Compared with ${comparison.label}, latest ${formatValueWithUnit(lastComparison.value, comparison.unit)}${
        relative ? ", both rebased to the start of the range" : ""
      }.`;
    }
  }
  return text;
}
