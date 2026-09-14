import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { DEFAULT_MARKET_SYMBOL, findMarket } from "@/data/mock/market-detail";
import { hydrateMarketWithTokenPrices, tokenResearchPreviewActive } from "@/lib/tokens/read/load";

/**
 * Rendered per request, never prerendered.
 *
 * This page reads the frozen Token Price benchmarks out of the database. Next
 * will happily prerender it at build time, where there is no production
 * database to read, and then serve that build-time snapshot to every visitor:
 * a permanently blank surface that no amount of correct data can fix, because
 * the page is never asked again. That is exactly how a healthy database and a
 * blank public page coexisted.
 */
export const dynamic = "force-dynamic";

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
