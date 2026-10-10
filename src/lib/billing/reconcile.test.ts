/**
 * Reconciliation: the narrow, Stripe-authoritative path the post-checkout page uses.
 *
 * The risk it carries is that a browser supplies the session id, so these tests are
 * mostly about what it refuses. A session id lifted from somebody else's URL must
 * not reconcile their subscription onto this account, and the same reconciliation
 * run twice must not look like two business events.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const readCustomerId = vi.hoisted(() => vi.fn());
const applySubscriptionEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/billing/store", () => ({ readCustomerId, applySubscriptionEvent }));

import { reconcileAccount, reconciliationEventId } from "@/lib/billing/reconcile";

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    customer: "cus_mine",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: 1_800_000_000,
    canceled_at: null,
    ended_at: null,
    livemode: false,
    metadata: {},
    items: { data: [{ price: { id: "price_1" } }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function stripeWith(opts: { session?: unknown; sessionThrows?: boolean; list?: unknown[]; retrieve?: unknown } = {}) {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => {
          if (opts.sessionThrows) throw new Error("No such checkout session");
          return opts.session;
        }),
      },
    },
    subscriptions: {
      retrieve: vi.fn(async () => opts.retrieve ?? subscription()),
      list: vi.fn(async () => ({ data: opts.list ?? [] })),
    },
  } as unknown as Stripe;
}

const sql = { query: vi.fn().mockResolvedValue({ rows: [] }) };

beforeEach(() => {
  readCustomerId.mockReset().mockResolvedValue("cus_mine");
  applySubscriptionEvent.mockReset().mockResolvedValue({ kind: "applied", entitlement: "granted" });
});

describe("a forged or borrowed session id cannot grant access", () => {
  it("REFUSES a session belonging to another customer", async () => {
    // The attack: copy a session id out of somebody else's success URL and open it
    // as yourself. The session resolves at Stripe, and to the wrong Customer.
    const stripe = stripeWith({ session: { customer: "cus_someone_else", subscription: "sub_theirs" } });

    const outcome = await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: "cs_theirs", mode: "test" });

    expect(outcome).toMatchObject({ kind: "refused" });
    expect(applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("grants nothing for an account with no Stripe customer at all", async () => {
    readCustomerId.mockResolvedValue(null);
    const stripe = stripeWith({ session: { customer: "cus_x", subscription: "sub_x" } });

    expect(await reconcileAccount(stripe, sql, { accountId: "acct_new", sessionId: "cs_x", mode: "test" })).toEqual({ kind: "nothing_found" });
    expect(applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("treats a nonexistent session as no evidence, not as an error", async () => {
    // An invented id must neither grant nor 500 the page a reader lands on.
    const stripe = stripeWith({ sessionThrows: true, list: [] });
    expect(await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: "cs_invented", mode: "test" })).toEqual({ kind: "nothing_found" });
    expect(applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("refuses a subscription that belongs to another customer even via the list path", async () => {
    const stripe = stripeWith({ list: [subscription({ customer: "cus_someone_else" })] });
    const outcome = await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: null, mode: "test" });
    expect(outcome).toMatchObject({ kind: "refused" });
    expect(applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("refuses a subscription from the other Stripe environment", async () => {
    const stripe = stripeWith({ list: [subscription({ livemode: true })] });
    const outcome = await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: null, mode: "test" });
    expect(outcome).toMatchObject({ kind: "refused" });
    expect(applySubscriptionEvent).not.toHaveBeenCalled();
  });
});

describe("when it does reconcile", () => {
  it("writes through the same idempotency path a webhook uses", async () => {
    const stripe = stripeWith({ session: { customer: "cus_mine", subscription: "sub_1" } });

    const outcome = await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: "cs_mine", mode: "test" });

    expect(outcome).toEqual({ kind: "entitled", subscriptionId: "sub_1", livemode: false, activated: false, analyticsConsent: "none" });
    expect(applySubscriptionEvent).toHaveBeenCalledOnce();
    // Same function, same ledger. A reconciliation and a webhook racing cannot both grant.
    expect(applySubscriptionEvent.mock.calls[0]?.[1]?.accountId).toBe("acct_mine");
  });

  it("reports whether this reconciliation was the one that activated access", async () => {
    // Only then does the post-checkout page record `subscription_completed`. When the
    // webhook activated first, the store reports no activation and neither does this.
    applySubscriptionEvent.mockResolvedValue({ kind: "applied", entitlement: "granted", activated: true });
    const stripe = stripeWith({ session: { customer: "cus_mine", subscription: "sub_1" } });
    const outcome = await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: "cs_mine", mode: "test" });
    expect(outcome).toMatchObject({ kind: "entitled", activated: true });

    applySubscriptionEvent.mockResolvedValue({ kind: "duplicate" });
    expect(await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: "cs_mine", mode: "test" })).toMatchObject({
      kind: "entitled",
      activated: false,
    });
  });

  it("reports not_entitled without granting when Stripe says the subscription is not good", async () => {
    const stripe = stripeWith({ list: [subscription({ status: "past_due" })] });
    const outcome = await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: null, mode: "test" });
    expect(outcome).toMatchObject({ kind: "not_entitled", status: "past_due" });
    // Still recorded, because the stored subscription state should follow Stripe.
    expect(applySubscriptionEvent).toHaveBeenCalledOnce();
  });

  it("uses the account's own Customer, never one from the request", async () => {
    const stripe = stripeWith({ session: { customer: "cus_mine", subscription: "sub_1" } });
    await reconcileAccount(stripe, sql, { accountId: "acct_mine", sessionId: "cs_mine", mode: "test" });
    expect(readCustomerId).toHaveBeenCalledWith(sql, "acct_mine");
  });
});

describe("repeated reconciliation is not repeated business events", () => {
  it("derives the same ledger id for unchanged state", () => {
    const snapshot = { stripeSubscriptionId: "sub_1", status: "active", currentPeriodEnd: "2026-10-06T00:00:00.000Z" } as never;
    expect(reconciliationEventId(snapshot)).toBe(reconciliationEventId(snapshot));
    expect(reconciliationEventId(snapshot)).toMatch(/^reconcile:sub_1:active:/);
  });

  it("derives a different id once the subscription has changed", () => {
    // Otherwise a real change reconciled after an earlier one would be swallowed as
    // a duplicate.
    const active = { stripeSubscriptionId: "sub_1", status: "active", currentPeriodEnd: "2026-10-06T00:00:00.000Z" } as never;
    const cancelled = { stripeSubscriptionId: "sub_1", status: "canceled", currentPeriodEnd: "2026-10-06T00:00:00.000Z" } as never;
    expect(reconciliationEventId(active)).not.toBe(reconciliationEventId(cancelled));
  });

  it("is distinguishable in the ledger from a delivered Stripe event", () => {
    const snapshot = { stripeSubscriptionId: "sub_1", status: "active", currentPeriodEnd: null } as never;
    expect(reconciliationEventId(snapshot).startsWith("reconcile:")).toBe(true);
  });
});
