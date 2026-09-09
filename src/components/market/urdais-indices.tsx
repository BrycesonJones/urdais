import { IndexRow } from "@/components/market/index-row";
import type { IndexSnapshot } from "@/types/market";

/** Secondary rail of Urdais index snapshots, styled like a market watchlist. */
export function UrdaisIndices({ indices }: { indices: IndexSnapshot[] }) {
  return (
    <aside
      aria-labelledby="urdais-indices-heading"
      className="rounded-xl border border-neutral-200 bg-white p-5 sm:p-6"
    >
      <h3 id="urdais-indices-heading" className="text-lg font-semibold tracking-tight text-neutral-950">
        Urdais Indices
      </h3>
      <ul className="mt-2 divide-y divide-neutral-200">
        {indices.map((index) => (
          <IndexRow key={index.symbol} index={index} />
        ))}
      </ul>
    </aside>
  );
}
