"use server";

/**
 * Onboarding's Server Actions: create an account, log in, resend a confirmation.
 *
 * Thin shells over Phase 2's `@/lib/auth/operations`. There is deliberately no
 * second signup implementation and no Supabase browser client: Phase 2 chose
 * server-side operations with httpOnly cookies precisely so that an access decision
 * can never be made in a browser, and a form is not a reason to give that up.
 *
 * ## Where each action sends the reader
 *
 * On success they all redirect to `/access`, not to the screen the outcome implies.
 * That is a deliberate extra hop: `/access` resolves the viewer from scratch on a
 * fresh request and routes to whichever state the account is actually in. Deciding
 * the destination here would mean computing the new state from inside the request
 * that established it, which is both subtler and a second place for the state
 * machine to live.
 *
 * The one exception is signup that requires confirmation, which produces no session
 * at all — there is nothing for `/access` to resolve, so it goes straight to the
 * verification screen with the address remembered.
 *
 * ## What is never read from the form
 *
 * Only `email`, `password` and `returnTo`. An account id, a verification flag or an
 * entitlement submitted as a field is ignored, and `returnTo` is sanitised before
 * use. Nothing here writes `identity.premium_entitlements`; onboarding cannot grant
 * access.
 */

import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { resendVerificationEmail, signInWithPassword, signUpWithPassword } from "@/lib/auth/operations";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { DEFAULT_RETURN_TO, safeReturnTo } from "@/lib/auth/return-to";
import type { AuthFormState } from "@/app/auth/form-state";
import { onboardingHref, ONBOARDING_HREF } from "@/lib/onboarding/routes";
import { forgetPendingEmail, readPendingEmail, rememberPendingEmail } from "@/lib/onboarding/pending-email";

const UNAVAILABLE: AuthFormState = {
  status: "error",
  message: "Accounts are unavailable right now. Try again shortly.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** `/access` carrying the reader's destination, for the post-authentication hop. */
function entryHref(returnTo: string): string {
  return returnTo === DEFAULT_RETURN_TO ? ONBOARDING_HREF : `${ONBOARDING_HREF}?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Where Supabase's confirmation link should land.
 *
 * Absolute, because it goes in an email, and built from the deployment's own
 * configured origin rather than from the request — a forged `Host` header must not
 * be able to point a confirmation link off-site.
 *
 * `next` is **`/access`, not the premium page the reader came from.** Confirming an
 * address finishes one step of onboarding; it does not finish onboarding. Sending
 * them straight to the premium destination would drop them back where they started
 * having never seen the checkout boundary, and would consume the destination that
 * Phase 5 needs to return them to *after* payment. So the destination travels as
 * `/access?returnTo=…` and is handed on, not spent.
 */
function confirmationUrl(returnTo: string): string {
  const url = new URL("/auth/confirm", env.appUrl);
  url.searchParams.set("next", onboardingHref("intro", returnTo));
  return url.toString();
}

export async function onboardingSignUpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));
  const email = field(formData, "email");

  const outcome = await signUpWithPassword(created.client, {
    email,
    password: field(formData, "password"),
    emailRedirectTo: confirmationUrl(returnTo),
  });

  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  if (outcome.kind === "signed_in") {
    // Confirmations are disabled on this project, so a session already exists.
    redirect(entryHref(returnTo));
  }

  // Confirmation required, and therefore no session. Remember the address so the
  // verification screen can name it and resend to it. See pending-email.ts for why
  // this is a cookie and what it must never be used to decide.
  await rememberPendingEmail(email);
  redirect(onboardingHref("verification_required", returnTo));
}

export async function onboardingLoginAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));
  const outcome = await signInWithPassword(created.client, {
    email: field(formData, "email"),
    password: field(formData, "password"),
  });

  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  // There is a real session now, so the authoritative email is on the viewer and
  // the remembered copy would only be a second source that could disagree with it.
  await forgetPendingEmail();
  redirect(entryHref(returnTo));
}

/**
 * Resend the confirmation email.
 *
 * The address comes from the server's own record of the pending signup, never from
 * the form: a resend that accepted an arbitrary address from a submission would let
 * anyone use Urdais to mail anyone. Where a reader is already signed in, the
 * verification screen passes no address at all and the viewer's own is used.
 */
export async function resendVerificationAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));

  // Authoritative first: a signed-in but unconfirmed reader's address comes from the
  // Auth server. The remembered pending signup is the fallback, for the case where
  // confirmation is required and therefore no session exists yet.
  const identity = await resolveSupabaseIdentity();
  const email = (identity.kind === "authenticated" ? identity.identity.email : null) ?? (await readPendingEmail());

  if (!email) {
    // Nothing pending on this browser. Sending them back to the start is honest:
    // there is no address to resend to, and inventing one would be the vulnerability.
    return {
      status: "error",
      message: "We no longer have a pending sign-up on this device. Log in, or create your account again.",
    };
  }

  const outcome = await resendVerificationEmail(created.client, { email, emailRedirectTo: confirmationUrl(returnTo) });

  if (outcome.kind === "rejected") {
    // Reported as a failure, because it was one. Saying "sent" when Supabase refused
    // leaves someone waiting for mail that will never arrive -- the likely case while
    // no custom SMTP is configured.
    return { status: "error", message: outcome.message };
  }

  return { status: "check_email", message: `Verification email sent again to ${email}.` };
}
