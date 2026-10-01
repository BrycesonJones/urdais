/**
 * Stripe's side of account deletion: make sure nothing can bill again.
 *
 * > Urdais must never report an account successfully deleted while knowingly
 * > leaving that account with an active or potentially future-billable Stripe
 * > subscription.
 *
 * Stripe is authoritative here, not the local `billing_subscriptions` rows, which
 * may be stale or incomplete. So this lists **every** subscription the account's
 * Customer has at Stripe (`status: "all"`), cancels each one that could still
 * bill, then **lists again** and requires that none remain. That re-list is also
 * what makes a retry safe: a subscription cancelled on a previous attempt shows up
 * as `canceled` and is simply satisfied.
 *
 * Only the Customer resolved server-side from the account's own mapping is ever
 * listed, so another account's subscriptions are unreachable.
 *
 * ## Cancellation semantics
 *
 * `subscriptions.cancel(id, { prorate: false, invoice_now: false })`: immediate,
 * no proration credit, no refund, no final invoice. A scheduled
 * `cancel_at_period_end` becomes immediate too, so remaining paid time is
 * forfeited -- the approved difference between deleting an account and cancelling
 * a subscription.
 *
 * ## Existing invoices are not forgiven
 *
 * Nothing here voids, refunds or marks anything uncollectible. Per Stripe's
 * documentation, cancelling a subscription "disables creating new invoices and
 * stops automatic collection of all outstanding invoices from the subscription":
 * its open and draft invoices get `auto_advance = false`, which pauses automatic
 * collection and reminder emails. An already-issued invoice therefore stays
 * **open** (it can still be paid or collected manually); it is just no longer
 * retried automatically. See docs/architecture/account-deletion.md.
 */

import type Stripe from "stripe";

import { livemodeMatches, type StripeMode } from "@/lib/billing/mode";
import { METADATA_ACCOUNT_ID } from "@/lib/billing/catalog";

/** Statuses that can no longer produce a billing period. Everything else can. */
const TERMINAL: readonly string[] = ["canceled", "incomplete_expired"];

export function isPotentiallyBillable(status: string): boolean {
  return !TERMINAL.includes(status);
}

export type BillingTermination =
  | { readonly kind: "terminated"; readonly canceled: number }
  | {
      readonly kind: "failed";
      readonly reason: "stripe_unavailable" | "cancel_failed" | "customer_mismatch";
      /** Whether this attempt cancelled anything before failing. */
      readonly anyCanceled: boolean;
    };

async function listSubscriptions(stripe: Stripe, customer: string): Promise<Stripe.Subscription[]> {
  return stripe.subscriptions.list({ customer, status: "all", limit: 100 }).autoPagingToArray({ limit: 10_000 });
}

export async function terminateBilling(stripe: Stripe, customerId: string, mode: StripeMode): Promise<BillingTermination> {
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch {
    return { kind: "failed", reason: "stripe_unavailable", anyCanceled: false };
  }
  // A deleted Customer's subscriptions are cancelled by Stripe with it.
  if ("deleted" in customer && customer.deleted) return { kind: "terminated", canceled: 0 };
  if (!livemodeMatches((customer as Stripe.Customer).livemode, mode)) {
    return { kind: "failed", reason: "customer_mismatch", anyCanceled: false };
  }

  let subscriptions: Stripe.Subscription[];
  try {
    subscriptions = await listSubscriptions(stripe, customerId);
  } catch {
    return { kind: "failed", reason: "stripe_unavailable", anyCanceled: false };
  }

  let canceled = 0;
  for (const subscription of subscriptions) {
    if (!isPotentiallyBillable(subscription.status)) continue;
    try {
      await stripe.subscriptions.cancel(subscription.id, { prorate: false, invoice_now: false });
      canceled += 1;
    } catch {
      // Not decided here: it may already be cancelled (a concurrent attempt, a
      // webhook-era change). The re-list below is the verdict.
    }
  }

  // The verdict: nothing this Customer has may still bill.
  let after: Stripe.Subscription[];
  try {
    after = await listSubscriptions(stripe, customerId);
  } catch {
    return { kind: "failed", reason: "stripe_unavailable", anyCanceled: canceled > 0 };
  }
  if (after.some((subscription) => isPotentiallyBillable(subscription.status))) {
    return { kind: "failed", reason: "cancel_failed", anyCanceled: canceled > 0 };
  }
  return { kind: "terminated", canceled };
}

/**
 * Remove the pointer from the retained Stripe Customer to the deleted Urdais
 * account. Setting a metadata key to "" unsets it. The Customer itself, its email
 * and its financial history are left exactly as they are.
 *
 * (A cancelled subscription cannot be updated, so its own copy of the metadata
 * stays; late events carrying it are handled as detached -- see
 * `applySubscriptionEvent`.)
 */
export async function detachStripeCustomer(stripe: Stripe, customerId: string): Promise<boolean> {
  try {
    await stripe.customers.update(customerId, { metadata: { [METADATA_ACCOUNT_ID]: "" } });
    return true;
  } catch (error) {
    // Already deleted at Stripe: nothing left to point anywhere.
    return (error as { code?: unknown })?.code === "resource_missing";
  }
}
