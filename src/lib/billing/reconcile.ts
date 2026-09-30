/**
 * Asking Stripe directly, for when a webhook has not arrived yet.
 *
 * ## Why this exists
 *
 * A reader who has just paid is looking at Urdais now. The webhook usually lands
 * within a second, but "usually" is doing real work in that sentence: delivery can
 * be delayed, and a local run may have no forwarding at all. Without a way to ask,
 * the post-checkout screen would say "processing" until someone refreshed at the
 * right moment.
 *
 * ## Why it is not a hole in the webhook's authority
 *
 * It asks **Stripe**, not the browser. The only thing the browser contributes is a
 * Checkout Session id, and that is used as a lookup key against Stripe's own API —
 * where a forged or replayed id either does not exist, or resolves to a session
 * belonging to a Customer that is not this reader's, which is checked. The
 * entitlement is then written through exactly the same
 * `applySubscriptionEvent` path a webhook uses, with the same idempotency ledger,
 * so a reconciliation and a webhook racing each other cannot both grant.
 *
 * The synthetic event id is prefixed `reconcile:` so the ledger distinguishes a
 * reconciliation from a delivered event. It is deterministic — derived from the
 * subscription and its current state — so repeated reconciliation of an unchanged
 * subscription is a duplicate rather than a new ledger row implying a new business
 * event.
 */

import type Stripe from "stripe";

import { livemodeMatches, type StripeMode } from "@/lib/billing/mode";
import { applySubscriptionEvent, readCustomerId } from "@/lib/billing/store";
import { snapshotEntitles, snapshotSubscription, type BillingSubscriptionSnapshot } from "@/lib/billing/subscription-state";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

export type Reconciliation =
  | { readonly kind: "entitled"; readonly subscriptionId: string }
  | { readonly kind: "not_entitled"; readonly subscriptionId: string; readonly status: string }
  | { readonly kind: "nothing_found" }
  | { readonly kind: "refused"; readonly detail: string };

/**
 * A ledger id for a reconciliation of this exact state.
 *
 * Includes the status and period end so that a *changed* subscription reconciles
 * as a new event while an unchanged one is recognised as already handled.
 */
export function reconciliationEventId(snapshot: BillingSubscriptionSnapshot): string {
  return `reconcile:${snapshot.stripeSubscriptionId}:${snapshot.status}:${snapshot.currentPeriodEnd ?? "none"}`;
}

/**
 * Bring Urdais's entitlement into line with Stripe, for one account.
 *
 * `sessionId` narrows the lookup to the session the reader just completed. When it
 * is absent the account's Stripe Customer is asked for its subscriptions instead,
 * which is what a support-side reconciliation uses.
 */
export async function reconcileAccount(
  stripe: Stripe,
  sql: TokenSqlExecutor,
  input: { readonly accountId: string; readonly sessionId?: string | null; readonly mode: StripeMode },
): Promise<Reconciliation> {
  const customerId = await readCustomerId(sql, input.accountId);
  if (!customerId) return { kind: "nothing_found" };

  let subscription: Stripe.Subscription | null = null;

  if (input.sessionId && input.sessionId.trim() !== "") {
    try {
      const session = await stripe.checkout.sessions.retrieve(input.sessionId.trim(), { expand: ["subscription"] });
      const sessionCustomer = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
      // The session must belong to *this* reader's Customer. Without this check a
      // session id lifted from somebody else's URL would reconcile their
      // subscription onto this account.
      if (sessionCustomer !== customerId) {
        return { kind: "refused", detail: "the checkout session belongs to another customer" };
      }
      const raw = session.subscription;
      subscription = typeof raw === "string" ? await stripe.subscriptions.retrieve(raw) : (raw ?? null);
    } catch {
      // A bad or expired id is not evidence of anything. Fall through to the
      // customer's own subscriptions rather than reporting an error to the reader.
      subscription = null;
    }
  }

  if (!subscription) {
    const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    // Newest first is Stripe's default ordering. The most recent subscription is
    // the one a reader who just paid means.
    subscription = list.data[0] ?? null;
  }

  if (!subscription) return { kind: "nothing_found" };

  const snapshot = snapshotSubscription(subscription);
  if (!snapshot) return { kind: "refused", detail: "the Stripe subscription is not in a usable shape" };
  if (!livemodeMatches(snapshot.livemode, input.mode)) {
    return { kind: "refused", detail: "the Stripe subscription belongs to the other environment" };
  }
  if (snapshot.stripeCustomerId !== customerId) {
    return { kind: "refused", detail: "the Stripe subscription belongs to another customer" };
  }

  await applySubscriptionEvent(sql, {
    accountId: input.accountId,
    snapshot,
    event: {
      id: reconciliationEventId(snapshot),
      type: "urdais.reconciliation",
      livemode: snapshot.livemode,
      // Now, not a Stripe event time: a reconciliation reflects state as of this
      // moment, and dating it earlier would let it lose to a stale stored event.
      createdAt: new Date().toISOString(),
    },
  });

  // The same policy function the webhook uses. Re-deciding it here with a second
  // comparison is how reconciliation and webhooks drift into disagreeing about who
  // is entitled.
  return snapshotEntitles(snapshot)
    ? { kind: "entitled", subscriptionId: snapshot.stripeSubscriptionId }
    : { kind: "not_entitled", subscriptionId: snapshot.stripeSubscriptionId, status: snapshot.status };
}
