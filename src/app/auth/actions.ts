"use server";

/**
 * Sign-out.
 *
 * The password sign-in action that used to live here was removed in Phase 7A along
 * with its form; Urdais authenticates passwordlessly, and `@/app/access/actions`
 * owns that flow. Signing out is the same operation however the session was
 * established.
 *
 * This runs on the server and can write cookies, which is the whole reason it lives
 * here rather than in a component: the session *is* the cookie, and a component
 * render cannot set one.
 *
 * Nothing here trusts the form. The only field read is `returnTo`, and it is
 * validated as an internal path before it is used.
 */

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { signOut } from "@/lib/auth/operations";
import { safeReturnTo } from "@/lib/auth/return-to";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signOutAction(formData: FormData): Promise<void> {
  const created = await createServerSupabaseClient();
  if (!("problem" in created)) {
    // Revokes the refresh token and clears the session cookies on this response.
    await signOut(created.client);
  }
  redirect(safeReturnTo(field(formData, "returnTo")));
}
