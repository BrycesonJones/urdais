/**
 * The authentication operations: create an account, sign in, sign out.
 *
 * Each returns a typed outcome rather than throwing, and each outcome is
 * something a UI can render without knowing what Supabase is. That is deliberate:
 * Phase 4 owns the polished onboarding journey and must be able to build it on
 * these three functions without reimplementing authentication or re-deriving what
 * a Supabase error code means.
 *
 * ## Account existence is not disclosed
 *
 * Supabase deliberately does not tell a caller whether a signed-up address was
 * already registered: with email confirmation on, signing up an existing address
 * succeeds and returns a user with an empty `identities` array instead of an
 * error. Urdais preserves that. `signUpWithPassword` answers
 * `confirmation_required` either way, so the sign-up form cannot be used to
 * enumerate who has a Urdais account. The `diagnostic` field distinguishes the two
 * for a server log and for tests; it is not a user-facing value and no copy should
 * branch on it.
 *
 * ## What these do not do
 *
 * They do not touch `identity.accounts`. A Urdais account is provisioned lazily,
 * the first time a signed-in request is resolved server-side — see
 * `@/lib/auth/accounts`. Provisioning at sign-up would mean an account row for
 * every address that ever started a sign-up and never confirmed, and would put
 * the write on the least trustworthy path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ input checks */

/**
 * A deliberately permissive address check.
 *
 * It rejects what is obviously not an address — no `@`, nothing before or after
 * it, whitespace, a bare domain — and defers everything else to Supabase, which
 * is the authority. A stricter regex here would reject valid addresses, which is
 * a worse failure than one extra round trip.
 */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "" || /\s/.test(trimmed)) return false;
  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;
  const local = parts[0] ?? "";
  const domain = parts[1] ?? "";
  if (local.length === 0 || domain.length < 3) return false;
  // A domain needs a dot with something either side of it.
  return /^[^.]+(\.[^.]+)+$/.test(domain);
}

/** Normalised as it will be stored: addresses are case-insensitive in practice. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/* ------------------------------------------------------------------ outcomes */

export type CredentialRejection =
  | "missing_email"
  | "missing_password"
  | "invalid_email"
  | "weak_password"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "signups_disabled"
  | "provider_error";

export type SignUpOutcome =
  | {
      readonly kind: "confirmation_required";
      /** Server-side only. Never shown to a reader; see the module comment. */
      readonly diagnostic: "new_account" | "existing_account";
    }
  | { readonly kind: "signed_in" }
  | { readonly kind: "rejected"; readonly reason: CredentialRejection; readonly message: string };

export type SignInOutcome =
  | { readonly kind: "signed_in" }
  | { readonly kind: "rejected"; readonly reason: CredentialRejection; readonly message: string };

export type SignOutOutcome = { readonly kind: "signed_out" } | { readonly kind: "failed"; readonly message: string };

export type ResendOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "rejected"; readonly reason: CredentialRejection; readonly message: string };

/** Copy safe to show a reader. Nothing here reveals whether an account exists. */
const MESSAGES: Record<CredentialRejection, string> = {
  missing_email: "Enter your email address.",
  missing_password: "Enter your password.",
  invalid_email: "That email address does not look valid.",
  weak_password: "That password does not meet the minimum requirements.",
  // One message for a wrong password and for an address with no account: telling
  // them apart is exactly the enumeration this avoids.
  invalid_credentials: "That email and password do not match an account.",
  email_not_confirmed: "Confirm your email address before signing in. Check your inbox for the confirmation link.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  signups_disabled: "New accounts are not being accepted right now.",
  provider_error: "Authentication is unavailable right now. Try again shortly.",
};

function reject(reason: CredentialRejection): { kind: "rejected"; reason: CredentialRejection; message: string } {
  return { kind: "rejected", reason, message: MESSAGES[reason] };
}

/**
 * Map a Supabase auth error onto a Urdais rejection.
 *
 * Matched on `code` where Supabase supplies one and on the message otherwise,
 * because the codes were introduced gradually and an older project can still
 * answer with a bare message. Anything unrecognised becomes `provider_error`:
 * generic, but never wrong, and never accidentally reported as a credential
 * problem the reader could "fix".
 */
export function classifyAuthError(error: { code?: string; message?: string; status?: number } | null | undefined): CredentialRejection {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();

  if (code === "weak_password" || message.includes("password should be") || message.includes("password is too short")) return "weak_password";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "email_not_confirmed";
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  if (code === "validation_failed" || message.includes("unable to validate email") || message.includes("invalid email")) return "invalid_email";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error?.status === 429 || message.includes("rate limit")) {
    return "rate_limited";
  }
  if (code === "signup_disabled" || message.includes("signups not allowed")) return "signups_disabled";
  return "provider_error";
}

/* ------------------------------------------------------------------ operations */

/** The subset of the Supabase client these operations use. Keeps tests honest. */
export type AuthCapableClient = Pick<SupabaseClient, "auth">;

/**
 * Create an account with an email and a password.
 *
 * `emailRedirectTo` is where Supabase's confirmation link sends the reader. It
 * must be an absolute URL that the project's redirect allow-list permits, and the
 * caller builds it — this module does not know the site's origin.
 */
export async function signUpWithPassword(
  client: AuthCapableClient,
  input: { email: string; password: string; emailRedirectTo?: string },
): Promise<SignUpOutcome> {
  const email = normalizeEmail(input.email ?? "");
  const password = input.password ?? "";

  if (email === "") return reject("missing_email");
  if (password === "") return reject("missing_password");
  if (!looksLikeEmail(email)) return reject("invalid_email");

  let result;
  try {
    result = await client.auth.signUp({
      email,
      password,
      options: input.emailRedirectTo ? { emailRedirectTo: input.emailRedirectTo } : undefined,
    });
  } catch {
    return reject("provider_error");
  }

  if (result.error) return reject(classifyAuthError(result.error));

  // Confirmations disabled on the project: Supabase returns a live session and the
  // reader is already signed in.
  if (result.data?.session) return { kind: "signed_in" };

  // Supabase signals "this address already has an account" by returning a user
  // with no identities, rather than an error. Both branches answer the same kind.
  const identities = result.data?.user?.identities;
  const existing = Array.isArray(identities) && identities.length === 0;
  return { kind: "confirmation_required", diagnostic: existing ? "existing_account" : "new_account" };
}

/** Sign in with an email and a password. */
export async function signInWithPassword(
  client: AuthCapableClient,
  input: { email: string; password: string },
): Promise<SignInOutcome> {
  const email = normalizeEmail(input.email ?? "");
  const password = input.password ?? "";

  if (email === "") return reject("missing_email");
  if (password === "") return reject("missing_password");

  let result;
  try {
    result = await client.auth.signInWithPassword({ email, password });
  } catch {
    return reject("provider_error");
  }

  if (result.error) return reject(classifyAuthError(result.error));
  if (!result.data?.session) {
    // No error and no session should not happen; treating it as a refusal is the
    // safe reading, since the alternative is reporting a sign-in that did not.
    return reject("provider_error");
  }
  return { kind: "signed_in" };
}

/**
 * Resend the signup confirmation email.
 *
 * Supabase's own `auth.resend`, not a mail system of Urdais's own: the token has to
 * be one the Auth server will accept, and only it can mint that.
 *
 * ## What this does and does not disclose
 *
 * It can only be called for `type: "signup"`, which Supabase will act on only where
 * a signup is actually pending. It therefore adds no capability an attacker does
 * not already have — the signup endpoint itself will send mail to any address — so
 * it is not a new enumeration or spam vector. It is still rate-limited by the
 * provider, and `over_email_send_rate_limit` maps to `rate_limited` so the reader is
 * told to wait rather than shown a generic failure.
 *
 * A failure is reported as a failure. Telling someone an email is on its way when
 * Supabase refused to send it is the one outcome that wastes their time completely,
 * and with no custom SMTP configured it is currently the likely one.
 */
export async function resendVerificationEmail(
  client: AuthCapableClient,
  input: { email: string; emailRedirectTo?: string },
): Promise<ResendOutcome> {
  const email = normalizeEmail(input.email ?? "");
  if (email === "") return reject("missing_email");
  if (!looksLikeEmail(email)) return reject("invalid_email");

  let result;
  try {
    result = await client.auth.resend({
      type: "signup",
      email,
      ...(input.emailRedirectTo ? { options: { emailRedirectTo: input.emailRedirectTo } } : {}),
    });
  } catch {
    return reject("provider_error");
  }

  if (result.error) return reject(classifyAuthError(result.error));
  return { kind: "sent" };
}

/**
 * Sign out.
 *
 * Supabase revokes the refresh token and `@supabase/ssr` clears the session
 * cookies on the response, which is why this must run somewhere cookies can be
 * written — a Server Action or Route Handler, never a component render. Clearing
 * React state is not signing out: the cookie is the session.
 */
export async function signOut(client: AuthCapableClient): Promise<SignOutOutcome> {
  try {
    const { error } = await client.auth.signOut();
    if (error) return { kind: "failed", message: error.message };
    return { kind: "signed_out" };
  } catch (error) {
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}
