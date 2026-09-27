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
 * ## Urdais has no authentication system yet
 *
 * This is the single most important fact about this file, and it is not a
 * limitation of the design — it is the state of the repository. There is no
 * Supabase Auth client, no session cookie, no middleware, no sign-in route and
 * no user table in any of the 107 migrations preceding this one. `pg` connects
 * with a privileged connection string and every table has RLS enabled with zero
 * policies, so today *every* reader of Urdais is anonymous and the entire
 * published product is public.
 *
 * `resolveViewer` therefore returns `ANONYMOUS_VIEWER`, always, and says so
 * loudly rather than pretending. When an authentication phase lands, this one
 * function is what it replaces: read the session, look the account up, call
 * `loadPremiumEntitlement`, return the viewer. Nothing else in Urdais changes,
 * because nothing else in Urdais asks who the reader is.
 *
 * The consequence for this phase is unavoidable and deliberate: **the guard
 * below is not wired to any route.** An `ANONYMOUS_VIEWER` cannot hold an
 * entitlement, so activating the guard against `/markets/compute-analytics`
 * today would deny Compute Economics to every reader in production with no
 * possible way to obtain access — a self-inflicted outage in exchange for
 * nothing. See `DEFERRED_PREMIUM_ENFORCEMENT` for the wiring plan and the
 * conditions that unblock it.
 */

import {
  ANONYMOUS_VIEWER,
  canAccess,
  type AccessDecision,
  type AccessDenialReason,
  type Viewer,
} from "@/lib/access/entitlement";
import type { UrdaisProductId } from "@/lib/access/products";

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
  // Intentionally unconditional. See the module comment: there is no
  // authentication system to consult, and inventing a header or cookie to read
  // here would be exactly the client-trusting shortcut this module exists to
  // prevent. Replace the body, not the signature.
  return ANONYMOUS_VIEWER;
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
