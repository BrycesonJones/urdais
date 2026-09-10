import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { findMarket } from "@/data/mock/market-detail";

type PageProps = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const market = findMarket((await params).symbol);
  return market ? { title: `${market.symbol} · ${market.name}` } : { title: "Not found" };
}

/** Detail page for one routed Urdais market; unknown symbols are a 404. */
export default async function MarketIndexPage({ params }: PageProps) {
  const market = findMarket((await params).symbol);
  if (!market) notFound();

  return (
    <>
      <SiteHeader />
      <MarketDetailPage key={market.symbol} market={market} />
      <SiteFooter />
    </>
  );
}
