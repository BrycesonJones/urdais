/**
 * Hardening the session cookie.
 *
 * `@supabase/ssr` writes its auth cookie **without `httpOnly`**, and that is not
 * an oversight on Supabase's part: `createBrowserClient` reads the session out of
 * `document.cookie`, so making it unreadable to scripts would break every
 * browser-side auth call.
 *
 * Urdais makes no browser-side auth calls. Sign-up, sign-in and sign-out are all
 * Server Actions (see `src/app/auth/actions.ts`), the session is resolved
 * server-side by `resolveViewer`, and no component asks the browser who the
 * reader is. So the tradeoff Supabase's default is making — script-readable
 * tokens in exchange for client-side auth — buys Urdais nothing, and paying it
 * would leave the access token extractable by any successful XSS.
 *
 * Hence `httpOnly: true` on every cookie the auth layer writes. It is a
 * deliberate divergence from the library default, and the constraint it imposes
 * is worth stating plainly for whoever builds Phase 4: **client-side Supabase
 * auth will not work while this is in force.** That is the intended posture, not
 * an accident to route around — a client-side sign-in would put an access
 * decision in the browser, which is the one thing this architecture exists to
 * prevent. Use a Server Action.
 *
 * `secure` follows the deployment's own origin rather than being hardcoded, so
 * production gets it and `http://localhost` development still works.
 */

import { env } from "@/config/env";

/** The cookie attributes `@supabase/ssr` hands back, plus the ones we impose. */
export type CookieOptionsLike = Record<string, unknown>;

/** True when this deployment serves over https, so `Secure` is safe to set. */
export function shouldMarkSecure(appUrl: string = env.appUrl): boolean {
  return appUrl.startsWith("https://");
}

/**
 * Supabase's own options for a cookie, with Urdais's guarantees layered on.
 *
 * Supabase's `path`, `maxAge`, `domain` and `sameSite` are preserved — they
 * encode the library's own session semantics and are not ours to second-guess.
 * Only the two flags above are forced.
 */
export function hardenCookieOptions(options: CookieOptionsLike | undefined): CookieOptionsLike {
  return {
    sameSite: "lax",
    ...(options ?? {}),
    httpOnly: true,
    secure: shouldMarkSecure(),
  };
}
