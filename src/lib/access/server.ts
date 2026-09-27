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
 * ## The guards are wired, and switched off (Paid Access Phase 3)
 *
 * Phase 3 wired the gate into every premium surface: both analytical pages, all
 * seven premium data routes, and the map's point filter. The reason production is
 * still commercially open is no longer that the guards are absent — they are
 * present and tested — but that they are *inactive*.
 *
 * `resolvePremiumGate` consults `@/lib/access/activation` first, and enforcement
 * defaults to off. Stripe does not exist, so no reader can obtain an entitlement,
 * and a live gate would show every visitor "Get Full Access" with no way to buy
 * it. Flipping `URDAIS_PREMIUM_ENFORCEMENT=active` is a later phase's deliberate
 * commercial decision.
 *
 * `PREMIUM_ENFORCEMENT_LEDGER` below records, per path, whether the guard is
 * implemented — which is now a different question from whether it is enforced.
 */

import { gateFor, isPremiumEnforcementActive, UNENFORCED_GATE, type PremiumGate } from "@/lib/access/activation";
import { mapAccessFor, OPEN_MAP_ACCESS, type MapAccess } from "@/lib/access/map-access";
import { ANONYMOUS_VIEWER, type AccessDecision, type AccessDenialReason, type Viewer } from "@/lib/access/entitlement";
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
 * The canonical gate: activation, then the access decision, resolved server-side.
 *
 * **This is the only thing pages, routes and the map filter call.** It is
 * activation-aware, so there is no unconditional variant lying around for
 * someone to reach for by mistake and paywall production. Whether enforcement is
 * on lives in `@/lib/access/activation` and nowhere else.
 *
 * When enforcement is inactive it returns immediately **without resolving a
 * viewer**. That matters beyond tidiness: resolving one costs a Supabase round
 * trip and two database queries, and adding those to every Compute Economics and
 * Power Analytics request today — to reach a verdict that is always "allowed" —
 * would be a live performance regression bought for nothing.
 *
 * An explicit `viewer` may be passed by a caller that already resolved one for
 * this request, so a page gating several sections does not resolve repeatedly. It
 * is not a way to supply a viewer from outside the server: the parameter is
 * unreachable from a browser.
 */
export async function resolvePremiumGate(
  productId: UrdaisProductId | string,
  viewer?: Viewer,
): Promise<PremiumGate> {
  if (!isPremiumEnforcementActive()) return UNENFORCED_GATE;
  const resolved = viewer ?? (await resolveViewer());
  return gateFor(productId, resolved);
}

/**
 * The gate as an HTTP refusal, for a Route Handler.
 *
 * Returns `null` when the request may proceed — including when enforcement is
 * inactive — so the happy path reads as a guard clause:
 *
 *     const denied = await denyUnlessEntitled("power_analytics");
 *     if (denied) return denied;
 *
 * The body carries the denial reason and the product id and nothing else. No
 * premium value, count, shape or timestamp rides along: a refusal that leaked the
 * number it was refusing would defeat the point.
 */
export async function denyUnlessEntitled(
  productId: UrdaisProductId | string,
  viewer?: Viewer,
): Promise<Response | null> {
  const gate = await resolvePremiumGate(productId, viewer);
  if (gate.allowed) return null;
  return accessDenialResponse({ allowed: false, reason: gate.reason, product: gate.product });
}

/**
 * The reader's map layer access, resolved server-side.
 *
 * Separate from `resolvePremiumGate` because the map's answer is not one verdict
 * but a partition: some categories are served and some are withheld, on the same
 * request. Asking the gate about the `map` product would answer "allowed", which
 * is true and useless — the map itself is public.
 *
 * Like the gate, it resolves no viewer while enforcement is inactive, so the map
 * page and the facilities endpoint behave exactly as they did before Phase 3.
 */
export async function resolveMapAccess(viewer?: Viewer): Promise<MapAccess> {
  if (!isPremiumEnforcementActive()) return OPEN_MAP_ACCESS;
  const resolved = viewer ?? (await resolveViewer());
  return mapAccessFor(resolved);
}

/* ------------------------------------------------------------------ the ledger */

/**
 * Every server path that governs premium data, and whether its guard exists.
 *
 * Phase 1 created this as a list of paths that were *not yet guarded*, because
 * nothing could safely be guarded then. Phase 3 wired all of them, so the
 * question the ledger answers has changed: `implemented` now says whether the
 * guard is in the code, which is a different thing from whether enforcement is
 * switched on. Nothing here is "activated" until
 * `URDAIS_PREMIUM_ENFORCEMENT=active`, and that is one flag for the whole set —
 * see `@/lib/access/activation`.
 *
 * It is kept rather than deleted because it is still the checklist: a reviewer can
 * see every premium data path in one place, and `server.test.ts` asserts each
 * file exists *and* actually references the guard, so a path cannot be silently
 * unwired or renamed out from under this list.
 *
 * Phase 3's audit found four routes that did not exist when Phase 1 wrote its
 * ledger — `compute/capacity`, `transmission-headroom`, `grid-buildout` and
 * `flexible-capacity`. That is the argument for the assertion in the test rather
 * than trusting this comment: the ledger goes stale exactly when new product
 * surfaces land.
 */
export type PremiumEnforcementPoint = {
  /** Repository path of the route, loader or read model. */
  readonly path: string;
  /** The product whose entitlement governs it. */
  readonly product: UrdaisProductId;
  /** A refusal, or a filtered response. */
  readonly enforcement: "deny_request" | "filter_response";
  /** Whether the guard is present in the code. Not whether it is switched on. */
  readonly implemented: boolean;
  readonly note: string;
};

export const PREMIUM_ENFORCEMENT_LEDGER: readonly PremiumEnforcementPoint[] = Object.freeze([
  {
    path: "src/app/markets/compute-analytics/page.tsx",
    product: "compute_economics",
    enforcement: "deny_request",
    implemented: true,
    note: "Gated before loadComputeEconomicsReadModel is called, so a denied reader's request never touches the database and no price reaches the RSC payload.",
  },
  {
    path: "src/app/api/compute/capacity/route.ts",
    product: "compute_economics",
    enforcement: "deny_request",
    implemented: true,
    note: "Available Compute Capacity snapshot. Added after Phase 1 wrote its ledger. Confirmed as part of compute_economics on 27 September 2026, rather than as a separate or public product -- note that the section component which would render it (available-capacity-section.tsx) is on no page today, so this classification governs the API alone until it is surfaced.",
  },
  {
    path: "src/app/api/compute/capacity/series/route.ts",
    product: "compute_economics",
    enforcement: "deny_request",
    implemented: true,
    note: "The capacity history. Guarding only the page would leave this as the bypass.",
  },
  {
    path: "src/app/markets/power-analytics/page.tsx",
    product: "power_analytics",
    enforcement: "deny_request",
    implemented: true,
    note: "Gated before all five read models load: gap, queue, headroom, buildout, flexibility.",
  },
  {
    path: "src/app/api/power-delivery/gap/route.ts",
    product: "power_analytics",
    enforcement: "deny_request",
    implemented: true,
    note: "Delivery gap JSON.",
  },
  {
    path: "src/app/api/interconnection-queue/route.ts",
    product: "power_analytics",
    enforcement: "deny_request",
    implemented: true,
    note: "Interconnection queue analytics JSON.",
  },
  {
    path: "src/app/api/transmission-headroom/route.ts",
    product: "power_analytics",
    enforcement: "deny_request",
    implemented: true,
    note: "Transmission headroom JSON. Not in Phase 1's ledger; the product shipped after it.",
  },
  {
    path: "src/app/api/grid-buildout/route.ts",
    product: "power_analytics",
    enforcement: "deny_request",
    implemented: true,
    note: "Grid buildout velocity JSON. Not in Phase 1's ledger.",
  },
  {
    path: "src/app/api/flexible-capacity/route.ts",
    product: "power_analytics",
    enforcement: "deny_request",
    implemented: true,
    note: "Flexible capacity JSON. Not in Phase 1's ledger.",
  },
  {
    path: "src/app/map/page.tsx",
    product: "map",
    enforcement: "filter_response",
    implemented: true,
    note: "The map stays public. Points in PREMIUM_MAP_CATEGORIES are dropped server-side for an unentitled reader, so premium coordinates never reach the RSC payload; the legend still lists those layers as premium.",
  },
  {
    path: "src/app/api/map/facilities/route.ts",
    product: "map",
    enforcement: "filter_response",
    implemented: true,
    note: "The same filter, and the more important of the two since this endpoint is directly fetchable. The filtered model still satisfies validatePublicFacilities.",
  },
]);

/**
 * Phase 1's name for the ledger, kept so nothing that referenced it breaks.
 *
 * @deprecated Use `PREMIUM_ENFORCEMENT_LEDGER`. The old name asserted that these
 * paths were deferred, which is no longer true of the guards — only of the
 * activation flag.
 */
export const DEFERRED_PREMIUM_ENFORCEMENT = PREMIUM_ENFORCEMENT_LEDGER;
