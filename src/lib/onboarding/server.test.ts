/**
 * Server-side onboarding resolution.
 *
 * Every screen asks this one function whether to render or redirect, so these cases
 * are the whole routing behaviour of the journey — including the ones that matter
 * most: a reader cannot reach the checkout boundary by typing its URL, and a
 * subscriber cannot reach it at all.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveViewer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/access/server", () => ({ resolveViewer }));

import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer } from "@/lib/access/entitlement";
import { ONBOARDING_STATES, type OnboardingState } from "@/lib/onboarding/state";
import { resolveOnboarding, resolveOnboardingEntry } from "@/lib/onboarding/server";

const anonymous = () => resolveViewer.mockResolvedValue(ANONYMOUS_VIEWER);
const unverified = () => resolveViewer.mockResolvedValue(authenticatedViewer("acct-1", false));
const verified = () => resolveViewer.mockResolvedValue(authenticatedViewer("acct-1", true));
const subscriber = () => resolveViewer.mockResolvedValue(subscriberViewer("acct-1"));
// A Stripe subscription that was canceled or went past_due: the account keeps an
// entitlement row, and it no longer grants anything.
const lapsed = () =>
  resolveViewer.mockResolvedValue(
    subscriberViewer("acct-1", { status: "inactive", source: "stripe", revokedAt: "2026-09-01T00:00:00.000Z" }),
  );

beforeEach(() => resolveViewer.mockReset());

describe("the entry point", () => {
  it("renders the account form for an anonymous reader, in place", async () => {
    anonymous();
    const resolution = await resolveOnboardingEntry("/markets/compute-analytics");
    expect(resolution.kind).toBe("render");
    expect(resolution.kind === "render" && resolution.state).toBe("create_account");
  });

  it("never shows an authenticated reader the account form", async () => {
    // Invariant 3: nobody signed in is asked to authenticate again, and that includes
    // being shown the account form at `/access` itself.
    for (const [setup, expected] of [
      [unverified, "/access/verify"],
      [verified, "/access/ready"],
      [subscriber, "/access/subscribed"],
    ] as const) {
      setup();
      const resolution = await resolveOnboardingEntry(null);
      expect(resolution.kind, expected).toBe("redirect");
      expect(resolution.kind === "redirect" && resolution.href).toBe(expected);
    }
  });

  it("carries the destination through the redirect", async () => {
    verified();
    const resolution = await resolveOnboardingEntry("/markets/power-analytics");
    expect(resolution.kind === "redirect" && resolution.href).toBe(
      `/access/ready?returnTo=${encodeURIComponent("/markets/power-analytics")}`,
    );
  });
});

describe("typing a URL you do not belong on", () => {
  it("cannot get an anonymous reader to the checkout boundary", async () => {
    anonymous();
    const resolution = await resolveOnboarding("ready_for_checkout", null);
    expect(resolution.kind).toBe("redirect");
    expect(resolution.kind === "redirect" && resolution.href).toBe("/access");
  });

  it("cannot get an unverified reader to the checkout boundary", async () => {
    unverified();
    const resolution = await resolveOnboarding("ready_for_checkout", null);
    expect(resolution.kind === "redirect" && resolution.href).toBe("/access/verify");
  });

  it("cannot get a subscriber to the checkout boundary", async () => {
    subscriber();
    const resolution = await resolveOnboarding("ready_for_checkout", null);
    expect(resolution.kind === "redirect" && resolution.href).toBe("/access/subscribed");
  });

  it("cannot get an anonymous reader to the already-entitled screen", async () => {
    anonymous();
    expect((await resolveOnboarding("already_entitled", null)).kind).toBe("redirect");
  });

  it("cannot get a signed-in reader back to the signup or login forms", async () => {
    for (const setup of [unverified, verified, subscriber]) {
      setup();
      for (const state of ["create_account", "login"] as const) {
        expect((await resolveOnboarding(state, null)).kind, state).toBe("redirect");
      }
    }
  });
});

describe("rendering the state a reader does belong on", () => {
  const cases: [string, () => void, OnboardingState][] = [
    ["anonymous / discover", anonymous, "discover"],
    ["anonymous / audience", anonymous, "audience"],
    ["anonymous / create_account", anonymous, "create_account"],
    ["anonymous / login", anonymous, "login"],
    ["unverified / verification_required", unverified, "email_challenge"],
    ["verified / ready_for_checkout", verified, "ready_for_checkout"],
    ["subscriber / already_entitled", subscriber, "already_entitled"],
  ];

  for (const [label, setup, state] of cases) {
    it(label, async () => {
      setup();
      const resolution = await resolveOnboarding(state, null);
      expect(resolution.kind).toBe("render");
      expect(resolution.kind === "render" && resolution.state).toBe(state);
    });
  }
});

describe("redirects terminate", () => {
  it("never redirects a reader to a state they would be redirected out of again", async () => {
    // The loop the specification warns about. Every redirect target must be a state
    // that same viewer can actually render.
    for (const setup of [anonymous, unverified, verified, subscriber]) {
      for (const requested of ONBOARDING_STATES) {
        setup();
        const first = await resolveOnboarding(requested, null);
        if (first.kind !== "redirect") continue;

        setup();
        const second = await resolveOnboarding(first.state, null);
        expect(second.kind, `${requested} -> ${first.state}`).toBe("render");
      }
    }
  });
});

describe("authority", () => {
  it("resolves the viewer from the server on every request", async () => {
    // Nothing is cached and nothing is passed in: a reader who signs out between two
    // requests gets the anonymous answer on the second, with no stale state to clear.
    verified();
    await resolveOnboarding("ready_for_checkout", null);
    anonymous();
    const after = await resolveOnboarding("ready_for_checkout", null);
    expect(after.kind).toBe("redirect");
    expect(resolveViewer).toHaveBeenCalledTimes(2);
  });
});

describe("premium introduction bypass", () => {
  it("sends authenticated non-subscribers straight to Plan / Pay", async () => {
    for (const requested of ["discover", "audience"] as const) {
      verified();
      const resolution = await resolveOnboarding(requested, "/markets/power-analytics");
      expect(resolution.kind === "redirect" && resolution.href).toBe(
        `/access/ready?returnTo=${encodeURIComponent("/markets/power-analytics")}`,
      );
    }
  });

  it("sends subscribers away from both introductory pages", async () => {
    for (const requested of ["discover", "audience"] as const) {
      subscriber();
      const resolution = await resolveOnboarding(requested, "/markets/power-analytics");
      expect(resolution.kind === "redirect" && resolution.href).toBe(
        `/access/subscribed?returnTo=${encodeURIComponent("/markets/power-analytics")}`,
      );
    }
  });
});

describe("signing in to the account rather than to buy access", () => {
  // The header's account icon sends an anonymous reader to `/access/login` with
  // `/account` as the destination. After the code, `verifyOtpAction` sends them to
  // `/access?returnTo=/account`, which must land on the account -- not on Plan / Pay.

  it("sends every signed-in reader to /account, entitled or not", async () => {
    for (const [label, setup] of [
      ["never subscribed", verified],
      ["active subscriber", subscriber],
      ["canceled / past_due", lapsed],
    ] as const) {
      setup();
      const entry = await resolveOnboardingEntry("/account");
      expect(entry.kind, label).toBe("redirect");
      expect(entry.kind === "redirect" && entry.href, label).toBe("/account");

      // And a signed-in reader who reaches the sign-in screen itself is not asked
      // to sign in again.
      setup();
      const login = await resolveOnboarding("login", "/account");
      expect(login.kind === "redirect" && login.href, label).toBe("/account");
    }
  });

  it("keeps a legacy unverified account on the email challenge first", async () => {
    unverified();
    const entry = await resolveOnboardingEntry("/account");
    expect(entry.kind === "redirect" && entry.href).toBe(`/access/verify?returnTo=${encodeURIComponent("/account")}`);
  });

  it("lets an anonymous reader sign in, carrying the account destination", async () => {
    anonymous();
    const login = await resolveOnboarding("login", "/account");
    expect(login.kind).toBe("render");
  });

  it("leaves the premium conversion funnel exactly as it was", async () => {
    // A premium destination still goes to Plan / Pay, and a subscriber is still
    // told they already have access. Only the account destination is different.
    verified();
    const ready = await resolveOnboardingEntry("/markets/power-analytics");
    expect(ready.kind === "redirect" && ready.href).toBe(
      `/access/ready?returnTo=${encodeURIComponent("/markets/power-analytics")}`,
    );

    lapsed();
    const lapsedReady = await resolveOnboardingEntry("/markets/power-analytics");
    expect(lapsedReady.kind === "redirect" && lapsedReady.href).toBe(
      `/access/ready?returnTo=${encodeURIComponent("/markets/power-analytics")}`,
    );

    subscriber();
    const subscribed = await resolveOnboardingEntry("/markets/power-analytics");
    expect(subscribed.kind === "redirect" && subscribed.href).toBe(
      `/access/subscribed?returnTo=${encodeURIComponent("/markets/power-analytics")}`,
    );

    verified();
    const none = await resolveOnboardingEntry(null);
    expect(none.kind === "redirect" && none.href).toBe("/access/ready");
  });

  it("matches the account path exactly, not by prefix", async () => {
    verified();
    for (const lookalike of ["/accounts", "/account-settings", "/accountx"]) {
      const entry = await resolveOnboardingEntry(lookalike);
      expect(entry.kind === "redirect" && entry.href, lookalike).toBe(`/access/ready?returnTo=${encodeURIComponent(lookalike)}`);
    }
    const withQuery = await resolveOnboardingEntry("/account?tab=x");
    expect(withQuery.kind === "redirect" && withQuery.href).toBe("/account?tab=x");
  });

  it("treats a route beneath /account as account intent too, and returns there", async () => {
    // Phase 7B: signing in from `/account/subscription` lands back on it, not Plan / Pay.
    for (const setup of [verified, subscriber, lapsed]) {
      setup();
      const entry = await resolveOnboardingEntry("/account/subscription");
      expect(entry.kind === "redirect" && entry.href).toBe("/account/subscription");
    }
  });

  it("still renders the checkout boundary for a signed-in reader who asked for it", async () => {
    // Account intent changes where a redirect lands, never whether a state renders.
    verified();
    const ready = await resolveOnboarding("ready_for_checkout", "/account");
    expect(ready.kind).toBe("render");
  });
});
