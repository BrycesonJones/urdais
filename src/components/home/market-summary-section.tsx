import { UcpiSummary } from "@/components/market/ucpi-summary";
import { UrdaisIndices } from "@/components/market/urdais-indices";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { UCPI_INDEX, UCPI_SERIES, UCPI_SNAPSHOT } from "@/data/mock/ucpi";

/**
 * The structured market surface that rises into the bottom of the Liquid
 * Chrome hero. The negative top margin creates the overlap; the section sits
 * above the hero in stacking order, is explicitly dark (a terminal-style
 * surface continuing the hero's palette) regardless of colour scheme, and
 * carries the page's large architectural top radius.
 */
export function MarketSummarySection() {
  return (
    <section
      aria-labelledby="market-summary-heading"
      className="relative z-10 -mt-10 flex-1 rounded-t-[32px] border-t border-neutral-800 bg-[#0a0a0a] px-4 pb-16 pt-8 text-neutral-50 shadow-[0_-8px_32px_rgba(0,0,0,0.45)] sm:px-6 md:-mt-16 md:rounded-t-[36px] md:pt-10 lg:-mt-24 lg:px-8"
    >
      <div className="mx-auto max-w-screen-2xl">
        <h2
          id="market-summary-heading"
          className="text-2xl font-semibold tracking-tight md:text-3xl"
        >
          Market summary
          <span aria-hidden="true" className="ml-1 text-neutral-600">
            ›
          </span>
        </h2>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <UcpiSummary index={UCPI_INDEX} snapshot={UCPI_SNAPSHOT} series={UCPI_SERIES} />
          <UrdaisIndices indices={INDEX_SNAPSHOTS} />
        </div>
      </div>
    </section>
  );
}
