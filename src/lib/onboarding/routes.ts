/**
 * Onboarding URLs, one per state.
 *
 * Each state has a real route rather than being a step in a client-side wizard.
 * That is what makes the specification's requirements fall out for free instead of
 * needing machinery: the back button works because each state is a history entry,
 * refresh works because there is nothing in memory to lose, and a link someone
 * sends themselves resolves against their current account state.
 *
 * `returnTo` travels in the query string of every one of them, and is re-validated
 * on arrival by Phase 2's `safeReturnTo` — the only sanitiser in Urdais. It is
 * never trusted between hops just because Urdais generated it on the previous one.
 */

import { safeReturnTo } from "@/lib/auth/return-to";
import type { OnboardingState } from "@/lib/onboarding/state";

/** The onboarding entry point, and where every premium gate's CTA leads. */
export const ONBOARDING_HREF = "/access";

const PATHS: Record<OnboardingState, string> = {
  intro: ONBOARDING_HREF,
  create_account: `${ONBOARDING_HREF}/create`,
  login: `${ONBOARDING_HREF}/login`,
  verification_required: `${ONBOARDING_HREF}/verify`,
  ready_for_checkout: `${ONBOARDING_HREF}/ready`,
  already_entitled: `${ONBOARDING_HREF}/subscribed`,
};

/** Every onboarding path, for tests and for the route-coverage assertion. */
export const ONBOARDING_PATHS: Readonly<Record<OnboardingState, string>> = Object.freeze(PATHS);

/**
 * The URL for a state, carrying the reader's destination.
 *
 * `returnTo` is validated here rather than assumed safe, because this is called
 * with values that came from a query string one hop earlier.
 */
export function onboardingHref(state: OnboardingState, returnTo?: string | null): string {
  const path = PATHS[state];
  const destination = safeReturnTo(returnTo);
  if (destination === "/") return path;
  return `${path}?returnTo=${encodeURIComponent(destination)}`;
}

/**
 * The reader's own destination, or null when they arrived without one.
 *
 * Null rather than `"/"` so a caller can tell "go back to the premium page you
 * came from" apart from "you came here directly, so there is nowhere specific to
 * send you" — the two want different copy.
 */
export function onboardingReturnTo(raw: unknown): string | null {
  const destination = safeReturnTo(raw);
  return destination === "/" ? null : destination;
}
