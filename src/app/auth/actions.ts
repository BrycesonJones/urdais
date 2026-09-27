"use server";

/**
 * Server Actions for the three authentication operations.
 *
 * These run on the server and can write cookies, which is the whole reason
 * sign-in and sign-out live here rather than in a component: the session *is* the
 * cookie, and a component render cannot set one.
 *
 * Each action is a thin shell — validate the form, call
 * `@/lib/auth/operations`, redirect or return a message. The logic is in that
 * module so Phase 4's onboarding can reuse it without going through a form.
 *
 * Nothing here trusts the form. An account id, an auth subject, a verification
 * flag or an entitlement submitted as a form field is ignored: the only fields
 * read are `email`, `password` and `returnTo`, and `returnTo` is validated as an
 * internal path before it is used.
 */

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { signInWithPassword, signOut, signUpWithPassword } from "@/lib/auth/operations";
import { DEFAULT_RETURN_TO, safeReturnTo } from "@/lib/auth/return-to";
import { env } from "@/config/env";
import type { AuthFormState } from "@/app/auth/form-state";

const UNAVAILABLE: AuthFormState = {
  status: "error",
  message: "Authentication is not configured for this deployment.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Where a confirmation link should land.
 *
 * Absolute, because Supabase puts it in an email. `env.appUrl` is the deployment's
 * own public origin, never a value from the request, so a forged `Host` header
 * cannot redirect a confirmation link off-site. The reader's intended destination
 * rides along as `next`, already validated.
 */
function confirmationUrl(returnTo: string): string {
  const url = new URL("/auth/confirm", env.appUrl);
  if (returnTo !== DEFAULT_RETURN_TO) url.searchParams.set("next", returnTo);
  return url.toString();
}

export async function signUpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));
  const outcome = await signUpWithPassword(created.client, {
    email: field(formData, "email"),
    password: field(formData, "password"),
    emailRedirectTo: confirmationUrl(returnTo),
  });

  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  if (outcome.kind === "signed_in") {
    // Email confirmation is disabled on this project; the reader is already in.
    redirect(returnTo);
  }

  // Identical copy whether or not the address already had an account.
  return {
    status: "check_email",
    message: "Check your email for a confirmation link to finish creating your account.",
  };
}

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const created = await createServerSupabaseClient();
  if ("problem" in created) return UNAVAILABLE;

  const returnTo = safeReturnTo(field(formData, "returnTo"));
  const outcome = await signInWithPassword(created.client, {
    email: field(formData, "email"),
    password: field(formData, "password"),
  });

  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };

  // `redirect` throws to unwind, so it must be outside the try/catch-shaped paths
  // above and is never reached on a rejection.
  redirect(returnTo);
}

export async function signOutAction(formData: FormData): Promise<void> {
  const created = await createServerSupabaseClient();
  if (!("problem" in created)) {
    // Revokes the refresh token and clears the session cookies on this response.
    await signOut(created.client);
  }
  redirect(safeReturnTo(field(formData, "returnTo")));
}
