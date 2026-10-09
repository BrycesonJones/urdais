"use client";

import { useEffect, useRef } from "react";

import type { UrdaisProductId } from "@/lib/access/products";
import { track } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS, categoryViewEvent, productProperties } from "@/lib/analytics/events";

/**
 * Records that a reader opened a Urdais product: `product_viewed`, plus the
 * category's own event (`index_viewed`, `analytics_viewed` or `map_viewed`).
 *
 * Rendered by the product's page, on the branch that actually rendered — so a 404
 * records nothing, and a premium page records whether the reader saw the product or
 * its gate (`locked`). Renders nothing.
 *
 * Once per product per mount. The ref survives React Strict Mode's simulated
 * remount, and a client-side move to a different product (one index page to
 * another) changes `productId` and records the new one.
 *
 * `$pageview` is PostHog's, not this component's: see `src/instrumentation-client.ts`.
 */
export function TrackProductView({ productId, locked = false }: { productId: UrdaisProductId; locked?: boolean }) {
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    const key = `${productId}:${locked}`;
    if (recorded.current === key) return;
    recorded.current = key;

    const product = productProperties(productId);
    if (!product) return;
    const properties = { ...product, locked, source_page: window.location.pathname };
    track(ANALYTICS_EVENTS.productViewed, properties);
    const categoryEvent = categoryViewEvent(product.product_category);
    if (categoryEvent) track(categoryEvent, properties);
  }, [productId, locked]);

  return null;
}
