/**
 * Cookie hardening.
 *
 * `httpOnly` is the assertion that matters: `@supabase/ssr` omits it by default so
 * its browser client can read the token, and Urdais does not want that. Without
 * this, any successful XSS could read a reader's access token out of
 * `document.cookie`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { hardenCookieOptions, shouldMarkSecure } from "@/lib/auth/cookies";

afterEach(() => vi.unstubAllEnvs());

describe("hardenCookieOptions", () => {
  it("forces httpOnly, whatever Supabase asked for", () => {
    expect(hardenCookieOptions({}).httpOnly).toBe(true);
    expect(hardenCookieOptions({ httpOnly: false }).httpOnly).toBe(true);
    expect(hardenCookieOptions(undefined).httpOnly).toBe(true);
  });

  it("preserves Supabase's own session semantics", () => {
    // path, maxAge and domain encode the library's session model and are not ours
    // to override.
    const hardened = hardenCookieOptions({ path: "/", maxAge: 3600, domain: ".urdais.com" });
    expect(hardened.path).toBe("/");
    expect(hardened.maxAge).toBe(3600);
    expect(hardened.domain).toBe(".urdais.com");
  });

  it("defaults sameSite to lax but lets Supabase choose", () => {
    expect(hardenCookieOptions({}).sameSite).toBe("lax");
    expect(hardenCookieOptions({ sameSite: "strict" }).sameSite).toBe("strict");
  });
});

describe("the Secure flag follows the deployment origin", () => {
  it("is set for an https deployment", () => {
    expect(shouldMarkSecure("https://urdais.com")).toBe(true);
  });

  it("is not set for local http development, which would break sign-in", () => {
    expect(shouldMarkSecure("http://localhost:3000")).toBe(false);
    expect(shouldMarkSecure("http://127.0.0.1:3100")).toBe(false);
  });
});
