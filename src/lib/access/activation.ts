/**
 * The activation boundary: whether premium enforcement is switched on.
 *
 * Phase 3 builds the whole gate system. This module is the single switch that
 * decides whether it *does* anything, and it exists because of a sequencing
 * problem: the gates have to be real and verifiable before Stripe exists, but a
 * live gate before Stripe exists would show every visitor "Get Full Access" with
 * no way to buy access. That is worse than no gate at all.
 *
 * So the architecture is complete and wired into the real surfaces, and this flag
 * is what keeps production commercially open until a deliberate later phase
 * flips it.
 *
 * ## One switch, consulted one way
 *
 * Nothing outside this file reads the environment variable, and no page, route or
 * component contains an `if (process.env.…)`. Everything goes through
 * `resolvePremiumGate`, which is the only thing that combines activation with the
 * access decision. That is what makes it impossible to activate the page gate
 * while forgetting the API, or to filter the map without gating the pages — a
 * failure mode the brief calls out and which a scattered flag guarantees.
 *
 * ## Server-controlled
 *
 * A plain environment variable, not `NEXT_PUBLIC_*`, so it is never in the browser
 * bundle. There is deliberately no query parameter, cookie, header or
 * localStorage key that can turn enforcement on or off: a `?premium=true` bypass
 * would be a public backdoor into every premium product, and a secret URL is the
 * same thing with extra steps.
 *
 * ## Default
 *
 * Inactive. Absent, empty, misspelled, or any value other than the exact string
 * `active` means inactive. That direction is chosen so a typo cannot paywall the
 * production site — the failure mode of a wrong value is "keeps working as it
 * does today", which is the current, correct production behaviour.
 */

import { canAccess, type AccessDenialReason, type Viewer } from "@/lib/access/entitlement";
import { findProduct, type UrdaisProduct, type UrdaisProductId } from "@/lib/access/products";

/** A `process.env`-shaped bag, so tests and callers can pass a fixture. */
export type ProcessEnvLike = Record<string, string | undefined>;

/** The one variable. Server-only: never `NEXT_PUBLIC_`. */
export const PREMIUM_ENFORCEMENT_VAR = "URDAIS_PREMIUM_ENFORCEMENT";

/** The only value that switches enforcement on. */
export const PREMIUM_ENFORCEMENT_ACTIVE_VALUE = "active";

export type PremiumEnforcement = "active" | "inactive";

/**
 * Whether premium enforcement is on.
 *
 * Exact match on the lowercased, trimmed string. `"true"`, `"1"`, `"on"` and
 * `"yes"` all read as inactive on purpose: an operator turning this on is making
 * a commercial decision, and it should require the word, not a guess at the
 * spelling.
 */
export function premiumEnforcement(env: ProcessEnvLike = process.env): PremiumEnforcement {
  return env[PREMIUM_ENFORCEMENT_VAR]?.trim().toLowerCase() === PREMIUM_ENFORCEMENT_ACTIVE_VALUE ? "active" : "inactive";
}

export function isPremiumEnforcementActive(env: ProcessEnvLike = process.env): boolean {
  return premiumEnforcement(env) === "active";
}

/* ------------------------------------------------------------------ the gate */

/**
 * What a caller should do about one product on one request.
 *
 * `enforced: false` is the current production state: enforcement is off, so the
 * product is served exactly as it was before Phase 3 existed. It is deliberately
 * a distinct shape from an allowed decision under active enforcement, so a caller
 * cannot conflate "nobody is checking" with "this reader is entitled" — the map
 * filter in particular must behave differently in those two cases only in that
 * the first does no viewer resolution at all.
 */
export type PremiumGate =
  | { readonly enforced: false; readonly allowed: true }
  | { readonly enforced: true; readonly allowed: true; readonly product: UrdaisProduct }
  | {
      readonly enforced: true;
      readonly allowed: false;
      readonly reason: AccessDenialReason;
      /** `null` only for an unregistered product id. */
      readonly product: UrdaisProduct | null;
    };

/** A gate result that is open because nobody is checking. */
export const UNENFORCED_GATE: PremiumGate = Object.freeze({ enforced: false, allowed: true });

/**
 * Combine activation with the canonical access decision.
 *
 * Pure: the viewer is passed in, so this is usable from a test, a route and a
 * Server Component alike. `@/lib/access/server` owns the impure half — obtaining
 * a `Viewer` — and `resolvePremiumGate` there is what callers normally use.
 *
 * When enforcement is inactive this never looks at the viewer, which is why the
 * server-side wrapper can skip resolving one entirely. That is not just an
 * optimisation: resolving a viewer costs a Supabase round trip and two database
 * queries, and adding those to every Compute Economics and Power Analytics
 * request *today*, to reach a decision that is always "allowed", would be a
 * performance regression on live pages in exchange for nothing.
 */
export function gateFor(
  productId: UrdaisProductId | string,
  viewer: Viewer,
  env: ProcessEnvLike = process.env,
): PremiumGate {
  if (!isPremiumEnforcementActive(env)) return UNENFORCED_GATE;

  const decision = canAccess(viewer, productId);
  if (decision.allowed) return { enforced: true, allowed: true, product: decision.product };
  return { enforced: true, allowed: false, reason: decision.reason, product: decision.product };
}

/**
 * Whether this product is premium *and* currently enforced.
 *
 * For a caller that needs to know whether to do premium-specific work at all —
 * the map filter deciding whether it must resolve a viewer, for instance — without
 * yet having one.
 */
export function isEnforcedPremiumProduct(
  productId: UrdaisProductId | string,
  env: ProcessEnvLike = process.env,
): boolean {
  if (!isPremiumEnforcementActive(env)) return false;
  return findProduct(productId)?.accessClass === "premium";
}
