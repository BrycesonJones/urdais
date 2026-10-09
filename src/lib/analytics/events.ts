/**
 * The custom analytics events Urdais sends, and their properties.
 *
 * Deliberately small. PostHog already captures pageviews, page leaves, clicks,
 * referrers, UTM parameters and landing pages on its own; an event belongs here
 * only when it records something autocapture cannot see reliably — which product a
 * page *is*, whether it was locked, and the subscription funnel.
 *
 * Every property is low-cardinality and none identifies a person. Product facts
 * come from the access registry (`@/lib/access/products`), so a product's name and
 * tier in analytics cannot drift from the ones that gate it.
 */

import { findProduct, type UrdaisProductId } from "@/lib/access/products";

export const ANALYTICS_EVENTS = Object.freeze({
  productViewed: "product_viewed",
  indexViewed: "index_viewed",
  analyticsViewed: "analytics_viewed",
  mapViewed: "map_viewed",
  premiumCtaClicked: "premium_cta_clicked",
  checkoutStarted: "checkout_started",
  subscriptionCompleted: "subscription_completed",
} as const);

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type ProductCategory = "index" | "analytics" | "map" | "docs";

export type ProductProperties = {
  readonly product_id: UrdaisProductId;
  readonly product_name: string;
  readonly product_category: ProductCategory;
  /** The product's access class: `public` or `premium`. Not the reader's entitlement. */
  readonly access_tier: "public" | "premium";
};

const ANALYTICAL_PRODUCTS: readonly UrdaisProductId[] = ["model_economics", "compute_economics", "power_analytics"];

function categoryFor(id: UrdaisProductId): ProductCategory {
  if (id.startsWith("market_")) return "index";
  if (ANALYTICAL_PRODUCTS.includes(id)) return "analytics";
  if (id === "map" || id.startsWith("map_")) return "map";
  return "docs";
}

/** The registry's facts about a product, as event properties. Null for an unknown id. */
export function productProperties(id: UrdaisProductId): ProductProperties | null {
  const product = findProduct(id);
  if (!product) return null;
  return {
    product_id: product.id,
    product_name: product.name,
    product_category: categoryFor(product.id),
    access_tier: product.accessClass,
  };
}

/** The category-specific view event that accompanies `product_viewed`, if there is one. */
export function categoryViewEvent(category: ProductCategory): AnalyticsEventName | null {
  switch (category) {
    case "index":
      return ANALYTICS_EVENTS.indexViewed;
    case "analytics":
      return ANALYTICS_EVENTS.analyticsViewed;
    case "map":
      return ANALYTICS_EVENTS.mapViewed;
    case "docs":
      return null;
  }
}
