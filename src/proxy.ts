/**
 * Next's request proxy: session cookie rotation, and nothing else.
 *
 * `proxy.ts` is the current Next convention — 16.3.4 deprecated `middleware.ts`
 * and refuses to build when both exist. Next resolves an export named `proxy` or
 * a default export; this file exports `proxy`.
 *
 * The logic lives in `@/lib/auth/session` so it can be tested without a running
 * Next server. Keep this file a one-liner: whatever is added here runs on every
 * matched request to a public data site.
 */

import type { NextRequest, NextResponse } from "next/server";

import { refreshSession } from "@/lib/auth/session";

export function proxy(request: NextRequest): Promise<NextResponse> {
  return refreshSession(request);
}

export const config = {
  /**
   * Everything except static assets and image files.
   *
   * Rotation has to be possible on any *page* a signed-in reader might land on
   * first, so the matcher is broad rather than a list of authenticated routes —
   * a reader arriving at `/` with an hour-old token needs it refreshed there. The
   * cost of that breadth is bounded by `refreshSession` itself, which returns
   * immediately when the request carries no Supabase auth cookie, so an
   * anonymous visitor does no auth work regardless of which paths match here.
   *
   * `_next/static` and `_next/image` are excluded because they are served from
   * the CDN and never carry a session worth rotating.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf|map|json|txt|xml|webmanifest)$).*)"],
};
