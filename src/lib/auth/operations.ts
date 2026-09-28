/**
 * The authentication operations.
 *
 * ## Urdais authenticates with an emailed code
 *
 * Two calls make up the customer flow: `sendEmailOtp` asks Supabase to email a
 * numeric verification code, and `verifyEmailOtp` exchanges that code for a
 * session. The reader never leaves Urdais.
 *
 * The code is not a verification step layered on top of a password account — **it
 * is the credential**. Possession of the mailbox is what proves identity, so
 * authentication and verification are the same event rather than two.
 *
 * A code rather than a link, because a link has to be *followed*: it opens wherever
 * the mail client decides, so a reader who starts on a laptop can end up
 * authenticated on their phone, and corporate mail scanners that prefetch URLs can
 * consume a single-use link before the recipient ever clicks it. A code is typed
 * into the browser that asked for it, which is also exactly what this
 * server-action-and-httpOnly-cookie architecture wants.
 *
 * `signUpWithPassword` and `signInWithPassword` remain below as **legacy**. They
 * are not reachable from any customer surface; see their own comments for why
 * they were kept rather than deleted.
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

import { looksLikeOtp, normalizeOtp } from "@/lib/auth/otp";

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
  | "missing_code"
  | "malformed_code"
  | "code_rejected"
  | "otp_disabled"
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

/** Copy safe to show a reader. Nothing here reveals whether an account exists. */
const MESSAGES: Record<CredentialRejection, string> = {
  missing_email: "Enter your email address.",
  missing_code: "Enter the verification code we emailed you.",
  malformed_code: "That does not look like a verification code. Check the digits and try again.",
  // One message for a wrong code and an expired one, because Supabase answers both
  // with `otp_expired` and does not say which. The remedy is identical.
  code_rejected: "That code is incorrect or has expired. Request a new one and try again.",
  otp_disabled: "Email sign-in is not available right now.",
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
 * Record why the provider refused, safely.
 *
 * The reader's message cannot say which of several limits or failures was hit, and
 * an operator needs to — the SMTP misconfiguration found during verification was
 * invisible without this.
 *
 * **Code and status only.** Never the address, the code, a token, or the provider's
 * error text, which routinely quotes the address back. What survives here is the
 * category and the two identifiers needed to look the rest up in Supabase's own
 * auth logs.
 */
function logProviderRefusal(operation: string, reason: CredentialRejection, error: unknown): void {
  const detail = (error ?? {}) as { code?: unknown; status?: unknown };
  console.error(
    `auth: ${operation} refused (reason=${reason} code=${String(detail.code ?? "none")} status=${String(detail.status ?? "none")})`,
  );
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
  if (code === "otp_expired" || message.includes("token has expired or is invalid")) return "code_rejected";
  if (code === "otp_disabled") return "otp_disabled";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "email_not_confirmed";
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  // `email_address_invalid` is what Supabase's hosted deliverability check answers
  // for an address it will not send to. Without it the reader is told the service is
  // unavailable, which sends them away to try again later over a problem only they
  // can fix.
  if (
    code === "validation_failed" ||
    code === "email_address_invalid" ||
    message.includes("unable to validate email") ||
    message.includes("invalid email") ||
    message.includes("is invalid")
  ) {
    return "invalid_email";
  }
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error?.status === 429 || message.includes("rate limit")) {
    return "rate_limited";
  }
  if (code === "signup_disabled" || message.includes("signups not allowed")) return "signups_disabled";
  return "provider_error";
}

/* ------------------------------------------------------------------ operations */

/** The subset of the Supabase client these operations use. Keeps tests honest. */
export type AuthCapableClient = Pick<SupabaseClient, "auth">;

export type EmailOtpSendOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "rejected"; readonly reason: CredentialRejection; readonly message: string };

export type EmailOtpVerifyOutcome =
  | { readonly kind: "verified" }
  | { readonly kind: "rejected"; readonly reason: CredentialRejection; readonly message: string };

/**
 * Email a one-time verification code.
 *
 * ## One call for both "create account" and "log in"
 *
 * `signInWithOtp` signs a new address up and signs an existing one in, and
 * `shouldCreateUser` is left at its default of `true` on **both** screens. That
 * is not laziness — it is the anti-enumeration property. If the login screen
 * passed `false`, an unknown address would produce a different answer from a known
 * one, and the form would become an oracle for "does this person have a Urdais
 * account". Identical calls give identical answers.
 *
 * The two screens therefore differ only in their heading and their link to the
 * other one. That is what the specification means by the distinction being "user
 * orientation": it is real to the reader and invisible to the server.
 *
 * ## What arrives is decided by the email template, not by this call
 *
 * `signInWithOtp` always mints a token. Whether the *email* shows it as a code
 * depends on the project's Magic Link template: `{{ .Token }}` renders the code,
 * `{{ .ConfirmationURL }}` renders a link. Both refer to the same token, so
 * `verifyEmailOtp` works either way — but a reader cannot type a code they were
 * never shown. The template requirement is documented in
 * `docs/architecture/passwordless-authentication.md`.
 *
 * No `emailRedirectTo` is passed. That option exists to tell Supabase where a
 * *link* should land, and Urdais no longer asks anyone to follow one; omitting it
 * keeps the email from carrying a second, redundant way in.
 */
export async function sendEmailOtp(
  client: AuthCapableClient,
  input: { email: string },
): Promise<EmailOtpSendOutcome> {
  const email = normalizeEmail(input.email ?? "");
  if (email === "") return reject("missing_email");
  if (!looksLikeEmail(email)) return reject("invalid_email");

  let result;
  try {
    result = await client.auth.signInWithOtp({ email });
  } catch {
    return reject("provider_error");
  }

  // Reported honestly. Telling someone a code is on its way when the provider
  // refused leaves them waiting for mail that will never arrive.
  if (result.error) {
    const reason = classifyAuthError(result.error);

    // Logged because the reader's message cannot say which limit was hit, and an
    // operator needs to. "Too many attempts" covers a per-address frequency cap, a
    // project-wide hourly email budget, and a generic 429 — and those have
    // different fixes: wait, raise the rate limit, or configure custom SMTP
    // because the built-in mailer allows only a couple of messages an hour.
    //
    // The code and status only. Never the address or the provider's message, both
    // of which carry the address into the log.
    logProviderRefusal("otp send", reason, result.error);
    return reject(reason);
  }
  return { kind: "sent" };
}

/**
 * Exchange an emailed code for a session.
 *
 * `type: "email"` covers both a new address and a returning one, which is what
 * keeps the create-account and log-in screens indistinguishable to the server.
 *
 * On success the Supabase client writes the session cookies through the same
 * server-side path every other Urdais auth call uses, so the caller must be a
 * Server Action or Route Handler. Nothing here reaches the browser.
 *
 * ## Why "incorrect" and "expired" are one outcome
 *
 * Supabase answers a wrong code and an expired one with the same `otp_expired`
 * code — there is no distinct "invalid OTP" code in its error set. Splitting them
 * in the copy would mean guessing, and guessing wrong tells someone their code
 * expired when they actually mistyped it, or the reverse. One honest message
 * covers both, and the remedy is the same either way: request a new code.
 */
export async function verifyEmailOtp(
  client: AuthCapableClient,
  input: { email: string; token: string },
): Promise<EmailOtpVerifyOutcome> {
  const email = normalizeEmail(input.email ?? "");
  const token = normalizeOtp(input.token ?? "");

  if (email === "") return reject("missing_email");
  if (token === "") return reject("missing_code");
  // A shape check only, to avoid a pointless round trip and to say something more
  // useful than "incorrect" when someone submits four digits. Supabase decides
  // correctness.
  if (!looksLikeOtp(token)) return reject("malformed_code");

  let result;
  try {
    result = await client.auth.verifyOtp({ email, token, type: "email" });
  } catch {
    return reject("provider_error");
  }

  if (result.error) {
    const reason = classifyAuthError(result.error);
    logProviderRefusal("otp verify", reason, result.error);
    return reject(reason);
  }

  // No error and no session should not happen. Treating it as a refusal is the safe
  // reading: reporting a sign-in that did not occur would send an unauthenticated
  // reader onward as though they were authenticated.
  if (!result.data?.session) return reject("provider_error");

  return { kind: "verified" };
}

/**
 * LEGACY. Create an account with an email and a password.
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

/**
 * LEGACY. Sign in with an email and a password.
 *
 * Retained deliberately, and reachable from no customer surface. Two reasons:
 *
 *   - accounts created before this change still have passwords, and deleting the
 *     only code path that can use them would strand them. Production holds none
 *     today, but the development fixtures do.
 *   - it is what lets the authenticated, entitled and signed-out states be
 *     exercised end to end without a mailbox, which is otherwise impossible once
 *     every customer path requires receiving real email.
 *
 * `/auth/sign-in` keeps it for operators. Nothing under `/access/` imports it, and
 * a test asserts that.
 */
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
