/**
 * The seam Phase 5 replaces, and the contract it must honour.
 *
 * Phase 4 ends one step before payment. This module is what that step will be
 * attached to: it produces the two values a checkout session needs, derives both
 * on the server, and contains no Stripe.
 *
 * ## The contract
 *
 * Phase 5 replaces the temporary action on the ready screen with something
 * equivalent to:
 *
 *     const handoff = await resolveCheckoutHandoff();
 *     if (handoff.kind !== "ready") return;              // never reachable from that screen
 *     await createCheckoutSession({
 *       accountId: handoff.accountId,                     // server-derived, never from the browser
 *       returnTo: handoff.returnTo,                       // already sanitised
 *     });
 *
 * `accountId` is deliberately **not** something the ready screen posts back. A
 * hidden form field carrying an account id is a subscription someone else pays for:
 * the whole point of deriving it here is that the browser never names the account
 * a checkout session is created against. Phase 5 must keep that property — resolve
 * the account from the session, do not accept it as input.
 *
 * ## Why it refuses rather than returns a partial answer
 *
 * `kind` is not decoration. A checkout session must not be creatable for an
 * anonymous reader, an unverified account, or someone who already subscribes — the
 * last of those being how duplicate subscriptions happen. Those are the same rules
 * the ready route enforces before rendering, and they are restated here because
 * Phase 5's action will be invoked by a form submission, which is a second entry
 * point and must not rely on the page having checked.
 *
 * ## What is deliberately absent
 *
 * No Stripe package, customer id, price id, environment variable, metadata or
 * database column. `@/lib/access/pricing` holds the price *for display*; Stripe's
 * Price object becomes the authority in Phase 5 and must be reconciled against it.
 */

import { hasPremiumEntitlement } from "@/lib/access/entitlement";
import { resolveViewer } from "@/lib/access/server";
import { onboardingReturnTo } from "@/lib/onboarding/routes";

export type CheckoutHandoff =
  | {
      readonly kind: "ready";
      /** The Urdais account id, resolved from the session. Never browser input. */
      readonly accountId: string;
      /** A validated internal path, or null when the reader arrived without one. */
      readonly returnTo: string | null;
    }
  | {
      readonly kind: "refused";
      readonly reason: "anonymous" | "unverified" | "already_entitled";
    };

/**
 * The checkout handoff for the current request.
 *
 * Returns `refused` rather than throwing, so a caller renders or redirects rather
 * than producing a 500 — and so the reason is available to decide which.
 */
export async function resolveCheckoutHandoff(returnTo?: string | null): Promise<CheckoutHandoff> {
  const viewer = await resolveViewer();

  if (viewer.authentication.kind !== "authenticated") return { kind: "refused", reason: "anonymous" };
  // Checked before verification: an entitled reader has nothing to buy, and offering
  // them checkout is how a second subscription gets created.
  if (hasPremiumEntitlement(viewer)) return { kind: "refused", reason: "already_entitled" };
  if (!viewer.authentication.emailVerified) return { kind: "refused", reason: "unverified" };

  return {
    kind: "ready",
    accountId: viewer.authentication.accountId,
    returnTo: onboardingReturnTo(returnTo),
  };
}
