import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { listedReadOptions, loadMarket } from "@/lib/markets/load-market";
import { DEFAULT_MARKET_SYMBOL } from "@/data/mock/market-detail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Information Markets" };

/** The Information Markets workspace, opened on the default market (UCPI). */
export default async function MarketsPage() {
  const market = (await loadMarket(DEFAULT_MARKET_SYMBOL, listedReadOptions()))!;
  return (
    <>
      <SiteHeader />
      <MarketDetailPage key={market.symbol} market={market} />
      <SiteFooter />
    </>
  );
}
