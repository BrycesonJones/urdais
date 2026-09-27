/**
 * The product access registry: which Urdais products are public and which
 * require the premium entitlement.
 *
 * This file is the **only** place an access class is declared. Nothing else in
 * the codebase may carry a list of premium products, a `isPremium` boolean on a
 * catalog entry, or an inline comparison against a product name. A second list
 * is how a product ends up gated on one surface and open on another, which is
 * both a revenue leak and a support ticket, so the invariant is enforced by
 * test rather than by convention: see `products.test.ts`.
 *
 * ## What a product is here
 *
 * A *product* is a thing a reader can be granted or denied, not a page and not
 * a component. Three kinds exist today:
 *
 *   - an **index market** (`market_ucpi`), one per routed symbol;
 *   - an **analytical market** (`compute_economics`), the non-index pages under
 *     `/markets`;
 *   - a **map layer** (`map_gpu_compute`), one per facility category, plus the
 *     map workspace itself (`map`).
 *
 * The map is deliberately modelled as a public product that *contains* premium
 * products. Locking `/map` would be the easy implementation and the wrong one:
 * the workspace, the basemap and the data-centre layer are public, and only
 * three of the four categories are premium. See `productForMapCategory`.
 *
 * ## Identifiers
 *
 * Stable, machine-readable, snake_case, and never a UI label — the label is
 * free to change and these are not. They appear in URLs (`returnTo`), in the
 * entitlement documentation and eventually in Stripe metadata, so treat an id
 * in this file as an published name: add and deprecate, do not rename.
 *
 * Access *class* is a product property. Whether a given reader satisfies it is
 * a different question entirely, and lives in `./entitlement`.
 */

import { FACILITY_CATEGORIES, type FacilityCategory } from "@/lib/facilities/domain";
import { COMPUTE_ANALYTICS_HREF, MAP_HREF, MARKETS_HREF, MODEL_ECONOMICS_HREF, POWER_ANALYTICS_HREF, marketIndexHref } from "@/lib/routes";

/**
 * How a product is reached.
 *
 * `public` products are served to everyone, signed in or not. `premium`
 * products require an authenticated account holding the single Urdais premium
 * entitlement. There is no third class: a product that is "public but
 * rate-limited" or "public with a signup wall" is not a thing Urdais has, and
 * inventing a class for it here would put a decision nobody has made into the
 * type system.
 */
export type ProductAccessClass = "public" | "premium";

/** Every registered product identifier. */
export type UrdaisProductId =
  // ---- Index markets, one per routed symbol. All public.
  | "market_ucpi"
  | "market_utvi"
  | "market_ugai"
  | "market_uavi"
  | "market_umpi"
  | "market_uppi"
  | "market_uepi"
  | "market_uaci"
  | "market_ubwi"
  // ---- Analytical markets.
  | "model_economics"
  | "compute_economics"
  | "power_analytics"
  // ---- The map workspace and its layers.
  | "map"
  | "map_data_centers"
  | "map_gpu_compute"
  | "map_power_infrastructure"
  | "map_semiconductor_fabs"
  // ---- The methodology and documentation library.
  | "docs";

export type UrdaisProduct = {
  id: UrdaisProductId;
  /** Human label, for a gate's copy. Never used as an identifier. */
  name: string;
  accessClass: ProductAccessClass;
  /**
   * Where the product lives. Present so that a later phase can send a reader
   * back to the resource that triggered onboarding without inventing a second
   * product→route table; nothing in this phase consumes it.
   *
   * A map layer's destination is the map, because a layer has no route of its
   * own — it is a filter over one page. `returnTo` for a premium layer
   * therefore lands on the map, which is the correct behaviour anyway.
   */
  destination: string;
  /** Set on the four layer products, so the map's taxonomy and this registry cannot drift. */
  mapCategory?: FacilityCategory;
};

function index(symbol: string, name: string): UrdaisProduct {
  return { id: `market_${symbol.toLowerCase()}` as UrdaisProductId, name, accessClass: "public", destination: marketIndexHref(symbol) };
}

/**
 * The registry. Ordered for reading, not for iteration: nothing depends on the
 * order, and the lookups below are by id.
 *
 * The five premium entries are the launch premium set, and they are the only
 * premium entries. Everything Urdais publishes today that is not one of those
 * five is public and stays public; adding a product to this file without an
 * explicit access class is a type error, which is the point.
 */
export const URDAIS_PRODUCTS: readonly UrdaisProduct[] = Object.freeze([
  // Index markets. Every routed symbol is public, including the ones that are
  // not yet publicly *presented* — presentation and access are different
  // decisions, and `publiclyPresented` in @/data/market-catalog owns the first.
  index("UCPI", "Urdais Compute Price Index"),
  index("UTVI", "Observed Token Volume Index"),
  index("UGAI", "Urdais Global AI Index"),
  index("UAVI", "Urdais AI Volatility Index"),
  index("UMPI", "Urdais Memory Price Index"),
  index("UPPI", "Urdais Photonics Price Index"),
  index("UEPI", "Urdais Energy & Power Index"),
  index("UACI", "Urdais Chip & Accelerator Index"),
  index("UBWI", "Urdais Bitcoin Wealth Index"),

  { id: "model_economics", name: "Model Economics", accessClass: "public", destination: MODEL_ECONOMICS_HREF },
  { id: "compute_economics", name: "Compute Economics", accessClass: "premium", destination: COMPUTE_ANALYTICS_HREF },
  { id: "power_analytics", name: "Power Analytics", accessClass: "premium", destination: POWER_ANALYTICS_HREF },

  // The map workspace is public and stays public.
  { id: "map", name: "Map", accessClass: "public", destination: MAP_HREF },
  { id: "map_data_centers", name: "Data Centers", accessClass: "public", destination: MAP_HREF, mapCategory: "data_center" },
  { id: "map_gpu_compute", name: "GPU Compute Clusters", accessClass: "premium", destination: MAP_HREF, mapCategory: "gpu_compute_cluster" },
  { id: "map_power_infrastructure", name: "Power Infrastructure", accessClass: "premium", destination: MAP_HREF, mapCategory: "power_infrastructure" },
  { id: "map_semiconductor_fabs", name: "Semiconductor Fabs", accessClass: "premium", destination: MAP_HREF, mapCategory: "semiconductor_fab" },

  { id: "docs", name: "Methodology & Documentation", accessClass: "public", destination: "/docs" },
]);

/** The five premium product ids, derived rather than restated. */
export const PREMIUM_PRODUCT_IDS: readonly UrdaisProductId[] = Object.freeze(
  URDAIS_PRODUCTS.filter((product) => product.accessClass === "premium").map((product) => product.id),
);

const BY_ID: ReadonlyMap<string, UrdaisProduct> = new Map(URDAIS_PRODUCTS.map((product) => [product.id, product]));

const BY_MAP_CATEGORY: ReadonlyMap<FacilityCategory, UrdaisProduct> = new Map(
  URDAIS_PRODUCTS.flatMap((product) => (product.mapCategory ? [[product.mapCategory, product] as const] : [])),
);

/**
 * The registered product with this id, or `null`.
 *
 * `null` for anything unregistered — a typo, a stale id from an old link, a
 * value out of a query string. Callers must treat it as *deny*, never as
 * public; `canAccess` does.
 */
export function findProduct(id: string | null | undefined): UrdaisProduct | null {
  if (typeof id !== "string") return null;
  return BY_ID.get(id) ?? null;
}

export function isRegisteredProduct(id: string | null | undefined): id is UrdaisProductId {
  return findProduct(id) !== null;
}

/**
 * Whether a product requires the premium entitlement.
 *
 * An unregistered id answers `true`. That is the fail-safe direction: an
 * unknown product is treated as premium, so a mistyped id withholds data
 * instead of publishing it. The corresponding `isPublicProduct` is *not* its
 * negation for exactly this reason — both answer `false` for an unknown id,
 * because an unknown product is neither known-premium nor known-public, and
 * every caller that branches on them must fall through to a denial.
 */
export function isPremiumProduct(id: string | null | undefined): boolean {
  return findProduct(id)?.accessClass !== "public";
}

/** Whether a product is registered and public. `false` for an unregistered id. */
export function isPublicProduct(id: string | null | undefined): boolean {
  return findProduct(id)?.accessClass === "public";
}

/**
 * The product a map facility category belongs to.
 *
 * Total over `FACILITY_CATEGORIES` — every category has exactly one product,
 * asserted in the tests — so a fifth category added to the map taxonomy without
 * an access class here fails the suite rather than appearing on the map
 * unclassified.
 */
export function productForMapCategory(category: FacilityCategory): UrdaisProduct {
  const product = BY_MAP_CATEGORY.get(category);
  if (!product) {
    // Unreachable while the coverage test passes; thrown rather than defaulted
    // so the failure is loud at the seam instead of silently public.
    throw new Error(`map category "${category}" has no registered access product`);
  }
  return product;
}

/** Whether a map category may only be seen by an entitled reader. */
export function isPremiumMapCategory(category: FacilityCategory): boolean {
  return productForMapCategory(category).accessClass === "premium";
}

/** The premium map categories, in taxonomy order. */
export const PREMIUM_MAP_CATEGORIES: readonly FacilityCategory[] = Object.freeze(
  FACILITY_CATEGORIES.filter((category) => isPremiumMapCategory(category)),
);

/** The routed prefix every analytical and index market shares, for documentation and tests. */
export const MARKETS_ROUTE_PREFIX = MARKETS_HREF;
