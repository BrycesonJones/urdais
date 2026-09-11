import type { Metadata } from "next";

import { ComputeAnalyticsPage } from "@/components/compute-analytics/compute-analytics-page";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Compute Analytics",
  description: "The economics of computational infrastructure: GPU-hour forward pricing, fleet utilization, and hardware payback.",
};

/** The Compute Analytics analytical market: not an index route, so it has no symbol. */
export default function ComputeAnalyticsRoute() {
  return (
    <>
      <SiteHeader />
      <ComputeAnalyticsPage />
      <SiteFooter />
    </>
  );
}
