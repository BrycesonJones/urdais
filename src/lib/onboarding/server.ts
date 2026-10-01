/**
 * Server-side onboarding resolution: the one gate every `/access` route calls.
 *
 * A route asks "may I render this state?" and either gets a viewer to render with
 * or is told where to send the reader instead. Because the answer comes from
 * `resolveViewer` — Phase 2's authoritative session → account → entitlement
 * lookup — the flow cannot be advanced by editing a URL, replaying a form, or
 * holding stale client state. Typing `/access/ready` while signed out lands on the
 * intro; typing it while unverified lands on the verification screen.
 *
 * Server-only. It reads cookies through `resolveViewer` and must never be imported
 * by a client component.
 *
 * ## What it does not do
 *
 * It does not create, modify or infer an entitlement. Onboarding's entire job is to
 * get a reader to the point where a subscription *could* be purchased; the only
 * writer of `identity.premium_entitlements` today is an operator with SQL, and
 * after Phase 5 it will be Stripe. Nothing in `/access` writes to it, which is
 * asserted rather than merely intended.
 */

import { resolveViewer } from "@/lib/access/server";
import type { Viewer } from "@/lib/access/entitlement";
import { onboardingHref } from "@/lib/onboarding/routes";
import { ACCOUNT_HREF } from "@/lib/routes";
import { isStateReachable, onboardingStateFor, redirectStateFor, type OnboardingState } from "@/lib/onboarding/state";

export type OnboardingResolution =
  /** Render the requested state, with this viewer. */
  | { readonly kind: "render"; readonly viewer: Viewer; readonly state: OnboardingState; readonly returnTo: string | null }
  /** Send the reader here instead; they may not be in the state they asked for. */
  | { readonly kind: "redirect"; readonly href: string; readonly state: OnboardingState };

/**
 * Resolve a request for one onboarding state.
 *
 * `returnTo` is passed through so the caller does not have to validate it twice;
 * `onboardingHref` re-validates it on the redirect path.
 */
export async function resolveOnboarding(
  requested: OnboardingState,
  returnTo: string | null,
): Promise<OnboardingResolution> {
  const viewer = await resolveViewer();

  if (isStateReachable(viewer, requested)) {
    return { kind: "render", viewer, state: requested, returnTo };
  }

  const target = redirectStateFor(viewer);
  return { kind: "redirect", href: redirectHref(viewer, target, returnTo), state: target };
}

/**
 * Whether the reader's destination is their account rather than a premium page.
 *
 * Only the exact path counts, with or without a query or fragment. `returnTo` has
 * already been through `safeReturnTo` by the time it gets here.
 */
function isAccountDestination(returnTo: string | null): boolean {
  if (!returnTo) return false;
  return returnTo === ACCOUNT_HREF || returnTo.startsWith(`${ACCOUNT_HREF}?`) || returnTo.startsWith(`${ACCOUNT_HREF}#`);
}

/**
 * Where a redirect lands.
 *
 * Normally the onboarding state the viewer belongs in. The one exception is a
 * signed-in reader who came to sign in *to their account* -- the header's account
 * icon, while anonymous -- rather than to buy access to a premium page. Sending
 * them on to Plan / Pay would turn "sign in" into a sales screen, so once their
 * session exists they go to the account instead, subscribed or not. An account
 * still owed the email challenge (only possible for a legacy password account)
 * goes there first; that screen is authentication, not a sale.
 *
 * Signing in and holding premium are separate: an authenticated reader without an
 * entitlement has a valid account and is never sent back through sign-in for it.
 */
function redirectHref(viewer: Viewer, target: OnboardingState, returnTo: string | null): string {
  if (viewer.authentication.kind === "authenticated" && target !== "email_challenge" && isAccountDestination(returnTo)) {
    return ACCOUNT_HREF;
  }
  return onboardingHref(target, returnTo);
}

/**
 * What `/access` should do.
 *
 * An anonymous reader gets the account form rendered **in place** — no redirect and
 * no intervening screen, because the premium gate already established intent.
 * Anyone with a session is sent to whichever state their account implies, which is
 * what makes `/access` a canonical entry point rather than a page: a bookmark, a
 * stale link and a fresh click all resolve to the right place.
 */
export async function resolveOnboardingEntry(returnTo: string | null): Promise<OnboardingResolution> {
  const viewer = await resolveViewer();

  if (viewer.authentication.kind !== "authenticated") {
    return { kind: "render", viewer, state: "create_account", returnTo };
  }

  const target = onboardingStateFor(viewer);
  return { kind: "redirect", href: redirectHref(viewer, target, returnTo), state: target };
}
