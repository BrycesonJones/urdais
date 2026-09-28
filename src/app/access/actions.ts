"use server";

/**
 * Onboarding's Server Actions: email a sign-in link, resend it, start Google.
 *
 * Thin shells over `@/lib/auth/operations` and Supabase OAuth. There is no second
 * auth implementation and no Supabase browser client: the session is an httpOnly
 * cookie written by the server, and a form is not a reason to give that up.
 *
 * ## One primitive, two screens
 *
 * "Create your account" and "Log in" both call `sendEmailSignInLink`. Supabase
 * signs a new address up and an existing one in, and the call is identical from
 * both screens — which is the anti-enumeration property, not a shortcut. A login
 * screen that behaved differently for an unknown address would be an oracle for who
 * has a Urdais account.
 *
 * ## What is never read from the form
 *
 * Only `email` and `returnTo`. There is no password field anywhere in the customer
 * flow. An account id, a verification flag or an entitlement submitted as a field is
 * ignored, and `returnTo` is sanitised before use. Nothing here writes
 * `identity.premium_entitlements`: onboarding cannot grant access.
 */

import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { sendEmailSignInLink } from "@/lib/auth/operations";
import { GOOGLE_PROVIDER, isGoogleAuthAvailable } from "@/lib/auth/google";
import { DEFAULT_RETURN_TO, safeReturnTo } from "@/lib/auth/return-to";
import type { AuthFormState } from "@/app/auth/form-state";
import { onboardingHref, ONBOARDING_HREF } from "@/lib/onboarding/routes";
import { forgetPendingEmail, readPendingEmail, rememberPendingEmail } from "@/lib/onboarding/pending-email";

const UNAVAILABLE: AuthFormState = {
  status: "error",
  message: "Sign-in is unavailable right now. Try again shortly.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Where a sign-in link should land.
 *
 * Absolute, because it goes in an email, and built from the deployment's own
 * configured origin rather than from the request — a forged `Host` header must not
 * be able to point a sign-in link off-site.
 *
 * `next` is `/access`, which resolves the newly authenticated viewer and continues
 * to whichever state they belong in. It is deliberately not the premium page: the
 * link finishes authentication, not the journey, and spending the destination here
 * would leave nothing for Phase 5 to return them to after payment.
 */
function linkRedirectUrl(returnTo: string): string {
  const url = new URL("/auth/confirm", env.appUrl);
  url.searchParams.set("next", onboardingHref("create_account", returnTo));
  return url.toString();
}

/** `/access` carrying the reader's destination. */
function entryHref(returnTo: string): string {
  return returnTo === DEFAULT_RETURN_TO ? ONBOARDING_HREF : `${ONBOARDING_HREF}?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Email a sign-in link. Used by both the create-account and the log-in screens. */
export async function sendSignInLinkAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));
  const email = field(formData, "email");

  const outcome = await sendEmailSignInLink(created.client, { email, emailRedirectTo: linkRedirectUrl(returnTo) });
  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  // Remember the address for the challenge screen to name and resend to. It is not
  // an identity and not a verification state; see pending-email.ts.
  await rememberPendingEmail(email);
  redirect(onboardingHref("email_challenge", returnTo));
}

/**
 * Send the link again.
 *
 * The address comes from the server's own record of the pending request, never from
 * the form: a resend that accepted an arbitrary address would let anyone use Urdais
 * to mail anyone.
 */
export async function resendSignInLinkAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
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

  const outcome = await sendEmailSignInLink(created.client, { email, emailRedirectTo: linkRedirectUrl(returnTo) });

  // Reported as a failure when it was one. Saying "sent" after the provider refused
  // — a rate limit, most often — leaves someone waiting for mail that is not coming.
  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  return { status: "check_email", message: `Sign-in link sent again to ${email}.` };
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
      // Google → Supabase → here. `/auth/confirm` already exchanges the PKCE code
      // for a session and refuses an off-site `next`.
      redirectTo: linkRedirectUrl(returnTo),
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
