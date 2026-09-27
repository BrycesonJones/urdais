/**
 * The words on a premium gate, in one place.
 *
 * Both gates — the page-level locked shell and the map-layer dialog — read from
 * here, so the proposition cannot drift into two different offers. It is a pure
 * module with no React in it, which also makes the copy assertable in a test
 * rather than only reviewable by eye.
 *
 * ## The two denial reasons say different things to the reader, and the same
 * thing to the wallet
 *
 * An anonymous reader and a signed-in non-subscriber both need to subscribe, so
 * the primary call to action is identical for both. What differs is the secondary
 * affordance: an anonymous reader might already *have* a Urdais account, so a
 * "Sign in" link is useful to them and meaningless to someone already signed in.
 *
 * The primary CTA deliberately does **not** go to sign-in for an anonymous
 * reader. Whether they need to create an account or sign in is onboarding's
 * decision, and routing them to a bare sign-in form presumes an answer.
 */

import type { AccessDenialReason } from "@/lib/access/entitlement";
import { PREMIUM_MAP_CATEGORIES, findProduct, productForMapCategory, type UrdaisProductId } from "@/lib/access/products";

/** Which surface the gate is covering. The map's copy names the layers. */
export type GateSurface = "page" | "map_layer";

export type GateCopy = {
  /** Shown as the gate's heading. Set in capitals deliberately; not a CSS transform. */
  readonly title: string;
  /** One line naming what is locked. */
  readonly lead: string;
  /** What a subscription buys. */
  readonly body: string;
  /** Primary action. */
  readonly ctaLabel: string;
  /** Secondary action, or null when it would make no sense. */
  readonly secondary: { readonly label: string } | null;
};

export const GATE_TITLE = "ACCESS REQUIRED";
export const GATE_CTA_LABEL = "Get Full Access";
export const GATE_SIGN_IN_LABEL = "Sign in";

/**
 * The premium map layers, named for the map gate's copy.
 *
 * Taken from the registry's own product names — which are already the public,
 * plural labels ("GPU Compute Clusters") — rather than from the map's category
 * vocabulary or a sentence written out here. A change to the premium map set
 * therefore cannot leave this listing the wrong layers, and there is no second
 * place where a layer's public name is spelled.
 */
export function premiumMapLayerNames(): string {
  const names = PREMIUM_MAP_CATEGORIES.map((category) => productForMapCategory(category).name);
  // "A, B, and C" — the Oxford comma matches the rest of Urdais's prose.
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * The copy for one denial.
 *
 * `unknown_product` has no entry and must never reach here: an unregistered
 * product is an application error, not an upsell opportunity, and turning one
 * into "subscribe for access" would advertise a product Urdais does not sell. The
 * callers answer 404 instead, and passing one here throws rather than inventing
 * a proposition.
 */
export function gateCopy(reason: AccessDenialReason, surface: GateSurface): GateCopy {
  if (reason === "unknown_product") {
    throw new Error("unknown_product has no gate copy: it is a not-found condition, not an upsell");
  }

  const lead = surface === "map_layer" ? "This map layer requires an Urdais subscription." : "This page requires an Urdais subscription.";

  const body =
    surface === "map_layer"
      ? `Full access unlocks ${premiumMapLayerNames()}, and every premium Urdais product.`
      : "Full access unlocks this product and every premium product across Urdais.";

  return {
    title: GATE_TITLE,
    lead,
    body,
    ctaLabel: GATE_CTA_LABEL,
    // Only offered to a reader who is not signed in. Someone already signed in
    // and unentitled has nothing to gain from it.
    secondary: reason === "authentication_required" ? { label: GATE_SIGN_IN_LABEL } : null,
  };
}

/** The product's display name, for a gate's accessible label. */
export function gateProductName(productId: UrdaisProductId | string | null | undefined): string | null {
  return findProduct(productId)?.name ?? null;
}
