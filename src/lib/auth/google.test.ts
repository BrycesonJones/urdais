/**
 * Whether the Google button may be shown.
 *
 * The property under test is that it fails closed. Every way of not knowing —
 * unconfigured project, unreachable endpoint, malformed answer, provider switched
 * off — must produce "not available", because the alternative is rendering a button
 * that predictably fails. That is the whole reason availability is read from
 * Supabase rather than from a flag someone could switch on too early.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { googleAuthAvailability, isGoogleAuthAvailable, resetGoogleAvailabilityCache } from "@/lib/auth/google";
import { SUPABASE_PUBLISHABLE_KEY_VAR, SUPABASE_URL_VAR } from "@/lib/auth/config";

const CONFIGURED = {
  [SUPABASE_URL_VAR]: "https://ref.supabase.co",
  [SUPABASE_PUBLISHABLE_KEY_VAR]: "sb_publishable_abc123",
};

function respondWith(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body });
}

beforeEach(() => {
  resetGoogleAvailabilityCache();
  vi.stubGlobal("fetch", respondWith({ external: { google: false } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetGoogleAvailabilityCache();
});

describe("when Supabase says the provider is enabled", () => {
  it("is available", async () => {
    vi.stubGlobal("fetch", respondWith({ external: { google: true, email: true } }));
    expect(await googleAuthAvailability(CONFIGURED)).toEqual({ available: true, reason: "configured" });
    expect(await isGoogleAuthAvailable(CONFIGURED)).toBe(true);
  });

  it("asks the project's own settings endpoint, with the publishable key", async () => {
    const fetchMock = respondWith({ external: { google: true } });
    vi.stubGlobal("fetch", fetchMock);
    await googleAuthAvailability(CONFIGURED);

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://ref.supabase.co/auth/v1/settings");
    expect(init.headers.apikey).toBe("sb_publishable_abc123");
  });
});

describe("failing closed", () => {
  it("is unavailable when the provider is switched off", async () => {
    vi.stubGlobal("fetch", respondWith({ external: { google: false } }));
    expect(await googleAuthAvailability(CONFIGURED)).toEqual({ available: false, reason: "provider_disabled" });
  });

  it("is unavailable when Supabase itself is not configured", async () => {
    expect(await googleAuthAvailability({})).toEqual({ available: false, reason: "unconfigured" });
  });

  it("is unavailable when the endpoint answers an error status", async () => {
    vi.stubGlobal("fetch", respondWith({}, false));
    expect(await googleAuthAvailability(CONFIGURED)).toEqual({ available: false, reason: "unreachable" });
  });

  it("is unavailable when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await googleAuthAvailability(CONFIGURED)).toEqual({ available: false, reason: "unreachable" });
  });

  it("is unavailable when the answer is malformed", async () => {
    for (const body of [null, {}, { external: null }, { external: { google: "true" } }, "not json"]) {
      resetGoogleAvailabilityCache();
      vi.stubGlobal("fetch", respondWith(body));
      expect(await isGoogleAuthAvailable(CONFIGURED), JSON.stringify(body)).toBe(false);
    }
  });

  it("treats a truthy-but-not-true value as disabled", async () => {
    // `google: "true"` is what a hand-edited or proxied response looks like. Only a
    // real boolean counts.
    vi.stubGlobal("fetch", respondWith({ external: { google: 1 } }));
    expect(await isGoogleAuthAvailable(CONFIGURED)).toBe(false);
  });
});

describe("caching", () => {
  it("asks once per process, because the answer changes with a dashboard edit", async () => {
    const fetchMock = respondWith({ external: { google: true } });
    vi.stubGlobal("fetch", fetchMock);

    await isGoogleAuthAvailable(CONFIGURED);
    await isGoogleAuthAvailable(CONFIGURED);
    await isGoogleAuthAvailable(CONFIGURED);

    // A page render must not depend on a live call to a third party.
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("caches the unavailable answer too, so an outage is not retried per request", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    await isGoogleAuthAvailable(CONFIGURED);
    await isGoogleAuthAvailable(CONFIGURED);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("the browser cannot influence it", () => {
  it("takes no request-derived input at all", async () => {
    // The signature is the guarantee: an environment bag, and nothing a reader
    // could set. There is no query parameter, cookie or header that turns the
    // button on.
    expect(googleAuthAvailability.length).toBeLessThanOrEqual(1);
    expect(isGoogleAuthAvailable.length).toBeLessThanOrEqual(1);
  });
});
