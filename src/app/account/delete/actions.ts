"use server";

/**
 * Account deletion's Server Actions: step-up verification, start, and finish.
 *
 * Nothing that names an account, a Supabase user, a Stripe Customer or a
 * Subscription is read from a form. The only fields read are the typed
 * confirmation word and an emailed code; everything else is resolved from the
 * session on the server (`deleteCurrentAccount`).
 *
 * Step-up reuses the passwordless primitives: the code is sent to, and verified
 * against, the **signed-in account's own address** from the Auth server -- never
 * an address from the form -- so this cannot be used to mail or sign in anyone
 * else. Verifying the code starts a new session whose `amr` timestamp is now,
 * which is what the 15-minute check reads; the reader is then returned to the
 * deletion page, not to onboarding or Plan / Pay.
 */

import { redirect } from "next/navigation";

import type { AuthFormState } from "@/app/auth/form-state";
import { deleteCurrentAccount, type DeletionOutcome } from "@/lib/account/deletion";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { sendEmailOtp, verifyEmailOtp } from "@/lib/auth/operations";
import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { onboardingHref } from "@/lib/onboarding/routes";
import { ACCOUNT_DELETED_HREF, ACCOUNT_DELETE_HREF } from "@/lib/routes";

/** The word a reader types to confirm. Compared exactly, server-side. */
const CONFIRMATION = "DELETE";

const UNAVAILABLE = "Sign-in verification is unavailable right now. Try again shortly.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function signedInEmail(): Promise<{ email: string } | null> {
  const identity = await resolveSupabaseIdentity();
  if (identity.kind !== "authenticated" || !identity.identity.email) return null;
  return { email: identity.identity.email };
}

/* ---------------------------------------------------------------- step-up */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the shape `useActionState` requires; nothing is read from the submission.
export async function sendStepUpCodeAction(_previous: AuthFormState, _formData: FormData): Promise<AuthFormState> {
  const signedIn = await signedInEmail();
  if (!signedIn) redirect(onboardingHref("login", ACCOUNT_DELETE_HREF));

  const created = await createServerSupabaseClient();
  if ("problem" in created) return { status: "error", message: UNAVAILABLE };

  const outcome = await sendEmailOtp(created.client, { email: signedIn.email });
  if (outcome.kind === "rejected") return { status: "error", message: outcome.message };
  return { status: "check_email", message: "We sent a verification code to your email." };
}

export async function verifyStepUpCodeAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const signedIn = await signedInEmail();
  if (!signedIn) redirect(onboardingHref("login", ACCOUNT_DELETE_HREF));

  const created = await createServerSupabaseClient();
  if ("problem" in created) return { status: "error", message: UNAVAILABLE };

  // The address is the session's, never the form's.
  const outcome = await verifyEmailOtp(created.client, { email: signedIn.email, token: field(formData, "code") });
  if (outcome.kind === "rejected") return { status: "check_email", message: outcome.message };

  // Fresh session: back to the deletion page, which now offers the confirmation.
  redirect(ACCOUNT_DELETE_HREF);
}

/* ------------------------------------------------------------- deletion */

/**
 * The reader-facing sentence for each outcome. Never a raw Stripe, Postgres or
 * Supabase message, and never "nothing changed" once something has.
 */
function messageFor(outcome: Exclude<DeletionOutcome, { kind: "complete" | "anonymous" | "reauth_required" }>): string {
  switch (outcome.kind) {
    case "unavailable":
      return "Account deletion isn’t available right now. Your account has not been deleted.";
    case "in_progress":
      return "Your account deletion is already being processed. Try again in a moment.";
    case "billing_not_terminated":
      return outcome.anyCanceled
        ? "We couldn’t cancel all of your subscription billing, so your account was not deleted. Some of it may already be canceled; you can still manage your billing from your account. Please try again."
        : "We couldn’t verify or cancel your subscription, so your account was not deleted. Nothing has been changed. Please try again.";
    case "incomplete":
      return "Your subscription has been canceled and your premium access has ended, but we couldn’t finish deleting your account. Please try again to finish.";
  }
}

async function finish(outcome: DeletionOutcome): Promise<AuthFormState> {
  if (outcome.kind === "complete") {
    // The Auth user is gone, and its sessions with it. Clear this browser's
    // cookies too, then leave for a public page -- never back to /account.
    try {
      const created = await createServerSupabaseClient();
      if (!("problem" in created)) await created.client.auth.signOut({ scope: "local" });
    } catch {
      // The server-side deletion is authoritative; a stale cookie can no longer
      // authenticate anyone.
    }
    redirect(ACCOUNT_DELETED_HREF);
  }
  if (outcome.kind === "anonymous") redirect(onboardingHref("login", ACCOUNT_DELETE_HREF));
  if (outcome.kind === "reauth_required") redirect(ACCOUNT_DELETE_HREF);
  return { status: "error", message: messageFor(outcome) };
}

/** Start deletion. Requires the typed confirmation word. */
export async function deleteAccountAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (field(formData, "confirmation") !== CONFIRMATION) {
    return { status: "error", message: `Type ${CONFIRMATION} to confirm. Your account has not been deleted.` };
  }
  return finish(await deleteCurrentAccount({ confirmed: true }));
}

/**
 * Finish a deletion already past billing termination. No confirmation word: the
 * irreversible part already happened, and finishing only removes what remains.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the shape `useActionState` requires; nothing is read from the submission.
export async function finishDeletionAction(_previous: AuthFormState, _formData: FormData): Promise<AuthFormState> {
  return finish(await deleteCurrentAccount({ confirmed: false }));
}
