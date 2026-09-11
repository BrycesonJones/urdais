import { SectionHeading } from "@/components/analytics/section-heading";
import { OPEN_WEIGHT_ANALYSIS, SHARE_WINDOW_DAYS } from "@/data/mock/model-economics";
import { formatNumber } from "@/lib/format";

const OPEN_FILL = "#8ca4ff";
const PROPRIETARY_FILL = "#2e3a63";

/**
 * Open-weight vs Proprietary: three analytical views derived from the same
 * model roster and volume observations. Volume share is the trailing window
 * split by access class; capability gap compares each class's most capable
 * model; price gap compares median blended prices among models at or above
 * the documented capability threshold.
 */
export function OpenWeightAnalysis() {
  const { volumeShare, capabilityGap, priceGap } = OPEN_WEIGHT_ANALYSIS;
  const openLeads = capabilityGap.gap < 0;

  return (
    <section id="open-weight" aria-labelledby="open-weight-heading" className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading
        id="open-weight-heading"
        title="Open-weight vs Proprietary"
        subtitle="Volume share, capability gap, and price gap"
      />

      <div className="mt-6 grid gap-8 divide-y divide-white/[0.08] lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-y-0">
        <div className="pt-8 first:pt-0 lg:pr-8 lg:pt-0">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">Volume share</h3>
          <p className="mt-1 text-xs text-neutral-500">Observed token volume, trailing {SHARE_WINDOW_DAYS} days</p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-[1px]" aria-hidden="true">
            <span style={{ width: `${volumeShare.openWeight}%`, backgroundColor: OPEN_FILL }} />
            <span style={{ width: `${volumeShare.proprietary}%`, backgroundColor: PROPRIETARY_FILL }} />
          </div>
          <dl className="mt-4 space-y-2 text-sm tabular-nums">
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-neutral-300">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-[1px]" style={{ backgroundColor: OPEN_FILL }} />
                Open-weight
              </dt>
              <dd className="font-medium text-neutral-50">{formatNumber(volumeShare.openWeight, 1)}%</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-neutral-300">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-[1px]" style={{ backgroundColor: PROPRIETARY_FILL }} />
                Proprietary
              </dt>
              <dd className="font-medium text-neutral-50">{formatNumber(volumeShare.proprietary, 1)}%</dd>
            </div>
          </dl>
        </div>

        <div className="pt-8 lg:px-8 lg:pt-0">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">Capability gap</h3>
          <p className="mt-1 text-xs text-neutral-500">Most capable model in each class, demo capability score</p>
          <dl className="mt-5 space-y-2 text-sm tabular-nums">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-neutral-300">Proprietary frontier</dt>
              <dd className="text-2xl font-semibold text-neutral-50">{formatNumber(capabilityGap.proprietary, 1)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-neutral-300">Open-weight frontier</dt>
              <dd className="text-2xl font-semibold text-neutral-50">{formatNumber(capabilityGap.openWeight, 1)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.08] pt-2">
              <dt className="text-neutral-400">Gap</dt>
              <dd className="font-medium text-neutral-100">
                {formatNumber(Math.abs(capabilityGap.gap), 1)}
                <span className="ml-1.5 text-xs font-normal text-neutral-500">{openLeads ? "open-weight leads" : "proprietary leads"}</span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="pt-8 lg:pl-8 lg:pt-0">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">Price gap</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Median blended price, models with capability ≥ {priceGap.capabilityThreshold}
          </p>
          <dl className="mt-5 space-y-2 text-sm tabular-nums">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-neutral-300">
                Proprietary <span className="text-xs text-neutral-500">({priceGap.proprietaryCount} models)</span>
              </dt>
              <dd className="text-2xl font-semibold text-neutral-50">${formatNumber(priceGap.proprietary)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-neutral-300">
                Open-weight <span className="text-xs text-neutral-500">({priceGap.openWeightCount} models)</span>
              </dt>
              <dd className="text-2xl font-semibold text-neutral-50">${formatNumber(priceGap.openWeight)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.08] pt-2">
              <dt className="text-neutral-400">Gap</dt>
              <dd className="font-medium text-neutral-100">
                {formatNumber(priceGap.ratio, 1)}×
                <span className="ml-1.5 text-xs font-normal text-neutral-500">proprietary median per 1M tokens</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
