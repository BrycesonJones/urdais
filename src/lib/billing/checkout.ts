/**
 * Creating a Stripe Checkout Session.
 *
 * Everything that decides what is bought, and who buys it, is resolved on the
 * server. The browser supplies exactly one thing — a destination to return to —
 * and that goes through `safeReturnTo` before it is used.
 *
 * | value | where it comes from |
 * | --- | --- |
 * | the Urdais account | the session, via `resolveCheckoutHandoff` |
 * | the Stripe Customer | the account's mapping row |
 * | the Price | `STRIPE_PREMIUM_PRICE_ID`, reconciled against `@/lib/access/pricing` |
 * | `returnTo` | the request, sanitised |
 *
 * A hidden field carrying an account id is a subscription somebody else pays for;
 * a Price chosen by the browser is a $0.50 subscription. Neither is accepted, and
 * `resolveCheckoutHandoff` exists precisely so that the ready screen cannot post
 * back an account.
 *
 * ## An entitled reader is refused
 *
 * Not a UI nicety: it is the duplicate-subscription guard. Someone following a
 * stale CTA, or pressing back after paying, is the ordinary way a customer ends up
 * paying twice — which is a refund conversation rather than a bug report.
 */

import { env } from "@/config/env";
import { PREMIUM_PRICE } from "@/lib/access/pricing";
import { METADATA_ACCOUNT_ID, catalogMetadata, describePriceMismatch } from "@/lib/billing/catalog";
import { resolveStripeCustomerId } from "@/lib/billing/customers";
import { describeUnavailability } from "@/lib/billing/mode";
import { stripeContext } from "@/lib/billing/stripe";
import { resolveCheckoutHandoff } from "@/lib/onboarding/checkout-handoff";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { resolveViewer } from "@/lib/access/server";
import { readCustomerId } from "@/lib/billing/store";
import { resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { tokenSqlExecutor } from "@/lib/tokens/read/database";

/** Where Stripe sends a reader who paid. Proves nothing; see the route. */
export function checkoutSuccessUrl(returnTo: string | null): string {
  const url = new URL("/access/complete", env.appUrl);
  // Stripe substitutes the real id. Used only to ask Stripe about the session
  // server-side; it is never treated as evidence of payment.
  url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

/** Where Stripe sends a reader who backed out. The offer, with their destination kept. */
export function checkoutCancelUrl(returnTo: string | null): string {
  return new URL(onboardingHref("ready_for_checkout", returnTo), env.appUrl).toString();
}

export type CheckoutStart =
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "refused"; readonly reason: "anonymous" | "unverified" | "already_entitled" }
  | { readonly kind: "unavailable"; readonly detail: string };

/**
 * Begin checkout for the current request's reader.
 *
 * Returns a Stripe-hosted URL to redirect to. Nothing is charged and no
 * entitlement moves here — a Session is an intention, and the webhook is what
 * makes it mean anything.
 */
export async function startCheckout(returnTo?: string | null): Promise<CheckoutStart> {
  const handoff = await resolveCheckoutHandoff(returnTo);
  if (handoff.kind === "refused") return { kind: "refused", reason: handoff.reason };

  const context = stripeContext();
  if (context.kind === "unavailable") {
    return { kind: "unavailable", detail: describeUnavailability(context.availability) };
  }
  const { stripe, availability } = context;

  const databaseUrl = resolveTokenDatabaseUrl();
  if (!databaseUrl) return { kind: "unavailable", detail: "no database is configured" };
  const sql = await tokenSqlExecutor(databaseUrl);

  // The configured Price is checked against the copy the reader was shown. A
  // mismatch refuses rather than charges: a Price that has drifted from "$80/week"
  // means one of the two is wrong, and the wrong one is always the one they read.
  const price = await stripe.prices.retrieve(availability.priceId);
  const mismatch = describePriceMismatch(price, PREMIUM_PRICE);
  if (mismatch) return { kind: "unavailable", detail: mismatch };

  const identity = await resolveSupabaseIdentity();
  const email = identity.kind === "authenticated" ? identity.identity.email : null;

  const customerId = await resolveStripeCustomerId(stripe, sql, {
    accountId: handoff.accountId,
    email,
    mode: availability.mode,
  });

  const metadata = {
    ...catalogMetadata(availability.mode),
    [METADATA_ACCOUNT_ID]: handoff.accountId,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: availability.priceId, quantity: 1 }],
    success_url: checkoutSuccessUrl(handoff.returnTo),
    cancel_url: checkoutCancelUrl(handoff.returnTo),
    // Both, deliberately. `client_reference_id` survives on the Session and
    // `metadata` is copied onto the Subscription, so a webhook about either object
    // can find the account without trusting anything the browser sent.
    client_reference_id: handoff.accountId,
    metadata,
    // No `trial_period_days`: Urdais sells no trial, and Stripe adds one only when
    // asked or when the Price carries trial settings. `priceMatchesPremium` is what
    // keeps such a Price from being the configured one, so the absence here is
    // checked rather than merely intended.
    subscription_data: { metadata },
  });

  if (!session.url) return { kind: "unavailable", detail: "Stripe returned a session with no URL" };
  return { kind: "redirect", url: session.url };
}

/* -------------------------------------------------------------- the portal */

export type PortalStart =
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "refused"; readonly detail: string };

/**
 * A Stripe Customer Portal session for the current reader.
 *
 * The Customer is looked up from the authenticated account's mapping row — never
 * taken from the request. A portal session created against a Customer id supplied
 * by the browser would hand one reader another's invoices, payment methods and
 * cancel button, which is the worst version of this bug.
 *
 * Stripe hosts it, so Urdais builds no card-management UI and stores no card data.
 * Cancellation, payment-method changes and invoice history all live there; Urdais
 * learns the outcome from the webhook like any other change.
 */
export async function startBillingPortal(returnTo?: string | null): Promise<PortalStart> {
  const viewer = await resolveViewer();
  if (viewer.authentication.kind !== "authenticated") return { kind: "refused", detail: "not authenticated" };

  const context = stripeContext();
  if (context.kind === "unavailable") return { kind: "refused", detail: describeUnavailability(context.availability) };

  const databaseUrl = resolveTokenDatabaseUrl();
  if (!databaseUrl) return { kind: "refused", detail: "no database is configured" };
  const sql = await tokenSqlExecutor(databaseUrl);

  const customerId = await readCustomerId(sql, viewer.authentication.accountId);
  if (!customerId) return { kind: "refused", detail: "this account has no Stripe customer" };

  const session = await context.stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: new URL(onboardingHref("already_entitled", onboardingReturnTo(returnTo)), env.appUrl).toString(),
  });

  return { kind: "redirect", url: session.url };
}
