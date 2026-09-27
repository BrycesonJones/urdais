/**
 * The onboarding state machine.
 *
 * One named state per situation a reader can be in, derived from the authoritative
 * server-side viewer — never from a collection of `showSignup` / `showVerify`
 * booleans, which is how a flow ends up in two states at once or in none.
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
 * grants are the only source of entitlement. Sending such a reader to "verify your
 * email" would be doubly wrong: `canAccess` already grants them premium, so the
 * verification would gate nothing, and the screen would imply they cannot use what
 * they can already use. Flagged because it is a judgement call, not something the
 * specification settled.
 */

import { hasPremiumEntitlement, type Viewer } from "@/lib/access/entitlement";

/**
 * Where a reader is in onboarding.
 *
 * `intro` is the anonymous entry point. `create_account` and `login` are the two
 * branches an anonymous reader may choose. The remaining three are all derived
 * from the server's view of an authenticated account.
 */
export type OnboardingState =
  | "intro"
  | "create_account"
  | "login"
  | "verification_required"
  | "ready_for_checkout"
  | "already_entitled";

export const ONBOARDING_STATES: readonly OnboardingState[] = Object.freeze([
  "intro",
  "create_account",
  "login",
  "verification_required",
  "ready_for_checkout",
  "already_entitled",
]);

/** The states an anonymous reader may occupy. */
export const ANONYMOUS_STATES: readonly OnboardingState[] = Object.freeze(["intro", "create_account", "login"]);

/** The states that require an authenticated viewer. */
export const AUTHENTICATED_STATES: readonly OnboardingState[] = Object.freeze([
  "verification_required",
  "ready_for_checkout",
  "already_entitled",
]);

/**
 * The state this viewer belongs in, ignoring any choice they have made.
 *
 * An anonymous viewer resolves to `intro`; whether they are looking at the signup
 * or the login form is a routing matter, and `isStateReachable` is what decides
 * whether that choice is still valid for them.
 */
export function onboardingStateFor(viewer: Viewer): OnboardingState {
  if (viewer.authentication.kind !== "authenticated") return "intro";

  // Entitlement first. See the module comment.
  if (hasPremiumEntitlement(viewer)) return "already_entitled";

  // Authoritative: `emailVerified` comes from the Auth server's own
  // `email_confirmed_at`, never from token metadata a reader can write.
  if (!viewer.authentication.emailVerified) return "verification_required";

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
 * reader goes to `intro` and an authenticated one to whatever their account
 * implies. That totality is what prevents the loop between `/access` and the auth
 * routes the specification warns about.
 */
export function redirectStateFor(viewer: Viewer): OnboardingState {
  return viewer.authentication.kind === "authenticated" ? onboardingStateFor(viewer) : "intro";
}
