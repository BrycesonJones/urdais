import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { findMarket } from "@/data/mock/market-detail";
import { hydrateMarketWithTokenPrices, tokenResearchPreviewActive } from "@/lib/tokens/read/load";
import { hydrateMarketWithListedCompute } from "@/lib/ucpi/read/load";
import { UbwiSection } from "@/components/ubwi/ubwi-section";
import { UgaiSection } from "@/components/ugai/ugai-section";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUgaiReadModel, loadUgaiSeries } from "@/lib/ugai/read/load";
import { unconfiguredUgaiReadModel, type UgaiSeriesPoint } from "@/lib/ugai/read/read-model";
import { ubwiSurface } from "@/lib/ubwi/read/surface";
import { loadFrozenUbwiPublication } from "@/lib/ubwi/read/publication-store";
import {
  loadFrozenUbwiHistory,
  ubwiCurrentRegimePoints,
  ubwiSeriesPoints,
} from "@/lib/ubwi/read/publication-history";

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
  // The same two hydrations /markets performs, in the same order. This route used to run
  // only the token one, so /markets served the live listed-GPU children while
  // /markets/ucpi -- the page the homepage links to -- served the mock Compute family.
  const market = await hydrateMarketWithListedCompute(await hydrateMarketWithTokenPrices(found));
  const researchPreview =
    (await tokenResearchPreviewActive()) &&
    (market.families.find((family) => family.id === "tokens")?.instruments.length ?? 0) > 0;

  // UBWI does not use the generic market chart page: that page is built around a
  // continuously quoted instrument with an intraday tail, and UBWI publishes once per UTC
  // day. It gets its own surface instead -- the value where one is published, the reason
  // plus the full observed/modelled disclosure where none is, and its own chart drawn
  // only from frozen production publications.
  // UGAI does not use the generic market chart page either, and for a stronger reason than
  // UBWI's: it has never published an observation, so the generic page's snapshot, movement and
  // chart would all have to come from somewhere, and the only somewhere available is invention.
  // Its own surface shows the level where one is published and says plainly where none is.
  if (market.symbol === "UGAI") {
    const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
    // No database reachable renders exactly the not-initialized surface, which is also the true
    // state -- there is no cached level to fall back to and no mock path to reach for.
    let model = unconfiguredUgaiReadModel();
    let series: UgaiSeriesPoint[] = [];
    if (databaseUrl) {
      const sql = await createTokenSqlExecutor(databaseUrl);
      try {
        model = await loadUgaiReadModel(sql);
        series = [...(await loadUgaiSeries(sql)).points];
      } catch (error) {
        // A failed read is not a licence to invent a level. The surface renders its
        // not-initialized state, which is what a reader should see when Urdais cannot answer.
        console.error(
          `ugai page: load failed (${error instanceof Error ? error.message : String(error)})`,
        );
      } finally {
        await sql.end();
      }
    }
    return (
      <>
        <SiteHeader />
        <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-10 text-neutral-50 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-screen-2xl">
            <UgaiSection model={model} series={series} />
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  if (market.symbol === "UBWI") {
    // The frozen point where one exists; null where none does, or where no database is
    // reachable. The surface decides what to render from that -- it never invents a value.
    // Sequential, deliberately. Both loaders take the process-wide pooled executor for
    // this url and close it when they finish, so running them concurrently lets whichever
    // returns first tear the pool out from under the other -- which renders as a healthy
    // database behind a surface that says nothing is published.
    const publication = await loadFrozenUbwiPublication();
    const history = await loadFrozenUbwiHistory();
    // The current methodology/residual regime only. The chart never joins two definitions
    // into one line, for the same reason the headline change refuses to measure across
    // them. With one regime published this is the whole history.
    const points = ubwiSeriesPoints(ubwiCurrentRegimePoints(history));
    return (
      <>
        <SiteHeader />
        <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-10 text-neutral-50 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-screen-2xl">
            <UbwiSection
              surface={ubwiSurface({ publication: publication ?? undefined })}
              history={points}
            />
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
