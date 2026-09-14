import Link from "next/link";

import type { MarketInstrumentDetail } from "@/types/market";

type ListedMarketMetaProps = {
  instrument: MarketInstrumentDetail;
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Compact listed-GPU status, source, and methodology strip. The long-form
 * methodology lives on the linked specification pages.
 */
export function ListedMarketMeta({ instrument }: ListedMarketMetaProps) {
  const listed = instrument.listed;
  if (!listed) return null;
  const breadth = listed.breadth ? `${titleCase(listed.breadth)} breadth` : null;

  return (
    <section aria-label="Listed market status" className="mt-8 max-w-3xl text-sm text-neutral-400">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Status</dt>
          <dd className="mt-1 text-neutral-200">{listed.statusLabel}</dd>
        </div>
        {breadth && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Breadth</dt>
            <dd className="mt-1 text-neutral-200">{breadth}</dd>
          </div>
        )}
        {listed.status !== "no_calculation" && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Participants</dt>
            <dd className="mt-1 text-neutral-200">
              {listed.participantCount}
              {listed.status === "unavailable" ? ` of ${listed.minimumParticipants} required` : ""}
            </dd>
          </div>
        )}
        {listed.technicalSourceCount > 0 && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Sources</dt>
            <dd className="mt-1 text-neutral-200">{listed.technicalSourceCount}</dd>
          </div>
        )}
        {listed.asOfDate && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">As of</dt>
            <dd className="mt-1 text-neutral-200">{listed.asOfDate}</dd>
          </div>
        )}
        {listed.unavailableReason && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Reason</dt>
            <dd className="mt-1 text-neutral-200">{listed.unavailableReason}</dd>
          </div>
        )}
        {listed.largestSourceShare !== null && listed.status !== "unavailable" && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Source concentration</dt>
            <dd className="mt-1 text-neutral-200">{Math.round(listed.largestSourceShare * 100)}%</dd>
          </div>
        )}
      </dl>

      {listed.attributions.length > 0 && (
        <p className="mt-4 text-neutral-400">{listed.attributions.join(" · ")}</p>
      )}

      <p className="mt-3">
        <Link href={listed.familyMethodologyHref} className="text-neutral-300 underline decoration-white/20 underline-offset-4 hover:text-neutral-100">
          Listed GPU methodology
        </Link>
        <span className="text-neutral-600"> · </span>
        <Link href={listed.childMethodologyHref} className="text-neutral-300 underline decoration-white/20 underline-offset-4 hover:text-neutral-100">
          {instrument.shortLabel} specification
        </Link>
      </p>

      <p className="mt-3 text-xs text-neutral-500">{listed.caveat}</p>
    </section>
  );
}
