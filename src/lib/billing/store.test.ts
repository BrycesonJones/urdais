/**
 * Durable billing state: idempotency, ordering, and the transaction that keeps the
 * subscription and the entitlement agreeing.
 *
 * The fake executor records every statement and lets a test say "this insert hit a
 * conflict", which is how duplicate delivery and out-of-order delivery are
 * reproduced without a database. The SQL itself is exercised against a real
 * Postgres by `supabase/tests/700_stripe_billing.sql`; what is checked here is the
 * control flow built on top of it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLAIM_EVENT_SQL,
  GRANT_ENTITLEMENT_SQL,
  REVOKE_ENTITLEMENT_SQL,
  UPSERT_SUBSCRIPTION_SQL,
  applySubscriptionEvent,
  claimCustomerId,
  claimEvent,
  upsertSubscription,
  writeEntitlementFor,
} from "@/lib/billing/store";
import type { BillingSubscriptionSnapshot } from "@/lib/billing/subscription-state";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

type Reply = { rows: Record<string, unknown>[] };

/** Records statements, and answers each from a queue keyed by a fragment of its SQL. */
function fakeSql(plan: { match: string; reply: Reply | (() => never) }[] = []): TokenSqlExecutor & { statements: string[] } {
  const statements: string[] = [];
  const remaining = [...plan];
  return {
    statements,
    async query(text: string) {
      // The whole statement, not its first line: assertions here check clauses that
      // sit several lines into the SQL.
      statements.push(text.trim());
      const index = remaining.findIndex((entry) => text.includes(entry.match));
      if (index >= 0) {
        const [entry] = remaining.splice(index, 1);
        if (typeof entry!.reply === "function") entry!.reply();
        return entry!.reply as Reply;
      }
      return { rows: [] };
    },
  };
}

const SNAPSHOT: BillingSubscriptionSnapshot = Object.freeze({
  stripeSubscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  status: "active",
  stripePriceId: "price_1",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: "2026-10-06T00:00:00.000Z",
  canceledAt: null,
  endedAt: null,
  livemode: false,
});

const EVENT = Object.freeze({ id: "evt_1", type: "customer.subscription.updated", livemode: false, createdAt: "2026-09-29T00:00:00.000Z" });

beforeEach(() => vi.restoreAllMocks());

describe("claiming an event is the idempotency mechanism", () => {
  it("reports `claimed` when the insert wins", async () => {
    const sql = fakeSql([{ match: "insert into identity.billing_events", reply: { rows: [{ stripe_event_id: "evt_1" }] } }]);
    expect(await claimEvent(sql, { id: "evt_1", type: "x", livemode: false, createdAt: "now", subscriptionId: "sub_1" })).toBe("claimed");
  });

  it("reports `duplicate` when it loses, without a prior read", async () => {
    // The insert IS the check. A read-then-write races Stripe's concurrent retries:
    // two deliveries can both read "not seen" before either writes.
    const sql = fakeSql([{ match: "insert into identity.billing_events", reply: { rows: [] } }]);
    expect(await claimEvent(sql, { id: "evt_1", type: "x", livemode: false, createdAt: "now", subscriptionId: null })).toBe("duplicate");
    expect(sql.statements.filter((s) => s.startsWith("select"))).toHaveLength(0);
  });

  it("uses on-conflict-do-nothing rather than a select", () => {
    expect(CLAIM_EVENT_SQL).toContain("on conflict (stripe_event_id) do nothing");
    expect(CLAIM_EVENT_SQL).toContain("returning stripe_event_id");
  });
});

describe("out-of-order delivery", () => {
  it("guards the upsert with the event timestamp, in SQL", () => {
    // In the statement, not in application code: two concurrent handlers must not
    // both be able to pass the comparison.
    expect(UPSERT_SUBSCRIPTION_SQL).toContain("last_event_at is null");
    expect(UPSERT_SUBSCRIPTION_SQL).toContain("excluded.last_event_at >= identity.billing_subscriptions.last_event_at");
  });

  it("reports `stale` when a newer event already described the subscription", async () => {
    const sql = fakeSql([{ match: "insert into identity.billing_subscriptions", reply: { rows: [] } }]);
    expect(await upsertSubscription(sql, "acct_1", SNAPSHOT, "2026-09-01T00:00:00.000Z")).toBe("stale");
  });

  it("does not touch the entitlement when the event is stale", async () => {
    // The whole point: a late `updated` must not resurrect access after a `deleted`.
    const sql = fakeSql([
      { match: "insert into identity.billing_events", reply: { rows: [{ stripe_event_id: "evt_old" }] } },
      { match: "insert into identity.billing_subscriptions", reply: { rows: [] } },
    ]);

    const outcome = await applySubscriptionEvent(sql, { accountId: "acct_1", snapshot: SNAPSHOT, event: EVENT });

    expect(outcome).toEqual({ kind: "stale" });
    expect(sql.statements.some((s) => s.includes("premium_entitlements"))).toBe(false);
    // Still committed: the event was genuinely processed, and leaving it unclaimed
    // would make Stripe retry it forever.
    expect(sql.statements).toContain("commit");
  });
});

describe("the entitlement write", () => {
  it("grants for an entitling status and revokes otherwise", async () => {
    const granting = fakeSql();
    expect(await writeEntitlementFor(granting, "acct_1", SNAPSHOT)).toBe("granted");
    expect(granting.statements.join(" ")).toContain("'active'");

    const revoking = fakeSql();
    expect(await writeEntitlementFor(revoking, "acct_1", { ...SNAPSHOT, status: "past_due" })).toBe("revoked");
    expect(revoking.statements.join(" ")).toContain("'inactive'");
  });

  it("names the subscription, because the schema refuses a stripe grant without one", () => {
    expect(GRANT_ENTITLEMENT_SQL).toContain("'stripe'");
    expect(GRANT_ENTITLEMENT_SQL).toContain("external_reference");
  });

  it("preserves the original grant date across a lapse and resume", () => {
    // Otherwise the most recent webhook is reported as the start of the customer
    // relationship.
    expect(GRANT_ENTITLEMENT_SQL).toContain("coalesce(identity.premium_entitlements.granted_at");
  });

  it("clears revoked_at when granting, which the schema requires of an active row", () => {
    expect(GRANT_ENTITLEMENT_SQL).toMatch(/revoked_at\s*=\s*null/);
  });

  it("keeps revoked_at at or after granted_at when revoking", () => {
    // A constraint violation here would make the webhook fail and Stripe retry forever.
    expect(REVOKE_ENTITLEMENT_SQL).toContain("greatest(now()");
  });
});

describe("the transaction", () => {
  it("wraps the claim, the subscription and the entitlement together", async () => {
    const sql = fakeSql([
      { match: "insert into identity.billing_events", reply: { rows: [{ stripe_event_id: "evt_1" }] } },
      { match: "insert into identity.billing_subscriptions", reply: { rows: [{ stripe_subscription_id: "sub_1" }] } },
    ]);

    const outcome = await applySubscriptionEvent(sql, { accountId: "acct_1", snapshot: SNAPSHOT, event: EVENT });

    expect(outcome).toEqual({ kind: "applied", entitlement: "granted" });
    expect(sql.statements[0]).toBe("begin");
    expect(sql.statements.at(-1)).toBe("commit");
    expect(sql.statements.some((s) => s.includes("billing_events"))).toBe(true);
    expect(sql.statements.some((s) => s.includes("billing_subscriptions"))).toBe(true);
    expect(sql.statements.some((s) => s.includes("premium_entitlements"))).toBe(true);
  });

  it("rolls back the event claim when the entitlement write fails", async () => {
    // The failure this design exists for. If the claim survived a failed
    // entitlement write, Stripe's retry would see a duplicate and do nothing, and a
    // paying customer would be locked out permanently.
    const sql = fakeSql([
      { match: "insert into identity.billing_events", reply: { rows: [{ stripe_event_id: "evt_1" }] } },
      { match: "insert into identity.billing_subscriptions", reply: { rows: [{ stripe_subscription_id: "sub_1" }] } },
      { match: "premium_entitlements", reply: () => { throw new Error("connection lost"); } },
    ]);

    await expect(applySubscriptionEvent(sql, { accountId: "acct_1", snapshot: SNAPSHOT, event: EVENT })).rejects.toThrow("connection lost");
    expect(sql.statements).toContain("rollback");
    expect(sql.statements).not.toContain("commit");
  });

  it("commits and reports duplicate without doing any work", async () => {
    const sql = fakeSql([{ match: "insert into identity.billing_events", reply: { rows: [] } }]);

    const outcome = await applySubscriptionEvent(sql, { accountId: "acct_1", snapshot: SNAPSHOT, event: EVENT });

    expect(outcome).toEqual({ kind: "duplicate" });
    expect(sql.statements.some((s) => s.includes("billing_subscriptions"))).toBe(false);
    expect(sql.statements.some((s) => s.includes("premium_entitlements"))).toBe(false);
    // Committed, so the caller answers Stripe with success and it stops retrying.
    expect(sql.statements).toContain("commit");
  });

  it("replaying the same event twice changes state exactly once", async () => {
    let claimed = false;
    const sql: TokenSqlExecutor & { entitlementWrites: number } = {
      entitlementWrites: 0,
      async query(text: string) {
        if (text.includes("billing_events")) {
          if (claimed) return { rows: [] };
          claimed = true;
          return { rows: [{ stripe_event_id: "evt_1" }] };
        }
        if (text.includes("billing_subscriptions")) return { rows: [{ stripe_subscription_id: "sub_1" }] };
        if (text.includes("premium_entitlements")) this.entitlementWrites += 1;
        return { rows: [] };
      },
    };

    const first = await applySubscriptionEvent(sql, { accountId: "acct_1", snapshot: SNAPSHOT, event: EVENT });
    const second = await applySubscriptionEvent(sql, { accountId: "acct_1", snapshot: SNAPSHOT, event: EVENT });

    expect(first.kind).toBe("applied");
    expect(second.kind).toBe("duplicate");
    expect(sql.entitlementWrites).toBe(1);
  });
});

describe("the customer mapping under concurrency", () => {
  it("returns the winner's id when this caller loses the race", async () => {
    // Both callers created a Stripe Customer; exactly one becomes the mapping, and
    // both must continue with the same one or the account ends up with two.
    const sql = fakeSql([
      { match: "insert into identity.billing_customers", reply: { rows: [] } },
      { match: "select stripe_customer_id", reply: { rows: [{ stripe_customer_id: "cus_winner" }] } },
    ]);
    expect(await claimCustomerId(sql, "acct_1", "cus_loser", false)).toBe("cus_winner");
  });

  it("returns its own id when it wins", async () => {
    const sql = fakeSql([{ match: "insert into identity.billing_customers", reply: { rows: [{ stripe_customer_id: "cus_mine" }] } }]);
    expect(await claimCustomerId(sql, "acct_1", "cus_mine", false)).toBe("cus_mine");
  });

  it("throws rather than inventing a mapping when the row vanishes", async () => {
    const sql = fakeSql([
      { match: "insert into identity.billing_customers", reply: { rows: [] } },
      { match: "select stripe_customer_id", reply: { rows: [] } },
    ]);
    await expect(claimCustomerId(sql, "acct_1", "cus_x", false)).rejects.toThrow(/vanished/);
  });
});
