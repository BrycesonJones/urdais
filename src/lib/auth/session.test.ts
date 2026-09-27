/**
 * Session rotation in the proxy.
 *
 * Two properties, and the second is the one that protects the product: a request
 * carrying a session gets its cookies rotated, and a request carrying none does
 * no Supabase work whatsoever. Urdais is a public site; if every anonymous page
 * view paid for an auth round trip, authentication would have made the public
 * product slower for the benefit of nobody reading it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasSupabaseAuthCookie } from "@/lib/auth/session";

const createServerClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/ssr", () => ({ createServerClient }));

describe("detecting a Supabase session cookie", () => {
  it("recognises the standard cookie", () => {
    expect(hasSupabaseAuthCookie(["sb-scwwjoyouohfrwylalha-auth-token"])).toBe(true);
  });

  it("recognises the chunked form, which is what a real session usually is", () => {
    // Supabase splits the cookie once it exceeds 4 KB. Missing these would sign
    // people out an hour after they signed in — a bug that only reproduces after
    // a wait, which is why it is tested directly.
    expect(hasSupabaseAuthCookie(["sb-abc-auth-token.0", "sb-abc-auth-token.1"])).toBe(true);
  });

  it("ignores unrelated cookies", () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
    expect(hasSupabaseAuthCookie(["theme", "NEXT_LOCALE", "sb-abc-other", "auth-token"])).toBe(false);
  });

  it("does not depend on the project ref", () => {
    // The ref differs between UrdaisDev and UrdaisProd; this file must not know it.
    expect(hasSupabaseAuthCookie(["sb-anything-at-all-auth-token"])).toBe(true);
  });
});

/** A minimal stand-in for NextRequest's cookie surface. */
function request(cookies: { name: string; value: string }[]) {
  const store = [...cookies];
  return {
    cookies: {
      getAll: () => store,
      set: (name: string, value: string) => {
        const existing = store.find((c) => c.name === name);
        if (existing) existing.value = value;
        else store.push({ name, value });
      },
    },
    nextUrl: { pathname: "/", origin: "https://urdais.test", searchParams: new URLSearchParams() },
  } as never;
}

describe("refreshSession", () => {
  beforeEach(() => {
    vi.resetModules();
    createServerClient.mockReset();
    vi.unstubAllEnvs();
  });

  it("does no Supabase work for an anonymous request", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");
    const { refreshSession } = await import("@/lib/auth/session");

    const response = await refreshSession(request([{ name: "theme", value: "dark" }]));

    // The whole public-performance argument rests on this assertion.
    expect(createServerClient).not.toHaveBeenCalled();
    expect(response).toBeTruthy();
  });

  it("does no Supabase work when auth is unconfigured, even with a cookie present", async () => {
    const { refreshSession } = await import("@/lib/auth/session");
    await refreshSession(request([{ name: "sb-ref-auth-token", value: "x" }]));
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("verifies and rotates when a session cookie is present", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");

    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    createServerClient.mockImplementation((_url: string, _key: string, options: { cookies: { setAll: (c: unknown[]) => void } }) => {
      // Simulate Supabase rotating the token, which is what `setAll` exists for.
      options.cookies.setAll([{ name: "sb-ref-auth-token", value: "rotated", options: { path: "/" } }]);
      return { auth: { getClaims } };
    });

    const { refreshSession } = await import("@/lib/auth/session");
    await refreshSession(request([{ name: "sb-ref-auth-token", value: "stale" }]));

    expect(createServerClient).toHaveBeenCalledOnce();
    // `getClaims`, not `getUser`: this path needs a validity check and the
    // rotation, not a user record, and getClaims can verify locally.
    expect(getClaims).toHaveBeenCalledOnce();
  });

  it("passes the request through when the refresh throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");
    createServerClient.mockReturnValue({ auth: { getClaims: vi.fn().mockRejectedValue(new Error("auth down")) } });

    const { refreshSession } = await import("@/lib/auth/session");
    // A Supabase outage must not take the public site down.
    await expect(refreshSession(request([{ name: "sb-ref-auth-token", value: "x" }]))).resolves.toBeTruthy();
  });

  it("never redirects", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");
    createServerClient.mockReturnValue({ auth: { getClaims: vi.fn().mockResolvedValue({ data: null, error: null }) } });

    const { refreshSession } = await import("@/lib/auth/session");
    for (const cookies of [[], [{ name: "sb-ref-auth-token", value: "x" }]]) {
      const response = await refreshSession(request(cookies));
      // A 3xx from the proxy would make Urdais login-required.
      expect(response.status).toBeLessThan(300);
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
