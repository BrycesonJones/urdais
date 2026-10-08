"use server";

/**
 * Onboarding's Server Actions: email a code, verify it, resend it, start Google.
 *
 * Thin shells over `@/lib/auth/operations` and Supabase OAuth. There is no second
 * auth implementation and no Supabase browser client: the session is an httpOnly
 * cookie written by the server, and a form is not a reason to give that up.
 *
 * ## One primitive, two screens
 *
 * "Create your account" and "Log in" both call `sendEmailOtp`. Supabase signs a new
 * address up and an existing one in, and the call is identical from both screens — which is the anti-enumeration property, not a shortcut. A login
 * screen that behaved differently for an unknown address would be an oracle for who
 * has a Urdais account.
 *
 * ## What is never read from the form
 *
 * Only `email`, `code` and `returnTo`. There is no password field anywhere in the
 * customer flow. An account id, a verification flag or an entitlement submitted as a field is
 * ignored, and `returnTo` is sanitised before use. Nothing here writes
 * `identity.premium_entitlements`: onboarding cannot grant access.
 */

import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { sendEmailOtp, verifyEmailOtp } from "@/lib/auth/operations";
import { GOOGLE_PROVIDER, isGoogleAuthAvailable } from "@/lib/auth/google";
import { DEFAULT_RETURN_TO, safeReturnTo } from "@/lib/auth/return-to";
import type { AuthFormState } from "@/app/auth/form-state";
import { onboardingHref, ONBOARDING_HREF } from "@/lib/onboarding/routes";
import { forgetPendingEmail, readPendingEmail, rememberPendingEmail } from "@/lib/onboarding/pending-email";
import { persistPendingAudienceForViewer } from "@/lib/onboarding/audience-store";

const UNAVAILABLE: AuthFormState = {
  status: "error",
  message: "Sign-in is unavailable right now. Try again shortly.",
};

/**
 * Where Google should return the reader.
 *
 * `/auth/confirm` exchanges the PKCE code Supabase appends. Absolute and built from
 * the deployment's own origin, never the request, so a forged `Host` cannot point
 * the callback off-site.
 */
function googleCallbackUrl(returnTo: string): string {
  const url = new URL("/auth/confirm", env.appUrl);
  url.searchParams.set("next", onboardingHref("create_account", returnTo));
  return url.toString();
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** `/access` carrying the reader's destination. */
function entryHref(returnTo: string): string {
  return returnTo === DEFAULT_RETURN_TO ? ONBOARDING_HREF : `${ONBOARDING_HREF}?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Email a verification code. Used by both the create-account and the log-in screens. */
export async function sendOtpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));
  const email = field(formData, "email");

  const outcome = await sendEmailOtp(created.client, { email });
  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  // Remember the address so the code screen can name it, verify against it and
  // resend to it. It is onboarding context only -- not an identity, not proof of
  // ownership, and not authentication. See pending-email.ts.
  await rememberPendingEmail(email);
  redirect(onboardingHref("email_challenge", returnTo));
}

/**
 * Verify a submitted code and, on success, establish the session.
 *
 * The address is taken from the server's record of the pending request, **not from
 * the form**. A verify action that accepted an arbitrary address alongside a code
 * would let someone brute-force codes against a mailbox they do not own.
 *
 * Success redirects to `/access`, which resolves the brand-new viewer on a fresh
 * request and routes to whichever state the account is in — ready, or subscribed.
 * Deciding that here would mean computing the new state inside the request that
 * created it, and would put the state machine in two places.
 */
export async function verifyOtpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));
  const email = await readPendingEmail();

  if (!email) {
    return {
      status: "error",
      message: "We no longer have a pending sign-in on this device. Enter your email again.",
    };
  }

  const outcome = await verifyEmailOtp(created.client, { email, token: field(formData, "code") });

  // Stay on the code screen. The address is untouched, so the reader can simply
  // retype the code or ask for a new one.
  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  // The emailed code has established the session. Only now resolve the Urdais
  // account on the server and attach the signed pre-auth audience choice to it.
  // The cookie is consumed at most once, before the write: a failed write loses
  // the optional choice rather than leaving it for the next account to sign in
  // here. Failure never undoes a successful sign-in.
  await persistPendingAudienceForViewer();

  // Authenticated now, so the authoritative address is on the viewer and this copy
  // would only be a second source that could disagree with it.
  await forgetPendingEmail();
  redirect(entryHref(returnTo));
}

/**
 * Send a new code.
 *
 * The address comes from the server's own record of the pending request, never from
 * the form: a resend that accepted an arbitrary address would let anyone use Urdais
 * to mail anyone. Changing address goes through "Use a different email", which
 * clears the record rather than mutating identity inside a resend.
 *
 * Nothing is read from the submission at all. The parameter exists because
 * `useActionState` passes one, not because there is anything in it to use.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the shape `useActionState` requires; a resend reads nothing from the submission.
export async function resendOtpAction(_previous: AuthFormState, _formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  // No `returnTo` is read here. A resend does not navigate -- it stays on the code
  // screen and reports back -- so there is no destination to carry, and sanitising
  // one only to discard it would suggest there was.
  const email = await readPendingEmail();

  if (!email) {
    return {
      status: "error",
      message: "We no longer have a pending sign-in on this device. Enter your email again.",
    };
  }

  const outcome = await sendEmailOtp(created.client, { email });

  // Reported as a failure when it was one. Saying "sent" after the provider refused
  // — a rate limit, most often — leaves someone waiting for mail that is not coming.
  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  return { status: "check_email", message: "A new code is on its way." };
}

/**
 * Start Google authentication.
 *
 * Server-initiated: `skipBrowserRedirect` makes Supabase hand back the authorization
 * URL instead of navigating, and the server redirects to it. The browser never
 * constructs the OAuth request, so it cannot choose the provider, the scopes or the
 * callback.
 *
 * Availability is re-checked here and not merely at render time. The button being
 * absent is a presentation decision; this is the one that matters, because a form
 * can be submitted by something that never rendered the page.
 */
export async function signInWithGoogleAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!(await isGoogleAuthAvailable())) {
    return { status: "error", message: "Google sign-in is not available yet." };
  }

  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));

  const { data, error } = await created.client.auth.signInWithOAuth({
    provider: GOOGLE_PROVIDER,
    options: {
      // Google → Supabase → here. `/auth/confirm` exchanges the PKCE code for a
      // session and refuses an off-site `next`. This is the remaining legitimate
      // use of that route now that nothing is emailed as a link.
      redirectTo: googleCallbackUrl(returnTo),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) return { status: "error", message: "Google sign-in could not be started. Try again shortly." };

  // Supabase's own authorization URL, never one assembled here.
  redirect(data.url);
}

/** Clear a pending sign-in and return to the account form. */
export async function useDifferentEmailAction(formData: FormData): Promise<void> {
  await forgetPendingEmail();
  redirect(entryHref(safeReturnTo(field(formData, "returnTo"))));
}
