import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { isPubliclyListed } from "@/data/market-catalog";
import { findMarket } from "@/data/mock/market-detail";
import { hydrateMarketWithTokenPrices, tokenResearchPreviewActive } from "@/lib/tokens/read/load";
import { hydrateMarketWithListedCompute } from "@/lib/ucpi/read/load";
import { hydrateMarketWithWholesalePower } from "@/lib/uepi/read/surface";
import { UbwiSection } from "@/components/ubwi/ubwi-section";
import { UaviSection } from "@/components/uavi/uavi-section";
import { UgaiSection } from "@/components/ugai/ugai-section";
import { UmpiSection } from "@/components/umpi/umpi-section";
import { loadUmpiSurface } from "@/lib/umpi/read/surface";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUgaiReadModel, loadUgaiSeries } from "@/lib/ugai/read/load";
import { unconfiguredUgaiReadModel, type UgaiSeriesPoint } from "@/lib/ugai/read/read-model";
import { loadUaviReadModel, loadUaviSeries } from "@/lib/uavi/read/load";
import { unconfiguredUaviReadModel, type UaviSeriesPoint } from "@/lib/uavi/read/read-model";
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
  // The same gate as the page, so metadata cannot announce a product the route will not serve.
  // Titling the tab "UACI · Urdais Chip & Accelerator Index" and then 404ing would put the
  // product in front of a reader, a link preview and a crawler anyway.
  const market = publicMarket((await params).symbol);
  return market ? { title: `${market.symbol} · ${market.name}` } : { title: "Not found" };
}

/**
 * The market behind a public route, or undefined.
 *
 * Two ways to be absent, one answer. An unknown symbol has never existed. A withheld one exists
 * in the registry but is not presented as a current Urdais product: UPPI, whose production is
 * DEFERRED_PENDING_DATA_RIGHTS per `docs/research/photonics/ph-3-closeout.md`; UGAI and UAVI,
 * which have never published an observation; UACI, which has only ever shown a demo walk. Their
 * backends, datasets and methodology documents are untouched -- they are simply not on sale, and
 * a public page saying "not yet live" is a product page all the same. A reader arriving at any of
 * those URLs gets this route's established behaviour for an unavailable product, a 404, rather
 * than a placeholder describing a product Urdais does not publish.
 *
 * The gate asks the catalog entry's own publication state, so hiding or restoring an index is one
 * flag in one place and no symbol is named here.
 */
function publicMarket(symbol: string) {
  const market = findMarket(symbol);
  return market && isPubliclyListed(market.symbol) ? market : undefined;
}

/** Detail page for one routed Urdais market; unknown and withheld symbols alike are a 404. */
export default async function MarketIndexPage({ params }: PageProps) {
  const found = publicMarket((await params).symbol);
  if (!found) notFound();
  // The same hydrations /markets performs, in the same order. This route used to run
  // only the token one, so /markets served the live listed-GPU children while
  // /markets/ucpi -- the page the homepage links to -- served the mock Compute family.
  //
  // Each leaves every family but its own alone, and they run sequentially rather than
  // concurrently: they share the process-wide pooled executor, and whichever finished first
  // would tear the pool out from under the others -- which renders as a healthy database behind
  // a surface that says nothing is published.
  const market = await hydrateMarketWithWholesalePower(
    await hydrateMarketWithListedCompute(await hydrateMarketWithTokenPrices(found)),
  );
  const researchPreview =
    (await tokenResearchPreviewActive()) &&
    (market.families.find((family) => family.id === "tokens")?.instruments.length ?? 0) > 0;

  // UBWI does not use the generic market chart page: that page is built around a
  // continuously quoted instrument with an intraday tail, and UBWI publishes once per UTC
  // day. It gets its own surface instead -- the value where one is published, the reason
  // plus the full observed/modelled disclosure where none is, and its own chart drawn
  // only from frozen production publications.
  // The UGAI and UAVI branches below are currently unreachable: neither index is publicly
  // presented, so the guard above has already 404'd. They are kept rather than deleted because
  // the surfaces themselves are finished work, and restoring either product is then a single
  // `publiclyPresented` flag rather than a rebuild.
  //
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

  // UAVI does not use the generic market chart page, for the same reason UGAI does not and one
  // more of its own. It has never published an observation, so the generic page's snapshot,
  // movement and chart would all have to be invented -- and the invention it previously carried
  // was a seeded mean-reverting walk around 30 points presented as "27.84 pts". On a volatility
  // index that is worse than an arbitrary level on a price index: a reader has no external anchor
  // for what AI-equity implied volatility should be, so a plausible figure is indistinguishable
  // from a real one and a year of plausible history invites the comparison it cannot support.
  if (market.symbol === "UAVI") {
    const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
    let model = unconfiguredUaviReadModel();
    let series: UaviSeriesPoint[] = [];
    if (databaseUrl) {
      const sql = await createTokenSqlExecutor(databaseUrl);
      try {
        model = await loadUaviReadModel(sql);
        series = [...(await loadUaviSeries(sql)).points];
      } catch (error) {
        // A failed read is not a licence to invent a level.
        console.error(
          `uavi page: load failed (${error instanceof Error ? error.message : String(error)})`,
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
            <UaviSection model={model} series={series} />
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  // UMPI does not use the generic market chart page either, and for two reasons at once. It is
  // monthly, so the page's daily vocabulary -- a "today" change, 1D and 1W ranges, a day-stamped
  // axis -- would describe it wrongly at every turn. And it has no composite: V1 is two series
  // measuring different economic objects, and the generic page is built around one headline
  // instrument, which is precisely the number UMPI must not invent. Its own surface shows both
  // series separately, each with its own base, source and caveat.
  if (market.symbol === "UMPI") {
    // Fails closed inside the loader: no database, an unreachable one, or a payload that fails
    // its own contract all return a model with no points and a stated reason. The demo memory
    // market this replaced is not reachable from here.
    const model = await loadUmpiSurface();
    return (
      <>
        <SiteHeader />
        <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 pb-16 pt-10 text-neutral-50 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-screen-2xl">
            <UmpiSection model={model} />
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
