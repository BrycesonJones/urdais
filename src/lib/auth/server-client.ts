/**
 * The server Supabase client, and the cookie-writing rule that makes it safe.
 *
 * Server-only. It reads the request's cookies through `next/headers`, so it sees
 * whatever session the browser presented — and nothing else. A caller cannot
 * hand it an identity.
 *
 * ## Why writes are allowed to fail
 *
 * Next forbids setting a cookie from a Server Component render. Supabase's auth
 * client will nonetheless try to write refreshed tokens whenever it rotates
 * them, so `setAll` swallows the resulting error. That is correct rather than
 * lazy: the refresh still succeeded in memory for the duration of this request,
 * and the durable rotation is the proxy's job (see `./session`), which runs
 * where cookies *can* be written. Letting the throw escape would turn a routine
 * token rotation into a 500 on a page that had already rendered fine.
 *
 * In a Route Handler or Server Action the write succeeds normally, which is why
 * sign-in and sign-out are implemented there and not in a component.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { readSupabaseConfig, type SupabaseConfigProblem } from "@/lib/auth/config";
import { hardenCookieOptions } from "@/lib/auth/cookies";

export type ServerSupabaseClient = ReturnType<typeof createServerClient>;

/**
 * A client bound to this request's cookies, or the reason there is none.
 *
 * `null` when Supabase Auth is unconfigured. Every caller treats that as "the
 * viewer is anonymous", which is exactly right: an Urdais deployment with no
 * auth configured is the public-only product, not a broken one.
 */
export async function createServerSupabaseClient(): Promise<
  { client: ServerSupabaseClient } | { problem: SupabaseConfigProblem }
> {
  const result = readSupabaseConfig();
  if ("problem" in result) return { problem: result.problem };

  const cookieStore = await cookies();

  const client = createServerClient(result.config.url, result.config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            // httpOnly and Secure are imposed here, not taken from Supabase. See
            // @/lib/auth/cookies for why, and for what it forbids.
            cookieStore.set(name, value, hardenCookieOptions(options));
          }
        } catch {
          // Server Component render: see the module comment. The proxy owns
          // durable rotation.
        }
      },
    },
  });

  return { client };
}
