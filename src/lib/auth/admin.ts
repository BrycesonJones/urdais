/**
 * Supabase Auth administration — deleting an Auth user, and nothing else.
 *
 * The one place Urdais holds a Supabase **secret** key (`SUPABASE_SECRET_KEY`,
 * `sb_secret_…`), approved in Phase 7D for exactly one operation: the supported
 * Admin API call `auth.admin.deleteUser`. It never deletes from `auth.users` with
 * SQL.
 *
 * Deliberately narrow:
 *
 *   - **One export that acts**, `deleteAuthUser`. The client is built inside it
 *     and never returned, so the secret cannot become a general data-access path.
 *     Application data stays on the Postgres connection (`DATABASE_URL`), as
 *     before; nothing here reads or writes `identity`.
 *   - **Server-only.** The variable has no `NEXT_PUBLIC_` prefix, so Next never
 *     inlines it into a browser bundle, and no client component imports this
 *     module (a test scans for that).
 *   - **Never logged.** No message or error from here includes the key, and the
 *     Supabase error is reduced to a short code before it leaves.
 *
 * When the key is absent or malformed, account deletion reports itself
 * **unavailable before it starts**, so a deployment without the key can never
 * cancel a subscription and then stall at the Auth step.
 */

import { createClient } from "@supabase/supabase-js";

import { readSupabaseConfig, type ProcessEnvLike } from "@/lib/auth/config";

export const SUPABASE_SECRET_KEY_VAR = "SUPABASE_SECRET_KEY";

export type AuthAdminAvailability =
  | { readonly kind: "available" }
  | { readonly kind: "unavailable"; readonly reason: "missing_key" | "not_a_secret_key" | "no_project_url" };

/** Whether Auth administration is configured. Reads configuration only; no network. */
export function authAdminAvailability(env: ProcessEnvLike = process.env): AuthAdminAvailability {
  const key = (env[SUPABASE_SECRET_KEY_VAR] ?? "").trim();
  if (key === "") return { kind: "unavailable", reason: "missing_key" };
  // The modern secret key only. A publishable key would fail at Supabase; a legacy
  // service_role JWT is being retired and is not accepted here either.
  if (!key.startsWith("sb_secret_")) return { kind: "unavailable", reason: "not_a_secret_key" };
  if (!("config" in readSupabaseConfig(env))) return { kind: "unavailable", reason: "no_project_url" };
  return { kind: "available" };
}

export type AuthUserDeletion =
  | { readonly kind: "deleted" }
  /** Already gone -- a retry after a deletion that succeeded. Treated as done. */
  | { readonly kind: "already_absent" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed"; readonly code: string };

/** Supabase's "no such user", across the shapes the Admin API has used. */
function isUserNotFound(error: { status?: number; code?: string; message?: string }): boolean {
  return error.status === 404 || error.code === "user_not_found" || /user not found/i.test(error.message ?? "");
}

/**
 * Delete the Supabase Auth user `subject` (a hard delete).
 *
 * Supabase removes the user's identities, sessions and refresh tokens with it, so
 * no existing session can be refreshed afterwards. Idempotent: deleting a user
 * that no longer exists reports `already_absent`.
 *
 * `subject` must be the server-resolved Supabase user id of the account being
 * deleted -- never a value from a request.
 */
export async function deleteAuthUser(subject: string, env: ProcessEnvLike = process.env): Promise<AuthUserDeletion> {
  if (authAdminAvailability(env).kind !== "available") return { kind: "unavailable" };
  const config = readSupabaseConfig(env);
  if (!("config" in config)) return { kind: "unavailable" };

  const admin = createClient(config.config.url, (env[SUPABASE_SECRET_KEY_VAR] ?? "").trim(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { error } = await admin.auth.admin.deleteUser(subject, false);
    if (!error) return { kind: "deleted" };
    if (isUserNotFound(error as { status?: number; code?: string; message?: string })) return { kind: "already_absent" };
    const code = (error as { code?: unknown }).code;
    return { kind: "failed", code: typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? code : "auth_admin_error" };
  } catch {
    return { kind: "failed", code: "auth_admin_unreachable" };
  }
}
