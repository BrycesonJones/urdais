import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ModelEconomicsPage } from "@/components/model-economics/model-economics-page";
import { loadMarketShareView } from "@/lib/market-share/surface";
import { loadModelFrontierView } from "@/lib/frontier/read/surface";
import { loadOpenWeightView } from "@/lib/open-weight/surface";
import { loadVisibleTokenInstruments, tokenResearchPreviewActive } from "@/lib/tokens/read/load";
import { loadUtviInstrumentView } from "@/lib/utvi/read/surface";

/**
 * Rendered per request, never prerendered.
 *
 * This page reads the frozen Token Price benchmarks, UTVI, Market Share, the
 * Model Frontier and the open-weight comparison out of the database. Next will happily prerender it at build time, where there is
 * no production database to read, and then serve that build-time snapshot to
 * every visitor:
 * a permanently blank surface that no amount of correct data can fix, because
 * the page is never asked again. That is exactly how a healthy database and a
 * blank public page coexisted.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model Economics",
  description: "The economics of machine intelligence: token price, volume, market share, and capability.",
};

/** The Model Economics analytical market: not an index route, so it has no symbol. */
export default async function ModelEconomicsRoute() {
  const tokenInstruments = await loadVisibleTokenInstruments();
  const researchPreview = (await tokenResearchPreviewActive()) && tokenInstruments.length > 0;
  const utvi = await loadUtviInstrumentView();
  const marketShare = await loadMarketShareView();
  const frontier = await loadModelFrontierView();
  const openWeight = await loadOpenWeightView();
  return (
    <>
      <SiteHeader />
      <ModelEconomicsPage
        tokenInstruments={tokenInstruments}
        utvi={utvi}
        marketShare={marketShare}
        frontier={frontier}
        openWeight={openWeight}
        researchPreview={researchPreview}
      />
      <SiteFooter />
    </>
  );
}
