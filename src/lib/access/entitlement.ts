/**
 * Authentication, entitlement, and the one function that decides access.
 *
 * ## Two questions, deliberately not one
 *
 * **Authentication** answers *who is this reader*. **Entitlement** answers
 * *what may they see*. Collapsing them produces the bug where a signed-in
 * reader is assumed to be a paying reader, which is the default failure of
 * every homegrown paywall, so the two are separate types here and the second
 * cannot be evaluated without the first: an entitlement attached to an
 * anonymous viewer is discarded, not honoured. See `hasPremiumEntitlement`.
 *
 * ## One entitlement
 *
 * Urdais sells a single subscription that unlocks every premium product. There
 * are no tiers, no per-product purchases, no seats and no credits, and this
 * module is written so that adding one later is a visible change rather than a
 * quiet one — `PremiumEntitlement` has no product field, and `canAccess` never
 * consults a product when deciding whether the *reader* is entitled. It asks
 * two independent questions and combines them:
 *
 *     is this product premium?          ./products
 *     does this reader hold premium?    this module
 *
 * Nothing in this file knows what a payment processor is. Stripe will, in a
 * later phase, become one writer of `EntitlementStatus`; a caller asking
 * whether someone may read Compute Economics must never learn that.
 */

import { findProduct, type UrdaisProduct, type UrdaisProductId } from "@/lib/access/products";

/* ------------------------------------------------------------------ authentication */

/**
 * Who the reader is, as far as the server has established.
 *
 * `emailVerified` is carried because an account system will have the notion
 * whether or not Urdais uses it, and a later phase may require verification
 * before granting access. **This phase does not gate on it**: no rule below
 * reads it. That is a deliberate non-decision — the field records what auth
 * knows, and adding a verification requirement should be one explicit edit to
 * `canAccess`, not a behaviour that leaks in because the field existed.
 */
export type AuthenticationState =
  | { readonly kind: "anonymous" }
  | {
      readonly kind: "authenticated";
      /** The Urdais account id. Server-issued; never read from the browser. */
      readonly accountId: string;
      readonly emailVerified: boolean;
    };

export const ANONYMOUS_AUTHENTICATION: AuthenticationState = Object.freeze({ kind: "anonymous" });

/* ------------------------------------------------------------------ entitlement */

/**
 * The state of an account's single premium entitlement.
 *
 * Two values today. More will come — a Stripe subscription can be `past_due`
 * or `canceled` at period end, and each is a distinct operational state even
 * when both deny access — so no caller compares against a status directly.
 * They go through `GRANTS_ACCESS`, which is the only place a status becomes a
 * yes or a no.
 */
export type EntitlementStatus = "active" | "inactive";

/** The statuses that grant premium access. Everything else denies. */
const GRANTS_ACCESS: ReadonlySet<EntitlementStatus> = new Set<EntitlementStatus>(["active"]);

/**
 * How an entitlement came to exist.
 *
 * `manual` is an operator grant — a comp, a founder account, a support fix.
 * `stripe` is reserved for the billing phase and is unused today. Recording
 * provenance from the start means the first Stripe-provisioned row does not
 * require a schema change, and an operator can always answer "why does this
 * person have access".
 */
export type EntitlementSource = "manual" | "stripe";

export type PremiumEntitlement = {
  readonly status: EntitlementStatus;
  readonly source: EntitlementSource;
  /**
   * The provisioning system's own identifier, when there is one — a Stripe
   * subscription id, later. Opaque here: nothing in this module parses it.
   */
  readonly externalReference: string | null;
  /** ISO timestamps. `grantedAt` is null for an entitlement that never activated. */
  readonly grantedAt: string | null;
  readonly revokedAt: string | null;
};

/* ------------------------------------------------------------------ the viewer */

/**
 * Everything the access decision is allowed to depend on.
 *
 * A `Viewer` is produced by the server and only by the server (see
 * `./server`). Constructing one in a browser is legitimate — presentation code
 * needs to know whether to render a gate — but a browser-constructed viewer
 * decides nothing: the server builds its own for every premium read and
 * ignores whatever the client believed.
 */
export type Viewer = {
  readonly authentication: AuthenticationState;
  /** `null` when the account has never held the entitlement, or when anonymous. */
  readonly premiumEntitlement: PremiumEntitlement | null;
};

/** The viewer every unauthenticated request gets, and the safe default everywhere. */
export const ANONYMOUS_VIEWER: Viewer = Object.freeze({
  authentication: ANONYMOUS_AUTHENTICATION,
  premiumEntitlement: null,
});

export function isAuthenticated(viewer: Viewer): boolean {
  return viewer.authentication.kind === "authenticated";
}

/**
 * Whether this viewer holds premium access right now.
 *
 * Authentication is a precondition, not a separate check a caller might
 * forget: an entitlement handed to an anonymous viewer answers `false` here
 * regardless of its status. There is no such thing as an anonymous
 * subscriber, and the one place that could be believed is this function.
 */
export function hasPremiumEntitlement(viewer: Viewer): boolean {
  if (!isAuthenticated(viewer)) return false;
  const entitlement = viewer.premiumEntitlement;
  if (!entitlement) return false;
  return GRANTS_ACCESS.has(entitlement.status);
}

/* ------------------------------------------------------------------ the decision */

/**
 * Why access was refused.
 *
 * Three reasons, and they are not interchangeable: `authentication_required`
 * sends a reader to sign-in, `entitlement_required` sends them to subscribe,
 * and `unknown_product` is a bug or a probe and sends them nowhere. Phase 2's
 * gate copy branches on this, which is why the denial carries a reason rather
 * than being a bare `false`.
 */
export type AccessDenialReason = "unknown_product" | "authentication_required" | "entitlement_required";

export type AccessDecision =
  | { readonly allowed: true; readonly product: UrdaisProduct }
  | { readonly allowed: false; readonly reason: AccessDenialReason; readonly product: UrdaisProduct | null };

/**
 * The canonical access check. Every gate, guard and conditional render in
 * Urdais resolves to this call.
 *
 * Pure, synchronous and total: it reads nothing, awaits nothing and throws
 * nothing, so it is equally usable in a server route, a React Server Component
 * and a test. Whatever work is needed to *obtain* a `Viewer` happens before
 * this and is the server's job.
 *
 *   public   product: allowed for anonymous, signed-in, and subscriber alike.
 *   premium  product: allowed only for a signed-in subscriber.
 *   unknown  product: denied, always.
 */
export function canAccess(viewer: Viewer, productId: UrdaisProductId | string | null | undefined): AccessDecision {
  const product = findProduct(productId);
  if (!product) return { allowed: false, reason: "unknown_product", product: null };

  if (product.accessClass === "public") return { allowed: true, product };

  if (!isAuthenticated(viewer)) return { allowed: false, reason: "authentication_required", product };
  if (!hasPremiumEntitlement(viewer)) return { allowed: false, reason: "entitlement_required", product };

  return { allowed: true, product };
}

/** `canAccess` reduced to a boolean, for call sites that only branch. */
export function isAccessAllowed(viewer: Viewer, productId: UrdaisProductId | string | null | undefined): boolean {
  return canAccess(viewer, productId).allowed;
}

/**
 * Test and fixture helper: a viewer holding an active premium entitlement.
 *
 * Exported from the production module on purpose. A subscriber fixture is
 * needed by tests, by Phase 2's component stories and by any local preview of
 * a gated surface, and the alternative — each of those hand-rolling a `Viewer`
 * literal — is how a fixture ends up disagreeing with the real shape. It
 * grants nothing on its own: authority comes from `./server`, which never
 * calls this.
 */
export function subscriberViewer(accountId = "fixture-account", overrides: Partial<PremiumEntitlement> = {}): Viewer {
  return {
    authentication: { kind: "authenticated", accountId, emailVerified: true },
    premiumEntitlement: {
      status: "active",
      source: "manual",
      externalReference: null,
      grantedAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
      ...overrides,
    },
  };
}

/** Test and fixture helper: signed in, holding no entitlement. */
export function authenticatedViewer(accountId = "fixture-account", emailVerified = true): Viewer {
  return { authentication: { kind: "authenticated", accountId, emailVerified }, premiumEntitlement: null };
}
