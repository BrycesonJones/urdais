import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { findMarket } from "@/data/mock/market-detail";
import { hydrateMarketWithTokenPrices, tokenResearchPreviewActive } from "@/lib/tokens/read/load";
import { UbwiSection } from "@/components/ubwi/ubwi-section";
import { ubwiSurface } from "@/lib/ubwi/read/surface";
import { loadFrozenUbwiPublication } from "@/lib/ubwi/read/publication-store";

type PageProps = { params: Promise<{ symbol: string }> };

/**
 * This page reads live publication state. Without this declaration Next prerenders it at
 * build time, where no production database is configured, and then serves that snapshot to
 * every visitor forever -- a healthy database behind a permanently blank surface. See
 * docs/operations/production-environments.md.
 */
export const dynamic = "force-dynamic";

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

  // UBWI publishes no series, so the chart page would render a stretched blank above a
  // surface that already carries everything real. It gets its own surface instead: the
  // value where one is published, and the reason plus the full observed/modelled
  // disclosure where none is.
  if (market.symbol === "UBWI") {
    // The frozen point where one exists; null where none does, or where no database is
    // reachable. The surface decides what to render from that -- it never invents a value.
    const publication = await loadFrozenUbwiPublication();
    return (
      <>
        <SiteHeader />
        <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-10 text-neutral-50 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-screen-2xl">
            <UbwiSection surface={ubwiSurface({ publication: publication ?? undefined })} />
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <MarketDetailPage key={market.symbol} market={market} researchPreview={researchPreview} />
      <SiteFooter />
    </>
  );
}
