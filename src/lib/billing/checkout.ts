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

import { STRIPE_METADATA_ANALYTICS_CONSENT, type ServerConsent } from "@/lib/analytics/consent";
import { env } from "@/config/env";
import { PREMIUM_PRICE } from "@/lib/access/pricing";
import { METADATA_ACCOUNT_ID, catalogMetadata, describePriceMismatch } from "@/lib/billing/catalog";
import { resolveStripeCustomerId } from "@/lib/billing/customers";
import { describeUnavailability, livemodeMatches } from "@/lib/billing/mode";
import { stripeContext } from "@/lib/billing/stripe";
import { resolveCheckoutHandoff } from "@/lib/onboarding/checkout-handoff";
import { onboardingHref } from "@/lib/onboarding/routes";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { resolveUrdaisAccount } from "@/lib/auth/accounts";
import { readCustomerMapping } from "@/lib/billing/store";
import { ACCOUNT_HREF } from "@/lib/routes";
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
  /** `accountId` is the server-resolved account the Session was created for. */
  | { readonly kind: "redirect"; readonly url: string; readonly accountId: string }
  | { readonly kind: "refused"; readonly reason: "anonymous" | "unverified" | "already_entitled" }
  | { readonly kind: "unavailable"; readonly detail: string };

/**
 * Begin checkout for the current request's reader.
 *
 * Returns a Stripe-hosted URL to redirect to. Nothing is charged and no
 * entitlement moves here — a Session is an intention, and the webhook is what
 * makes it mean anything.
 */
export async function startCheckout(returnTo?: string | null, analyticsConsent: ServerConsent = "none"): Promise<CheckoutStart> {
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
    // Analytics only: the reader's analytics consent at this moment, so the
    // webhook -- which carries no cookie -- knows whether its conversion event may
    // name the account. Read by nothing in billing.
    [STRIPE_METADATA_ANALYTICS_CONSENT]: analyticsConsent,
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
  return { kind: "redirect", url: session.url, accountId: handoff.accountId };
}

/* -------------------------------------------------------------- the portal */

/**
 * Where Stripe's Customer Portal sends the reader back: the Account Hub, always.
 *
 * Fixed rather than carried from the request. Billing management starts and ends
 * at the account, so there is no destination to preserve -- and a return target
 * nobody can supply is one nobody can turn into an open redirect. Built from the
 * deployment's own origin, never the request's `Host`.
 *
 * Returning here proves nothing. The page reads the webhook-reconciled state like
 * any other visit; arriving from Stripe grants and revokes nothing.
 */
export function portalReturnUrl(): string {
  return new URL(ACCOUNT_HREF, env.appUrl).toString();
}

export type PortalStart =
  | { readonly kind: "redirect"; readonly url: string }
  /** The reader may not open a Portal. Nothing was created. */
  | { readonly kind: "refused"; readonly reason: "anonymous" | "no_customer" | "mode_mismatch" }
  /** Billing, the database or Stripe could not be reached. Nothing was created or changed. */
  | { readonly kind: "unavailable"; readonly detail: string };

/**
 * A Stripe Customer Portal session for the current reader. The one Portal primitive.
 *
 * Customer Portal access always resolves the Stripe Customer from the
 * authenticated Urdais account server-side:
 *
 *   session -> Supabase identity -> Urdais account -> `identity.billing_customers`
 *
 * Nothing about which account or Customer to open is read from the request. A
 * Portal opened against a browser-supplied Customer id would hand one reader
 * another's invoices, payment methods and cancel button.
 *
 * It **never creates a Customer**. An account with no mapping -- one that has
 * never been to Checkout -- is refused, not repaired: a Customer is created only
 * at the purchase boundary, inside `startCheckout`. And it never creates a
 * subscription, which is why it is the recovery path for a payment issue: the
 * reader fixes the existing subscription instead of buying a second one.
 *
 * The mapping's `livemode` must match this deployment's Stripe mode, so a test
 * deployment cannot open a live Customer's Portal or the reverse.
 *
 * Stripe hosts the Portal, so Urdais builds no card-management UI and stores no
 * card data. Cancellation, payment methods and invoices live there; Urdais learns
 * the outcome from the signed webhook like any other change.
 */
export async function startBillingPortal(): Promise<PortalStart> {
  const identity = await resolveSupabaseIdentity();
  if (identity.kind !== "authenticated") return { kind: "refused", reason: "anonymous" };

  const context = stripeContext();
  if (context.kind === "unavailable") return { kind: "unavailable", detail: describeUnavailability(context.availability) };

  let mapping: Awaited<ReturnType<typeof readCustomerMapping>>;
  try {
    const databaseUrl = resolveTokenDatabaseUrl();
    if (!databaseUrl) return { kind: "unavailable", detail: "no database is configured" };
    const sql = await tokenSqlExecutor(databaseUrl);
    // The same account resolution every authenticated surface uses.
    const account = await resolveUrdaisAccount(sql, identity.identity);
    mapping = await readCustomerMapping(sql, account.id);
  } catch (error) {
    return { kind: "unavailable", detail: `account or customer could not be read: ${error instanceof Error ? error.name : "error"}` };
  }

  if (!mapping) return { kind: "refused", reason: "no_customer" };
  if (!livemodeMatches(mapping.livemode, context.availability.mode)) return { kind: "refused", reason: "mode_mismatch" };

  let url: string | null | undefined;
  try {
    const session = await context.stripe.billingPortal.sessions.create({
      customer: mapping.stripeCustomerId,
      return_url: portalReturnUrl(),
    });
    url = session.url;
  } catch (error) {
    // Stripe rejected the session or could not be reached. Reported, never retried
    // with a different Customer.
    const code = (error as { code?: unknown })?.code;
    return { kind: "unavailable", detail: `portal session refused by Stripe: ${typeof code === "string" ? code : error instanceof Error ? error.name : "error"}` };
  }

  if (!url) return { kind: "unavailable", detail: "Stripe returned a portal session with no URL" };
  return { kind: "redirect", url };
}
