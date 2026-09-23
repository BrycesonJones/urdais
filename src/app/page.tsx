import { InformationMarketsSection } from "@/components/home/information-markets-section";
import { LiquidChromeSection } from "@/components/home/liquid-chrome-section";
import { MeasurementTaxonomySection } from "@/components/home/measurement-taxonomy-section";
import { NewsSections } from "@/components/home/news-sections";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { assembleIndexRail } from "@/lib/market/index-rail";
import { UMPI_WATCHLIST_ROW } from "@/lib/umpi/read/watchlist";
import { loadFrozenUbwiPublication } from "@/lib/ubwi/read/publication-store";
import { ubwiIndexSnapshot } from "@/lib/ubwi/read/surface";
import { loadUcpiHeadline } from "@/lib/ucpi/read/load";
import { loadUtviInstrumentView } from "@/lib/utvi/read/surface";
import { utviIndexSnapshot } from "@/lib/utvi/read/watchlist";
import { isProductionRuntime } from "@/lib/tokens/read/publication";

/**
 * The Compute news rail and the UBWI watchlist row read production data, so the
 * page is rendered per request. Without this it would serve whatever the store
 * held at build time, for as long as the build lived.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // UBWI is the one index on this page with a real published value. Its row comes from
  // the frozen production publication, never from the mock dataset; when nothing is
  // published there is simply no UBWI row, which is why this is a concat and not a
  // placeholder. The other indices remain mock data for now.
  const ubwiRow = ubwiIndexSnapshot(await loadFrozenUbwiPublication());
  // UTVI is the second index here with a real published value, and the only one whose row links
  // somewhere other than a `/markets/{symbol}` page: its canonical presentation is the Volume
  // section of Model Economics, and the rail follows the destination on its catalog entry. Read
  // sequentially for the reason the others are -- these share the process-wide pooled executor,
  // and running them concurrently lets whichever finishes first tear the pool out from under the
  // rest. No publication, or a failed read, means no row rather than an invented token count.
  const utviRow = utviIndexSnapshot(await loadUtviInstrumentView());
  // UMPI joins from its own module: it publishes, but as two series with no composite, so it has
  // no single level for a rail row. Its old row took the HBM3E demo walk's value and unit; that
  // instrument is gone, and no number replaces it.
  // UGAI, UAVI and UACI are absent by product decision, not by data state: they are not presented
  // as products, so `assembleIndexRail` drops any row offered for them. See the
  // `publiclyPresented` flag in @/data/market-catalog.
  const base = [...INDEX_SNAPSHOTS, UMPI_WATCHLIST_ROW];
  const indices = assembleIndexRail([...base, utviRow, ubwiRow].filter((row) => row !== null));

  // The UCPI panel now reads the same released listed-GPU children the UCPI market page
  // shows, so the two surfaces cannot disagree. Sequential for the reason the UBWI
  // loaders are: these share the process-wide pooled executor.
  const ucpi = await loadUcpiHeadline();

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <LiquidChromeSection />
        <InformationMarketsSection
          indices={indices}
          ucpi={ucpi}
          fixturesPermitted={!isProductionRuntime(process.env)}
        />
        <NewsSections />
        <MeasurementTaxonomySection />
      </main>
      <SiteFooter />
    </>
  );
}
