"use client";

import { useMemo, useState } from "react";
import type { PointerEvent } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { useContainerSize } from "@/components/charts/use-container-size";
import { findForwardCurve } from "@/data/mock/compute-analytics";
import { formatNumber, formatPercent } from "@/lib/format";
import type { CurveShape, Tenor } from "@/types/compute-analytics";

const LINE = "#b6c7ff";
const MARKER = "#8ca4ff";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const CROSSHAIR = "#aab2c5";
const SURFACE = "#0a0a0a";
const PADDING = { top: 20, right: 64, bottom: 30, left: 40 };

const TENOR_LABEL: Record<Tenor, string> = { spot: "Spot", "1M": "1M", "3M": "3M", "6M": "6M", "1Y": "1Y" };
const SHAPE_LABEL: Record<CurveShape, string> = { downward: "Downward sloping", flat: "Flat", upward: "Upward sloping" };

/**
 * Compute Forward Curve: demo term marks for the selected accelerator at
 * spot, 1M, 3M, 6M, and 1Y, in $/GPU-hour. The x axis is tenor, not time,
 * so this is its own small chart rather than the historical series chart:
 * one line, five marks, hairline grid, and a readout on hover. No matrix
 * field, which would only add noise to a five-point curve.
 */
export function ComputeForwardCurve({ instrumentId }: { instrumentId: string }) {
  const curve = findForwardCurve(instrumentId);
  const { ref, size } = useContainerSize<HTMLDivElement>();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const oneYear = curve.marks[curve.marks.length - 1]!;

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const curve = findForwardCurve(instrumentId);
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const prices = curve.marks.map((mark) => mark.forwardPricePerGpuHour);
    const span = Math.max(...prices) - Math.min(...prices) || Math.max(...prices) * 0.1;
    const rough = (span * 1.6) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((n) => n * magnitude).find((candidate) => candidate >= rough) ?? magnitude;
    const yMin = Math.max(0, Math.floor((Math.min(...prices) - span * 0.3) / step) * step);
    const yMax = Math.ceil((Math.max(...prices) + span * 0.3) / step) * step;
    const x = (index: number) => plotLeft + (index / (curve.marks.length - 1)) * (plotRight - plotLeft);
    const y = (price: number) => plotBottom - ((price - yMin) / (yMax - yMin)) * (plotBottom - plotTop);
    const yTicks: number[] = [];
    for (let value = yMin; value <= yMax + step / 2; value += step) yTicks.push(Number(value.toFixed(4)));
    const path = `M${curve.marks.map((mark, index) => `${x(index).toFixed(1)},${y(mark.forwardPricePerGpuHour).toFixed(1)}`).join("L")}`;
    return { plotLeft, plotRight, plotTop, plotBottom, x, y, yTicks, path, decimals: step < 0.1 ? 2 : step < 1 ? 1 : 0 };
  }, [size, instrumentId]);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const fraction = (px - geometry.plotLeft) / (geometry.plotRight - geometry.plotLeft);
    setActiveIndex(Math.round(Math.min(Math.max(fraction, 0), 1) * (curve.marks.length - 1)));
  }

  const active = activeIndex === null ? null : curve.marks[activeIndex]!;
  const description = `${curve.label} forward marks in ${curve.unit} by tenor: ${curve.marks
    .map((mark) => `${TENOR_LABEL[mark.tenor]} $${formatNumber(mark.forwardPricePerGpuHour)}`)
    .join(", ")}. The 1Y mark is ${formatPercent(oneYear.changeVsSpotPercent, 1)} versus spot; the curve is ${SHAPE_LABEL[curve.shape].toLowerCase()}. Tenor, not calendar time, runs along the x axis.`;

  return (
    <section id="forwards" aria-labelledby="forwards-heading" className="scroll-mt-24">
      <SectionHeading
        id="forwards-heading"
        title="Compute Forward Curve"
        subtitle="Market pricing by tenor"
        aside={
          <dl className="grid grid-cols-3 gap-x-6 text-sm tabular-nums sm:text-right">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Spot</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-neutral-50">${formatNumber(curve.spotPricePerGpuHour)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">1Y forward</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-neutral-50">${formatNumber(oneYear.forwardPricePerGpuHour)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">1Y vs spot</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-neutral-50">{formatPercent(oneYear.changeVsSpotPercent, 1)}</dd>
            </div>
          </dl>
        }
      />
      <p className="mt-2 text-xs text-neutral-500">
        {curve.label} · {curve.unit} · {SHAPE_LABEL[curve.shape]} · demo term marks, not exchange-traded futures
      </p>

      <div ref={ref} className="relative mt-4 h-[280px] sm:h-[340px]">
        {geometry && size && (
          <svg
            role="img"
            aria-label={`${curve.label} forward curve by tenor`}
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            className="block select-none"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActiveIndex(null)}
          >
            <title>{`${curve.label} forward curve by tenor`}</title>
            <desc>{description}</desc>
            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                <text x={geometry.plotRight + 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} dominantBaseline="middle" className="tabular-nums">
                  ${formatNumber(tick, Math.max(2, geometry.decimals))}
                </text>
              </g>
            ))}
            {curve.marks.map((mark, index) => (
              <text key={mark.tenor} x={geometry.x(index)} y={size.height - 10} fill={AXIS_TEXT} fontSize={11} textAnchor="middle">
                {TENOR_LABEL[mark.tenor]}
              </text>
            ))}
            <path d={geometry.path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
            {curve.marks.map((mark, index) => (
              <g key={mark.tenor}>
                <title>{`${TENOR_LABEL[mark.tenor]}: $${formatNumber(mark.forwardPricePerGpuHour)} per GPU-hour, ${formatPercent(mark.changeVsSpotPercent, 1)} vs spot`}</title>
                <circle cx={geometry.x(index)} cy={geometry.y(mark.forwardPricePerGpuHour)} r={index === activeIndex ? 6 : 4.5} fill={index === 0 ? MARKER : SURFACE} stroke={LINE} strokeWidth={2} />
              </g>
            ))}
            {active && activeIndex !== null && (
              <line x1={geometry.x(activeIndex)} x2={geometry.x(activeIndex)} y1={geometry.plotTop} y2={geometry.plotBottom} stroke={CROSSHAIR} strokeOpacity={0.5} strokeDasharray="6 4" pointerEvents="none" />
            )}
          </svg>
        )}
        {geometry && active && activeIndex !== null && size && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs shadow-lg shadow-black/40"
            style={{ top: geometry.plotTop + 4, ...(geometry.x(activeIndex) > size.width * 0.55 ? { right: size.width - geometry.x(activeIndex) + 12 } : { left: geometry.x(activeIndex) + 12 }) }}
          >
            <p className="text-neutral-400">{curve.label} · {TENOR_LABEL[active.tenor]}</p>
            <p className="mt-1 font-medium tabular-nums text-neutral-50">${formatNumber(active.forwardPricePerGpuHour)} <span className="font-normal text-neutral-400">{curve.unit}</span></p>
            <p className="tabular-nums text-neutral-500">{active.tenor === "spot" ? "spot mark" : `${formatPercent(active.changeVsSpotPercent, 1)} vs spot`}</p>
          </div>
        )}
      </div>
    </section>
  );
}
