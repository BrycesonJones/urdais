/**
 * The Account Hub's subscription mapping.
 *
 * The property that matters most is negative: the hub must never describe a
 * denied account as Active, and never describe an account it could not read, or
 * whose records disagree, as one that has never subscribed. Every Stripe status
 * the schema permits is exercised against both entitlement answers.
 */

import { describe, expect, it } from "vitest";

import { STRIPE_SUBSCRIPTION_STATUSES, statusEntitles } from "@/lib/billing/subscription-state";
import {
  actionFor,
  currentSubscription,
  presentSubscription,
  type AccountSubscriptionRow,
  type SubscriptionPresentationInput,
} from "@/lib/account/subscription-presentation";

const PRICE = "price_canonical";
const row = (status: string, overrides: Partial<AccountSubscriptionRow> = {}): AccountSubscriptionRow => ({
  status,
  stripePriceId: PRICE,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: "2026-10-08T00:00:00.000Z",
  ...overrides,
});
const input = (overrides: Partial<SubscriptionPresentationInput>): SubscriptionPresentationInput => ({
  subscriptions: [],
  entitlementGrants: false,
  entitlementSource: null,
  canonicalPriceId: PRICE,
  ...overrides,
});
// How the webhook leaves the entitlement for each status: granted exactly when
// the status entitles, sourced from Stripe.
const reconciled = (status: string) =>
  input({ subscriptions: [row(status)], entitlementGrants: statusEntitles(status), entitlementSource: "stripe" });

describe("the four named states", () => {
  it("never subscribed: no rows, no entitlement", () => {
    const p = presentSubscription(input({}));
    expect(p).toEqual({ kind: "none" });
    expect(actionFor(p)).toEqual({ kind: "subscribe", label: "Subscribe" });
  });

  it("active: an entitling subscription the entitlement agrees with, at the canonical price", () => {
    const p = presentSubscription(reconciled("active"));
    expect(p).toEqual({ kind: "active", priceLabel: "$80/week", cancellationScheduled: false, endsAt: null });
    expect(actionFor(p)).toEqual({ kind: "manage", label: "Manage subscription" });
  });

  it("canceled: history exists, so it is not 'never subscribed'", () => {
    const p = presentSubscription(reconciled("canceled"));
    expect(p).toEqual({ kind: "canceled" });
    expect(actionFor(p)).toEqual({ kind: "subscribe", label: "Subscribe again" });
  });

  it("past_due: a payment issue, not a cancellation, and denied", () => {
    const p = presentSubscription(reconciled("past_due"));
    expect(p).toEqual({ kind: "payment_issue", status: "past_due" });
    // Phase 7C: recovery through billing management, never a second Checkout.
    expect(actionFor(p)).toEqual({ kind: "manage", label: "Manage billing" });
  });
});

describe("every status Stripe and the schema allow", () => {
  const expected: Record<string, string> = {
    active: "active",
    trialing: "active",
    past_due: "payment_issue",
    unpaid: "payment_issue",
    incomplete: "payment_issue",
    paused: "paused",
    canceled: "canceled",
    incomplete_expired: "none",
  };

  it("covers the whole status list", () => {
    expect(Object.keys(expected).sort()).toEqual([...STRIPE_SUBSCRIPTION_STATUSES].sort());
  });

  for (const status of STRIPE_SUBSCRIPTION_STATUSES) {
    it(`${status} -> ${expected[status]}`, () => {
      expect(presentSubscription(reconciled(status)).kind).toBe(expected[status]);
    });
  }

  it("offers Subscribe beside no live subscription, ever", () => {
    // A second Checkout beside a live (if unpaid) subscription is a duplicate.
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
      const action = actionFor(presentSubscription(reconciled(status)));
      expect(action?.kind, status).not.toBe("subscribe");
    }
  });

  it("offers Manage subscription to an entitled subscription and Manage billing to a recoverable payment issue", () => {
    const expectedAction: Record<string, string | null> = {
      active: "Manage subscription",
      trialing: "Manage subscription",
      past_due: "Manage billing",
      unpaid: "Manage billing",
      // A first payment that never completed expires by itself; nothing to manage.
      incomplete: null,
      // Cannot arise today, and the Portal cannot resume it.
      paused: null,
      canceled: "Subscribe again",
      incomplete_expired: "Subscribe",
    };
    for (const status of STRIPE_SUBSCRIPTION_STATUSES) {
      const action = actionFor(presentSubscription(reconciled(status)));
      expect(action ? action.label : null, status).toBe(expectedAction[status]);
    }
  });

  it("never offers billing management to an account that has never subscribed or holds only an operator grant", () => {
    // No Stripe Customer exists for either; management must not be a way to make one.
    expect(actionFor(presentSubscription(input({})))?.kind).toBe("subscribe");
    expect(actionFor(presentSubscription(input({ entitlementGrants: true, entitlementSource: "manual" })))).toBeNull();
  });
});

describe("display never contradicts authorization", () => {
  it("never shows Active when the entitlement denies, whatever the subscription says", () => {
    for (const status of STRIPE_SUBSCRIPTION_STATUSES) {
      const p = presentSubscription(input({ subscriptions: [row(status)], entitlementGrants: false, entitlementSource: "stripe" }));
      expect(p.kind, status).not.toBe("active");
      expect(p.kind, status).not.toBe("complimentary");
    }
  });

  it("reports 'unavailable', not Active, when an active subscription has no granting entitlement", () => {
    // Webhook lag or drift. Authorization reads the entitlement and denies; the hub
    // must not tell the reader otherwise.
    expect(presentSubscription(input({ subscriptions: [row("active")], entitlementGrants: false }))).toEqual({
      kind: "unavailable",
      reason: "inconsistent",
    });
  });

  it("reports 'unavailable', not a denial, when Stripe's entitlement grants but billing says otherwise", () => {
    for (const status of ["canceled", "past_due", "paused"]) {
      expect(
        presentSubscription(input({ subscriptions: [row(status)], entitlementGrants: true, entitlementSource: "stripe" })).kind,
        status,
      ).toBe("unavailable");
    }
    expect(presentSubscription(input({ entitlementGrants: true, entitlementSource: "stripe" })).kind).toBe("unavailable");
  });

  it("explains an operator grant as included access, with nothing to buy or manage", () => {
    for (const subscriptions of [[], [row("canceled")]]) {
      const p = presentSubscription(input({ subscriptions, entitlementGrants: true, entitlementSource: "manual" }));
      expect(p).toEqual({ kind: "complimentary" });
      expect(actionFor(p)).toBeNull();
    }
  });

  it("treats a status this build does not know as unreadable, never as none or active", () => {
    for (const grants of [true, false]) {
      const p = presentSubscription(input({ subscriptions: [row("some_future_status")], entitlementGrants: grants }));
      expect(p).toEqual({ kind: "unavailable", reason: "inconsistent" });
      expect(actionFor(p)).toBeNull();
    }
  });
});

describe("details", () => {
  it("quotes $80/week only for the canonical Price", () => {
    // The Phase 6 validation subscription was on a $1 Price: quoting $80 for it
    // would have been a lie.
    const other = presentSubscription(input({ subscriptions: [row("active", { stripePriceId: "price_validation" })], entitlementGrants: true }));
    expect(other).toEqual({ kind: "active", priceLabel: null, cancellationScheduled: false, endsAt: null });
    const unconfigured = presentSubscription(input({ subscriptions: [row("active")], entitlementGrants: true, canonicalPriceId: null }));
    expect(unconfigured.kind === "active" && unconfigured.priceLabel).toBeNull();
  });

  it("keeps a scheduled cancellation Active until the period ends", () => {
    // The entitlement policy ignores cancel_at_period_end; so does the label.
    const p = presentSubscription(input({ subscriptions: [row("active", { cancelAtPeriodEnd: true })], entitlementGrants: true }));
    expect(p).toEqual({ kind: "active", priceLabel: "$80/week", cancellationScheduled: true, endsAt: "2026-10-08T00:00:00.000Z" });
    expect(actionFor(p)).toEqual({ kind: "manage", label: "Manage subscription" });
  });

  it("knows a cancellation is scheduled even when Stripe reported no period end", () => {
    const p = presentSubscription(
      input({ subscriptions: [row("active", { cancelAtPeriodEnd: true, currentPeriodEnd: null })], entitlementGrants: true }),
    );
    expect(p).toEqual({ kind: "active", priceLabel: "$80/week", cancellationScheduled: true, endsAt: null });
  });

  it("describes the live subscription when there is history too", () => {
    const rows = [row("canceled"), row("active"), row("incomplete_expired")];
    expect(currentSubscription(rows)?.status).toBe("active");
    expect(presentSubscription(input({ subscriptions: rows, entitlementGrants: true, entitlementSource: "stripe" })).kind).toBe("active");
  });

  it("prefers a payment problem over old history", () => {
    expect(currentSubscription([row("canceled"), row("past_due")])?.status).toBe("past_due");
  });

  it("shows several canceled subscriptions as canceled, not as none", () => {
    expect(presentSubscription(reconciled("canceled")).kind).toBe("canceled");
    expect(presentSubscription(input({ subscriptions: [row("canceled"), row("canceled")] })).kind).toBe("canceled");
  });
});
