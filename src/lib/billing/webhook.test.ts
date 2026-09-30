/**
 * Webhook processing: what an event is allowed to do, and what it must not.
 *
 * The signature is verified by the route, not here, so these tests start from an
 * already-verified event and check the authority questions: which account, which
 * subscription state, and whether the answer came from the payload or from Stripe.
 */

import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import { HANDLED_EVENT_TYPES, isHandledEventType, processStripeEvent } from "@/lib/billing/webhook";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

function sqlWith(overrides: { accountForCustomer?: string | null; claim?: "won" | "lost"; upsert?: "applied" | "stale" } = {}) {
  const statements: string[] = [];
  // Account ids arrive as bound parameters, never interpolated into the SQL, so
  // assertions about *which* account was written have to look here.
  const params: unknown[][] = [];
  const sql: TokenSqlExecutor & { statements: string[]; params: unknown[][] } = {
    statements,
    params,
    async query(text: string, values: readonly unknown[] = []) {
      statements.push(text.trim());
      params.push([...values]);
      if (text.includes("select account_id")) {
        const id = overrides.accountForCustomer;
        return { rows: id ? [{ account_id: id }] : [] };
      }
      if (text.includes("insert into identity.billing_events")) {
        return { rows: overrides.claim === "lost" ? [] : [{ stripe_event_id: "evt" }] };
      }
      if (text.includes("insert into identity.billing_subscriptions")) {
        return { rows: overrides.upsert === "stale" ? [] : [{ stripe_subscription_id: "sub_1" }] };
      }
      return { rows: [] };
    },
  };
  return sql;
}

function stripeWith(subscription: Partial<Stripe.Subscription> | Error) {
  const retrieve = vi.fn(async () => {
    if (subscription instanceof Error) throw subscription;
    return {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: 1_800_000_000,
      canceled_at: null,
      ended_at: null,
      livemode: false,
      metadata: {},
      items: { data: [{ price: { id: "price_1" } }] },
      ...subscription,
    } as unknown as Stripe.Subscription;
  });
  return { retrieve, stripe: { subscriptions: { retrieve } } as unknown as Stripe };
}

function event(type: string, object: Record<string, unknown>, overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: "evt_1",
    type,
    livemode: false,
    created: 1_790_000_000,
    data: { object },
    ...overrides,
  } as unknown as Stripe.Event;
}

const SUBSCRIPTION_OBJECT = { id: "sub_1", customer: "cus_1", metadata: { urdais_account_id: "acct_1" } };

describe("the handled event set", () => {
  it("is exactly four events, and invoice events are not among them", () => {
    // Invoice events cannot change entitlement without Stripe also moving the
    // subscription's status, and Stripe keeps a subscription active through its
    // retry schedule on purpose. Handling them would revoke access during a window
    // Stripe still considers good standing.
    expect([...HANDLED_EVENT_TYPES]).toEqual([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ]);
    expect(isHandledEventType("invoice.payment_failed")).toBe(false);
    expect(isHandledEventType("invoice.payment_succeeded")).toBe(false);
  });

  it("acknowledges an unhandled event instead of failing it", async () => {
    // A 500 here would make Stripe retry an event this build will never handle, for days.
    const { stripe } = stripeWith({});
    const outcome = await processStripeEvent(stripe, sqlWith(), event("invoice.paid", {}), "test");
    expect(outcome.kind).toBe("ignored");
  });
});

describe("where the subscription state comes from", () => {
  it("re-reads the subscription from Stripe rather than trusting the payload", async () => {
    // The payload is identity only. Stripe does not guarantee delivery order, so a
    // payload can describe a subscription two states ago.
    const { stripe, retrieve } = stripeWith({ status: "past_due" });
    const sql = sqlWith();

    // The payload claims active; Stripe says past_due. The stored decision must
    // follow Stripe.
    const outcome = await processStripeEvent(
      stripe,
      sql,
      event("customer.subscription.updated", { ...SUBSCRIPTION_OBJECT, status: "active" }),
      "test",
    );

    expect(retrieve).toHaveBeenCalledWith("sub_1");
    expect(outcome).toMatchObject({ kind: "processed" });
    expect(sql.statements.join(" ")).toContain("'inactive'");
  });

  it("asks Stripe to retry when the re-read fails", async () => {
    const { stripe } = stripeWith(new Error("network"));
    const outcome = await processStripeEvent(stripe, sqlWith(), event("customer.subscription.updated", SUBSCRIPTION_OBJECT), "test");
    expect(outcome.kind).toBe("failed");
  });
});

describe("which account an event belongs to", () => {
  it("prefers the metadata the server itself wrote", async () => {
    const { stripe } = stripeWith({});
    const sql = sqlWith({ accountForCustomer: "acct_from_mapping" });

    await processStripeEvent(stripe, sql, event("customer.subscription.updated", SUBSCRIPTION_OBJECT), "test");

    // Metadata named acct_1, so the customer mapping must not have been consulted.
    expect(sql.statements.some((s) => s.includes("select account_id"))).toBe(false);
    expect(sql.params.flat()).toContain("acct_1");
  });

  it("falls back to the customer mapping for a subscription created outside this flow", async () => {
    // An operator creating a subscription in the Stripe dashboard leaves no Urdais
    // metadata, but the Customer is still one Urdais knows.
    const { stripe } = stripeWith({});
    const sql = sqlWith({ accountForCustomer: "acct_mapped" });

    const outcome = await processStripeEvent(stripe, sql, event("customer.subscription.updated", { id: "sub_1", customer: "cus_1" }), "test");

    expect(outcome.kind).toBe("processed");
    expect(sql.statements.some((s) => s.includes("select account_id"))).toBe(true);
  });

  it("refuses rather than guessing when no account can be named", async () => {
    // Guessing is how one reader's payment entitles another. Rejected rather than
    // retried, because retrying will not make an account appear.
    const { stripe } = stripeWith({});
    const outcome = await processStripeEvent(
      stripe,
      sqlWith({ accountForCustomer: null }),
      event("customer.subscription.updated", { id: "sub_1", customer: "cus_unknown" }),
      "test",
    );
    expect(outcome).toMatchObject({ kind: "rejected" });
  });

  it("never takes the account from anything a browser could set", async () => {
    // client_reference_id and metadata are written by the server. There is no other
    // source, and in particular no query parameter or body field.
    const { stripe } = stripeWith({});
    const sql = sqlWith({ accountForCustomer: null });
    const outcome = await processStripeEvent(
      stripe,
      sql,
      event("checkout.session.completed", { mode: "subscription", subscription: "sub_1", customer: "cus_1", metadata: {} }),
      "test",
    );
    // No metadata, no mapping: refused, not defaulted to some account.
    expect(outcome.kind).toBe("rejected");
  });
});

describe("test and live cannot cross", () => {
  it("rejects a live event on a test deployment", async () => {
    const { stripe } = stripeWith({});
    const outcome = await processStripeEvent(
      stripe,
      sqlWith(),
      event("customer.subscription.updated", SUBSCRIPTION_OBJECT, { livemode: true }),
      "test",
    );
    expect(outcome).toMatchObject({ kind: "rejected" });
  });

  it("rejects a live subscription even when the event claims test", async () => {
    // Both are checked. The event's flag and the object's flag can disagree if
    // something is badly misconfigured, and either being wrong is disqualifying.
    const { stripe } = stripeWith({ livemode: true });
    const outcome = await processStripeEvent(stripe, sqlWith(), event("customer.subscription.updated", SUBSCRIPTION_OBJECT), "test");
    expect(outcome).toMatchObject({ kind: "rejected" });
  });
});

describe("checkout.session.completed", () => {
  it("binds the subscription named by the session", async () => {
    const { stripe, retrieve } = stripeWith({});
    const outcome = await processStripeEvent(
      stripe,
      sqlWith(),
      event("checkout.session.completed", {
        mode: "subscription",
        subscription: "sub_1",
        customer: "cus_1",
        metadata: { urdais_account_id: "acct_1" },
      }),
      "test",
    );
    expect(retrieve).toHaveBeenCalledWith("sub_1");
    expect(outcome).toMatchObject({ kind: "processed" });
  });

  it("accepts client_reference_id when metadata is absent", async () => {
    const { stripe } = stripeWith({});
    const sql = sqlWith();
    const outcome = await processStripeEvent(
      stripe,
      sql,
      event("checkout.session.completed", {
        mode: "subscription",
        subscription: "sub_1",
        customer: "cus_1",
        client_reference_id: "acct_ref",
      }),
      "test",
    );
    expect(outcome).toMatchObject({ kind: "processed" });
    expect(sql.params.flat()).toContain("acct_ref");
  });

  it("ignores a one-off payment session", async () => {
    const { stripe } = stripeWith({});
    const outcome = await processStripeEvent(stripe, sqlWith(), event("checkout.session.completed", { mode: "payment" }), "test");
    expect(outcome.kind).toBe("ignored");
  });

  it("ignores a session with no subscription", async () => {
    const { stripe } = stripeWith({});
    const outcome = await processStripeEvent(
      stripe,
      sqlWith(),
      event("checkout.session.completed", { mode: "subscription", subscription: null, customer: "cus_1" }),
      "test",
    );
    expect(outcome.kind).toBe("ignored");
  });
});

describe("the lifecycle", () => {
  it("revokes on deletion", async () => {
    const { stripe } = stripeWith({ status: "canceled", ended_at: 1_790_000_100 });
    const sql = sqlWith();
    const outcome = await processStripeEvent(stripe, sql, event("customer.subscription.deleted", SUBSCRIPTION_OBJECT), "test");
    expect(outcome).toMatchObject({ kind: "processed", detail: expect.stringContaining("revoked") });
  });

  it("keeps access when the reader has asked to cancel but the period is paid", async () => {
    const { stripe } = stripeWith({ status: "active", cancel_at_period_end: true, canceled_at: 1_790_000_000 });
    const sql = sqlWith();
    const outcome = await processStripeEvent(stripe, sql, event("customer.subscription.updated", SUBSCRIPTION_OBJECT), "test");
    expect(outcome).toMatchObject({ kind: "processed", detail: expect.stringContaining("granted") });
  });

  it("reports a duplicate as processed so Stripe stops retrying", async () => {
    const { stripe } = stripeWith({});
    const outcome = await processStripeEvent(stripe, sqlWith({ claim: "lost" }), event("customer.subscription.updated", SUBSCRIPTION_OBJECT), "test");
    expect(outcome).toMatchObject({ kind: "processed", detail: expect.stringContaining("already processed") });
  });

  it("reports a stale event as processed and changes nothing", async () => {
    const { stripe } = stripeWith({});
    const sql = sqlWith({ upsert: "stale" });
    const outcome = await processStripeEvent(stripe, sql, event("customer.subscription.updated", SUBSCRIPTION_OBJECT), "test");
    expect(outcome).toMatchObject({ kind: "processed", detail: expect.stringContaining("older than stored state") });
    expect(sql.statements.some((s) => s.includes("premium_entitlements"))).toBe(false);
  });

  it("rejects a subscription with no usable price", async () => {
    const { stripe } = stripeWith({ items: { data: [] } as unknown as Stripe.ApiList<Stripe.SubscriptionItem> });
    const outcome = await processStripeEvent(stripe, sqlWith(), event("customer.subscription.updated", SUBSCRIPTION_OBJECT), "test");
    expect(outcome).toMatchObject({ kind: "rejected" });
  });
});
