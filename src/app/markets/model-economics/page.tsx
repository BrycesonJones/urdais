import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ModelEconomicsPage } from "@/components/model-economics/model-economics-page";
import { loadVisibleTokenInstruments, tokenResearchPreviewActive } from "@/lib/tokens/read/load";

export const metadata: Metadata = {
  title: "Model Economics",
  description: "The economics of machine intelligence: token price, volume, market share, and capability.",
};

/** The Model Economics analytical market: not an index route, so it has no symbol. */
export default async function ModelEconomicsRoute() {
  const tokenInstruments = await loadVisibleTokenInstruments();
  const researchPreview = (await tokenResearchPreviewActive()) && tokenInstruments.length > 0;
  return (
    <>
      <SiteHeader />
      <ModelEconomicsPage tokenInstruments={tokenInstruments} researchPreview={researchPreview} />
      <SiteFooter />
    </>
  );
}
