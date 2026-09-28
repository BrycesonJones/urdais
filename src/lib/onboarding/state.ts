/**
 * The onboarding state machine.
 *
 * One named state per situation a reader can be in, derived from the authoritative
 * server-side viewer — never from a collection of `showSignup` / `showVerify`
 * booleans, which is how a flow ends up in two states at once or in none.
 *
 * ## There is no intro state
 *
 * The premium gate already established intent: someone who pressed "Get Full
 * Access" has decided. A marketing screen between that decision and the account
 * form was a second ask, so `create_account` is now where an anonymous reader
 * lands, at `/access` itself.
 *
 * ## The state is a function of the viewer, not of where the reader has been
 *
 * `onboardingStateFor` is pure and total. That is what makes refresh, back
 * navigation, a confirmation link arriving hours later, and typing `/access`
 * directly all behave the same: each one resolves the current account state from
 * the server and lands wherever that state belongs. There is no progress to lose
 * because there is no progress being kept.
 *
 * The two states a reader *chooses* — `create_account` and `login` — are the
 * exception, and they are carried by the URL rather than by this function.
 * Choosing is the one thing the server cannot infer, because Urdais deliberately
 * does not tell an anonymous visitor whether their address already has an account
 * (see `@/lib/auth/operations`). So `/access` offers both and the reader picks.
 *
 * ## Precedence, and the one case the brief leaves open
 *
 * Entitlement is checked **before** verification. A reader holding an active
 * entitlement sees "you already have full access" even if their address is
 * unverified — which today can only happen to an operator comp, since manual
 * grants are the only source of entitlement. Sending such a reader to the email
 * challenge would be doubly wrong: `canAccess` already grants them premium, so it
 * would gate nothing, and the screen would imply they cannot use what they can. Flagged because it is a judgement call, not something the
 * specification settled.
 */

import { hasPremiumEntitlement, type Viewer } from "@/lib/access/entitlement";

/**
 * Where a reader is in onboarding.
 *
 * `create_account` is the anonymous entry point, and `login` is the same primitive
 * under a different heading for readers who know they have an account. The rest are
 * derived from the server's view of the session.
 */
export type OnboardingState =
  | "create_account"
  | "login"
  /**
   * The sign-in link has been emailed and is waiting to be opened.
   *
   * Named for what it is. Under passwordless authentication this is not a
   * verification step bolted onto a password account — the emailed link *is* the
   * credential, so this state is the authentication challenge itself.
   */
  | "email_challenge"
  | "ready_for_checkout"
  | "already_entitled";

export const ONBOARDING_STATES: readonly OnboardingState[] = Object.freeze([
  "create_account",
  "login",
  "email_challenge",
  "ready_for_checkout",
  "already_entitled",
]);

/**
 * The states an anonymous reader may occupy.
 *
 * `email_challenge` is here because a reader awaiting their link has no session
 * yet: the link is what creates one. It is the one anonymous state that is not a
 * form.
 */
export const ANONYMOUS_STATES: readonly OnboardingState[] = Object.freeze(["create_account", "login", "email_challenge"]);

/** The states that require an authenticated viewer. */
export const AUTHENTICATED_STATES: readonly OnboardingState[] = Object.freeze([
  "ready_for_checkout",
  "already_entitled",
]);

/**
 * The state this viewer belongs in, ignoring any choice they have made.
 *
 * An anonymous viewer resolves to `create_account`; whether they are actually
 * looking at that form or the login one is a routing matter, and `isStateReachable`
 * is what decides whether their choice is still valid.
 */
export function onboardingStateFor(viewer: Viewer): OnboardingState {
  if (viewer.authentication.kind !== "authenticated") return "create_account";

  // Entitlement first. See the module comment.
  if (hasPremiumEntitlement(viewer)) return "already_entitled";

  // A session established by an emailed link means the address was already proven:
  // clicking the link IS the verification. So an authenticated reader is verified
  // by construction under passwordless auth, and the only way to be authenticated
  // and unverified is a legacy password account. Those are sent back to the
  // challenge, where one emailed link both proves the address and signs them in.
  if (!viewer.authentication.emailVerified) return "email_challenge";

  return "ready_for_checkout";
}

/**
 * Whether a reader in this viewer state may be shown `state`.
 *
 * Used by every onboarding route to decide between rendering and redirecting, so
 * the rules live here once rather than as six similar `if` blocks across six
 * files. An authenticated reader may not see the signup or login forms — Invariant
 * 3: nobody who is already signed in is asked to sign in again — and an anonymous
 * reader may not see any of the authenticated states.
 */
export function isStateReachable(viewer: Viewer, state: OnboardingState): boolean {
  const authenticated = viewer.authentication.kind === "authenticated";

  if (!authenticated) return ANONYMOUS_STATES.includes(state);

  // An authenticated reader may still be shown the challenge -- a legacy password
  // account whose address was never confirmed needs exactly that screen.
  if (state === "email_challenge") return onboardingStateFor(viewer) === "email_challenge";

  // An authenticated reader belongs in exactly the state their account implies.
  // There is no legitimate reason for them to sit on a different authenticated
  // screen: "ready for checkout" for an unverified account would be a lie, and
  // "verify your email" for an entitled one would be an obstacle.
  return state === onboardingStateFor(viewer);
}

/**
 * Where to send a reader who asked for a state they may not be in.
 *
 * Always a state they *can* be in, so a redirect can never bounce: an anonymous
 * reader goes to the account form and an authenticated one to whatever their
 * account implies. That totality is what prevents the loop between `/access` and the auth
 * routes the specification warns about.
 */
export function redirectStateFor(viewer: Viewer): OnboardingState {
  return viewer.authentication.kind === "authenticated" ? onboardingStateFor(viewer) : "create_account";
}
