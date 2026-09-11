"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { FRONTIER_POINTS, SHARE_WINDOW_DAYS } from "@/data/mock/model-economics";
import { TOKEN_UNIT } from "@/data/mock/token-providers";
import { formatCompact, formatNumber } from "@/lib/format";
import type { FrontierPoint } from "@/types/model-economics";

// Same identity as the detailed chart: icy blue on near-black, cool-gray guides.
const OPEN_FILL = "#8ca4ff";
const PROPRIETARY_STROKE = "#b6c7ff";
const FRONTIER_LINE = "#aab2c5";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const SURFACE = "#0a0a0a";
const LABEL_TEXT = "#c9ccd6";

const PADDING = { top: 20, right: 24, bottom: 44, left: 44 };
const MIN_RADIUS = 4;
const MAX_RADIUS = 16;
/** Prices span more than an order of magnitude, so the x axis is logarithmic. */
const PRICE_TICKS = [0.25, 0.5, 1, 2, 5, 10, 20];
const NARROW_CHART_WIDTH = 560;

type Size = { width: number; height: number };

const accessLabel = (point: FrontierPoint) => (point.accessClass === "open-weight" ? "Open-weight" : "Proprietary");

/**
 * Model Frontier: capability against blended token price for every model in
 * the roster, point size by observed volume, with open-weight models drawn
 * solid and proprietary models drawn as outlined rings so the classes differ
 * by more than colour. A thin dashed line traces the Pareto frontier of
 * non-dominated models. Hovering a point shows its full readout; each point
 * also carries an accessible name with the same facts.
 */
export function ModelFrontierChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

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
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;

    const prices = FRONTIER_POINTS.map((point) => point.blendedPrice);
    const xMin = Math.log10(Math.min(...prices) / 1.3);
    const xMax = Math.log10(Math.max(...prices) * 1.3);
    const capabilities = FRONTIER_POINTS.map((point) => point.capabilityScore);
    const yMin = Math.floor((Math.min(...capabilities) - 3) / 5) * 5;
    const yMax = Math.min(100, Math.ceil((Math.max(...capabilities) + 2) / 5) * 5);
    const volumes = FRONTIER_POINTS.map((point) => point.tokenVolume);
    const volumeMax = Math.max(...volumes);

    const x = (price: number) => plotLeft + ((Math.log10(price) - xMin) / (xMax - xMin)) * (plotRight - plotLeft);
    const y = (score: number) => plotBottom - ((score - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
    // Area, not radius, scales with volume, so a point twice as busy looks twice as big.
    const r = (volume: number) => MIN_RADIUS + Math.sqrt(volume / volumeMax) * (MAX_RADIUS - MIN_RADIUS);

    const yTicks: number[] = [];
    for (let value = yMin; value <= yMax; value += 5) yTicks.push(value);
    const xTicks = PRICE_TICKS.filter((price) => Math.log10(price) >= xMin && Math.log10(price) <= xMax);

    const frontier = FRONTIER_POINTS.filter((point) => point.onFrontier).sort((a, b) => a.blendedPrice - b.blendedPrice);
    const frontierPath = `M${frontier.map((point) => `${x(point.blendedPrice).toFixed(1)},${y(point.capabilityScore).toFixed(1)}`).join("L")}`;

    return { plotLeft, plotRight, plotTop, plotBottom, x, y, r, xTicks, yTicks, frontierPath };
  }, [size]);

  const active = activeId ? FRONTIER_POINTS.find((point) => point.id === activeId) : null;
  const narrow = size ? size.width < NARROW_CHART_WIDTH : false;

  const description = `${FRONTIER_POINTS.length} models plotted by capability score against blended price in ${TOKEN_UNIT}; ${
    FRONTIER_POINTS.filter((point) => point.onFrontier).length
  } are on the frontier: ${FRONTIER_POINTS.filter((point) => point.onFrontier)
    .sort((a, b) => a.blendedPrice - b.blendedPrice)
    .map((point) => point.modelName)
    .join(", ")}.`;

  return (
    <section id="frontier" aria-labelledby="frontier-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="frontier-heading"
        title="Model Frontier"
        subtitle="Capability against price"
        aside={
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ backgroundColor: OPEN_FILL }} />
              Open-weight
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 rounded-full border-[1.5px]"
                style={{ borderColor: PROPRIETARY_STROKE, backgroundColor: SURFACE }}
              />
              Proprietary
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block w-4 border-t border-dashed" style={{ borderColor: FRONTIER_LINE }} />
              Frontier
            </li>
            <li className="text-neutral-500">Size = observed volume, trailing {SHARE_WINDOW_DAYS} days</li>
          </ul>
        }
      />

      <div ref={containerRef} className="relative mt-6 h-[360px] sm:h-[420px]">
        {geometry && size && (
          <svg
            role="img"
            aria-label="Model Frontier: capability score against blended token price"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            className="block select-none"
            onPointerLeave={() => setActiveId(null)}
          >
            <title>Model Frontier: capability score against blended token price</title>
            <desc>{description}</desc>

            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                <text x={geometry.plotLeft - 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} textAnchor="end" dominantBaseline="middle" className="tabular-nums">
                  {tick}
                </text>
              </g>
            ))}
            {geometry.xTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.x(tick)} x2={geometry.x(tick)} y1={geometry.plotTop} y2={geometry.plotBottom} stroke={GRID_LINE} />
                <text x={geometry.x(tick)} y={geometry.plotBottom + 16} fill={AXIS_TEXT} fontSize={11} textAnchor="middle" className="tabular-nums">
                  ${formatNumber(tick, tick < 1 ? 2 : 0)}
                </text>
              </g>
            ))}
            <text x={geometry.plotRight} y={size.height - 6} fill={AXIS_TEXT} fontSize={10} textAnchor="end">
              Blended price, {TOKEN_UNIT} (log scale) →
            </text>
            <text
              x={12}
              y={geometry.plotTop}
              fill={AXIS_TEXT}
              fontSize={10}
              textAnchor="end"
              transform={`rotate(-90 12 ${geometry.plotTop})`}
            >
              Capability score →
            </text>

            <path d={geometry.frontierPath} fill="none" stroke={FRONTIER_LINE} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" />

            {FRONTIER_POINTS.map((point) => {
              const cx = geometry.x(point.blendedPrice);
              const cy = geometry.y(point.capabilityScore);
              const radius = geometry.r(point.tokenVolume);
              const open = point.accessClass === "open-weight";
              const isActive = point.id === activeId;
              const name = `${point.modelName} (${point.labName}): capability ${formatNumber(point.capabilityScore, 1)}, $${formatNumber(point.blendedPrice)} per 1M tokens, ${formatCompact(point.tokenVolume)} tokens per day, ${accessLabel(point).toLowerCase()}${point.onFrontier ? ", on the frontier" : ""}`;
              return (
                <g
                  key={point.id}
                  role="img"
                  aria-label={name}
                  onPointerEnter={() => setActiveId(point.id)}
                  className="cursor-default"
                >
                  <title>{name}</title>
                  {/* Hit target larger than the mark. */}
                  <circle cx={cx} cy={cy} r={Math.max(radius + 6, 12)} fill="transparent" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={open ? OPEN_FILL : SURFACE}
                    fillOpacity={open ? (isActive ? 1 : 0.85) : 1}
                    stroke={open ? SURFACE : PROPRIETARY_STROKE}
                    strokeWidth={open ? 1.5 : isActive ? 2.5 : 1.75}
                  />
                  {point.onFrontier && !narrow && (
                    <text x={cx + radius + 5} y={cy} fill={LABEL_TEXT} fontSize={11} dominantBaseline="middle">
                      {point.modelName}
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
              top: Math.max(0, geometry.y(active.capabilityScore) - 96),
              ...(geometry.x(active.blendedPrice) > size.width * 0.6
                ? { right: size.width - geometry.x(active.blendedPrice) + 16 }
                : { left: geometry.x(active.blendedPrice) + 16 }),
            }}
          >
            <p className="font-semibold text-neutral-50">{active.modelName}</p>
            <p className="text-neutral-400">
              {active.labName} · {accessLabel(active)}
              {active.onFrontier ? " · frontier" : ""}
            </p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 tabular-nums">
              <dt className="text-neutral-500">Capability</dt>
              <dd className="text-right font-medium text-neutral-50">{formatNumber(active.capabilityScore, 1)}</dd>
              <dt className="text-neutral-500">Blended price</dt>
              <dd className="text-right font-medium text-neutral-50">${formatNumber(active.blendedPrice)} / 1M</dd>
              <dt className="text-neutral-500">Volume</dt>
              <dd className="text-right font-medium text-neutral-50">{formatCompact(active.tokenVolume)}/day</dd>
            </dl>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Blended price is a provisional normalised average of input and output economics; the capability score is a 0–100 demo
        measure, not a benchmark. A model is on the frontier when no other model is both cheaper and more capable.
      </p>
    </section>
  );
}
