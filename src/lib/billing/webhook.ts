/**
 * Stripe webhooks: the only thing that can move an entitlement.
 *
 * ## Why this is the authority and the success redirect is not
 *
 * A success URL is a string in a browser's address bar. Anyone can type it, and a
 * reader who abandons Checkout at the card form can still reach it by pressing
 * back. A webhook is a request Stripe signs with a secret only Stripe and this
 * server hold. So the redirect is user experience and this is accounting, and
 * `/access/complete` grants nothing.
 *
 * ## The event set, and why it is this small
 *
 * | event | why |
 * | --- | --- |
 * | `checkout.session.completed` | the first moment the account, Customer and Subscription are all known together. It carries the metadata the server wrote, so the account is trusted without touching browser state |
 * | `customer.subscription.created` | the subscription exists |
 * | `customer.subscription.updated` | every status change: paid, `past_due`, `canceled`, and the cancel-at-period-end flag |
 * | `customer.subscription.deleted` | the end, and the final revocation |
 *
 * **Invoice events are deliberately not handled.** `invoice.payment_failed` cannot
 * change whether an account is entitled without Stripe also moving the
 * subscription's status, and Stripe keeps a subscription `active` through its retry
 * schedule on purpose. Handling both would mean two code paths deciding one
 * question, and the invoice path would revoke access during a retry window that
 * Stripe still considers good standing. Entitlement follows subscription status;
 * that is the whole policy, and it lives in `subscription-state.ts`.
 *
 * ## Every handler re-reads the subscription from Stripe
 *
 * The event payload is used for its *identity* — which subscription, which event,
 * when — and not for its state. Stripe does not guarantee delivery order, so a
 * payload can describe a subscription as it was two states ago. Re-fetching means
 * what gets stored is what Stripe believes right now, which is the only version
 * worth storing. The stored `last_event_at` then stops an older event from
 * overwriting a newer one's result.
 *
 * This costs one API call per event and removes an entire class of bug.
 */

import type Stripe from "stripe";

import { METADATA_ACCOUNT_ID } from "@/lib/billing/catalog";
import { livemodeMatches, type StripeMode } from "@/lib/billing/mode";
import { applySubscriptionEvent, readAccountIdForCustomer, type ApplyOutcome } from "@/lib/billing/store";
import { snapshotSubscription } from "@/lib/billing/subscription-state";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

/** The events Urdais asks Stripe for. Anything else is acknowledged and ignored. */
export const HANDLED_EVENT_TYPES = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const);

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];

export function isHandledEventType(value: string): value is HandledEventType {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(value);
}

export type WebhookOutcome =
  | { readonly kind: "processed"; readonly detail: string }
  | { readonly kind: "ignored"; readonly detail: string }
  /** Something is wrong with the request itself. Stripe should not retry. */
  | { readonly kind: "rejected"; readonly detail: string }
  /** Something is wrong here. Stripe should retry. */
  | { readonly kind: "failed"; readonly detail: string };

function subscriptionIdFromSession(session: Stripe.Checkout.Session): string | null {
  const subscription = session.subscription;
  if (typeof subscription === "string") return subscription.trim() === "" ? null : subscription;
  return typeof subscription?.id === "string" ? subscription.id : null;
}

/**
 * The Urdais account an event concerns.
 *
 * Metadata first, because the server wrote it and Stripe stored it verbatim. The
 * customer mapping second, because an event about a subscription created outside
 * this flow — an operator acting in the dashboard, say — carries no Urdais
 * metadata but still belongs to a known Customer.
 *
 * Neither source is the browser, which is the point.
 */
async function resolveAccountId(
  sql: TokenSqlExecutor,
  metadata: Stripe.Metadata | null | undefined,
  stripeCustomerId: string | null,
): Promise<string | null> {
  const fromMetadata = metadata?.[METADATA_ACCOUNT_ID];
  if (typeof fromMetadata === "string" && fromMetadata.trim() !== "") return fromMetadata.trim();
  if (stripeCustomerId) return readAccountIdForCustomer(sql, stripeCustomerId);
  return null;
}

function describe(outcome: ApplyOutcome, subscriptionId: string): string {
  switch (outcome.kind) {
    case "applied":
      return `subscription ${subscriptionId} stored, entitlement ${outcome.entitlement}`;
    case "duplicate":
      return `event already processed for ${subscriptionId}`;
    case "stale":
      return `event older than stored state for ${subscriptionId}, no change`;
  }
}

/**
 * Process one verified Stripe event.
 *
 * The signature must already have been checked by the caller; this function does
 * not see the raw body and cannot verify it.
 */
export async function processStripeEvent(
  stripe: Stripe,
  sql: TokenSqlExecutor,
  event: Stripe.Event,
  mode: StripeMode,
): Promise<WebhookOutcome> {
  // A live event reaching a test deployment (or the reverse) means credentials are
  // crossed somewhere. Processing it would write billing state from the wrong
  // Stripe account, so it is refused rather than retried.
  if (!livemodeMatches(event.livemode, mode)) {
    return { kind: "rejected", detail: `event livemode=${event.livemode} does not match ${mode} mode` };
  }

  if (!isHandledEventType(event.type)) {
    // Acknowledged so Stripe stops sending it. Not an error: the endpoint may be
    // subscribed to more than this build handles.
    return { kind: "ignored", detail: `unhandled event type ${event.type}` };
  }

  // Which subscription, and which account — from the event's identity only.
  let subscriptionId: string | null = null;
  let metadata: Stripe.Metadata | null | undefined;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription") {
      return { kind: "ignored", detail: `checkout session mode ${session.mode} is not a subscription` };
    }
    subscriptionId = subscriptionIdFromSession(session);
    metadata = session.metadata;
    // `client_reference_id` is the server-written account id as well. Used only if
    // metadata is somehow absent, and never in preference to it.
    if (!metadata?.[METADATA_ACCOUNT_ID] && typeof session.client_reference_id === "string") {
      metadata = { ...(metadata ?? {}), [METADATA_ACCOUNT_ID]: session.client_reference_id };
    }
  } else {
    const subscription = event.data.object as Stripe.Subscription;
    subscriptionId = typeof subscription.id === "string" ? subscription.id : null;
    metadata = subscription.metadata;
  }

  if (!subscriptionId) {
    return { kind: "ignored", detail: `${event.type} names no subscription` };
  }

  // The authoritative read. See the module comment.
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    // Could be transient. Ask Stripe to retry rather than silently dropping it.
    return { kind: "failed", detail: `could not retrieve subscription ${subscriptionId}: ${error instanceof Error ? error.name : "error"}` };
  }

  const snapshot = snapshotSubscription(subscription);
  if (!snapshot) {
    return { kind: "rejected", detail: `subscription ${subscriptionId} has no usable customer, price or status` };
  }
  if (!livemodeMatches(snapshot.livemode, mode)) {
    return { kind: "rejected", detail: `subscription ${subscriptionId} livemode does not match ${mode} mode` };
  }

  // The customer comes from the snapshot -- i.e. from the re-fetch -- not from the
  // event payload. The payload's copy could be stale for the same reason its status
  // could be.
  const accountId = await resolveAccountId(sql, metadata ?? subscription.metadata, snapshot.stripeCustomerId);
  if (!accountId) {
    // No account can be named for this subscription. Refused rather than retried:
    // retrying will not make an account appear, and guessing is how one reader's
    // payment entitles another.
    return { kind: "rejected", detail: `no Urdais account for subscription ${subscriptionId}` };
  }

  try {
    const outcome = await applySubscriptionEvent(sql, {
      accountId,
      snapshot,
      event: {
        id: event.id,
        type: event.type,
        livemode: event.livemode,
        createdAt: new Date(event.created * 1000).toISOString(),
      },
    });
    return { kind: "processed", detail: describe(outcome, subscriptionId) };
  } catch (error) {
    return { kind: "failed", detail: `could not store ${event.type}: ${error instanceof Error ? error.message : "error"}` };
  }
}
