import { LiquidChromeSection } from "@/components/home/liquid-chrome-section";
import { InformationMarketsSection } from "@/components/home/information-markets-section";
import { SiteHeader } from "@/components/layout/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <LiquidChromeSection />
        <InformationMarketsSection />
      </main>
    </>
  );
}
