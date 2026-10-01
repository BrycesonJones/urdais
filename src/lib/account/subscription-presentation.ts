/**
 * What the Account Hub says about a reader's subscription.
 *
 * Pure and total: canonical billing rows and the canonical entitlement go in, one
 * presentation state comes out. The page renders the state; it never inspects a
 * Stripe status itself, so the mapping lives here once rather than as conditionals
 * scattered through JSX.
 *
 * ## Display, not authorization
 *
 * Nothing here decides access. Premium authorization is `canAccess` over the
 * entitlement, as everywhere else in Urdais. This module takes the entitlement's
 * answer as an input and refuses to contradict it: a subscription row that says
 * `active` while the entitlement denies is **not** shown as Active, and a denied
 * status is never shown as Active either. Where the two disagree the hub says it
 * cannot confirm the status, rather than picking one and being wrong.
 *
 * ## Never subscribed vs canceled
 *
 * Decided by `identity.billing_subscriptions`, not by the entitlement. An account
 * with no subscription rows has never subscribed; one whose rows are all
 * `canceled` subscribed and stopped. The entitlement alone cannot tell these apart
 * reliably -- a revoked operator comp is also an inactive entitlement with no
 * subscription behind it.
 *
 * ## The mapping
 *
 * | Chosen subscription        | Entitlement grants | Presentation    |
 * | -------------------------- | ------------------ | --------------- |
 * | none (or only `incomplete_expired`) | no        | `none`          |
 * | none                       | yes, manual        | `complimentary` |
 * | `active` / `trialing`      | yes                | `active`        |
 * | `past_due` / `unpaid` / `incomplete` | no       | `payment_issue` |
 *
 * (See `actionFor` for what each state offers: Subscribe, Subscribe again, Manage
 * subscription, Manage billing, or nothing.)
 * | `paused`                   | no                 | `paused`        |
 * | `canceled`                 | no                 | `canceled`      |
 * | any non-entitling status   | yes, manual        | `complimentary` |
 * | anything else (disagreement) | either           | `unavailable`   |
 *
 * `incomplete_expired` is a Checkout whose first payment never completed: no
 * period was ever paid, so it is not subscription history worth reporting and the
 * reader is offered the ordinary Subscribe.
 */

import { formatPremiumPrice, PREMIUM_PRODUCT_NAME } from "@/lib/access/pricing";
import { isKnownSubscriptionStatus, statusEntitles, type StripeSubscriptionStatus } from "@/lib/billing/subscription-state";
import type { EntitlementSource } from "@/lib/access/entitlement";

/** One `identity.billing_subscriptions` row, as the hub needs it. */
export type AccountSubscriptionRow = {
  readonly status: string;
  readonly stripePriceId: string;
  readonly cancelAtPeriodEnd: boolean;
  /** ISO timestamp, or null. */
  readonly currentPeriodEnd: string | null;
};

export type SubscriptionPresentationInput = {
  /** Every subscription row for the account, newest first. */
  readonly subscriptions: readonly AccountSubscriptionRow[];
  /** `hasPremiumEntitlement` for this account -- the authorization answer. */
  readonly entitlementGrants: boolean;
  /** Where that entitlement came from, when there is one. */
  readonly entitlementSource: EntitlementSource | null;
  /** The configured canonical Price id, when billing is configured. */
  readonly canonicalPriceId: string | null;
};

export type SubscriptionPresentation =
  /** A valid account that has never held a subscription. Offer Subscribe. */
  | { readonly kind: "none" }
  /** Entitled by a subscription in good standing. */
  | {
      readonly kind: "active";
      /** "$80/week", only when the subscription is on the canonical Price. */
      readonly priceLabel: string | null;
      /**
       * The reader asked to cancel; Stripe keeps the subscription `active`, and the
       * entitlement with it, until the paid period ends. Never revokes anything.
       */
      readonly cancellationScheduled: boolean;
      /** When a scheduled cancellation takes effect (ISO), if Stripe reported it. */
      readonly endsAt: string | null;
    }
  /** Entitled by an operator grant, not by billing. Nothing to buy or manage. */
  | { readonly kind: "complimentary" }
  /** The subscription ended. The account did not. Offer Subscribe again. */
  | { readonly kind: "canceled" }
  /** A live subscription whose payment failed. Denied immediately; no grace period. */
  | { readonly kind: "payment_issue"; readonly status: "past_due" | "unpaid" | "incomplete" }
  /** Paused: not collecting, so not entitled. */
  | { readonly kind: "paused" }
  /** Could not be read, or the canonical records disagree. Claims nothing. */
  | { readonly kind: "unavailable"; readonly reason: "read_failed" | "inconsistent" };

export type AccountAction =
  /** To Plan / Pay, the canonical purchase path. */
  | { readonly kind: "subscribe"; readonly label: "Subscribe" | "Subscribe again" }
  /**
   * Stripe's hosted Customer Portal, for the account's existing Customer. Never
   * creates a Customer or a subscription.
   */
  | { readonly kind: "manage"; readonly label: "Manage subscription" | "Manage billing" };

/** Lower sorts first: the subscription that best describes the account now. */
function priority(status: StripeSubscriptionStatus): number {
  if (statusEntitles(status)) return 0;
  switch (status) {
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return 1;
    case "canceled":
      return 2;
    default:
      return 3;
  }
}

/**
 * The subscription that describes the account, or null for none.
 *
 * An account can hold several over time (canceled, then subscribed again). A live
 * one always outranks history; within a rank the newest wins, because the rows
 * arrive newest first and the sort is stable.
 */
export function currentSubscription(rows: readonly AccountSubscriptionRow[]): AccountSubscriptionRow | null {
  const known = rows.filter((row) => isKnownSubscriptionStatus(row.status) && row.status !== "incomplete_expired");
  const sorted = [...known].sort(
    (a, b) => priority(a.status as StripeSubscriptionStatus) - priority(b.status as StripeSubscriptionStatus),
  );
  return sorted[0] ?? null;
}

export function presentSubscription(input: SubscriptionPresentationInput): SubscriptionPresentation {
  // A status this build does not recognise cannot be described honestly.
  if (input.subscriptions.some((row) => !isKnownSubscriptionStatus(row.status))) {
    return { kind: "unavailable", reason: "inconsistent" };
  }

  const current = currentSubscription(input.subscriptions);
  const comp = input.entitlementGrants && input.entitlementSource === "manual";

  if (!current) {
    if (!input.entitlementGrants) return { kind: "none" };
    // Access with no billing behind it is an operator grant -- or, if the
    // entitlement claims Stripe, rows the hub cannot see. Never guess.
    return comp ? { kind: "complimentary" } : { kind: "unavailable", reason: "inconsistent" };
  }

  const status = current.status as StripeSubscriptionStatus;

  if (statusEntitles(status)) {
    // The subscription says paid; only show it if the authority agrees.
    if (!input.entitlementGrants) return { kind: "unavailable", reason: "inconsistent" };
    return {
      kind: "active",
      priceLabel: input.canonicalPriceId !== null && current.stripePriceId === input.canonicalPriceId ? formatPremiumPrice() : null,
      cancellationScheduled: current.cancelAtPeriodEnd,
      endsAt: current.cancelAtPeriodEnd ? current.currentPeriodEnd : null,
    };
  }

  // A non-entitling subscription. An operator grant still explains access.
  if (input.entitlementGrants) return comp ? { kind: "complimentary" } : { kind: "unavailable", reason: "inconsistent" };

  switch (status) {
    case "past_due":
    case "unpaid":
    case "incomplete":
      return { kind: "payment_issue", status };
    case "paused":
      return { kind: "paused" };
    case "canceled":
      return { kind: "canceled" };
    default:
      return { kind: "unavailable", reason: "inconsistent" };
  }
}

/** The one action each state offers. Most offer none. */
export function actionFor(presentation: SubscriptionPresentation): AccountAction | null {
  switch (presentation.kind) {
    case "none":
      return { kind: "subscribe", label: "Subscribe" };
    case "canceled":
      return { kind: "subscribe", label: "Subscribe again" };
    case "active":
      return { kind: "manage", label: "Manage subscription" };
    case "payment_issue":
      // Payment-issue accounts recover through billing management, not by creating
      // a second subscription. `past_due` and `unpaid` still have a live
      // subscription with an open invoice: fixing the payment method in the Portal
      // lets Stripe collect it, the webhook moves the status back to `active`, and
      // the entitlement is re-granted. `incomplete` is a first payment that never
      // completed and expires on its own within a day; the Portal has nothing to
      // recover there, so it is offered nothing.
      return presentation.status === "incomplete" ? null : { kind: "manage", label: "Manage billing" };
    // `paused` cannot arise in Urdais today (no trials, no pausing configured), and
    // the Portal cannot resume a paused subscription, so there is nothing honest to
    // offer. A Subscribe beside it would be a duplicate subscription.
    default:
      return null;
  }
}

/** The plan name shown wherever a plan exists. */
export const ACCOUNT_PLAN_NAME = PREMIUM_PRODUCT_NAME;
