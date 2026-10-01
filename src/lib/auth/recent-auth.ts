/**
 * Recent authentication, for step-up before account deletion.
 *
 * Policy (Phase 7D, approved): deleting an account requires that **this session**
 * authenticated within the last 15 minutes; otherwise the reader proves control
 * of their mailbox again with a fresh emailed code first.
 *
 * ## Why the session's `amr` timestamp, not `user.last_sign_in_at`
 *
 * The approval named `last_sign_in_at`. Its Supabase semantics make it unsuitable
 * for this guarantee: it is a property of the **user**, refreshed by a sign-in on
 * *any* device. A session stolen last month would count as "fresh" the moment
 * its owner signed in on their phone, so the check would gate nothing.
 *
 * The access token's `amr` claim is per-session. Each entry records how *this*
 * session authenticated and when. Supabase keeps it across token refreshes (a
 * refresh does not re-authenticate) and sets it anew when an emailed code is
 * verified. It is read from `getClaims()`, which verifies the token (signature, or
 * the Auth server for symmetric keys) before returning its payload, and the
 * token's `sub` must match the identity being deleted.
 *
 * Nothing here trusts a timestamp from the browser.
 */

import { createServerSupabaseClient } from "@/lib/auth/server-client";

export const RECENT_AUTH_WINDOW_SECONDS = 15 * 60;

/**
 * When the session last authenticated (UNIX seconds), from verified `amr`
 * claims, or null when the claims carry no timestamped entry. Pure.
 */
export function authenticatedAtFromClaims(claims: unknown, expectedSubject: string): number | null {
  if (!claims || typeof claims !== "object") return null;
  const { sub, amr } = claims as { sub?: unknown; amr?: unknown };
  if (typeof sub !== "string" || sub !== expectedSubject) return null;
  if (!Array.isArray(amr)) return null;

  let latest: number | null = null;
  for (const entry of amr) {
    // RFC-8176 string entries carry no time and prove nothing about recency.
    if (!entry || typeof entry !== "object") continue;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}

/**
 * Whether an authentication at `authenticatedAt` is recent enough at `now`.
 *
 * Inclusive at exactly 15:00. A timestamp from the future (clock skew beyond a
 * minute) is not trusted.
 */
export function isRecentAuthentication(authenticatedAt: number | null, nowSeconds: number): boolean {
  if (authenticatedAt === null) return false;
  if (authenticatedAt - nowSeconds > 60) return false;
  return nowSeconds - authenticatedAt <= RECENT_AUTH_WINDOW_SECONDS;
}

export type RecentAuthentication =
  | { readonly kind: "recent" }
  /** Re-verify with an emailed code. */
  | { readonly kind: "stale" }
  /** The session could not be verified at all. */
  | { readonly kind: "unverifiable" };

/** The current request's session, checked against the 15-minute window. */
export async function checkRecentAuthentication(subject: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<RecentAuthentication> {
  let created;
  try {
    created = await createServerSupabaseClient();
  } catch {
    return { kind: "unverifiable" };
  }
  if ("problem" in created) return { kind: "unverifiable" };

  try {
    const { data, error } = await created.client.auth.getClaims();
    if (error || !data?.claims) return { kind: "unverifiable" };
    return isRecentAuthentication(authenticatedAtFromClaims(data.claims, subject), nowSeconds) ? { kind: "recent" } : { kind: "stale" };
  } catch {
    return { kind: "unverifiable" };
  }
}
