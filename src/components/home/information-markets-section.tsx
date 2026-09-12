import Link from "next/link";

import { UcpiSummary } from "@/components/market/ucpi-summary";
import { UrdaisIndices } from "@/components/market/urdais-indices";
import { ChromeRevealText } from "@/components/ui/chrome-reveal-text";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { UCPI_INDEX, UCPI_SERIES, UCPI_SNAPSHOT } from "@/data/mock/ucpi";
import { MARKETS_HREF } from "@/lib/routes";

/**
 * Information Markets: the structured, near-black data surface that rises
 * into the bottom of the Liquid Chrome hero. The negative top margin creates
 * the overlap and the section sits above the hero in stacking order. There is
 * no outer shell: the background fades in over its first 40px (64px from md)
 * so the chrome dissolves into a stable dark surface instead of meeting a
 * hard edge. The heading sits inside the tail of that fade, and its text is
 * rendered once out of the hero's chrome material (ChromeRevealText, in
 * step with the hero title's own pass), so the section reads as a
 * continuation of the hero rather than a new block.
 * The surface is explicitly dark regardless of colour scheme.
 */
export function InformationMarketsSection() {
  return (
    <section
      aria-labelledby="information-markets-heading"
      className="relative z-10 -mt-16 bg-[linear-gradient(to_bottom,rgba(10,10,10,0),#0a0a0a_40px)] px-4 pb-16 pt-8 text-neutral-50 sm:px-6 md:-mt-28 md:bg-[linear-gradient(to_bottom,rgba(10,10,10,0),#0a0a0a_64px)] md:pt-10 lg:-mt-40 lg:px-8 lg:pt-12"
    >
      <div className="mx-auto max-w-screen-2xl">
        <h2
          id="information-markets-heading"
          className="text-2xl font-semibold tracking-tight md:text-3xl"
        >
          <Link
            href={MARKETS_HREF}
            className="group inline-flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-400"
          >
            <ChromeRevealText>Information Markets</ChromeRevealText>
            <span
              aria-hidden="true"
              className="text-neutral-600 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-neutral-300 group-focus-visible:text-neutral-300"
            >
              ›
            </span>
          </Link>
        </h2>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <UcpiSummary index={UCPI_INDEX} snapshot={UCPI_SNAPSHOT} series={UCPI_SERIES} />
          <UrdaisIndices indices={INDEX_SNAPSHOTS} />
        </div>
      </div>
    </section>
  );
}
