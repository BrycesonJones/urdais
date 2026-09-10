"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

import { useSvgId } from "@/components/charts/use-svg-id";
import { formatNumber, formatTimestamp } from "@/lib/format";
import type { TimeSeriesPoint } from "@/types/market";

type SnapshotChartProps = {
  data: TimeSeriesPoint[];
  /** Whether points are intraday, which switches axis and readout to show time of day. */
  intraday: boolean;
  unit: string;
  /** Accessible description of the chart, e.g. "UCPI historical chart, 1M range". */
  label: string;
  className?: string;
};

// Urdais blue chart identity on the panel's near-black surface: an icy line
// over a deeper cobalt matrix. The line is never coloured by performance;
// movement colours live in the text values.
const LINE_COLOR = "#b6c7ff";
const MATRIX_COLOR = "#526fe0";
const MARKER_COLOR = "#8ca4ff";
const MARKER_LABEL_TEXT = "#040f30";
const AXIS_TEXT = "#8a8a8a";
const CROSSHAIR_COLOR = "#3d4c85";
const HOVER_MARKER_FILL = "#111111";

// Square-matrix field beneath the line: small squares on a fixed grid,
// strongest just under the line and fading out toward the bottom. Cobalt is
// darker than the old silver, so it starts a little more opaque.
const MATRIX_SQUARE = 3;
const MATRIX_TOP_OPACITY = 0.7;
const MATRIX_BOTTOM_OPACITY = 0;

const PADDING = { top: 12, right: 52, bottom: 26, left: 4 };
const MIN_X_TICKS = 2;
const MAX_X_TICKS = 5;
/** Horizontal room per x label, sized so counts land at 2–3 / 3–4 / 4–5 by breakpoint. */
const X_LABEL_SPACING = 180;

type Size = { width: number; height: number };

/**
 * Urdais-owned snapshot chart: a small SVG thumbnail for the homepage.
 * It draws a silver trend line over a square-matrix field clipped to the
 * area under the line, a single current-value marker on the right, and a
 * minimal set of muted x labels. No grid, no y-axis: precision belongs to
 * the detailed chart page. A pointer crosshair (vertical guide and marker)
 * writes its reading to a text line above the graphic. The value and change
 * are always shown as text elsewhere, so the SVG is a labelled illustration.
 */
export function SnapshotChart({ data, intraday, unit, label, className }: SnapshotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  // Hover is stored with the series it belongs to, so a range change
  // implicitly clears it without an effect.
  const [hover, setHover] = useState<{ series: TimeSeriesPoint[]; index: number } | null>(null);
  const hoverIndex = hover && hover.series === data ? hover.index : null;

  // Instance-safe ids for SVG definitions, so several charts can share a page.
  const baseId = useSvgId("snap");
  const ids = {
    pattern: `${baseId}-pattern`,
    fade: `${baseId}-fade`,
    mask: `${baseId}-mask`,
    clip: `${baseId}-clip`,
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

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0 || data.length < 2) return null;

    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const plotWidth = Math.max(plotRight - plotLeft, 1);
    const plotHeight = Math.max(plotBottom - plotTop, 1);

    let min = Infinity;
    let max = -Infinity;
    for (const point of data) {
      if (point.value < min) min = point.value;
      if (point.value > max) max = point.value;
    }
    const margin = (max - min || Math.abs(max) || 1) * 0.12;
    const yMin = min - margin;
    const yMax = max + margin;

    const x = (index: number) => plotLeft + (index / (data.length - 1)) * plotWidth;
    const y = (value: number) => plotBottom - ((value - yMin) / (yMax - yMin)) * plotHeight;

    const points = data.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);
    const linePath = `M${points.join("L")}`;
    const areaPath = `${linePath}L${x(data.length - 1).toFixed(1)},${plotBottom}L${plotLeft},${plotBottom}Z`;
    const lineTop = y(max);

    const xTickCount = Math.max(MIN_X_TICKS, Math.min(MAX_X_TICKS, Math.floor(plotWidth / X_LABEL_SPACING)));
    const xTicks = Array.from({ length: xTickCount }, (_, i) => {
      const index = Math.round(((data.length - 1) * i) / (xTickCount - 1));
      return { index, x: x(index) };
    });

    // Slightly wider cells on wide charts so the field never turns into noise.
    const matrixSpacing = plotWidth < 480 ? 8 : 10;

    return { plotLeft, plotRight, plotTop, plotBottom, x, y, linePath, areaPath, lineTop, xTicks, matrixSpacing };
  }, [data, size]);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const fraction = (px - geometry.plotLeft) / (geometry.plotRight - geometry.plotLeft);
    const index = Math.round(Math.min(Math.max(fraction, 0), 1) * (data.length - 1));
    setHover({ series: data, index });
  }

  const last = data[data.length - 1];
  const hovered = hoverIndex === null ? null : data[hoverIndex];
  const readout = hovered
    ? `${formatTimestamp(hovered.time, intraday)} · ${formatNumber(hovered.value)} ${unit}`
    : "";

  return (
    <div className={["flex min-h-0 flex-col", className].filter(Boolean).join(" ")}>
      <p className="h-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">{readout}</p>
      <div ref={containerRef} className="min-h-0 flex-1">
        {geometry && size && last && (
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
            <defs>
              <pattern
                id={ids.pattern}
                patternUnits="userSpaceOnUse"
                width={geometry.matrixSpacing}
                height={geometry.matrixSpacing}
                x={geometry.plotLeft}
                y={geometry.plotBottom}
              >
                <rect width={MATRIX_SQUARE} height={MATRIX_SQUARE} fill={MATRIX_COLOR} />
              </pattern>
              <linearGradient
                id={ids.fade}
                gradientUnits="userSpaceOnUse"
                x1="0"
                x2="0"
                y1={geometry.lineTop}
                y2={geometry.plotBottom}
              >
                <stop offset="0" stopColor="#fff" stopOpacity={MATRIX_TOP_OPACITY} />
                <stop offset="1" stopColor="#fff" stopOpacity={MATRIX_BOTTOM_OPACITY} />
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
              <clipPath id={ids.clip}>
                <path d={geometry.areaPath} />
              </clipPath>
            </defs>

            {/* Square-matrix field: pattern clipped to the area under the line, fading downward. */}
            <g clipPath={`url(#${ids.clip})`} mask={`url(#${ids.mask})`}>
              <rect
                x={geometry.plotLeft}
                y={geometry.plotTop}
                width={geometry.plotRight - geometry.plotLeft}
                height={geometry.plotBottom - geometry.plotTop}
                fill={`url(#${ids.pattern})`}
              />
            </g>

            {geometry.xTicks.map((tick, i) => {
              const point = data[tick.index];
              if (!point) return null;
              const anchor = i === 0 ? "start" : i === geometry.xTicks.length - 1 ? "end" : "middle";
              return (
                <text
                  key={tick.index}
                  x={tick.x}
                  y={size.height - 8}
                  fill={AXIS_TEXT}
                  fontSize={11}
                  textAnchor={anchor}
                >
                  {formatAxisTime(point.time, intraday)}
                </text>
              );
            })}

            <path
              d={geometry.linePath}
              fill="none"
              stroke={LINE_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Current value: endpoint dot and a single right-edge label. */}
            <circle cx={geometry.x(data.length - 1)} cy={geometry.y(last.value)} r={3} fill={MARKER_COLOR} />
            <g transform={`translate(${geometry.plotRight + 4}, ${geometry.y(last.value)})`}>
              <rect x={0} y={-9} width={PADDING.right - 6} height={18} rx={2} fill={MARKER_COLOR} />
              <text
                x={(PADDING.right - 6) / 2}
                y={0}
                fill={MARKER_LABEL_TEXT}
                fontSize={11}
                fontWeight={500}
                textAnchor="middle"
                dominantBaseline="middle"
                className="tabular-nums"
              >
                {formatNumber(last.value)}
              </text>
            </g>

            {hovered && hoverIndex !== null && (
              <g pointerEvents="none">
                <line
                  x1={geometry.x(hoverIndex)}
                  x2={geometry.x(hoverIndex)}
                  y1={geometry.plotTop}
                  y2={geometry.plotBottom}
                  stroke={CROSSHAIR_COLOR}
                  strokeWidth={1}
                />
                <circle
                  cx={geometry.x(hoverIndex)}
                  cy={geometry.y(hovered.value)}
                  r={4}
                  fill={HOVER_MARKER_FILL}
                  stroke={LINE_COLOR}
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

/** Short axis label: time of day for intraday series, month and day otherwise. */
function formatAxisTime(unixSeconds: number, intraday: boolean): string {
  const date = new Date(unixSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(intraday ? { hour: "2-digit", minute: "2-digit", hour12: false } : { month: "short", day: "numeric" }),
  }).format(date);
}
