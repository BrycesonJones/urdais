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
} from "@/lib/analytics/consent-client";

let regionDefault: "granted" | "pending" | "error" = "pending";

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
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
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

  it("applies a refusal as cookieless, after clearing anything stored", () => {
    fake.state.consent = "granted";
    setCookie("denied");
    startAnalytics();
    expect(fake.calls).toEqual(["init", "reset", "opt_out"]);
    expect(getConsentView()).toMatchObject({ status: "denied", explicit: true });
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

  it("declining from pending goes cookieless, without a manual pageview", async () => {
    startAnalytics();
    await flush();
    chooseConsent("denied");
    expect(document.cookie).toContain("urdais_analytics_consent=denied");
    expect(fake.calls.slice(-2)).toEqual(["reset", "opt_out"]);
    expect(fake.api.capture).not.toHaveBeenCalled();
  });

  it("declining after accepting clears identity and stored data, including PostHog's session window ids", () => {
    // sessionStorage only: jsdom's localStorage is unusable under this Node, and the
    // real-browser check covers localStorage.
    sessionStorage.setItem("ph_phc_test_window_id", "w");
    sessionStorage.setItem("unrelated", "kept");
    setCookie("granted");
    startAnalytics();
    openConsentPreferences();
    chooseConsent("denied");
    expect(fake.calls.slice(-2)).toEqual(["reset", "opt_out"]);
    expect(getConsentView().preferencesOpen).toBe(false);
    expect(sessionStorage.getItem("ph_phc_test_window_id")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("kept");
  });

  it("re-applies the choice after a sign-out reset clears it", () => {
    setCookie("granted");
    startAnalytics();
    fake.api.reset();
    reapplyConsentAfterReset();
    expect(fake.calls.slice(-2)).toEqual(["reset", "opt_in:false"]);
    expect(fake.state.consent).toBe("granted");
  });
});
