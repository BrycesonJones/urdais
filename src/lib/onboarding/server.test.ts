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
