"use server";

/**
 * The Server Actions that talk to Stripe.
 *
 * Separate from `@/app/access/actions` because that module is the authentication
 * flow and this one can spend money. Keeping them apart means the source scan that
 * asserts the customer auth surface never imports the password operations has a
 * counterpart here: nothing in this file is reachable from a client component
 * except through a form action, and the Stripe secret never leaves the server.
 *
 * ## Nothing is read from the form except a destination
 *
 * Not the account, not the Price, not the Customer, not the Subscription. Every one
 * of those is derived server-side — see `@/lib/billing/checkout`. The one field
 * submitted is `returnTo`, and it is sanitised before use.
 */

import { redirect } from "next/navigation";

import { startBillingPortal, startCheckout } from "@/lib/billing/checkout";
import { safeReturnTo } from "@/lib/auth/return-to";
import { onboardingHref } from "@/lib/onboarding/routes";
import type { AuthFormState } from "@/app/auth/form-state";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Start Stripe-hosted Checkout.
 *
 * Redirects to Stripe's own URL. Urdais renders no card fields and holds no card
 * data at any point.
 */
export async function startCheckoutAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const returnTo = safeReturnTo(field(formData, "returnTo"));

  const outcome = await startCheckout(returnTo);

  if (outcome.kind === "redirect") {
    // Stripe's session URL, never one assembled here.
    redirect(outcome.url);
  }

  if (outcome.kind === "refused") {
    // An entitled reader has nothing to buy; the rest belong earlier in the journey.
    // Sending them to the state machine is what stops a duplicate subscription.
    if (outcome.reason === "already_entitled") redirect(onboardingHref("already_entitled", returnTo));
    redirect(onboardingHref("create_account", returnTo));
  }

  // Unavailable. The detail names a configuration fault and is for the log, not the
  // reader: it would mean nothing to them and may name an environment variable.
  console.error(`checkout unavailable: ${outcome.detail}`);
  return {
    status: "error",
    message: "Subscriptions are not available right now. Nothing has been charged.",
  };
}

/**
 * Open the Stripe Customer Portal, where a subscriber cancels or changes a card.
 *
 * The Customer is derived from the session inside `startBillingPortal`. Nothing
 * about which Stripe Customer to open is read from this form.
 */
export async function openBillingPortalAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const returnTo = safeReturnTo(field(formData, "returnTo"));
  const outcome = await startBillingPortal(returnTo);

  if (outcome.kind === "redirect") redirect(outcome.url);

  console.error(`billing portal unavailable: ${outcome.detail}`);
  return {
    status: "error",
    message: "Subscription management is not available right now. Nothing has been changed.",
  };
}
