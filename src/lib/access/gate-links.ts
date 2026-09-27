/**
 * Where a premium gate's buttons go.
 *
 * One module so the destination is changed in one place, and so every CTA carries
 * its `returnTo` the same way. Both links are built with
 * Phase 2's `safeReturnTo`, which is the only redirect sanitiser in Urdais — a
 * second one is how the two drift and one of them becomes an open redirect.
 *
 * ## `/access` is the real onboarding entry point
 *
 * Phase 4 replaced the placeholder that used to live there. `/access` now resolves
 * the reader's authoritative state and routes them: an anonymous reader sees the
 * offer and chooses between creating an account and logging in, a signed-in reader
 * goes to whichever step their account actually needs, and an existing subscriber is
 * told they already have access rather than being sold a second subscription.
 *
 * The CTA target did not change, which was the point of routing it through this
 * function: the gates were written against `/access` and were not touched when the
 * destination behind it became real. Phase 5 replaces the checkout boundary at the
 * end of that journey, and the gates will not need touching then either.
 */

import { safeReturnTo } from "@/lib/auth/return-to";

/** The onboarding entry point. See @/lib/onboarding/routes for the states behind it. */
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
