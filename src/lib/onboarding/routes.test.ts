/**
 * Onboarding URLs and the destination they carry.
 *
 * `returnTo` has to survive six hops — intro, signup, login, verification, the
 * confirmation callback, and the checkout boundary — and arrive unchanged. It also
 * has to be re-validated at every one of them, because a value Urdais generated on
 * the previous hop still reached the browser in between.
 *
 * The hostile values are not re-derived here: they are Phase 2's, exercised through
 * this surface. Duplicating the sanitiser's own test suite would mean two lists that
 * can disagree about what is safe.
 */

import { describe, expect, it } from "vitest";

import { ONBOARDING_HREF, ONBOARDING_PATHS, onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { ONBOARDING_STATES } from "@/lib/onboarding/state";

const PREMIUM_DESTINATIONS = ["/markets/compute-analytics", "/markets/power-analytics", "/map", "/map?layer=gpu_compute_cluster"];

/** Every way a destination can be hostile. Sourced from Phase 2's threat list. */
const HOSTILE = [
  "https://evil.test/phish",
  "//evil.test",
  "///evil.test",
  "/\\evil.test",
  "/%2f%2fevil.test",
  "javascript:alert(1)",
  "data:text/html,<script>",
  "/../../etc/passwd",
  "/markets\r\nSet-Cookie: a=b",
  "/auth/sign-in",
  "/access/ready",
];

describe("a path for every state", () => {
  it("covers the whole state machine", () => {
    for (const state of ONBOARDING_STATES) {
      expect(ONBOARDING_PATHS[state], state).toBeTruthy();
    }
    expect(Object.keys(ONBOARDING_PATHS).sort()).toEqual([...ONBOARDING_STATES].sort());
  });

  it("keeps every state under the /access entry point", () => {
    for (const state of ONBOARDING_STATES) {
      expect(ONBOARDING_PATHS[state].startsWith(ONBOARDING_HREF), state).toBe(true);
    }
  });

  it("gives each state its own distinct path, so back navigation works", () => {
    const paths = Object.values(ONBOARDING_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("carrying the destination", () => {
  for (const destination of PREMIUM_DESTINATIONS) {
    it(`preserves ${destination} across every state`, () => {
      for (const state of ONBOARDING_STATES) {
        const href = onboardingHref(state, destination);
        expect(href, state).toContain(`returnTo=${encodeURIComponent(destination)}`);
      }
    });
  }

  it("omits the parameter entirely when there is nowhere specific to return to", () => {
    for (const state of ONBOARDING_STATES) {
      expect(onboardingHref(state, null), state).toBe(ONBOARDING_PATHS[state]);
      expect(onboardingHref(state, "/"), state).toBe(ONBOARDING_PATHS[state]);
    }
  });

  it("survives a full round trip through the state machine unchanged", () => {
    // discovery -> audience -> account form -> challenge -> ready.
    let carried: string | null = "/markets/compute-analytics";
    for (const state of ["discover", "audience", "create_account", "login", "email_challenge", "ready_for_checkout"] as const) {
      const href = onboardingHref(state, carried);
      const params = new URL(href, "https://urdais.test").searchParams;
      carried = onboardingReturnTo(params.get("returnTo"));
      expect(carried, state).toBe("/markets/compute-analytics");
    }
  });
});

describe("refusing a hostile destination", () => {
  for (const hostile of HOSTILE) {
    it(`discards ${JSON.stringify(hostile)}`, () => {
      // Dropped rather than sanitised into something adjacent: every state's URL
      // comes back with no returnTo at all.
      for (const state of ONBOARDING_STATES) {
        expect(onboardingHref(state, hostile), state).toBe(ONBOARDING_PATHS[state]);
      }
      expect(onboardingReturnTo(hostile)).toBeNull();
    });
  }

  it("discards anything that is not a string", () => {
    for (const value of [null, undefined, 42, {}, [], ["/a", "/b"]]) {
      expect(onboardingReturnTo(value)).toBeNull();
    }
  });

  it("refuses an onboarding destination, so the journey cannot point at itself", () => {
    // `/access/ready` as a returnTo would send a reader who finishes checkout back
    // into onboarding rather than to the product they wanted.
    expect(onboardingReturnTo("/access/ready")).toBeNull();
  });
});

describe("reading a destination back", () => {
  it("returns null rather than the root, so 'nowhere specific' is distinguishable", () => {
    // The two cases want different copy on the ready and already-entitled screens.
    expect(onboardingReturnTo("/")).toBeNull();
    expect(onboardingReturnTo("/markets/power-analytics")).toBe("/markets/power-analytics");
  });

  it("keeps a query string and fragment, which a premium destination may carry", () => {
    expect(onboardingReturnTo("/markets/power-analytics?section=queue")).toBe("/markets/power-analytics?section=queue");
    expect(onboardingReturnTo("/map?layer=semiconductor_fab")).toBe("/map?layer=semiconductor_fab");
  });
});
