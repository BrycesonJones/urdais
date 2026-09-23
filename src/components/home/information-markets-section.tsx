import Link from "next/link";

import { UcpiSummary } from "@/components/market/ucpi-summary";
import { UrdaisIndices } from "@/components/market/urdais-indices";
import { ChromeRevealText } from "@/components/ui/chrome-reveal-text";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { assembleIndexRail } from "@/lib/market/index-rail";
import type { IndexSnapshot } from "@/types/market";
import { UCPI_INDEX, UCPI_SERIES, UCPI_SNAPSHOT } from "@/data/mock/ucpi";
import type { UcpiHeadline } from "@/lib/ucpi/read/load";
import { MARKETS_HREF, marketIndexHref } from "@/lib/routes";

/**
 * The panel where production is the only permitted source and it has nothing to show.
 *
 * It says so rather than falling back to the fixtures. A stale demo price under a live
 * index is worse than an absent one: the reader cannot tell it is not the market.
 */
function UcpiUnavailable() {
  return (
    <article
      aria-labelledby="ucpi-heading"
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#111111] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(255,255,255,0.03),0_10px_32px_rgba(0,0,0,0.45)] sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id="ucpi-heading" className="text-lg font-semibold tracking-tight text-neutral-50">
          <Link
            href={marketIndexHref(UCPI_INDEX.symbol)}
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-400"
          >
            {UCPI_INDEX.symbol}
          </Link>
        </h3>
        <span className="text-sm text-neutral-400">{UCPI_INDEX.name}</span>
      </div>
      <p className="text-sm text-neutral-500">
        UCPI is unavailable right now. No published value is being shown.
      </p>
    </article>
  );
}

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
export function InformationMarketsSection({
  indices = assembleIndexRail(INDEX_SNAPSHOTS),
  ucpi = null,
  fixturesPermitted = true,
}: {
  /**
   * The watchlist rows. Defaults to the mock snapshots alone, so a render with no
   * props never implies a published production value; the page passes the real UBWI
   * row in when one is frozen. The default is assembled rather than handed over raw, so
   * it cannot present an index the public catalog withholds.
   */
  indices?: IndexSnapshot[];
  /** The released production UCPI headline, or null when production has none. */
  ucpi?: UcpiHeadline | null;
  /**
   * Whether the UCPI fixtures may stand in where production has nothing. The page
   * passes false in production, so a failed or empty production read there shows the
   * panel as unavailable instead of quietly reinstating the Sep-4 demo series. It
   * defaults to true so development, tests and prop-less renders keep the fixtures.
   */
  fixturesPermitted?: boolean;
} = {}) {
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
          {ucpi !== null ? (
            <UcpiSummary
              index={ucpi.index}
              snapshot={ucpi.snapshot}
              series={ucpi.series}
              provenance="production"
            />
          ) : fixturesPermitted ? (
            <UcpiSummary
              index={UCPI_INDEX}
              snapshot={UCPI_SNAPSHOT}
              series={UCPI_SERIES}
              provenance="demo"
            />
          ) : (
            <UcpiUnavailable />
          )}
          <UrdaisIndices indices={indices} />
        </div>
      </div>
    </section>
  );
}
