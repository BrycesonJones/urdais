"use client";

import { useMemo } from "react";

import { useContainerSize } from "@/components/charts/use-container-size";
import { SectionHeading } from "@/components/analytics/section-heading";
import { FLEXIBILITY_CURVE, FLEXIBILITY_HEADLINE, FLEXIBILITY_SCENARIOS } from "@/data/mock/power-analytics";
import { formatNumber } from "@/lib/format";

const TOTAL_LINE = "#b6c7ff";
const INTERRUPTIBLE_FILL = "#526fe0";
const BATTERY_FILL = "#d4a56a";
const AXIS_TEXT = "#8a8a8a";
const GRID_LINE = "rgba(255,255,255,0.06)";
const SURFACE = "#0a0a0a";
const PADDING = { top: 16, right: 48, bottom: 30, left: 8 };

/**
 * Flexible Capacity: additional load the existing grid could support if
 * large loads flexed for a given number of hours per year. Interruptible
 * load and battery shifting are stacked; their sum is the total curve, and
 * the headline scenario is quoted from the same model. Scenario points are
 * marked and listed beneath as text.
 */
export function FlexibleCapacityChart() {
  const { ref, size } = useContainerSize<HTMLDivElement>();

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const plotLeft = PADDING.left;
    const plotRight = size.width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = size.height - PADDING.bottom;
    const hMax = FLEXIBILITY_CURVE[FLEXIBILITY_CURVE.length - 1]!.flexibleHoursPerYear;
    const vMax = Math.ceil((Math.max(...FLEXIBILITY_CURVE.map((point) => point.unlockedGw)) * 1.1) / 10) * 10;
    const x = (hours: number) => plotLeft + (hours / hMax) * (plotRight - plotLeft);
    const y = (gw: number) => plotBottom - (gw / vMax) * (plotBottom - plotTop);
    const line = (pick: (point: (typeof FLEXIBILITY_CURVE)[number]) => number) =>
      FLEXIBILITY_CURVE.map((point) => `${x(point.flexibleHoursPerYear).toFixed(1)},${y(pick(point)).toFixed(1)}`).join("L");
    const interruptibleArea = `M${line((point) => point.interruptibleGw)}L${x(hMax)},${plotBottom}L${plotLeft},${plotBottom}Z`;
    const batteryArea = `M${line((point) => point.unlockedGw)}L${[...FLEXIBILITY_CURVE].reverse().map((point) => `${x(point.flexibleHoursPerYear).toFixed(1)},${y(point.interruptibleGw).toFixed(1)}`).join("L")}Z`;
    const yTicks: number[] = [];
    for (let value = 0; value <= vMax; value += vMax / 4) yTicks.push(value);
    return { plotLeft, plotRight, plotTop, plotBottom, x, y, totalPath: `M${line((point) => point.unlockedGw)}`, interruptibleArea, batteryArea, yTicks };
  }, [size]);

  const description = `Estimated additional capacity unlocked by flexible large loads: ${FLEXIBILITY_SCENARIOS.map(
    (scenario) => `${scenario.flexibleHoursPerYear} hours ${formatNumber(scenario.unlockedGw, 0)} GW`,
  ).join(", ")}, of which interruptible load and battery shifting are shown separately.`;

  return (
    <section id="flexibility" aria-labelledby="flexibility-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="flexibility-heading"
        title="Flexible Capacity"
        subtitle="Additional compute capacity unlocked through load shifting"
        aside={
          <p className="tabular-nums">
            <span className="block font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">{FLEXIBILITY_HEADLINE.flexibleHoursPerYear} flexible hours / year</span>
            <span className="mt-1 block text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">
              +{formatNumber(FLEXIBILITY_HEADLINE.unlockedGw, 0)} <span className="text-base font-normal text-neutral-400">GW</span>
            </span>
            <span className="block text-xs text-neutral-500">estimated additional capacity</span>
          </p>
        }
      />

      <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3 rounded-[1px]" style={{ backgroundColor: INTERRUPTIBLE_FILL, opacity: 0.6 }} /><span className="text-neutral-200">Interruptible load</span></li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block size-3 rounded-[1px]" style={{ backgroundColor: BATTERY_FILL, opacity: 0.5 }} /><span className="text-neutral-200">Battery shifting</span></li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-[2px] w-4 rounded-full" style={{ backgroundColor: TOTAL_LINE }} /><span className="text-neutral-200">Total unlocked</span></li>
        <li className="text-neutral-500">GW unlocked against flexible hours per year</li>
      </ul>

      <div ref={ref} className="relative mt-3 h-[260px] sm:h-[300px]">
        {geometry && size && (
          <svg role="img" aria-label="Flexible capacity: additional capacity unlocked by flexible hours per year" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} className="block select-none">
            <title>Flexible capacity: additional capacity unlocked by flexible hours per year</title>
            <desc>{description}</desc>
            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line x1={geometry.plotLeft} x2={geometry.plotRight} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke={GRID_LINE} />
                <text x={geometry.plotRight + 8} y={geometry.y(tick)} fill={AXIS_TEXT} fontSize={11} dominantBaseline="middle" className="tabular-nums">{formatNumber(tick, 0)}</text>
              </g>
            ))}
            <path d={geometry.interruptibleArea} fill={INTERRUPTIBLE_FILL} fillOpacity={0.35} />
            <path d={geometry.batteryArea} fill={BATTERY_FILL} fillOpacity={0.3} />
            <path d={geometry.totalPath} fill="none" stroke={TOTAL_LINE} strokeWidth={2} strokeLinejoin="round" />
            {FLEXIBILITY_SCENARIOS.map((scenario) => (
              <g key={scenario.flexibleHoursPerYear}>
                <circle cx={geometry.x(scenario.flexibleHoursPerYear)} cy={geometry.y(scenario.unlockedGw)} r={scenario.flexibleHoursPerYear === FLEXIBILITY_HEADLINE.flexibleHoursPerYear ? 5 : 3.5} fill={scenario.flexibleHoursPerYear === FLEXIBILITY_HEADLINE.flexibleHoursPerYear ? TOTAL_LINE : SURFACE} stroke={TOTAL_LINE} strokeWidth={1.5} />
                <text x={geometry.x(scenario.flexibleHoursPerYear)} y={size.height - 10} fill={AXIS_TEXT} fontSize={11} textAnchor={scenario.flexibleHoursPerYear === 0 ? "start" : "middle"}>{scenario.flexibleHoursPerYear}</text>
              </g>
            ))}
          </svg>
        )}
      </div>

      <ol className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 text-sm sm:grid-cols-6" aria-label="Flexibility scenarios">
        {FLEXIBILITY_SCENARIOS.map((scenario) => (
          <li key={scenario.flexibleHoursPerYear} className="tabular-nums">
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{scenario.flexibleHoursPerYear} h</span>
            <span className="block font-medium text-neutral-50">+{formatNumber(scenario.unlockedGw, 0)} GW</span>
            <span className="block text-xs text-neutral-500">{formatNumber(scenario.interruptibleGw, 0)} interruptible · {formatNumber(scenario.batteryGw, 0)} battery</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-neutral-500">
        A scenario model, not an engineering forecast: the share of flexible load that unlocks capacity rises with diminishing returns as more constrained hours are covered.
      </p>
    </section>
  );
}
