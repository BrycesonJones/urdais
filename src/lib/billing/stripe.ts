/**
 * The Stripe client, and the boundary it must never cross.
 *
 * **Server-only.** `STRIPE_SECRET_KEY` can spend money and read every customer in
 * the account, so this module must not be reachable from a client component. That
 * is asserted by a source scan in `billing-boundary.test.ts` rather than by the
 * `server-only` package, because the repository has no such dependency and a test
 * that names the offending file is more useful than an import error.
 *
 * There is deliberately **no browser Stripe client anywhere in Urdais**. Checkout
 * is Stripe-hosted: the server creates a Session and redirects to Stripe's own
 * URL, so `@stripe/stripe-js` would be a dependency, a bundle and an attack
 * surface added for nothing. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` exists in the
 * environment and is **unused** for that reason — see
 * `docs/architecture/stripe-billing.md`.
 *
 * ## The API version is the SDK's own
 *
 * Not pinned here. The SDK ships pinned to the version its TypeScript types were
 * generated against, and overriding `apiVersion` to a different string makes the
 * types describe a shape the API no longer returns — which fails at runtime while
 * type-checking cleanly. Upgrading Stripe's API version is therefore an SDK
 * upgrade, deliberately.
 */

import Stripe from "stripe";

import { type BillingAvailability, billingAvailability } from "@/lib/billing/mode";

/** How Urdais identifies itself in Stripe's logs. */
const APP_INFO = { name: "Urdais", url: "https://urdais.com" } as const;

/**
 * A Stripe client for this request, or the reason there is none.
 *
 * Constructed per call rather than memoised at module scope. The client is cheap,
 * and a module-level singleton would capture whichever credential happened to be
 * present when the module first loaded — which is the kind of thing that survives
 * a key rotation and starts failing hours later.
 */
export type StripeContext =
  | { readonly kind: "ready"; readonly stripe: Stripe; readonly availability: Extract<BillingAvailability, { kind: "available" }> }
  | { readonly kind: "unavailable"; readonly availability: Extract<BillingAvailability, { kind: "unavailable" }> };

export function stripeContext(env: Record<string, string | undefined> = process.env): StripeContext {
  const availability = billingAvailability(env);
  if (availability.kind === "unavailable") return { kind: "unavailable", availability };

  return {
    kind: "ready",
    availability,
    stripe: new Stripe(availability.secretKey, {
      appInfo: APP_INFO,
      // Two retries on Stripe's own idempotent-safe retry path. A Checkout Session
      // creation that fails on a transient network error should not present the
      // reader with an error they can do nothing about.
      maxNetworkRetries: 2,
    }),
  };
}

/**
 * The client, or `null`.
 *
 * For callers that have already decided what to do about unavailability and only
 * need the happy path.
 */
export function stripeClientOrNull(env: Record<string, string | undefined> = process.env): Stripe | null {
  const context = stripeContext(env);
  return context.kind === "ready" ? context.stripe : null;
}
