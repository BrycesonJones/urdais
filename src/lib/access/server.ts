/**
 * The server side of access control: who the server believes the reader is, and
 * the guard that turns that belief into a refusal.
 *
 * ## This module is the authority
 *
 * `canAccess` in `./entitlement` is pure and will happily answer a question
 * about any `Viewer` handed to it, including one a browser invented. That is
 * fine, because the only `Viewer` that decides whether bytes leave the server
 * is the one `resolveViewer` builds here, from state the server controls. A
 * request cannot influence it by changing local storage, editing React state,
 * adding a query parameter, or calling a premium endpoint directly — none of
 * those are inputs to it.
 *
 * Import this from server code only: route handlers, Server Components,
 * `scripts/`. It is never bundled into a client component, and `server.test.ts`
 * asserts that no `"use client"` module imports it.
 *
 * ## Authentication (Paid Access Phase 2)
 *
 * Urdais authenticates with Supabase Auth, email and password. Phase 1 shipped
 * this resolver as anonymous-only because no authentication system existed at
 * all; that is no longer true, and `resolveViewer` below is the real thing.
 *
 * The lifecycle is three steps, each owned by a different module, and the split
 * is the point — Supabase proves identity, Urdais owns the account, and the
 * entitlement system decides access:
 *
 *   1. `resolveSupabaseIdentity()`  a server-confirmed Supabase user, or anonymous.
 *   2. `resolveUrdaisAccount()`     that subject's `identity.accounts` row, created
 *                                   on first sight, keyed on (provider, subject).
 *   3. `loadPremiumEntitlement()`   that account's entitlement, or null.
 *
 * Authentication does not imply entitlement. Step 3 returns `null` for every
 * real user today, and `canAccess` denies premium on a null entitlement exactly
 * as it did before this phase. There is no `if (user) return premiumAccess`
 * anywhere, and `server.test.ts` asserts a signed-in reader with no entitlement
 * is refused every premium product.
 *
 * ## The guard is still not wired to any route
 *
 * Authentication existing is not permission to switch premium enforcement on.
 * Stripe does not exist, so there is still no way for a reader to obtain an
 * entitlement, and a live gate would deny Compute Economics and Power Analytics
 * to everyone. `DEFERRED_PREMIUM_ENFORCEMENT` remains deferred; see its own
 * comment for the activation conditions.
 */

import {
  ANONYMOUS_VIEWER,
  canAccess,
  type AccessDecision,
  type AccessDenialReason,
  type Viewer,
} from "@/lib/access/entitlement";
import { loadPremiumEntitlement } from "@/lib/access/entitlement-store";
import type { UrdaisProductId } from "@/lib/access/products";
import { resolveUrdaisAccount } from "@/lib/auth/accounts";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";

/**
 * The reader, as established by the server.
 *
 * Async because its eventual implementation reads a session and then the
 * database. Callers should `await` it now so that adding authentication is a
 * change to this file alone.
 *
 * Takes no request argument for the same reason: in Next's App Router the
 * session is read from `cookies()`/`headers()`, which are ambient, and a
 * signature that accepted a `Request` would invite a caller to pass a
 * reconstructed one.
 */
export async function resolveViewer(): Promise<Viewer> {
  const resolution = await resolveSupabaseIdentity();
  if (resolution.kind === "anonymous") return ANONYMOUS_VIEWER;

  const { identity } = resolution;

  // The account and its entitlement live in `identity`, which no browser role can
  // reach. This is the privileged server connection every other Urdais read uses
  // -- the shared serverless pool, not a fresh client per request, because this
  // runs on the request path and connection churn there is what exhausted the
  // pooler once already (see @/lib/db/connection).
  try {
    // Inside the guard, not before it. Resolving the URL reads the environment and
    // can throw, and a throw here would 500 a page whose content is public.
    const databaseUrl = resolveTokenDatabaseUrl();
    if (!databaseUrl) {
      // Authenticated against Supabase, but Urdais cannot reach its own database.
      // Reporting anonymous is the safe direction: it withholds premium data rather
      // than granting it, and public Urdais is unaffected.
      console.error("resolveViewer: authenticated viewer could not be resolved, no database configured");
      return ANONYMOUS_VIEWER;
    }

    const sql = await tokenSqlExecutor(databaseUrl);
    const account = await resolveUrdaisAccount(sql, identity);
    const premiumEntitlement = await loadPremiumEntitlement(sql, account.id);

    return {
      authentication: {
        kind: "authenticated",
        accountId: account.id,
        // From the Auth server's own column, never from token metadata.
        emailVerified: identity.emailVerified,
      },
      premiumEntitlement,
    };
  } catch (error) {
    // A provisioning or entitlement read failure must not 500 a page. Anonymous
    // is the fail-safe answer: the reader loses premium they may be owed, which
    // is recoverable, rather than gaining premium they are not, which is not.
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`resolveViewer: entitlement resolution failed (${detail})`);
    return ANONYMOUS_VIEWER;
  }
}

/* ------------------------------------------------------------------ the guard */

/** HTTP status for each denial reason. */
const DENIAL_STATUS: Record<AccessDenialReason, number> = {
  // Not authenticated: the reader may well be entitled once they sign in.
  authentication_required: 401,
  // Authenticated and not entitled: signing in again will not help.
  entitlement_required: 403,
  // A product Urdais does not have. Not 403 — there is nothing to be entitled to.
  unknown_product: 404,
};

/**
 * Why a premium read was refused, in a form a client can branch on.
 *
 * Deliberately terse and deliberately honest about *which* premium product was
 * refused: these products are advertised on the marketing surface, so hiding
 * their existence buys nothing and costs the client the information it needs to
 * render the right gate.
 */
export type AccessDenialBody = {
  readonly error: "access_denied";
  readonly reason: AccessDenialReason;
  readonly product: string | null;
};

export function accessDenialResponse(decision: Extract<AccessDecision, { allowed: false }>): Response {
  const body: AccessDenialBody = {
    error: "access_denied",
    reason: decision.reason,
    product: decision.product?.id ?? null,
  };
  return Response.json(body, { status: DENIAL_STATUS[decision.reason] });
}

/**
 * The enforcement primitive: resolve the reader server-side, decide, and refuse
 * with a `Response` when the answer is no.
 *
 * Returns `null` on success so the happy path reads as a guard clause:
 *
 *     const denied = await denyUnlessEntitled("power_analytics");
 *     if (denied) return denied;
 *
 * An explicit `viewer` may be passed by a caller that has already resolved one
 * for this request — a page that gates several sections should not open several
 * database connections. It is not a way to supply a viewer from outside the
 * server: the parameter is unreachable from a browser.
 */
export async function denyUnlessEntitled(
  productId: UrdaisProductId | string,
  viewer?: Viewer,
): Promise<Response | null> {
  const resolved = viewer ?? (await resolveViewer());
  const decision = canAccess(resolved, productId);
  return decision.allowed ? null : accessDenialResponse(decision);
}

/**
 * The same decision without the HTTP shape, for a Server Component that must
 * render a gate rather than return a status code.
 */
export async function resolveAccess(
  productId: UrdaisProductId | string,
  viewer?: Viewer,
): Promise<AccessDecision> {
  const resolved = viewer ?? (await resolveViewer());
  return canAccess(resolved, productId);
}

/* ------------------------------------------------------------------ deferred wiring */

/**
 * Every server path that must be guarded, and is not yet.
 *
 * This is the phase's honest ledger, not documentation prose: it is a typed
 * constant so that a reviewer can see the full blast radius in one place, and
 * so Phase 5 has a checklist it cannot half-complete from memory. The map
 * entries are the sharpest of them — `/map` and `/api/map/facilities` today
 * serve *every* published facility, all four categories, to anyone. Gating the
 * map means filtering the point set by category for an unentitled reader, not
 * refusing the route.
 */
export type DeferredEnforcementPoint = {
  /** Repository path of the route, loader or read model that needs the guard. */
  readonly path: string;
  /** The product whose entitlement governs it. */
  readonly product: UrdaisProductId;
  /** What the guard must do there — a refusal, or a filter. */
  readonly enforcement: "deny_request" | "filter_response";
  readonly note: string;
};

export const DEFERRED_PREMIUM_ENFORCEMENT: readonly DeferredEnforcementPoint[] = Object.freeze([
  {
    path: "src/app/markets/compute-analytics/page.tsx",
    product: "compute_economics",
    enforcement: "deny_request",
    note: "Server Component: resolveAccess, then render the Phase 2 gate instead of loadComputeEconomicsReadModel. The read model must not be loaded for an unentitled reader, or the data ships in the RSC payload behind the blur.",
  },
  {
    path: "src/app/api/compute/capacity/series/route.ts",
    product: "compute_economics",
    enforcement: "deny_request",
    note: "The JSON behind Compute Economics. Guarding only the page leaves this endpoint as the bypass.",
  },
  {
    path: "src/app/markets/power-analytics/page.tsx",
    product: "power_analytics",
    enforcement: "deny_request",
    note: "Same shape as Compute Economics: gate before loadDeliveryGapReadModel and loadQueueAnalytics run.",
  },
  {
    path: "src/app/api/power-delivery/gap/route.ts",
    product: "power_analytics",
    enforcement: "deny_request",
    note: "Delivery gap JSON.",
  },
  {
    path: "src/app/api/interconnection-queue/route.ts",
    product: "power_analytics",
    enforcement: "deny_request",
    note: "Interconnection queue analytics JSON.",
  },
  {
    path: "src/app/map/page.tsx",
    product: "map",
    enforcement: "filter_response",
    note: "The map stays public. facilityMapPoints must drop points in PREMIUM_MAP_CATEGORIES for an unentitled reader, so premium coordinates never reach the RSC payload. The legend rows for those categories become Phase 2's upsell affordance.",
  },
  {
    path: "src/app/api/map/facilities/route.ts",
    product: "map",
    enforcement: "filter_response",
    note: "Same filter as the page, and the more important of the two: this endpoint is directly fetchable. Note that validatePublicFacilities runs over the response, so the filter must produce a model that still satisfies the facility contract.",
  },
]);
