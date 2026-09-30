/**
 * The billing -> entitlement policy.
 *
 * This is the module that decides who gets in, so the tests are written as claims
 * about money rather than about strings: a status that should not grant access must
 * not grant it even when it is new, misspelled, or absent.
 */

import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  STRIPE_SUBSCRIPTION_STATUSES,
  describeStatusDecision,
  isKnownSubscriptionStatus,
  snapshotEntitles,
  snapshotSubscription,
  statusEntitles,
} from "@/lib/billing/subscription-state";

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: 1_800_000_000,
    canceled_at: null,
    ended_at: null,
    livemode: false,
    metadata: {},
    items: { object: "list", data: [{ id: "si_1", price: { id: "price_123" } }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("which statuses entitle", () => {
  it("grants for active and trialing, and nothing else", () => {
    expect(statusEntitles("active")).toBe(true);
    // Urdais sells no trial. If one is ever configured, locking out a customer
    // Stripe considers in good standing would be the wrong failure.
    expect(statusEntitles("trialing")).toBe(true);

    for (const status of ["incomplete", "incomplete_expired", "past_due", "canceled", "unpaid", "paused"]) {
      expect(statusEntitles(status), status).toBe(false);
    }
  });

  it("denies past_due, which is the deliberate and contestable line", () => {
    // Weekly billing: past_due means the invoice for the current week went unpaid
    // after Stripe exhausted its retry schedule. A grace period would be a large
    // fraction of the thing being sold.
    expect(statusEntitles("past_due")).toBe(false);
  });

  it("fails closed on anything it has never heard of", () => {
    // The important property. A Stripe status added after this build shipped must
    // not grant access by falling through a default.
    for (const value of ["", "ACTIVE", "Active", "active ", "gruntled", "paid", null, undefined, 1, {}, []]) {
      expect(statusEntitles(value as unknown), JSON.stringify(value)).toBe(false);
    }
  });

  it("covers every status the schema permits, so storable never means undecidable", () => {
    // The migration's CHECK and this module must agree on the vocabulary, or a row
    // can be stored that no policy branch recognises.
    for (const status of STRIPE_SUBSCRIPTION_STATUSES) {
      expect(isKnownSubscriptionStatus(status), status).toBe(true);
      expect(typeof statusEntitles(status), status).toBe("boolean");
    }
    expect(STRIPE_SUBSCRIPTION_STATUSES).toHaveLength(8);
  });

  it("describes its decision for an operator without inventing certainty", () => {
    expect(describeStatusDecision("active")).toMatch(/entitled/);
    expect(describeStatusDecision("past_due")).toMatch(/not entitled/);
    expect(describeStatusDecision("wat")).toMatch(/unknown status .* failing closed/);
  });
});

describe("snapshotting a Stripe subscription", () => {
  it("keeps only what Urdais stores", () => {
    const snapshot = snapshotSubscription(subscription());
    expect(snapshot).toEqual({
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
      stripePriceId: "price_123",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
      canceledAt: null,
      endedAt: null,
      livemode: false,
    });
  });

  it("reads the customer whether Stripe expanded it or not", () => {
    expect(snapshotSubscription(subscription({ customer: { id: "cus_expanded" } }))?.stripeCustomerId).toBe("cus_expanded");
  });

  it("finds the period end wherever the API version puts it", () => {
    // Newer Stripe API versions moved current_period_end onto the subscription item.
    // Reading only the old place would turn a real paid-through date into null, and a
    // cancelled subscription would look as though it had none.
    const moved = subscription({
      current_period_end: undefined,
      items: { object: "list", data: [{ id: "si_1", price: { id: "price_123" }, current_period_end: 1_700_000_000 }] },
    });
    expect(snapshotSubscription(moved)?.currentPeriodEnd).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it("refuses a subscription it cannot reconcile later", () => {
    // Each of these would store a row that no later event or reconciliation could
    // match up, and storing it is worse than refusing because the webhook would then
    // report success.
    expect(snapshotSubscription(subscription({ customer: null }))).toBeNull();
    expect(snapshotSubscription(subscription({ items: { object: "list", data: [] } }))).toBeNull();
    expect(snapshotSubscription(subscription({ status: "gruntled" }))).toBeNull();
    expect(snapshotSubscription(subscription({ id: "" }))).toBeNull();
  });

  it("carries livemode through verbatim", () => {
    expect(snapshotSubscription(subscription({ livemode: true }))?.livemode).toBe(true);
  });

  it("entitles from the snapshot exactly as it does from the status", () => {
    expect(snapshotEntitles(snapshotSubscription(subscription())!)).toBe(true);
    expect(snapshotEntitles(snapshotSubscription(subscription({ status: "past_due" }))!)).toBe(false);
  });

  it("still entitles when the reader has asked to cancel but the period is paid for", () => {
    // The refund-conversation case. Stripe keeps the status `active` through a period
    // already paid for; revoking on the flag would take away something bought.
    const asked = subscription({ cancel_at_period_end: true, canceled_at: 1_700_000_000 });
    const snapshot = snapshotSubscription(asked)!;
    expect(snapshot.cancelAtPeriodEnd).toBe(true);
    expect(snapshotEntitles(snapshot)).toBe(true);
  });

  it("stops entitling once Stripe says the subscription actually ended", () => {
    const ended = subscription({ status: "canceled", cancel_at_period_end: true, ended_at: 1_700_000_100 });
    expect(snapshotEntitles(snapshotSubscription(ended)!)).toBe(false);
  });
});
