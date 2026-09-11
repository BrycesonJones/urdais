"use client";

import { useMemo } from "react";

import { SectionHeading } from "@/components/analytics/section-heading";
import { useContainerSize } from "@/components/charts/use-container-size";
import { findPayback } from "@/data/mock/compute-analytics";
import { formatNumber } from "@/lib/format";
import type { Tenor } from "@/types/compute-analytics";

const BAR = "#526fe0";
const BAR_SPOT = "#8ca4ff";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const PADDING = { top: 24, right: 48, bottom: 30, left: 8 };
const TENOR_LABEL: Record<Tenor, string> = { spot: "Spot", "1M": "1M", "3M": "3M", "6M": "6M", "1Y": "1Y" };

/**
 * Payback Period: years to recover the selected accelerator's acquisition
 * cost at each forward tenor, from the same forward marks, the latest
 * fleet utilization, and explicit hardware and operating assumptions.
 * Lower is better and the copy says so; a tenor whose net revenue is not
 * positive is shown as "Not economic" rather than a negative number.
 */
export function PaybackPeriodChart({ instrumentId }: { instrumentId: string }) {
  const analysis = findPayback(instrumentId);
  const { ref, size } = useContainerSize<HTMLDivElement>();
  const spot = analysis.points[0]!;
  const viable = analysis.points.filter((point) => point.paybackYears !== null);

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const analysis = findPayback(instrumentId);
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const max = Math.max(1, ...analysis.points.map((point) => point.paybackYears ?? 0));
    const step = max <= 2 ? 0.5 : max <= 5 ? 1 : 2;
    const yMax = Math.ceil((max * 1.1) / step) * step;
    const y = (years: number) => plotBottom - (years / yMax) * (plotBottom - plotTop);
    const slot = (plotRight - plotLeft) / analysis.points.length;
    const barWidth = Math.min(slot * 0.5, 64);
    const x = (index: number) => plotLeft + slot * index + (slot - barWidth) / 2;
    const yTicks: number[] = [];
    for (let value = 0; value <= yMax + step / 2; value += step) yTicks.push(value);
    return { plotLeft, plotRight, plotTop, plotBottom, y, x, barWidth, slot, yTicks, decimals: step < 1 ? 1 : 0 };
  }, [size, instrumentId]);

  const description = `${analysis.label} payback years by tenor at ${formatNumber(analysis.utilizationPercent, 0)}% utilization: ${analysis.points
    .map((point) => `${TENOR_LABEL[point.tenor]} ${point.paybackYears === null ? "not economic" : `${formatNumber(point.paybackYears, 1)} years`}`)
    .join(", ")}. Lower is better.`;

  return (
    <section id="payback" aria-labelledby="payback-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="payback-heading"
        title="Payback Period"
        subtitle="Years to recover hardware investment along the forward curve"
        aside={
          <p className="tabular-nums sm:text-right">
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{analysis.label} · spot payback</span>
            <span className="mt-1 block text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">
              {spot.paybackYears === null ? "Not economic" : <>{formatNumber(spot.paybackYears, 1)} <span className="text-base font-normal text-neutral-400">years</span></>}
            </span>
            <span className="block text-xs text-neutral-500">lower payback = faster hardware cost recovery</span>
          </p>
        }
      />

      <div ref={ref} className="relative mt-6 h-[260px] sm:h-[300px]">
        {geometry && size && (
          <svg role="img" aria-label={`${analysis.label} payback period by tenor`} width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} className="block select-none">
            <title>{`${analysis.label} payback period by tenor`}</title>
            <desc>{description}</desc>
            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                <text x={geometry.plotRight + 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} dominantBaseline="middle" className="tabular-nums">{formatNumber(tick, geometry.decimals)}y</text>
              </g>
            ))}
            {analysis.points.map((point, index) => (
              <g key={point.tenor}>
                <title>{`${TENOR_LABEL[point.tenor]}: ${point.paybackYears === null ? "not economic" : `${formatNumber(point.paybackYears, 1)} years`}`}</title>
                {point.paybackYears !== null ? (
                  <>
                    <rect x={geometry.x(index)} y={geometry.y(point.paybackYears)} width={geometry.barWidth} height={geometry.plotBottom - geometry.y(point.paybackYears)} fill={index === 0 ? BAR_SPOT : BAR} fillOpacity={index === 0 ? 1 : 0.75} />
                    <text x={geometry.x(index) + geometry.barWidth / 2} y={geometry.y(point.paybackYears) - 6} fill="#e5e7eb" fontSize={11} textAnchor="middle" className="tabular-nums">{formatNumber(point.paybackYears, 1)}y</text>
                  </>
                ) : (
                  <text x={geometry.x(index) + geometry.barWidth / 2} y={geometry.plotBottom - 8} fill={AXIS_TEXT} fontSize={10} textAnchor="middle">Not economic</text>
                )}
                <text x={geometry.x(index) + geometry.barWidth / 2} y={size.height - 10} fill={AXIS_TEXT} fontSize={11} textAnchor="middle">{TENOR_LABEL[point.tenor]}</text>
              </g>
            ))}
          </svg>
        )}
      </div>

      <ol className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 text-sm sm:grid-cols-5" aria-label={`${analysis.label} payback by tenor`}>
        {analysis.points.map((point) => (
          <li key={point.tenor} className="tabular-nums">
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{TENOR_LABEL[point.tenor]} · ${formatNumber(point.forwardPricePerGpuHour)}</span>
            <span className="block font-medium text-neutral-50">{point.paybackYears === null ? "Not economic" : `${formatNumber(point.paybackYears, 1)} years`}</span>
            <span className="block text-xs text-neutral-500">net ${formatNumber(point.netAnnualRevenueUsd, 0)} / year</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-neutral-500">
        Demo assumptions · utilization {formatNumber(analysis.utilizationPercent, 0)}% (latest fleet observation) · acquisition ${formatNumber(analysis.economics.acquisitionCostUsd, 0)} · power {formatNumber(analysis.economics.powerDrawKw, 2)} kW while rented · electricity ${formatNumber(analysis.electricityCostPerKwh, 2)}/kWh · hosting ${formatNumber(analysis.economics.hostingCostPerGpuHour, 2)}/GPU-hour available · other ${formatNumber(analysis.economics.otherOperatingCostPerGpuHour, 2)}/GPU-hour rented. Payback = acquisition cost ÷ (gross rental revenue − electricity − hosting − other), over 8,760 hours.
        {viable.length < analysis.points.length && " Tenors marked Not economic have no positive net revenue, so the hardware never pays back."}
      </p>
    </section>
  );
}
