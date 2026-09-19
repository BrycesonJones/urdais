"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";

import { SectionHeading } from "@/components/analytics/section-heading";
import { assumptionValues } from "@/lib/compute-economics/assumptions";
import { calculateComputeEconomics, paybackSensitivity } from "@/lib/compute-economics/calculate";
import type { ComputeEconomicsInputs, ComputeEconomicsInstrument } from "@/lib/compute-economics/domain";
import { formatNumber, formatTimestamp } from "@/lib/format";

const WIDTH = 800;
const HEIGHT = 260;
const PADDING = { top: 24, right: 28, bottom: 42, left: 58 };

const INPUT_FIELDS: ReadonlyArray<{
  key: keyof ComputeEconomicsInputs;
  label: string;
  suffix: string;
  step: number;
  percent?: boolean;
}> = [
  { key: "acquisitionCostUsd", label: "Acquisition cost", suffix: "USD", step: 500 },
  { key: "utilization", label: "Utilization", suffix: "%", step: 1, percent: true },
  { key: "electricityCostPerKwh", label: "Electricity price", suffix: "$/kWh", step: 0.01 },
  { key: "powerDrawKw", label: "Power draw", suffix: "kW", step: 0.025 },
  { key: "hostingCostPerGpuHour", label: "Hosting cost", suffix: "$/GPU-hour", step: 0.01 },
  { key: "otherOperatingCostPerGpuHour", label: "Other operating cost", suffix: "$/GPU-hour", step: 0.01 },
];

function usd(value: number, digits = 0): string {
  return `$${formatNumber(value, digits)}`;
}

function utc(iso: string): string {
  return formatTimestamp(Date.parse(iso) / 1000, true);
}

function AssumptionInput({
  field,
  value,
  description,
  onChange,
}: {
  field: (typeof INPUT_FIELDS)[number];
  value: number;
  description: string;
  onChange: (value: number) => void;
}) {
  const shown = field.percent ? value * 100 : value;
  function update(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) onChange(field.percent ? next / 100 : next);
  }
  return (
    <label className="block rounded border border-white/10 bg-white/[0.02] p-3">
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm text-neutral-200">{field.label}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber-300/80">Assumption</span>
      </span>
      <span className="mt-2 flex items-center gap-2">
        <input
          aria-label={field.label}
          type="number"
          min="0"
          max={field.percent ? 100 : undefined}
          step={field.step}
          value={shown}
          onChange={update}
          className="h-9 min-w-0 flex-1 rounded-[3px] border border-white/10 bg-[#111111] px-2.5 text-sm tabular-nums text-neutral-50 outline-none focus-visible:border-[#8ca4ff]"
        />
        <span className="text-xs text-neutral-500">{field.suffix}</span>
      </span>
      <span className="mt-2 block text-[11px] leading-4 text-neutral-500">{description}</span>
    </label>
  );
}

function SensitivityChart({ price, inputs }: { price: number; inputs: ComputeEconomicsInputs }) {
  const points = useMemo(() => paybackSensitivity(price, inputs), [price, inputs]);
  const geometry = useMemo(() => {
    const viable = points.filter((point) => point.paybackYears !== null);
    const max = Math.max(1, ...viable.map((point) => point.paybackYears!));
    const yMax = Math.ceil(max * 1.15);
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const x = (index: number) => PADDING.left + (index / (points.length - 1)) * plotWidth;
    const y = (years: number) => PADDING.top + plotHeight - (years / yMax) * plotHeight;
    const yTicks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index);
    const line = viable.map((point) => {
      const index = points.indexOf(point);
      return `${x(index)},${y(point.paybackYears!)}`;
    }).join(" ");
    return { x, y, yMax, yTicks, line, plotBottom: HEIGHT - PADDING.bottom };
  }, [points]);

  return (
    <section aria-labelledby="sensitivity-heading" className="border-t border-white/10 pt-8">
      <SectionHeading
        id="sensitivity-heading"
        title="Payback sensitivity"
        subtitle="Modeled payback versus utilization; observed price and all other assumptions held constant"
      />
      <svg role="img" aria-label="Modeled payback period versus utilization" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mt-5 h-auto w-full">
        <title>Modeled payback period versus utilization</title>
        <desc>Payback is recalculated from 40 to 100 percent utilization. This is scenario sensitivity, not historical or forecast data.</desc>
        {geometry.yTicks.map((tick) => (
          <g key={tick}>
            <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke="rgba(255,255,255,0.06)" />
            <text x={PADDING.left - 10} y={geometry.y(tick)} fill="#8a8a8a" fontSize="11" textAnchor="end" dominantBaseline="middle">{formatNumber(tick, 1)}y</text>
          </g>
        ))}
        {geometry.line && <polyline points={geometry.line} fill="none" stroke="#8ca4ff" strokeWidth="2" strokeLinejoin="round" />}
        {points.map((point, index) => (
          <g key={point.utilizationPercent}>
            {point.paybackYears === null ? (
              <text x={geometry.x(index)} y={geometry.plotBottom - 8} fill="#8a8a8a" fontSize="10" textAnchor="middle">N/E</text>
            ) : (
              <circle cx={geometry.x(index)} cy={geometry.y(point.paybackYears)} r="4" fill="#0a0a0a" stroke="#b6c7ff" strokeWidth="2" />
            )}
            <text x={geometry.x(index)} y={HEIGHT - 14} fill="#8a8a8a" fontSize="11" textAnchor="middle">{point.utilizationPercent}%</text>
          </g>
        ))}
      </svg>
      <ol aria-label="Payback sensitivity values" className="mt-2 grid grid-cols-4 gap-3 text-xs tabular-nums sm:grid-cols-7">
        {points.map((point) => (
          <li key={point.utilizationPercent}>
            <span className="block text-neutral-500">{point.utilizationPercent}% utilized</span>
            <span className="text-neutral-200">{point.paybackYears === null ? "Not economic" : `${formatNumber(point.paybackYears, 1)} years`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ComputeEconomicsAnalysis({ instrument }: { instrument: ComputeEconomicsInstrument }) {
  const [inputs, setInputs] = useState<ComputeEconomicsInputs>(() => assumptionValues(instrument.defaultAssumptions));
  const price = instrument.observedPrice;
  const result = price.freshness.usableForPayback ? calculateComputeEconomics(price.priceUsdPerGpuHour, inputs) : null;

  function setField(key: keyof ComputeEconomicsInputs, value: number) {
    const bounded = key === "utilization" ? Math.min(1, Math.max(0, value)) : Math.max(0, value);
    setInputs((current) => ({ ...current, [key]: bounded }));
  }

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="observed-price-heading">
        <SectionHeading
          id="observed-price-heading"
          title="Observed compute price"
          subtitle="Latest released Urdais listed-GPU observation"
          aside={
            <p className="tabular-nums sm:text-right">
              <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">Observed · {price.freshness.state}</span>
              <span className="mt-1 block text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">{usd(price.priceUsdPerGpuHour, 2)}</span>
              <span className="block text-xs text-neutral-500">USD per GPU-hour · listed</span>
            </p>
          }
        />
        <dl className="mt-5 grid gap-4 border-y border-white/10 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-neutral-500">Accelerator</dt><dd className="mt-1 text-neutral-200">{instrument.gpu.vendor} {instrument.label}</dd></div>
          <div><dt className="text-xs text-neutral-500">Observation date</dt><dd className="mt-1 text-neutral-200">{price.calculationDate}</dd></div>
          <div><dt className="text-xs text-neutral-500">Observation window ended</dt><dd className="mt-1 text-neutral-200">{utc(price.observationWindowEnd)}</dd></div>
          <div><dt className="text-xs text-neutral-500">Published</dt><dd className="mt-1 text-neutral-200">{utc(price.publishedAt)}</dd></div>
          <div><dt className="text-xs text-neutral-500">Coverage</dt><dd className="mt-1 text-neutral-200">{price.participantCount} participant{price.participantCount === 1 ? "" : "s"} · {price.contributingSourceCount} source{price.contributingSourceCount === 1 ? "" : "s"}</dd></div>
          <div><dt className="text-xs text-neutral-500">Market breadth</dt><dd className="mt-1 capitalize text-neutral-200">{price.marketBreadth ?? "Unavailable"}</dd></div>
          <div><dt className="text-xs text-neutral-500">Methodology</dt><dd className="mt-1 text-neutral-200">{price.methodologyVersion}</dd></div>
          <div><dt className="text-xs text-neutral-500">Instrument specification</dt><dd className="mt-1 text-neutral-200">{price.instrumentSpecVersion}</dd></div>
        </dl>
        {price.attributions.map((attribution) => <p key={attribution} className="mt-2 text-xs text-neutral-500">{attribution}</p>)}
      </section>

      {!price.freshness.usableForPayback ? (
        <section aria-labelledby="stale-price-heading" className="rounded border border-amber-400/20 bg-amber-400/[0.04] p-5">
          <h2 id="stale-price-heading" className="text-lg font-medium text-neutral-100">Payback unavailable: observed price is stale</h2>
          <p className="mt-2 max-w-3xl text-sm text-neutral-400">This observation passed UCPI publication controls when released but is older than the next daily publication deadline ({utc(price.freshness.staleAfter)}). Urdais does not calculate Payback from it.</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="assumptions-heading">
            <SectionHeading id="assumptions-heading" title="Scenario assumptions" subtitle="Explicit user-adjustable defaults; none are observed market data" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {INPUT_FIELDS.map((field) => (
                <AssumptionInput
                  key={field.key}
                  field={field}
                  value={inputs[field.key]}
                  description={instrument.defaultAssumptions[field.key].description}
                  onChange={(value) => setField(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="payback-heading" className="border-t border-white/10 pt-8">
            <SectionHeading
              id="payback-heading"
              title="Payback"
              subtitle="Modeled hardware cost recovery at the observed current rental price"
              aside={
                <p className="tabular-nums sm:text-right">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[#aabaff]">Derived</span>
                  <span className="mt-1 block text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">{result!.paybackYears === null ? "No finite payback" : `${formatNumber(result!.paybackYears, 1)} years`}</span>
                </p>
              }
            />
            <dl className="mt-6 grid gap-px overflow-hidden rounded border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Annual gross revenue", usd(result!.grossAnnualRevenueUsd)],
                ["Annual operating cost", usd(result!.annualOperatingCostUsd)],
                ["Annual net cash flow", usd(result!.netAnnualCashFlowUsd)],
                ["Observed rental price", `${usd(price.priceUsdPerGpuHour, 2)} / GPU-hour`],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#0d0d0d] p-4"><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-2 text-xl font-medium tabular-nums text-neutral-100">{value}</dd></div>
              ))}
            </dl>
            <dl aria-label="Annual cash-flow audit" className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-neutral-500">Electricity expense</dt><dd className="mt-1 tabular-nums text-neutral-200">{usd(result!.electricityAnnualCostUsd)}</dd></div>
              <div><dt className="text-neutral-500">Hosting expense</dt><dd className="mt-1 tabular-nums text-neutral-200">{usd(result!.hostingAnnualCostUsd)}</dd></div>
              <div><dt className="text-neutral-500">Other operating expense</dt><dd className="mt-1 tabular-nums text-neutral-200">{usd(result!.otherAnnualCostUsd)}</dd></div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-neutral-500">
              Calculation basis: 8,760 hours per year. Gross revenue = price × utilization × hours. Power = kW × electricity price × utilization × hours. Hosting = hosting rate × hours. Other operating cost = other rate × utilization × hours. Payback = acquisition cost ÷ positive annual net cash flow.
            </p>
            {result!.paybackYears === null && <p className="mt-4 text-sm text-amber-200/80">Annual net cash flow is not positive under these assumptions, so the scenario has no finite payback.</p>}
          </section>

          <SensitivityChart price={price.priceUsdPerGpuHour} inputs={inputs} />
        </>
      )}

      <p className="border-t border-white/10 pt-5 text-xs leading-5 text-neutral-500">
        Payback is a modeled scenario using current observed compute rental pricing and user-configurable economic assumptions. It is not an observed operator return and is not a forecast of future compute prices. <Link href="/docs/methodology/compute-economics" className="text-neutral-300 underline decoration-neutral-600 underline-offset-2 hover:text-neutral-100">Read the methodology.</Link>
      </p>
    </div>
  );
}
