/**
 * Where a premium gate's buttons go.
 *
 * One module so the destination is changed in one place when onboarding lands,
 * and so every CTA carries its `returnTo` the same way. Both links are built with
 * Phase 2's `safeReturnTo`, which is the only redirect sanitiser in Urdais — a
 * second one is how the two drift and one of them becomes an open redirect.
 *
 * ## `/access` is a placeholder, and says so
 *
 * Stripe and onboarding do not exist. The CTA therefore cannot lead to a checkout,
 * and pointing it at one that is not there would be a broken journey. It leads to
 * `/access`, which states plainly that subscriptions are not yet available and
 * offers the reader their way back. When onboarding ships, this function is what
 * changes; the gates do not.
 */

import { safeReturnTo } from "@/lib/auth/return-to";

/** The temporary subscription entry point. Replaced by onboarding in a later phase. */
export const ACCESS_ENTRY_HREF = "/access";

/** Phase 2's sign-in route. */
export const SIGN_IN_HREF = "/auth/sign-in";

/**
 * The "Get Full Access" destination, carrying where the reader was.
 *
 * `returnTo` is validated here rather than trusted, even though it is normally
 * built from a product's own `destination`: a gate on the map passes a path
 * assembled at request time, and a sanitiser that is only applied to untrusted
 * input eventually misses a case.
 */
export function accessHref(returnTo?: string | null): string {
  const destination = safeReturnTo(returnTo);
  if (destination === "/") return ACCESS_ENTRY_HREF;
  return `${ACCESS_ENTRY_HREF}?returnTo=${encodeURIComponent(destination)}`;
}

/** The secondary "Sign in" destination, carrying the same `returnTo`. */
export function signInHref(returnTo?: string | null): string {
  const destination = safeReturnTo(returnTo);
  if (destination === "/") return SIGN_IN_HREF;
  return `${SIGN_IN_HREF}?returnTo=${encodeURIComponent(destination)}`;
}
