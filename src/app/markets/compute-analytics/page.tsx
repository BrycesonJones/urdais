import type { Metadata } from "next";

import { ComputeAnalyticsPage } from "@/components/compute-analytics/compute-analytics-page";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { capacitySurface } from "@/lib/capacity/read/surface";

export const metadata: Metadata = {
  title: "Compute Analytics",
  description:
    "The economics of computational infrastructure: GPU-hour forward pricing, observed available capacity, and hardware payback.",
};

/**
 * This page reads live observation state for the capacity section. Without this
 * declaration Next prerenders it at build time, where no production database is
 * configured, and serves that snapshot forever. See
 * docs/operations/production-environments.md.
 */
export const dynamic = "force-dynamic";

/** The Compute Analytics analytical market: not an index route, so it has no symbol. */
export default async function ComputeAnalyticsRoute() {
  const capacity = await capacitySurface();
  return (
    <>
      <SiteHeader />
      <ComputeAnalyticsPage capacity={capacity} />
      <SiteFooter />
    </>
  );
}
