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

import { requestAnalyticsConsent } from "@/lib/analytics/request-consent";
import { recordCheckoutStarted } from "@/lib/analytics/server";
import { startBillingPortal, startCheckout } from "@/lib/billing/checkout";
import { safeReturnTo } from "@/lib/auth/return-to";
import { onboardingHref } from "@/lib/onboarding/routes";
import { ACCOUNT_HREF } from "@/lib/routes";
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

  // Analytics only. Never throws; anything unclear is "not_granted".
  const analyticsConsent = await requestAnalyticsConsent();
  const outcome = await startCheckout(returnTo, analyticsConsent);

  if (outcome.kind === "redirect") {
    // A Session exists now, so this is a checkout that really started -- a press
    // that was refused or failed above never reaches here. Sent after the redirect.
    recordCheckoutStarted(outcome.accountId, returnTo, analyticsConsent);
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
 * Open the Stripe Customer Portal: "Manage subscription" and "Manage billing".
 *
 * Reads nothing from the form -- not an account, not a Customer, not a return
 * target. `startBillingPortal` derives the Customer from the session and always
 * returns the reader to `/account`.
 *
 * Every failure stays on the account page with a short, true message. None of
 * them falls back to Checkout or creates a Customer: a reader with a payment
 * problem must fix the subscription they have, not be sold a second one.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the shape `useActionState` requires; nothing is read from the submission.
export async function openBillingPortalAction(_previous: AuthFormState, _formData: FormData): Promise<AuthFormState> {
  const outcome = await startBillingPortal();

  // Stripe's own Portal URL, never one assembled here.
  if (outcome.kind === "redirect") redirect(outcome.url);

  // The session ended between rendering the page and pressing the button.
  if (outcome.kind === "refused" && outcome.reason === "anonymous") redirect(onboardingHref("login", ACCOUNT_HREF));

  if (outcome.kind === "refused" && outcome.reason === "no_customer") {
    return { status: "error", message: "There is no billing account to manage yet. Nothing has been changed." };
  }

  // Unavailable or a mode mismatch. The detail is for the log: it can name a
  // configuration fault, which means nothing to the reader.
  console.error(`billing portal unavailable: ${outcome.kind === "refused" ? outcome.reason : outcome.detail}`);
  return {
    status: "error",
    message: "Billing management isn\u2019t available right now. Nothing has been changed. Try again shortly.",
  };
}
