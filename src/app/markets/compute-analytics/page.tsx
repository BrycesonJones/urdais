import type { Metadata } from "next";

import { ComputeAnalyticsPage } from "@/components/compute-analytics/compute-analytics-page";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { loadComputeEconomicsReadModel } from "@/lib/compute-economics/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compute Economics",
  description: "Model accelerator payback from current production Urdais compute prices and explicit scenario assumptions.",
};

/** Compute Economics is an analytical product, not an index route. */
export default async function ComputeAnalyticsRoute() {
  const model = await loadComputeEconomicsReadModel();
  return (
    <>
      <SiteHeader />
      <ComputeAnalyticsPage model={model} />
      <SiteFooter />
    </>
  );
}
