import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A stateful stand-in for the parts of posthog-js consent touches. */
const fake = vi.hoisted(() => {
  const state = { consent: "pending" as "pending" | "granted" | "denied", loaded: false, identified: false };
  const calls: string[] = [];
  const api = {
    get __loaded() {
      return state.loaded;
    },
    init: vi.fn((_key: string, config: { loaded?: () => void }) => {
      state.loaded = true;
      calls.push("init");
      config.loaded?.();
    }),
    get_explicit_consent_status: () => state.consent,
    opt_in_capturing: vi.fn((options?: { captureEventName?: string | false | null }) => {
      state.consent = "granted";
      calls.push(`opt_in:${options?.captureEventName ?? "$opt_in"}`);
    }),
    opt_out_capturing: vi.fn(() => {
      state.consent = "denied";
      calls.push("opt_out");
    }),
    clear_opt_in_out_capturing: vi.fn(() => {
      state.consent = "pending";
      calls.push("clear");
    }),
    reset: vi.fn(() => {
      state.consent = "pending";
      state.identified = false;
      calls.push("reset");
    }),
    capture: vi.fn((event: string) => calls.push(`capture:${event}`)),
  };
  return { state, calls, api };
});
vi.mock("posthog-js", () => ({ default: fake.api }));

const config = vi.hoisted(() => ({ value: { key: "phc_test", host: "https://ph.invalid" } as { key: string; host: string } | null }));
vi.mock("@/lib/analytics/config", () => ({ analyticsConfig: () => config.value }));

import {
  chooseConsent,
  getConsentView,
  identificationAllowed,
  openConsentPreferences,
  reapplyConsentAfterReset,
  resetConsentForTests,
  startAnalytics,
  storedIdentifiedId,
} from "@/lib/analytics/consent-client";

let regionDefault: "granted" | "pending" | "error" = "pending";
let sessionAccount: string | null | "error" = null;

function setCookie(value: string | null) {
  document.cookie = value ? `urdais_analytics_consent=${value}; path=/` : "urdais_analytics_consent=; path=/; max-age=0";
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetConsentForTests();
  fake.state.consent = "pending";
  fake.state.loaded = false;
  fake.calls.length = 0;
  for (const fn of Object.values(fake.api)) if (typeof fn === "function" && "mockClear" in fn) fn.mockClear();
  config.value = { key: "phc_test", host: "https://ph.invalid" };
  setCookie(null);
  regionDefault = "pending";
  sessionAccount = null;
  sessionStorage.clear();
  document.cookie = "ph_phc_test_posthog=; path=/; max-age=0";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/analytics/identity")) {
        if (sessionAccount === "error") throw new Error("offline");
        return { json: async () => ({ accountId: sessionAccount }) };
      }
      if (regionDefault === "error") throw new Error("offline");
      return { json: async () => ({ default: regionDefault }) };
    }),
  );
  Object.defineProperty(navigator, "doNotTrack", { value: null, configurable: true });
  Object.defineProperty(navigator, "globalPrivacyControl", { value: undefined, configurable: true });
});

afterEach(() => vi.unstubAllGlobals());

describe("starting", () => {
  it("does nothing without configuration", () => {
    config.value = null;
    startAnalytics();
    expect(fake.api.init).not.toHaveBeenCalled();
    expect(getConsentView().status).toBe("off");
  });

  it("never starts PostHog for Do Not Track or Global Privacy Control", () => {
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true });
    startAnalytics();
    expect(fake.api.init).not.toHaveBeenCalled();
    expect(getConsentView().status).toBe("blocked");
    Object.defineProperty(navigator, "globalPrivacyControl", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
    resetConsentForTests();
    startAnalytics();
    expect(fake.api.init).not.toHaveBeenCalled();
  });

  it("configures cookieless-on-reject, no flags, no replay, no external scripts", () => {
    startAnalytics();
    const options = fake.api.init.mock.calls[0]![1] as Record<string, unknown>;
    expect(options).toMatchObject({
      cookieless_mode: "on_reject",
      advanced_disable_flags: true,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
      capture_pageview: "history_change",
    });
    // Not PostHog's DNT handling: under on_reject it would make DNT browsers cookieless-tracked.
    expect(options.respect_dnt).toBeUndefined();
  });
});

describe("before a choice", () => {
  it("captures nothing in a prior-consent region and shows the banner", async () => {
    regionDefault = "pending";
    startAnalytics();
    expect(getConsentView().status).toBe("resolving");
    await flush();
    expect(getConsentView()).toMatchObject({ status: "pending", explicit: false });
    expect(fake.calls).toEqual(["init"]);
    expect(identificationAllowed()).toBe(false);
  });

  it("treats a failed region lookup as prior-consent", async () => {
    regionDefault = "error";
    startAnalytics();
    await flush();
    expect(getConsentView().status).toBe("pending");
  });

  it("turns on by default elsewhere (the SDK then sends the landing pageview it held back)", async () => {
    regionDefault = "granted";
    startAnalytics();
    await flush();
    expect(getConsentView()).toMatchObject({ status: "granted", explicit: false });
    expect(fake.calls).toEqual(["init", "opt_in:false"]);
    expect(identificationAllowed()).toBe(true);
  });

  it("keeps a by-default browser's id on later visits instead of cycling it through pending", async () => {
    fake.state.consent = "granted"; // from an earlier visit
    regionDefault = "granted";
    startAnalytics();
    await flush();
    expect(fake.calls).toEqual(["init"]);
    expect(getConsentView().status).toBe("granted");
  });

  it("withdraws a by-default grant when the visitor is now in a prior-consent region", async () => {
    fake.state.consent = "granted";
    regionDefault = "pending";
    startAnalytics();
    await flush();
    expect(fake.calls).toEqual(["init", "reset"]);
    expect(getConsentView().status).toBe("pending");
  });
});

describe("a stored choice", () => {
  it("applies an acceptance before PostHog decides on the first pageview, and asks no region", () => {
    setCookie("granted");
    startAnalytics();
    expect(fake.calls).toEqual(["init", "opt_in:false"]);
    expect(getConsentView()).toMatchObject({ status: "granted", explicit: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a refusal in a prior-consent region never starts PostHog at all", async () => {
    regionDefault = "pending";
    setCookie("denied");
    startAnalytics();
    await flush();
    expect(fake.api.init).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);
    expect(getConsentView()).toMatchObject({ status: "denied", explicit: true, regionDefault: "pending" });
  });

  it("a refusal where the region lookup fails is treated as prior-consent: PostHog never starts", async () => {
    regionDefault = "error";
    setCookie("denied");
    startAnalytics();
    await flush();
    expect(fake.api.init).not.toHaveBeenCalled();
  });

  it("a refusal in a default-on region starts PostHog cookieless, after clearing anything stored", async () => {
    regionDefault = "granted";
    fake.state.consent = "granted";
    setCookie("denied");
    startAnalytics();
    expect(fake.api.init).not.toHaveBeenCalled(); // waits for the region
    await flush();
    expect(fake.calls).toEqual(["init", "reset", "opt_out"]);
    expect(identificationAllowed()).toBe(false);
  });
});

describe("choosing", () => {
  it("accepting from pending records it and opts in", async () => {
    startAnalytics();
    await flush();
    chooseConsent("granted");
    expect(document.cookie).toContain("urdais_analytics_consent=granted");
    // No manual pageview: the SDK sends the held-back one itself.
    expect(fake.calls.at(-1)).toBe("opt_in:false");
    expect(getConsentView()).toMatchObject({ status: "granted", explicit: true, preferencesOpen: false });
  });

  it("EEA: declining from pending collects nothing — no opt-out, so no cookieless counting", async () => {
    regionDefault = "pending";
    startAnalytics();
    await flush();
    chooseConsent("denied");
    expect(document.cookie).toContain("urdais_analytics_consent=denied");
    expect(fake.api.opt_out_capturing).not.toHaveBeenCalled();
    expect(fake.state.consent).toBe("pending"); // the SDK state that captures and stores nothing
    expect(fake.api.capture).not.toHaveBeenCalled();
  });

  it("default-on region: declining goes cookieless, without a manual pageview", async () => {
    regionDefault = "granted";
    startAnalytics();
    await flush();
    chooseConsent("denied");
    expect(fake.calls.slice(-2)).toEqual(["reset", "opt_out"]);
    expect(fake.api.capture).not.toHaveBeenCalled();
  });

  it("EEA withdrawal: accepted then declined clears identity and storage and does not go cookieless", async () => {
    // sessionStorage only: jsdom's localStorage is unusable under this Node, and the
    // real-browser check covers localStorage.
    sessionStorage.setItem("ph_phc_test_window_id", "w");
    sessionStorage.setItem("unrelated", "kept");
    regionDefault = "pending";
    setCookie("granted");
    startAnalytics();
    openConsentPreferences(); // learns the region
    await flush();
    chooseConsent("denied");
    expect(fake.calls.slice(-1)).toEqual(["reset"]);
    expect(fake.api.opt_out_capturing).not.toHaveBeenCalled();
    expect(fake.state.consent).toBe("pending");
    expect(getConsentView().preferencesOpen).toBe(false);
    expect(sessionStorage.getItem("ph_phc_test_window_id")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("kept");
  });

  it("withdrawal before the region is known takes the conservative path", () => {
    setCookie("granted");
    startAnalytics(); // no region lookup for a stored acceptance
    chooseConsent("denied");
    expect(fake.api.opt_out_capturing).not.toHaveBeenCalled();
    expect(fake.state.consent).toBe("pending");
  });

  it("default-on withdrawal: accepted then declined goes cookieless", async () => {
    regionDefault = "granted";
    setCookie("granted");
    startAnalytics();
    openConsentPreferences();
    await flush();
    chooseConsent("denied");
    expect(fake.calls.slice(-2)).toEqual(["reset", "opt_out"]);
  });

  it("EEA: accepting after a refusal starts PostHog then, and the SDK counts this page", async () => {
    regionDefault = "pending";
    setCookie("denied");
    startAnalytics();
    await flush();
    expect(fake.api.init).not.toHaveBeenCalled();
    chooseConsent("granted");
    expect(fake.calls).toEqual(["init", "opt_in:false"]);
    expect(getConsentView()).toMatchObject({ status: "granted", explicit: true });
  });

  it("re-applies the choice after a sign-out reset clears it", () => {
    setCookie("granted");
    startAnalytics();
    fake.api.reset();
    reapplyConsentAfterReset();
    expect(fake.calls.slice(-2)).toEqual(["reset", "opt_in:false"]);
    expect(fake.state.consent).toBe("granted");
  });

  it("sign-out keeps an EEA refusal silent", async () => {
    regionDefault = "pending";
    startAnalytics();
    await flush();
    chooseConsent("denied");
    fake.api.reset();
    reapplyConsentAfterReset();
    expect(fake.api.opt_out_capturing).not.toHaveBeenCalled();
    expect(fake.state.consent).toBe("pending");
  });
});

describe("a browser PostHog identified on an earlier visit", () => {
  const ACCOUNT = "0f8e1c3a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
  const identifiedCookie = (id = ACCOUNT) => {
    document.cookie = `ph_phc_test_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: id, $user_state: "identified" }))}; path=/`;
  };
  const identityChecks = () => (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(([url]) => String(url).includes("/api/analytics/identity")).length;

  it("reads PostHog's own persistence for an identified id, and ignores anonymous ones", () => {
    identifiedCookie();
    expect(storedIdentifiedId("phc_test")).toBe(ACCOUNT);
    document.cookie = `ph_phc_test_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: "anon", $user_state: "anonymous" }))}; path=/`;
    expect(storedIdentifiedId("phc_test")).toBeNull();
  });

  it("keeps the identity when the session still belongs to that account, and checks once per tab", async () => {
    setCookie("granted");
    identifiedCookie();
    sessionAccount = ACCOUNT;
    startAnalytics();
    expect(fake.api.init).not.toHaveBeenCalled(); // waits for the check
    await flush();
    expect(fake.calls).toEqual(["init", "opt_in:false"]);
    expect(fake.api.reset).not.toHaveBeenCalled();
    resetConsentForTests();
    fake.api.init.mockClear();
    startAnalytics();
    expect(fake.api.init).toHaveBeenCalled(); // verified in this tab: no second check
    expect(identityChecks()).toBe(1);
  });

  it("re-checks a tab whose verification is older than the re-check window", async () => {
    setCookie("granted");
    identifiedCookie();
    sessionStorage.setItem("urdais_analytics_identity_verified", `${ACCOUNT} ${Date.now() - 11 * 60 * 1000}`);
    sessionAccount = null; // deleted elsewhere since
    startAnalytics();
    await flush();
    expect(identityChecks()).toBe(1);
    expect(fake.calls).toEqual(["init", "reset", "opt_in:false"]);
  });

  it("resets before anything is sent when the account is gone or the session ended", async () => {
    for (const answer of [null, "a-different-account", "error"] as const) {
      resetConsentForTests();
      fake.calls.length = 0;
      sessionStorage.clear();
      setCookie("granted");
      identifiedCookie();
      sessionAccount = answer;
      startAnalytics();
      await flush();
      // reset() first, inside loaded, before the SDK schedules the first pageview; then consent re-applied.
      expect(fake.calls, String(answer)).toEqual(["init", "reset", "opt_in:false"]);
    }
  });

  it("does not check browsers that were never identified", async () => {
    setCookie("granted");
    startAnalytics();
    expect(identityChecks()).toBe(0);
  });
});
