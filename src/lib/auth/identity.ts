/**
 * Establishing who the reader is, according to Supabase Auth.
 *
 * This module answers exactly one question — *which Supabase user is making this
 * request, and is their address verified* — and answers it from a source the
 * browser cannot influence. It knows nothing about Urdais accounts or
 * entitlements; that mapping is `./accounts`, and the decision is
 * `@/lib/access/entitlement`.
 *
 * ## Why `getUser()` and not `getClaims()`
 *
 * Supabase offers three ways to ask, and only one of them is correct here.
 *
 * `getSession()` is out: it reads the session straight from the cookie without
 * revalidating it, and Supabase's own documentation says never to trust it in
 * server code because the sender can tamper with it.
 *
 * `getClaims()` is the documented way to *verify identity*, and it is cheaper —
 * with asymmetric signing keys it validates the token locally with no network
 * call. It would be the right choice if `sub` were all Urdais needed. It is not:
 * `AuthenticationState.emailVerified` has to come from somewhere, and the access
 * token's claims do not carry `email_confirmed_at`. The only verification-shaped
 * value in a token is `user_metadata.email_verified` — and `user_metadata` is
 * writable by the user through `auth.updateUser`, so a reader could mark
 * themselves verified. Reading it would be a privilege escalation with a
 * plausible-looking field name, which is the worst kind.
 *
 * So `getUser()`: it makes an authenticated request to the Auth server and
 * returns a server-confirmed record, which both validates the token and yields
 * `email_confirmed_at` from a column the user cannot write. The cost is one
 * round trip per resolution, paid only by requests that actually need to know
 * who the reader is — public Urdais never calls this. If that cost ever matters,
 * the fix is a verification claim in the token, not trusting metadata.
 */

import { createServerSupabaseClient } from "@/lib/auth/server-client";

/** The Supabase-authenticated reader, as confirmed by the Auth server. */
export type SupabaseIdentity = {
  /** The Supabase Auth user id. Becomes `auth_subject`; never read from a request body. */
  readonly subject: string;
  /** May be absent — a user can exist without one (phone sign-up, future providers). */
  readonly email: string | null;
  /** `email_confirmed_at is not null`, straight from the Auth server. */
  readonly emailVerified: boolean;
};

export type IdentityResolution =
  | { readonly kind: "anonymous"; readonly reason: "unconfigured" | "no_session" | "invalid_session" | "provider_error" }
  | { readonly kind: "authenticated"; readonly identity: SupabaseIdentity };

/**
 * The Supabase identity behind this request, or anonymity and why.
 *
 * Never throws. Every failure — unconfigured project, expired token, Auth server
 * unreachable — resolves to anonymous, because the alternative is that a
 * transient Supabase outage takes down public Urdais. The reason is carried for
 * the log, not for the access decision: `canAccess` treats every anonymous
 * viewer identically.
 */
export async function resolveSupabaseIdentity(): Promise<IdentityResolution> {
  // Client construction reads cookies through `next/headers`, which can itself
  // throw — an unexpected render context, or a future Next change to the cookie
  // API. Wrapped so that "never throws" is true of the whole function rather than
  // only of the network call, because a throw here would 500 a page that had no
  // business depending on authentication at all.
  let created;
  try {
    created = await createServerSupabaseClient();
  } catch {
    return { kind: "anonymous", reason: "provider_error" };
  }
  if ("problem" in created) return { kind: "anonymous", reason: "unconfigured" };

  let result;
  try {
    result = await created.client.auth.getUser();
  } catch {
    // Network failure reaching the Auth server.
    return { kind: "anonymous", reason: "provider_error" };
  }

  const { data, error } = result;
  if (error) {
    // Supabase answers `AuthSessionMissingError` for "no cookie at all", which is
    // the ordinary state of a public visitor and not worth distinguishing in a
    // log from a genuinely rejected token.
    const missing = error.name === "AuthSessionMissingError" || /session (from session id )?not found|missing/i.test(error.message);
    return { kind: "anonymous", reason: missing ? "no_session" : "invalid_session" };
  }

  const user = data?.user;
  if (!user?.id) return { kind: "anonymous", reason: "no_session" };

  const email = typeof user.email === "string" && user.email.trim() !== "" ? user.email.trim().toLowerCase() : null;

  return {
    kind: "authenticated",
    identity: {
      subject: user.id,
      email,
      // Server-controlled column. Deliberately not `user.user_metadata.email_verified`.
      emailVerified: typeof user.email_confirmed_at === "string" && user.email_confirmed_at !== "",
    },
  };
}
