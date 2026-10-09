import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ComputeAnalyticsPage } from "@/components/compute-analytics/compute-analytics-page";
import { TrackProductView } from "@/components/analytics/track-product-view";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PremiumLockedPage } from "@/components/premium/premium-locked-page";
import { COMPUTE_ANALYTICS_HREF } from "@/lib/routes";
import { loadComputeEconomicsReadModel } from "@/lib/compute-economics/load";
import { resolvePremiumGate } from "@/lib/access/server";

export const dynamic = "force-dynamic";

const TITLE = "Compute Economics";
const DESCRIPTION =
  "Model accelerator payback from current production Urdais compute prices and explicit scenario assumptions.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
};

/**
 * Compute Economics is an analytical product, not an index route.
 *
 * ## The gate runs before the loader, and that ordering is the security boundary
 *
 * `resolvePremiumGate` is awaited first and `loadComputeEconomicsReadModel` is
 * only reached on the allowed branch. That is not a stylistic preference. In the
 * App Router, anything a Server Component loads is serialised into the RSC payload
 * the browser receives, so the obvious implementation —
 *
 *     const model = await loadComputeEconomicsReadModel();
 *     return denied ? <Locked model={model} /> : <Product model={model} />;
 *
 * — ships every price to a reader who was refused, behind a CSS blur they can
 * remove with developer tools. Here a denied reader's request never calls the
 * loader at all: no database query runs, and there is no model to serialise.
 * `compute-analytics-gate.test.tsx` asserts the loader is not invoked.
 *
 * When enforcement is inactive — the current production state — the gate returns
 * immediately without resolving a viewer, and this page behaves exactly as it did
 * before Phase 3: one loader call, no auth round trip.
 */
export default async function ComputeAnalyticsRoute() {
  const gate = await resolvePremiumGate("compute_economics");

  if (!gate.allowed) {
    // An unregistered product id is a bug or a probe, never an upsell: there is
    // nothing to subscribe to, so it is a not-found condition.
    if (gate.reason === "unknown_product") notFound();

    return (
      <>
        <SiteHeader />
        <TrackProductView productId="compute_economics" locked />
        <PremiumLockedPage title={TITLE} description={DESCRIPTION} reason={gate.reason} returnTo={COMPUTE_ANALYTICS_HREF} productId="compute_economics" />
        <SiteFooter />
      </>
    );
  }

  const model = await loadComputeEconomicsReadModel();
  return (
    <>
      <SiteHeader />
      <TrackProductView productId="compute_economics" />
      <ComputeAnalyticsPage model={model} />
      <SiteFooter />
    </>
  );
}
