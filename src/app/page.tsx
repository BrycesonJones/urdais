import { InformationMarketsSection } from "@/components/home/information-markets-section";
import { LiquidChromeSection } from "@/components/home/liquid-chrome-section";
import { MeasurementTaxonomySection } from "@/components/home/measurement-taxonomy-section";
import { NewsSections } from "@/components/home/news-sections";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <LiquidChromeSection />
        <InformationMarketsSection />
        <NewsSections />
        <MeasurementTaxonomySection />
      </main>
      <SiteFooter />
    </>
  );
}
