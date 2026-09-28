/**
 * Sign-up, sign-in and sign-out outcomes.
 *
 * The case that matters most is the one that looks like a missing feature:
 * signing up an address that already has an account must be indistinguishable,
 * to the caller and to the reader, from signing up a new one. Anything else turns
 * the form into an account-enumeration oracle.
 */

import { describe, expect, it, vi } from "vitest";

import {
  classifyAuthError,
  sendEmailSignInLink,
  looksLikeEmail,
  normalizeEmail,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  type AuthCapableClient,
} from "@/lib/auth/operations";

type SignUpResult = { data: { user: unknown; session: unknown }; error: unknown };

function client(overrides: Partial<Record<"signUp" | "signInWithPassword" | "signInWithOtp" | "signOut", unknown>>): AuthCapableClient {
  return { auth: overrides as never } as AuthCapableClient;
}

const NEW_USER: SignUpResult = { data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null }, error: null };
const EXISTING_USER: SignUpResult = { data: { user: { id: "u1", identities: [] }, session: null }, error: null };

describe("the passwordless sign-in link", () => {
  it("asks Supabase to email a link", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    const outcome = await sendEmailSignInLink(client({ signInWithOtp }), {
      email: "reader@example.invalid",
      emailRedirectTo: "https://urdais.com/auth/confirm?next=%2Faccess",
    });

    expect(outcome).toEqual({ kind: "sent" });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "reader@example.invalid",
      options: { emailRedirectTo: "https://urdais.com/auth/confirm?next=%2Faccess" },
    });
  });

  it("does not restrict signup, which is what keeps the two screens identical", async () => {
    // `shouldCreateUser` is left at its default of true. Passing false on the login
    // screen would make an unknown address behave differently from a known one, and
    // the form would become an oracle for who has a Urdais account.
    const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    await sendEmailSignInLink(client({ signInWithOtp }), { email: "a@b.co" });
    expect(signInWithOtp.mock.calls[0]?.[0]?.options?.shouldCreateUser).toBeUndefined();
  });

  it("answers identically for an address that exists and one that does not", async () => {
    // Supabase returns the same shape either way; this asserts Urdais does not add a
    // distinction of its own.
    const first = await sendEmailSignInLink(client({ signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }) }), { email: "known@example.invalid" });
    const second = await sendEmailSignInLink(client({ signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }) }), { email: "unknown@example.invalid" });
    expect(first).toEqual(second);
  });

  it("normalises the address before sending", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    await sendEmailSignInLink(client({ signInWithOtp }), { email: "  Reader@Example.INVALID " });
    expect(signInWithOtp.mock.calls[0]?.[0]?.email).toBe("reader@example.invalid");
  });

  it("validates before calling the provider", async () => {
    const signInWithOtp = vi.fn();
    expect((await sendEmailSignInLink(client({ signInWithOtp }), { email: "" })).kind).toBe("rejected");
    expect((await sendEmailSignInLink(client({ signInWithOtp }), { email: "not-an-email" })).kind).toBe("rejected");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("reports a rate limit as something the reader can act on", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit" } });
    const outcome = await sendEmailSignInLink(client({ signInWithOtp }), { email: "a@b.co" });
    expect(outcome).toMatchObject({ kind: "rejected", reason: "rate_limited" });
    expect(outcome.kind === "rejected" && outcome.message).toMatch(/wait/i);
  });

  it("reports a provider failure as a failure, never as sent", async () => {
    // Saying "sent" when the provider refused leaves someone waiting for mail that
    // is not coming -- the one outcome that wastes their time completely.
    const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: { message: "smtp unavailable" } });
    expect((await sendEmailSignInLink(client({ signInWithOtp }), { email: "a@b.co" })).kind).toBe("rejected");
  });

  it("survives a thrown network error", async () => {
    const signInWithOtp = vi.fn().mockRejectedValue(new Error("fetch failed"));
    expect((await sendEmailSignInLink(client({ signInWithOtp }), { email: "a@b.co" })).kind).toBe("rejected");
  });
});

describe("email shape", () => {
  it("accepts ordinary addresses", () => {
    for (const value of ["a@b.co", "reader.name+tag@sub.example.invalid"]) expect(looksLikeEmail(value)).toBe(true);
  });

  it("rejects what is plainly not an address", () => {
    for (const value of ["", "  ", "no-at-sign", "@example.invalid", "reader@", "reader@localhost", "a b@c.co", "a@@b.co"]) {
      expect(looksLikeEmail(value), value).toBe(false);
    }
  });

  it("normalises case and surrounding space", () => {
    expect(normalizeEmail("  Reader@Example.INVALID ")).toBe("reader@example.invalid");
  });
});

describe("signing up", () => {
  it("reports confirmation required for a new account", async () => {
    const signUp = vi.fn().mockResolvedValue(NEW_USER);
    const outcome = await signUpWithPassword(client({ signUp }), { email: "new@example.invalid", password: "correct horse" });
    expect(outcome).toEqual({ kind: "confirmation_required", diagnostic: "new_account" });
  });

  it("reports the identical outcome for an address that already has an account", async () => {
    const signUp = vi.fn().mockResolvedValue(EXISTING_USER);
    const outcome = await signUpWithPassword(client({ signUp }), { email: "taken@example.invalid", password: "correct horse" });

    // Same `kind`, so no caller can branch on existence; the diagnostic is for a
    // server log only.
    expect(outcome.kind).toBe("confirmation_required");
    expect(outcome).toEqual({ kind: "confirmation_required", diagnostic: "existing_account" });
  });

  it("does not disclose existence through the outcome kind", async () => {
    const newOutcome = await signUpWithPassword(client({ signUp: vi.fn().mockResolvedValue(NEW_USER) }), {
      email: "a@example.invalid",
      password: "correct horse",
    });
    const existingOutcome = await signUpWithPassword(client({ signUp: vi.fn().mockResolvedValue(EXISTING_USER) }), {
      email: "b@example.invalid",
      password: "correct horse",
    });
    expect(newOutcome.kind).toBe(existingOutcome.kind);
  });

  it("signs the reader straight in when the project has confirmations disabled", async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    const outcome = await signUpWithPassword(client({ signUp }), { email: "new@example.invalid", password: "correct horse" });
    expect(outcome).toEqual({ kind: "signed_in" });
  });

  it("validates before calling the provider", async () => {
    const signUp = vi.fn();
    expect((await signUpWithPassword(client({ signUp }), { email: "", password: "x" })).kind).toBe("rejected");
    expect((await signUpWithPassword(client({ signUp }), { email: "a@b.co", password: "" })).kind).toBe("rejected");
    expect((await signUpWithPassword(client({ signUp }), { email: "not-an-email", password: "x" })).kind).toBe("rejected");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("passes the confirmation redirect through", async () => {
    const signUp = vi.fn().mockResolvedValue(NEW_USER);
    await signUpWithPassword(client({ signUp }), {
      email: "a@b.co",
      password: "correct horse",
      emailRedirectTo: "https://urdais.com/auth/confirm",
    });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { emailRedirectTo: "https://urdais.com/auth/confirm" } }),
    );
  });

  it("maps a weak password to a reason the reader can act on", async () => {
    const signUp = vi.fn().mockResolvedValue({ data: {}, error: { code: "weak_password", message: "Password should be at least 8 characters" } });
    const outcome = await signUpWithPassword(client({ signUp }), { email: "a@b.co", password: "short" });
    expect(outcome).toMatchObject({ kind: "rejected", reason: "weak_password" });
  });

  it("survives a thrown network error", async () => {
    const signUp = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const outcome = await signUpWithPassword(client({ signUp }), { email: "a@b.co", password: "correct horse" });
    expect(outcome).toMatchObject({ kind: "rejected", reason: "provider_error" });
  });
});

describe("signing in", () => {
  it("succeeds with a session", async () => {
    const signInFn = vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    expect(await signInWithPassword(client({ signInWithPassword: signInFn }), { email: "a@b.co", password: "pw" })).toEqual({
      kind: "signed_in",
    });
  });

  it("gives one message for a wrong password and for no such account", async () => {
    const signInFn = vi.fn().mockResolvedValue({ data: {}, error: { code: "invalid_credentials", message: "Invalid login credentials" } });
    const outcome = await signInWithPassword(client({ signInWithPassword: signInFn }), { email: "a@b.co", password: "wrong" });
    expect(outcome).toMatchObject({ kind: "rejected", reason: "invalid_credentials" });
    // The copy must not hint at which half was wrong.
    expect(outcome.kind === "rejected" && outcome.message).not.toMatch(/exist|found|unknown|registered/i);
  });

  it("surfaces an unconfirmed address distinctly, since the remedy differs", async () => {
    const signInFn = vi.fn().mockResolvedValue({ data: {}, error: { code: "email_not_confirmed", message: "Email not confirmed" } });
    const outcome = await signInWithPassword(client({ signInWithPassword: signInFn }), { email: "a@b.co", password: "pw" });
    expect(outcome).toMatchObject({ kind: "rejected", reason: "email_not_confirmed" });
    expect(outcome.kind === "rejected" && outcome.message).toMatch(/confirm/i);
  });

  it("rejects missing credentials without calling the provider", async () => {
    const signInFn = vi.fn();
    expect((await signInWithPassword(client({ signInWithPassword: signInFn }), { email: "", password: "" })).kind).toBe("rejected");
    expect(signInFn).not.toHaveBeenCalled();
  });

  it("refuses a response with neither error nor session", async () => {
    const signInFn = vi.fn().mockResolvedValue({ data: {}, error: null });
    const outcome = await signInWithPassword(client({ signInWithPassword: signInFn }), { email: "a@b.co", password: "pw" });
    // Reporting a sign-in that did not happen is the one wrong answer here.
    expect(outcome).toMatchObject({ kind: "rejected", reason: "provider_error" });
  });
});

describe("signing out", () => {
  it("reports success", async () => {
    expect(await signOut(client({ signOut: vi.fn().mockResolvedValue({ error: null }) }))).toEqual({ kind: "signed_out" });
  });

  it("reports failure rather than throwing", async () => {
    const outcome = await signOut(client({ signOut: vi.fn().mockRejectedValue(new Error("network")) }));
    expect(outcome).toMatchObject({ kind: "failed" });
  });
});

describe("classifying provider errors", () => {
  it("maps the hosted deliverability rejection to an address problem", () => {
    // Otherwise a reader whose address Supabase will not send to is told the service
    // is unavailable and comes back later to the same failure.
    expect(classifyAuthError({ code: "email_address_invalid", message: 'Email address "x@example.com" is invalid' })).toBe("invalid_email");
  });

  it("matches on code where Supabase supplies one", () => {
    expect(classifyAuthError({ code: "over_request_rate_limit" })).toBe("rate_limited");
    expect(classifyAuthError({ code: "signup_disabled" })).toBe("signups_disabled");
    expect(classifyAuthError({ code: "validation_failed" })).toBe("invalid_email");
  });

  it("falls back to the message for an older project with no code", () => {
    expect(classifyAuthError({ message: "Invalid login credentials" })).toBe("invalid_credentials");
    expect(classifyAuthError({ message: "Email not confirmed" })).toBe("email_not_confirmed");
    expect(classifyAuthError({ message: "Password should be at least 6 characters" })).toBe("weak_password");
  });

  it("uses the status code for rate limiting", () => {
    expect(classifyAuthError({ status: 429, message: "slow down" })).toBe("rate_limited");
  });

  it("never guesses a credential problem from an unrecognised error", () => {
    // A generic failure reported as "wrong password" would send a reader in
    // circles over an outage.
    expect(classifyAuthError({ message: "database unavailable" })).toBe("provider_error");
    expect(classifyAuthError(null)).toBe("provider_error");
    expect(classifyAuthError(undefined)).toBe("provider_error");
  });
});
