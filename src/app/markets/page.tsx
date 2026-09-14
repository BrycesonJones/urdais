import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { DEFAULT_MARKET_SYMBOL, findMarket } from "@/data/mock/market-detail";
import { hydrateMarketWithTokenPrices, tokenResearchPreviewActive } from "@/lib/tokens/read/load";

export const metadata: Metadata = { title: "Information Markets" };

/** The Information Markets workspace, opened on the default market (UCPI). */
export default async function MarketsPage() {
  const market = await hydrateMarketWithTokenPrices(findMarket(DEFAULT_MARKET_SYMBOL)!);
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
