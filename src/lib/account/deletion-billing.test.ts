/**
 * Terminating billing before deletion, against a stateful fake of the Stripe
 * calls used: customers.retrieve/update, subscriptions.list/cancel.
 *
 * The rule under test: deletion proceeds only when Stripe, re-read after
 * cancelling, shows nothing this Customer has that could bill again -- and
 * nothing belonging to another Customer is ever touched.
 */

import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { detachStripeCustomer, isPotentiallyBillable, terminateBilling } from "@/lib/account/deletion-billing";

type Sub = { id: string; customer: string; status: string; cancel_at_period_end?: boolean };

function fakeStripe(init: { subs: Sub[]; livemode?: boolean; deleted?: boolean; failCancel?: string[]; failList?: "first" | "second" | "always"; failRetrieve?: boolean }) {
  const subs = init.subs.map((s) => ({ ...s }));
  const calls = { cancel: [] as { id: string; params: unknown }[], list: 0, update: [] as { id: string; params: unknown }[] };
  const stripe = {
    customers: {
      retrieve: async (id: string) => {
        if (init.failRetrieve) throw new Error("connection");
        return init.deleted ? { id, deleted: true } : { id, livemode: init.livemode ?? false, metadata: { urdais_account_id: "acct" } };
      },
      update: async (id: string, params: unknown) => {
        calls.update.push({ id, params });
        return { id };
      },
    },
    subscriptions: {
      list: (params: { customer: string }) => ({
        autoPagingToArray: async () => {
          calls.list += 1;
          if (init.failList === "always" || (init.failList === "first" && calls.list === 1) || (init.failList === "second" && calls.list === 2)) throw new Error("connection");
          return subs.filter((s) => s.customer === params.customer).map((s) => ({ ...s }));
        },
      }),
      cancel: async (id: string, params: unknown) => {
        calls.cancel.push({ id, params });
        const sub = subs.find((s) => s.id === id)!;
        if (init.failCancel?.includes(id)) throw Object.assign(new Error("card_error"), { code: "resource_missing" });
        if (sub.status === "canceled") throw Object.assign(new Error("already canceled"), { code: "subscription_canceled" });
        sub.status = "canceled";
        return sub;
      },
    },
  } as unknown as Stripe;
  return { stripe, subs, calls };
}

const run = (fake: ReturnType<typeof fakeStripe>) => terminateBilling(fake.stripe, "cus_mine", "test");

describe("what counts as billable", () => {
  it("everything except canceled and incomplete_expired", () => {
    for (const s of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) expect(isPotentiallyBillable(s), s).toBe(true);
    for (const s of ["canceled", "incomplete_expired"]) expect(isPotentiallyBillable(s), s).toBe(false);
  });
});

describe("by subscription state", () => {
  for (const status of ["active", "past_due", "unpaid", "paused", "incomplete", "trialing"]) {
    it(`${status}: cancelled immediately, no proration, no final invoice`, async () => {
      const fake = fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status }] });
      expect(await run(fake)).toEqual({ kind: "terminated", canceled: 1 });
      expect(fake.calls.cancel).toEqual([{ id: "sub_1", params: { prorate: false, invoice_now: false } }]);
      expect(fake.subs[0]!.status).toBe("canceled");
    });
  }

  it("a scheduled cancel_at_period_end becomes immediate", async () => {
    const fake = fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status: "active", cancel_at_period_end: true }] });
    expect((await run(fake)).kind).toBe("terminated");
    expect(fake.calls.cancel).toHaveLength(1);
  });

  it("already canceled: satisfied, nothing cancelled again", async () => {
    const fake = fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status: "canceled" }, { id: "sub_0", customer: "cus_mine", status: "incomplete_expired" }] });
    expect(await run(fake)).toEqual({ kind: "terminated", canceled: 0 });
    expect(fake.calls.cancel).toHaveLength(0);
  });

  it("no subscriptions at all: satisfied", async () => {
    expect(await run(fakeStripe({ subs: [] }))).toEqual({ kind: "terminated", canceled: 0 });
  });

  it("a deleted Stripe Customer: satisfied (Stripe cancels its subscriptions with it)", async () => {
    expect((await run(fakeStripe({ subs: [], deleted: true }))).kind).toBe("terminated");
  });
});

describe("multiple subscriptions", () => {
  it("cancels every billable one, not just the first", async () => {
    const fake = fakeStripe({
      subs: [
        { id: "sub_a", customer: "cus_mine", status: "active" },
        { id: "sub_b", customer: "cus_mine", status: "past_due" },
        { id: "sub_c", customer: "cus_mine", status: "canceled" },
      ],
    });
    expect(await run(fake)).toEqual({ kind: "terminated", canceled: 2 });
    expect(fake.subs.every((s) => s.status === "canceled")).toBe(true);
  });

  it("never touches another Customer's subscriptions", async () => {
    const fake = fakeStripe({ subs: [{ id: "sub_mine", customer: "cus_mine", status: "active" }, { id: "sub_theirs", customer: "cus_other", status: "active" }] });
    await run(fake);
    expect(fake.calls.cancel.map((c) => c.id)).toEqual(["sub_mine"]);
    expect(fake.subs.find((s) => s.id === "sub_theirs")!.status).toBe("active");
  });

  it("fails closed when one of two cannot be cancelled, and says something was cancelled", async () => {
    const fake = fakeStripe({ subs: [{ id: "sub_a", customer: "cus_mine", status: "active" }, { id: "sub_b", customer: "cus_mine", status: "active" }], failCancel: ["sub_b"] });
    expect(await run(fake)).toEqual({ kind: "failed", reason: "cancel_failed", anyCanceled: true });
  });
});

describe("failures fail closed", () => {
  it("Stripe unreachable: nothing cancelled, not terminated", async () => {
    expect(await run(fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status: "active" }], failRetrieve: true }))).toEqual({ kind: "failed", reason: "stripe_unavailable", anyCanceled: false });
    expect(await run(fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status: "active" }], failList: "first" }))).toEqual({ kind: "failed", reason: "stripe_unavailable", anyCanceled: false });
  });

  it("the verifying re-list fails: not terminated, even though the cancel went through", async () => {
    expect(await run(fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status: "active" }], failList: "second" }))).toEqual({ kind: "failed", reason: "stripe_unavailable", anyCanceled: true });
  });

  it("a cancellation error is not trusted either way; the re-list decides", async () => {
    const fake = fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status: "active" }], failCancel: ["sub_1"] });
    expect(await run(fake)).toEqual({ kind: "failed", reason: "cancel_failed", anyCanceled: false });
  });

  it("a live Customer on a test deployment is refused before anything is cancelled", async () => {
    const fake = fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status: "active" }], livemode: true });
    expect(await run(fake)).toEqual({ kind: "failed", reason: "customer_mismatch", anyCanceled: false });
    expect(fake.calls.cancel).toHaveLength(0);
  });
});

describe("retry", () => {
  it("a retry after a successful cancellation re-reads Stripe and cancels nothing twice", async () => {
    const fake = fakeStripe({ subs: [{ id: "sub_1", customer: "cus_mine", status: "active" }] });
    await run(fake);
    expect(await run(fake)).toEqual({ kind: "terminated", canceled: 0 });
    expect(fake.calls.cancel).toHaveLength(1);
  });
});

describe("detaching the retained Customer", () => {
  it("unsets only the Urdais account pointer; email and history untouched", async () => {
    const fake = fakeStripe({ subs: [] });
    expect(await detachStripeCustomer(fake.stripe, "cus_mine")).toBe(true);
    expect(fake.calls.update).toEqual([{ id: "cus_mine", params: { metadata: { urdais_account_id: "" } } }]);
  });

  it("a Customer already gone at Stripe counts as detached; other errors do not", async () => {
    const gone = { customers: { update: async () => { throw Object.assign(new Error("x"), { code: "resource_missing" }); } } } as unknown as Stripe;
    expect(await detachStripeCustomer(gone, "cus_x")).toBe(true);
    const down = { customers: { update: async () => { throw new Error("connection"); } } } as unknown as Stripe;
    expect(await detachStripeCustomer(down, "cus_x")).toBe(false);
  });
});
