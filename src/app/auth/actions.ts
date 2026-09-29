"use server";

/**
 * LEGACY Server Actions: password sign-in, and sign-out.
 *
 * Sign-up by password is gone — Urdais authenticates passwordlessly, and
 * `@/app/access/actions` owns the customer flow. `signInAction` remains for
 * `/auth/sign-in`, which is an operator surface for accounts that predate the
 * change. `signOutAction` is not legacy at all: signing out is the same operation
 * however the session was established.
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
import { signInWithPassword, signOut } from "@/lib/auth/operations";
import { safeReturnTo } from "@/lib/auth/return-to";
import type { AuthFormState } from "@/app/auth/form-state";

const UNAVAILABLE: AuthFormState = {
  status: "error",
  message: "Authentication is not configured for this deployment.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
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
