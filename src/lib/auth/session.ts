/**
 * Session cookie rotation — the one piece of authentication that cannot live in
 * a Server Component.
 *
 * Supabase access tokens are short-lived and are exchanged for new ones using a
 * refresh token. The exchange produces new cookies, and Next only permits
 * cookies to be written from a proxy, a Route Handler or a Server Action. A
 * Server Component that rotates a token therefore rotates it for that render
 * only and throws the result away, so a reader would appear to be signed out the
 * moment their first token expired. This module is what stops that.
 *
 * ## Why `proxy.ts` and not `middleware.ts`
 *
 * Next 16.3.4 deprecated the middleware convention. Its own build says so —
 * `The "middleware" file convention is deprecated. Please use "proxy" instead.`
 * — and it *throws* if both files exist. Supabase's published Next.js SSR guide
 * still shows `middleware.ts`, which would work here but emit a deprecation
 * warning on every build, so Urdais follows the framework rather than the
 * example. The handler contract is the same: Next resolves an export named
 * `proxy` or a default export from `src/proxy.ts`.
 *
 * ## Public Urdais pays nothing for this
 *
 * Urdais is a public data site where most requests are from nobody in
 * particular. Running a Supabase call on every one of them would add latency to
 * every index page, chart and map load to benefit the small minority who are
 * signed in. So the first thing the proxy does is look for a Supabase auth
 * cookie, and with none it returns immediately — no client constructed, no token
 * verified, no network call. Only a request that actually carries a session pays
 * for one.
 *
 * ## It never redirects
 *
 * Not once, for any route. Urdais stays anonymously browsable, so the proxy's
 * entire job is to rotate a cookie when there is one to rotate. Redirecting an
 * unauthenticated reader anywhere would turn a public product into a
 * login-required one, and sending a signed-in reader somewhere is Phase 3's
 * decision to make in a page, not this file's.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { readSupabaseConfig } from "@/lib/auth/config";
import { hardenCookieOptions } from "@/lib/auth/cookies";

/**
 * Whether any of these cookie names is a Supabase auth token.
 *
 * Supabase names its session cookie `sb-<project-ref>-auth-token`, and splits it
 * into `…auth-token.0`, `…auth-token.1` when it exceeds the 4 KB cookie limit —
 * which it does whenever the user has non-trivial metadata. Matching the prefix
 * and the substring covers both, and covers a project ref changing between
 * environments without this file knowing the ref.
 *
 * Pure and exported so the skip path is tested directly: a false negative here
 * silently signs people out when their token expires, which is the kind of bug
 * that reproduces only after an hour of idling.
 */
export function hasSupabaseAuthCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => name.startsWith("sb-") && name.includes("auth-token"));
}

/**
 * Rotate this request's session if it has one, and return the response that
 * carries any refreshed cookies.
 *
 * Never throws: an unconfigured project, an expired refresh token or an
 * unreachable Auth server all fall through to passing the request along
 * untouched. Authentication failing must not take the site down.
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  // The response the request continues on when there is nothing to rotate.
  const passthrough = () => NextResponse.next({ request });

  const cookieNames = request.cookies.getAll().map((cookie) => cookie.name);
  if (!hasSupabaseAuthCookie(cookieNames)) return passthrough();

  const configured = readSupabaseConfig();
  if ("problem" in configured) return passthrough();

  // Reassigned by `setAll` when Supabase rotates tokens, so the cookies land on
  // the response that is actually returned.
  let response = passthrough();

  const supabase = createServerClient(configured.config.url, configured.config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Update the request too, so anything downstream in this same pass sees
        // the new token rather than the one that just expired.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, hardenCookieOptions(options));
        }
      },
    },
  });

  try {
    // Verifies the access token and, when it has expired, performs the refresh
    // whose cookies `setAll` captures. `getClaims` rather than `getUser`: this
    // path needs the rotation and a validity check, not a user record, and with
    // asymmetric signing keys it validates locally with no network call at all.
    await supabase.auth.getClaims();
  } catch {
    // A failed refresh leaves the old cookies in place and the reader resolves
    // as anonymous on the next server read. That is the correct degradation.
  }

  return response;
}
