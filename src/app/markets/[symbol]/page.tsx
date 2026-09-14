import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { findMarket } from "@/data/mock/market-detail";
import { hydrateMarketWithTokenPrices, tokenResearchPreviewActive } from "@/lib/tokens/read/load";

type PageProps = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const market = findMarket((await params).symbol);
  return market ? { title: `${market.symbol} · ${market.name}` } : { title: "Not found" };
}

/** Detail page for one routed Urdais market; unknown symbols are a 404. */
export default async function MarketIndexPage({ params }: PageProps) {
  const found = findMarket((await params).symbol);
  if (!found) notFound();
  const market = await hydrateMarketWithTokenPrices(found);
  const researchPreview =
    (await tokenResearchPreviewActive()) &&
    (market.families.find((family) => family.id === "tokens")?.instruments.length ?? 0) > 0;

  return (
    <>
      <SiteHeader />
      <MarketDetailPage key={market.symbol} market={market} researchPreview={researchPreview} />
      <SiteFooter />
    </>
  );
}
