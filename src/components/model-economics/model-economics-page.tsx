import { MarketShareChart } from "@/components/model-economics/market-share-chart";
import { ModelFrontierChart } from "@/components/model-economics/model-frontier-chart";
import { OpenWeightAnalysis } from "@/components/model-economics/open-weight-analysis";
import { TokenPriceSection } from "@/components/model-economics/token-price-section";
import { UtviSection } from "@/components/model-economics/utvi-section";
import type { MarketInstrumentDetail } from "@/types/market";
import type { MarketShareView } from "@/lib/market-share/view";
import type { UtviInstrumentView } from "@/lib/utvi/read/instrument";

const SECTIONS = [
  { id: "price", label: "Price" },
  { id: "volume", label: "Volume" },
  { id: "share", label: "Share" },
  { id: "frontier", label: "Frontier" },
  { id: "open-weight", label: "Open-weight" },
] as const;

/**
 * Model Economics: the deeper analytical view of the model economy. Five
 * derived views stacked as full-width sections separated by hairlines, with
 * anchor navigation beneath the introduction. Token Price, Observed Token
 * Volume and Market Share read production; the Frontier and the open-weight
 * analytics are still one deterministic demo data graph, and the badge says
 * which is which. The quick model-level token-price view remains inside
 * UCPI; this page is its deeper destination.
 */
export function ModelEconomicsPage({
  tokenInstruments = [],
  utvi = null,
  marketShare = null,
  researchPreview = false,
}: {
  tokenInstruments?: readonly MarketInstrumentDetail[];
  utvi?: UtviInstrumentView | null;
  marketShare?: MarketShareView | null;
  researchPreview?: boolean;
}) {
  return (
    <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-6 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl">
        <header>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 md:text-4xl">Model Economics</h1>
            {/* Token Price, Observed Token Volume and Market Share are production. Frontier and
                Open-weight are not, so the badge names them rather than the page: a page-level
                "Demo data" would now be false about three sections, and removing it entirely
                would be false about two. */}
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              Frontier and Open-weight are demo data
            </span>
          </div>
          <p className="mt-2 text-base text-neutral-300 md:text-lg">The economics of machine intelligence.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Price, consumption, market share, and capability across the model economy.
          </p>
        </header>

        <nav aria-label="Sections" className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex items-center gap-x-6 whitespace-nowrap border-b border-white/10 font-mono text-[11px] uppercase tracking-[0.2em]">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-block border-b border-transparent pb-3 text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-10 flex flex-col gap-14">
          <TokenPriceSection instruments={tokenInstruments} researchPreview={researchPreview} />
          <UtviSection view={utvi} />
          <MarketShareChart view={marketShare} />
          <ModelFrontierChart />
          <OpenWeightAnalysis />
        </div>
      </div>
    </main>
  );
}
