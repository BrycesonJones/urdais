/**
 * The onboarding state machine.
 *
 * The properties worth pinning are the ones that turn into real-world failures: an
 * unverified reader must never be told they are ready for checkout, an existing
 * subscriber must never be offered a second subscription, and a signed-in reader
 * must never be asked to sign in again. Each is one `onboardingStateFor` case.
 */

import { describe, expect, it } from "vitest";

import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer, type Viewer } from "@/lib/access/entitlement";
import {
  ANONYMOUS_STATES,
  AUTHENTICATED_STATES,
  ONBOARDING_STATES,
  isStateReachable,
  onboardingStateFor,
  redirectStateFor,
  type OnboardingState,
} from "@/lib/onboarding/state";

/** Signed in, address confirmed, no entitlement: the ordinary new subscriber. */
const verified = (): Viewer => authenticatedViewer("acct-1", true);
/** Signed in, address not yet confirmed. */
const unverified = (): Viewer => authenticatedViewer("acct-1", false);

describe("deriving the state from the viewer", () => {
  it("puts an anonymous reader at the account form", () => {
    expect(onboardingStateFor(ANONYMOUS_VIEWER)).toBe("create_account");
  });

  it("sends a signed-in unverified reader to the email challenge", () => {
    expect(onboardingStateFor(unverified())).toBe("email_challenge");
  });

  it("sends a signed-in verified reader without an entitlement to the checkout boundary", () => {
    expect(onboardingStateFor(verified())).toBe("ready_for_checkout");
  });

  it("sends a subscriber to the already-entitled state", () => {
    expect(onboardingStateFor(subscriberViewer())).toBe("already_entitled");
  });

  it("does not treat a lapsed entitlement as a subscription", () => {
    const lapsed = subscriberViewer("acct-1", { status: "inactive", revokedAt: "2026-06-01T00:00:00.000Z" });
    expect(onboardingStateFor(lapsed)).toBe("ready_for_checkout");
  });

  it("puts entitlement ahead of verification", () => {
    // An operator comp on an unconfirmed address. `canAccess` already grants them
    // premium, so "verify your email" would gate nothing and imply they cannot use
    // what they can already use. A judgement call, pinned so it stays deliberate.
    const entitledUnverified: Viewer = {
      authentication: { kind: "authenticated", accountId: "acct-1", emailVerified: false },
      premiumEntitlement: { status: "active", source: "manual", externalReference: null, grantedAt: "2026-01-01T00:00:00.000Z", revokedAt: null },
    };
    expect(onboardingStateFor(entitledUnverified)).toBe("already_entitled");
  });

  it("is total: every viewer resolves to a registered state", () => {
    for (const viewer of [ANONYMOUS_VIEWER, unverified(), verified(), subscriberViewer()]) {
      expect(ONBOARDING_STATES).toContain(onboardingStateFor(viewer));
    }
  });
});

describe("which states a reader may occupy", () => {
  it("lets an anonymous reader use the account form, the login form and the challenge", () => {
    // The choice is theirs because Urdais does not disclose whether an address
    // already has an account.
    for (const state of ANONYMOUS_STATES) {
      expect(isStateReachable(ANONYMOUS_VIEWER, state), state).toBe(true);
    }
  });

  it("keeps an anonymous reader out of every authenticated state", () => {
    for (const state of AUTHENTICATED_STATES) {
      expect(isStateReachable(ANONYMOUS_VIEWER, state), state).toBe(false);
    }
  });

  it("never asks a signed-in reader to sign in again", () => {
    for (const viewer of [unverified(), verified(), subscriberViewer()]) {
      expect(isStateReachable(viewer, "create_account")).toBe(false);
      expect(isStateReachable(viewer, "login")).toBe(false);
    }
  });

  it("admits an authenticated reader to exactly one state — their own", () => {
    const cases: [Viewer, OnboardingState][] = [
      [unverified(), "email_challenge"],
      [verified(), "ready_for_checkout"],
      [subscriberViewer(), "already_entitled"],
    ];

    for (const [viewer, own] of cases) {
      for (const state of ONBOARDING_STATES) {
        expect(isStateReachable(viewer, state), `${own} / ${state}`).toBe(state === own);
      }
    }
  });

  it("keeps an unverified reader away from the checkout boundary", () => {
    // The single most important refusal here: "you're ready to continue" shown to
    // someone who has not confirmed their address would be untrue.
    expect(isStateReachable(unverified(), "ready_for_checkout")).toBe(false);
  });

  it("keeps a subscriber away from the checkout boundary", () => {
    // How duplicate subscriptions happen once Stripe exists.
    expect(isStateReachable(subscriberViewer(), "ready_for_checkout")).toBe(false);
  });
});

describe("where a misdirected reader is sent", () => {
  it("always names a state that reader can actually occupy, so a redirect cannot loop", () => {
    for (const viewer of [ANONYMOUS_VIEWER, unverified(), verified(), subscriberViewer()]) {
      const target = redirectStateFor(viewer);
      expect(isStateReachable(viewer, target), target).toBe(true);
    }
  });

  it("sends an anonymous reader to the account form", () => {
    expect(redirectStateFor(ANONYMOUS_VIEWER)).toBe("create_account");
  });

  it("sends an authenticated reader to their own state", () => {
    expect(redirectStateFor(unverified())).toBe("email_challenge");
    expect(redirectStateFor(verified())).toBe("ready_for_checkout");
    expect(redirectStateFor(subscriberViewer())).toBe("already_entitled");
  });
});
