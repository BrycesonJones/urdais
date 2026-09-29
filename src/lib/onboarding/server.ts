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
  return { kind: "redirect", href: onboardingHref(target, returnTo), state: target };
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
  return { kind: "redirect", href: onboardingHref(target, returnTo), state: target };
}
