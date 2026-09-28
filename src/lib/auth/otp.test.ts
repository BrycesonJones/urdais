/**
 * The shape rules for an emailed code.
 *
 * These are small functions with one property worth pinning: they must not be
 * stricter than Supabase. Validation that rejects a code Supabase minted is an
 * outage that presents itself to every reader as "wrong code".
 */

import { describe, expect, it } from "vitest";

import { MAX_OTP_LENGTH, MIN_OTP_LENGTH, expectedOtpLength, looksLikeOtp, normalizeOtp } from "@/lib/auth/otp";

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
  it("is six unless the project is configured otherwise", () => {
    expect(expectedOtpLength({})).toBe(6);
  });

  it("follows URDAIS_OTP_LENGTH when it names a length Supabase can produce", () => {
    expect(expectedOtpLength({ URDAIS_OTP_LENGTH: "8" })).toBe(8);
  });

  it("falls back rather than printing nonsense for an unusable value", () => {
    // Presentation only: a bad value here must never become a hint that tells
    // readers to type the wrong number of digits.
    for (const value of ["", "0", "5", "11", "six", "6.5", "-6"]) {
      expect(expectedOtpLength({ URDAIS_OTP_LENGTH: value }), value).toBe(6);
    }
  });
});
