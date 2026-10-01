/**
 * The 15-minute step-up window, read from the session's own `amr` claim.
 *
 * Why not `last_sign_in_at`: it belongs to the user and is refreshed by a sign-in
 * on any device, so an old session elsewhere would pass. These tests pin the
 * per-session reading and its boundary.
 */

import { describe, expect, it } from "vitest";

import { RECENT_AUTH_WINDOW_SECONDS, authenticatedAtFromClaims, isRecentAuthentication } from "@/lib/auth/recent-auth";

const NOW = 1_800_000_000;
const claims = (amr: unknown, sub = "user-1") => ({ sub, amr });

describe("the window", () => {
  it("is fifteen minutes", () => {
    expect(RECENT_AUTH_WINDOW_SECONDS).toBe(900);
  });

  it("accepts a sign-in under 15 minutes ago", () => {
    expect(isRecentAuthentication(NOW - 60, NOW)).toBe(true);
    expect(isRecentAuthentication(NOW - 899, NOW)).toBe(true);
  });

  it("accepts exactly 15:00 and refuses 15:01", () => {
    expect(isRecentAuthentication(NOW - 900, NOW)).toBe(true);
    expect(isRecentAuthentication(NOW - 901, NOW)).toBe(false);
  });

  it("refuses an older sign-in", () => {
    expect(isRecentAuthentication(NOW - 3600, NOW)).toBe(false);
    expect(isRecentAuthentication(NOW - 86_400 * 30, NOW)).toBe(false);
  });

  it("refuses no timestamp at all, and a timestamp from the future", () => {
    expect(isRecentAuthentication(null, NOW)).toBe(false);
    expect(isRecentAuthentication(NOW + 3600, NOW)).toBe(false);
    // Small clock skew is tolerated.
    expect(isRecentAuthentication(NOW + 30, NOW)).toBe(true);
  });
});

describe("reading the session's amr claim", () => {
  it("takes the latest timestamped authentication of this session", () => {
    expect(authenticatedAtFromClaims(claims([{ method: "otp", timestamp: NOW - 5000 }, { method: "otp", timestamp: NOW - 30 }]), "user-1")).toBe(NOW - 30);
  });

  it("ignores RFC-8176 string entries, which prove nothing about when", () => {
    expect(authenticatedAtFromClaims(claims(["otp", "password"]), "user-1")).toBeNull();
  });

  it("refuses claims for a different user", () => {
    expect(authenticatedAtFromClaims(claims([{ method: "otp", timestamp: NOW }], "someone-else"), "user-1")).toBeNull();
  });

  it("refuses malformed claims", () => {
    for (const bad of [null, undefined, "x", {}, { sub: "user-1" }, { sub: "user-1", amr: "otp" }, { sub: "user-1", amr: [{ method: "otp", timestamp: "now" }] }]) {
      expect(authenticatedAtFromClaims(bad, "user-1")).toBeNull();
    }
  });

  it("does not read `iat`, which a token refresh moves without re-authenticating", () => {
    expect(authenticatedAtFromClaims({ sub: "user-1", iat: NOW, amr: [{ method: "otp", timestamp: NOW - 7200 }] }, "user-1")).toBe(NOW - 7200);
  });
});
