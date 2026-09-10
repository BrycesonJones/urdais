import { IndexRow } from "@/components/market/index-row";
import type { IndexSnapshot } from "@/types/market";

/** Secondary rail of Urdais index snapshots, styled like a market watchlist. */
export function UrdaisIndices({ indices }: { indices: IndexSnapshot[] }) {
  return (
    <aside
      aria-labelledby="urdais-indices-heading"
      className="rounded-xl border border-white/10 bg-[#111111] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.02),0_8px_28px_rgba(0,0,0,0.4),0_0_30px_rgba(82,111,224,0.11)] transition-colors hover:border-white/15 sm:p-6"
    >
      <h3 id="urdais-indices-heading" className="text-lg font-semibold tracking-tight text-neutral-50">
        Urdais Indices
      </h3>
      <ul className="mt-2 divide-y divide-neutral-800">
        {indices.map((index) => (
          <IndexRow key={index.symbol} index={index} />
        ))}
      </ul>
    </aside>
  );
}
