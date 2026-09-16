import { InformationMarketsSection } from "@/components/home/information-markets-section";
import { LiquidChromeSection } from "@/components/home/liquid-chrome-section";
import { MeasurementTaxonomySection } from "@/components/home/measurement-taxonomy-section";
import { NewsSections } from "@/components/home/news-sections";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { loadFrozenUbwiPublication } from "@/lib/ubwi/read/publication-store";
import { ubwiIndexSnapshot } from "@/lib/ubwi/read/surface";
import { loadUcpiHeadline } from "@/lib/ucpi/read/load";
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
  const indices = ubwiRow === null ? INDEX_SNAPSHOTS : [...INDEX_SNAPSHOTS, ubwiRow];

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
