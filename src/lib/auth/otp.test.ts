/**
 * The shape rules for an emailed code.
 *
 * These are small functions with one property worth pinning: they must not be
 * stricter than Supabase. Validation that rejects a code Supabase minted is an
 * outage that presents itself to every reader as "wrong code".
 */

import { describe, expect, it } from "vitest";

import { MAX_OTP_LENGTH, MIN_OTP_LENGTH, configuredOtpLength, looksLikeOtp, normalizeOtp } from "@/lib/auth/otp";

describe("the accepted range", () => {
  it("spans exactly what Supabase's otp_length permits", () => {
    expect(MIN_OTP_LENGTH).toBe(6);
    expect(MAX_OTP_LENGTH).toBe(10);
  });

  it("accepts every length in that range", () => {
    for (let length = MIN_OTP_LENGTH; length <= MAX_OTP_LENGTH; length += 1) {
      expect(looksLikeOtp("1".repeat(length)), `${length} digits`).toBe(true);
    }
  });

  it("refuses what Supabase could not have minted", () => {
    for (const candidate of ["", "1", "12345", "1".repeat(11), "abcdef", "  "]) {
      expect(looksLikeOtp(candidate), JSON.stringify(candidate)).toBe(false);
    }
  });
});

describe("normalising what a reader pastes", () => {
  it("keeps the digits and drops everything a mail client wraps them in", () => {
    // Real paste shapes: a trailing newline, a non-breaking space, the sentence's
    // punctuation, a hyphenated code. All of these are a correct code.
    expect(normalizeOtp("123456\n")).toBe("123456");
    expect(normalizeOtp("123 456")).toBe("123456");
    expect(normalizeOtp("Your code is 123456.")).toBe("123456");
    expect(normalizeOtp("123-456")).toBe("123456");
  });

  it("does not invent digits", () => {
    expect(normalizeOtp("no digits here")).toBe("");
  });

  it("survives a missing value rather than throwing inside a Server Action", () => {
    expect(normalizeOtp(undefined as unknown as string)).toBe("");
  });
});

describe("the length shown to the reader", () => {
  // UrdaisDev is set to 8. The app cannot read `otp_length` from any endpoint, so a
  // default of 6 was a false promise: "6-digit code" above a box expecting eight
  // tells the reader their correct code is the wrong shape.
  it("says nothing when nobody has configured a length", () => {
    expect(configuredOtpLength({})).toBeNull();
    expect(configuredOtpLength({ URDAIS_OTP_LENGTH: "" })).toBeNull();
    expect(configuredOtpLength({ URDAIS_OTP_LENGTH: "   " })).toBeNull();
  });

  it("follows URDAIS_OTP_LENGTH across the range Supabase can mint", () => {
    for (let length = MIN_OTP_LENGTH; length <= MAX_OTP_LENGTH; length += 1) {
      expect(configuredOtpLength({ URDAIS_OTP_LENGTH: String(length) }), String(length)).toBe(length);
    }
  });

  it("stays silent rather than printing a number Supabase could not have produced", () => {
    for (const value of ["0", "5", "11", "six", "6.5", "-6", "8abc", "abc8"]) {
      expect(configuredOtpLength({ URDAIS_OTP_LENGTH: value }), value).toBeNull();
    }
  });

  it("never rejects a code, whatever it says", () => {
    // The hint is presentation. An 8-digit code is valid on a deployment that
    // declares 6, because Supabase — not this value — decides.
    expect(configuredOtpLength({ URDAIS_OTP_LENGTH: "6" })).toBe(6);
    expect(looksLikeOtp("58877743")).toBe(true);
  });
});
