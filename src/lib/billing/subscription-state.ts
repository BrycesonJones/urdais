/**
 * The one place that decides whether a Stripe subscription entitles anybody.
 *
 * Pure, total, and deliberately boring: a `switch` over Stripe's documented
 * statuses with no default that grants. Everything else in the billing layer
 * defers to this, so "can this subscription unlock Urdais" has one answer rather
 * than one per call site.
 *
 * ## The policy
 *
 * | Stripe status        | Urdais entitlement | why |
 * | -------------------- | ------------------ | --- |
 * | `active`             | **granted**        | the period is paid for |
 * | `trialing`           | **granted**        | Stripe considers the period covered. Urdais sells no trial, so this should never occur; if a trial is ever configured, the safe behaviour is to honour it rather than to lock out a customer Stripe thinks is in good standing |
 * | `past_due`           | denied             | see below |
 * | `unpaid`             | denied             | Stripe gave up collecting |
 * | `incomplete`         | denied             | the first payment never completed |
 * | `incomplete_expired` | denied             | and never will |
 * | `canceled`           | denied             | over |
 * | `paused`             | denied             | not collecting, so not entitled |
 * | anything else        | denied             | fail closed |
 *
 * ## Why `past_due` denies
 *
 * This is the one genuinely contestable line, and monthly-billing products
 * commonly grant a grace period. Urdais bills **weekly**, and `past_due` means
 * the invoice for the current week was not paid. A grace period on a weekly plan
 * is a large fraction of the thing being sold, and the recovery is immediate and
 * in the reader's hands — update the card and Stripe retries. So it denies, and
 * the reader sees the ordinary subscribe path rather than a silent free week.
 *
 * Note that `past_due` is not reached on the first retry: Stripe keeps a
 * subscription `active` through its configured retry schedule and only moves it
 * to `past_due` when that schedule is exhausted. By the time this denies,
 * collection has already failed repeatedly.
 *
 * ## Why `cancel_at_period_end` is not an input
 *
 * Asking to cancel is not the same as having stopped paying, and Stripe keeps the
 * status `active` until the paid period actually elapses. Reading the flag here
 * would revoke access somebody has paid for, the moment they press cancel — a
 * refund conversation, and the most predictable way to get one. The flag is
 * stored for operators and for copy; the decision is the status alone.
 */

import type Stripe from "stripe";

/** Stripe's documented subscription statuses. */
export const STRIPE_SUBSCRIPTION_STATUSES = Object.freeze([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const);

export type StripeSubscriptionStatus = (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];

/** Whether a string is a status this build knows how to store and reason about. */
export function isKnownSubscriptionStatus(value: unknown): value is StripeSubscriptionStatus {
  return typeof value === "string" && (STRIPE_SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/**
 * The statuses that entitle. Enumerated positively: a new Stripe status cannot
 * join this set by being unrecognised.
 */
const ENTITLING: readonly StripeSubscriptionStatus[] = Object.freeze(["active", "trialing"]);

/**
 * Whether a subscription in this status entitles the account to premium.
 *
 * Accepts `unknown` rather than the narrowed type on purpose: this is called with
 * strings that came from Stripe over the network and from a database column, and
 * an unknown value must reach the fail-closed branch instead of a type assertion.
 */
export function statusEntitles(status: unknown): boolean {
  if (!isKnownSubscriptionStatus(status)) return false;
  return ENTITLING.includes(status);
}

/** Operator-facing reason, for logs and the reconciliation report. */
export function describeStatusDecision(status: unknown): string {
  if (!isKnownSubscriptionStatus(status)) return `unknown status ${JSON.stringify(status)}: denied, failing closed`;
  if (ENTITLING.includes(status)) return `${status}: entitled`;
  return `${status}: not entitled`;
}

/** The fields Urdais stores from a Stripe Subscription. Nothing else is kept. */
export type BillingSubscriptionSnapshot = {
  readonly stripeSubscriptionId: string;
  readonly stripeCustomerId: string;
  readonly status: StripeSubscriptionStatus;
  readonly stripePriceId: string;
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: string | null;
  readonly canceledAt: string | null;
  readonly endedAt: string | null;
  readonly livemode: boolean;
};

function secondsToIso(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function customerIdOf(subscription: Stripe.Subscription): string | null {
  const customer = subscription.customer;
  if (typeof customer === "string") return customer.trim() === "" ? null : customer;
  // Expanded, or deleted. A deleted customer still carries its id.
  return typeof customer?.id === "string" && customer.id.trim() !== "" ? customer.id : null;
}

function priceIdOf(subscription: Stripe.Subscription): string | null {
  // Urdais sells exactly one Price, so the first item is the subscription's
  // Price. Reading `items.data[0]` rather than searching means a subscription
  // that somehow carries two items is visible as the wrong shape instead of
  // being silently reduced to whichever item matched.
  const price = subscription.items?.data?.[0]?.price;
  return typeof price?.id === "string" && price.id.trim() !== "" ? price.id : null;
}

/**
 * The period end, in a way that survives Stripe moving the field.
 *
 * Stripe's newer API versions carry `current_period_end` on the subscription item
 * rather than on the subscription. Reading both means an SDK upgrade cannot
 * silently turn a real period end into `null` — which would make a cancelled
 * subscription look as though it had no paid-through date.
 */
function currentPeriodEndOf(subscription: Stripe.Subscription): string | null {
  const onSubscription = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const fromSubscription = secondsToIso(onSubscription);
  if (fromSubscription) return fromSubscription;
  const item = subscription.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  return secondsToIso(item?.current_period_end);
}

/**
 * A snapshot of a Stripe Subscription, or `null` when it is not usable.
 *
 * `null` for a missing customer, a missing price or an unrecognised status: each
 * would produce a row that cannot be reconciled, and storing it is worse than
 * refusing it because the webhook would then report success.
 */
export function snapshotSubscription(subscription: Stripe.Subscription): BillingSubscriptionSnapshot | null {
  const stripeCustomerId = customerIdOf(subscription);
  const stripePriceId = priceIdOf(subscription);
  if (!stripeCustomerId || !stripePriceId) return null;
  if (!isKnownSubscriptionStatus(subscription.status)) return null;
  if (typeof subscription.id !== "string" || subscription.id.trim() === "") return null;

  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId,
    status: subscription.status,
    stripePriceId,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    currentPeriodEnd: currentPeriodEndOf(subscription),
    canceledAt: secondsToIso(subscription.canceled_at),
    endedAt: secondsToIso(subscription.ended_at),
    livemode: subscription.livemode === true,
  };
}

/** Whether this snapshot should leave the account holding an active entitlement. */
export function snapshotEntitles(snapshot: BillingSubscriptionSnapshot): boolean {
  return statusEntitles(snapshot.status);
}
