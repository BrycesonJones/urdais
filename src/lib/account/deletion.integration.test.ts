/**
 * Account deletion end to end, against a REAL PostgreSQL with every migration
 * applied: the real workflow (`deleteCurrentAccount`), the real stage SQL, the real
 * FK / detach / trigger behaviour, the real `resolveUrdaisAccount`, and the real
 * webhook processor for the races.
 *
 * Faked: the session (identity + 15-minute check), the Stripe client (a stateful
 * in-process fake of the four calls used), and the Supabase Admin call. The Stripe
 * and Auth network contracts are covered by deletion-billing.test.ts and
 * admin.test.ts; this file is about ordering, idempotency, retention and races.
 *
 * Skipped unless URDAIS_DELETION_TEST_DATABASE_URL names a disposable database,
 * e.g. the local harness:
 *
 *   npm run db:reset && npm run db:migrate
 *   URDAIS_DELETION_TEST_DATABASE_URL=$(scripts/db/local.sh url) npx vitest run src/lib/account/deletion.integration.test.ts
 */

import type Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.URDAIS_DELETION_TEST_DATABASE_URL ?? "";

const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const checkRecentAuthentication = vi.hoisted(() => vi.fn());
const deleteAuthUser = vi.hoisted(() => vi.fn());
const stripeContext = vi.hoisted(() => vi.fn());
const executor = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/auth/recent-auth", () => ({ checkRecentAuthentication }));
vi.mock("@/lib/auth/admin", () => ({ deleteAuthUser, authAdminAvailability: () => ({ kind: "available" }) }));
vi.mock("@/lib/billing/stripe", () => ({ stripeContext }));
vi.mock("@/lib/tokens/read/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tokens/read/database")>()),
  resolveTokenDatabaseUrl: () => "postgresql://integration",
  tokenSqlExecutor: async () => executor.current,
}));

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { settleHeldDeletion, settleHeldDeletions } from "@/lib/account/analytics-erasure";
import { deleteCurrentAccount } from "@/lib/account/deletion";
import { AccountDeletionPendingError, resolveUrdaisAccount } from "@/lib/auth/accounts";
import { readCustomerMapping } from "@/lib/billing/store";
import { processStripeEvent } from "@/lib/billing/webhook";

type Sql = Awaited<ReturnType<typeof createTokenSqlExecutor>>;
let sql: Sql;

/* ------------------------------------------------------------- fake Stripe */

type Sub = { id: string; customer: string; status: string; cancel_at_period_end?: boolean; metadata: Record<string, string> };
const stripeState = { subs: [] as Sub[], customerMetadata: {} as Record<string, Record<string, string>>, failCancel: new Set<string>(), down: false, failUpdate: 0, cancels: 0 };
const fakeStripe = {
  customers: {
    retrieve: async (id: string) => {
      if (stripeState.down) throw new Error("connection");
      return { id, livemode: false, metadata: stripeState.customerMetadata[id] ?? {} };
    },
    update: async (id: string, params: { metadata: Record<string, string> }) => {
      if (stripeState.failUpdate > 0) {
        stripeState.failUpdate -= 1;
        throw new Error("connection");
      }
      const next = { ...(stripeState.customerMetadata[id] ?? {}) };
      for (const [k, v] of Object.entries(params.metadata)) if (v === "") delete next[k]; else next[k] = v;
      stripeState.customerMetadata[id] = next;
      return { id };
    },
  },
  subscriptions: {
    list: (params: { customer: string }) => ({
      autoPagingToArray: async () => {
        if (stripeState.down) throw new Error("connection");
        return stripeState.subs.filter((s) => s.customer === params.customer).map((s) => ({ ...s }));
      },
    }),
    cancel: async (id: string) => {
      if (stripeState.failCancel.has(id)) throw new Error("card_declined");
      const sub = stripeState.subs.find((s) => s.id === id)!;
      if (sub.status === "canceled") throw Object.assign(new Error("already"), { code: "subscription_canceled" });
      sub.status = "canceled";
      stripeState.cancels += 1;
      return sub;
    },
    // For the webhook processor's authoritative re-read.
    retrieve: async (id: string) => {
      const s = stripeState.subs.find((x) => x.id === id)!;
      return { ...s, livemode: false, items: { data: [{ price: { id: "price_x" } }] }, cancel_at_period_end: s.cancel_at_period_end ?? false, canceled_at: null, ended_at: null };
    },
  },
} as unknown as Stripe;

/* ----------------------------------------------------------------- helpers */

let subjectCounter = 0;
async function newAccount(opts: { sub?: string; ent?: "active" | "inactive"; source?: "stripe" | "manual"; cape?: boolean; extraSubs?: string[] } = {}) {
  const subject = `del-subject-${++subjectCounter}-${Date.now()}`;
  const email = `${subject}@example.invalid`;
  const account = await resolveUrdaisAccount(sql, { subject, email });
  const customer = `cus_${subject}`;
  if (opts.sub || opts.extraSubs) {
    await sql.query(`insert into identity.billing_customers (account_id, stripe_customer_id, livemode) values ($1,$2,false)`, [account.id, customer]);
    stripeState.customerMetadata[customer] = { urdais_account_id: account.id, urdais_application: "urdais" };
    for (const [i, status] of [opts.sub, ...(opts.extraSubs ?? [])].filter(Boolean).entries()) {
      const id = `sub_${subject}_${i}`;
      stripeState.subs.push({ id, customer, status: status!, cancel_at_period_end: opts.cape, metadata: { urdais_account_id: account.id } });
      await sql.query(
        `insert into identity.billing_subscriptions (stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id, livemode, cancel_at_period_end, last_event_at) values ($1,$2,$3,$4,'price_x',false,$5, now() - interval '1 hour')`,
        [id, account.id, customer, status, opts.cape ?? false],
      );
    }
  }
  if (opts.ent) {
    const source = opts.source ?? "stripe";
    await sql.query(
      `insert into identity.premium_entitlements (account_id, status, source, external_reference, granted_at, revoked_at) values ($1,$2,$3,$4, now() - interval '2 days', $5)`,
      [account.id, opts.ent, source, source === "stripe" ? `sub_${subject}_0` : null, opts.ent === "inactive" ? new Date() : null],
    );
  }
  return { subject, email, accountId: account.id, customer };
}

function signIn(who: { subject: string; email: string }) {
  resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: who.subject, email: who.email, emailVerified: true } });
}

async function one<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T | undefined> {
  return (await sql.query(q, p)).rows[0] as T | undefined;
}
const count = async (q: string, p: unknown[] = []) => Number((await one<{ n: string }>(q, p))?.n ?? 0);
const deletionOf = (subject: string) => one<{ state: string; account_id: string | null }>(`select state, account_id from identity.account_deletions where auth_subject = $1`, [subject]);

/* ------------------------------------------------------------------- setup */

const suite = DATABASE_URL ? describe : describe.skip;

suite("account deletion against a real database", () => {
  beforeAll(async () => {
    sql = await createTokenSqlExecutor(DATABASE_URL);
    executor.current = sql;
  });
  afterAll(async () => {
    await (sql as unknown as { end?: () => Promise<void> }).end?.();
  });
  beforeEach(() => {
    stripeState.failCancel.clear();
    stripeState.down = false;
    stripeState.failUpdate = 0;
    stripeState.cancels = 0;
    checkRecentAuthentication.mockResolvedValue({ kind: "recent" });
    deleteAuthUser.mockReset().mockResolvedValue({ kind: "deleted" });
    stripeContext.mockReturnValue({ kind: "ready", stripe: fakeStripe, availability: { kind: "available", mode: "test", environment: "development", secretKey: "sk_test_x", priceId: "price_x" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  async function expectFullyDeleted(who: { subject: string; email: string; accountId: string; customer: string }) {
    expect(await count(`select count(*) n from identity.accounts where id = $1`, [who.accountId])).toBe(0);
    expect(await count(`select count(*) n from identity.premium_entitlements where account_id = $1`, [who.accountId])).toBe(0);
    // No personal data survives: neither the email nor the auth subject appears anywhere in identity.
    expect(await count(`select count(*) n from identity.accounts where email = $1`, [who.email])).toBe(0);
    expect(await count(`select count(*) n from identity.account_deletions where auth_subject = $1 or account_id = $2`, [who.subject, who.accountId])).toBe(0);
    expect(deleteAuthUser).toHaveBeenCalledWith(who.subject);
  }

  /* ------------------------------------------------------------- refusals */

  it("unauthenticated: refused, nothing written", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "anonymous" });
  });

  it("stale sign-in: step-up required, nothing written", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    checkRecentAuthentication.mockResolvedValue({ kind: "stale" });
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "reauth_required" });
    expect(await deletionOf(who.subject)).toBeUndefined();
    expect(stripeState.cancels).toBe(0);
  });

  it("without the typed confirmation: refused before anything", async () => {
    const who = await newAccount();
    signIn(who);
    expect((await deleteCurrentAccount({ confirmed: false })).kind).toBe("unavailable");
    expect(await deletionOf(who.subject)).toBeUndefined();
  });

  /* -------------------------------------------------------- by state */

  it("never subscribed: deleted, Auth deleted, no Stripe call", async () => {
    const who = await newAccount();
    signIn(who);
    stripeContext.mockReturnValue({ kind: "unavailable", availability: { kind: "unavailable" } });
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
    await expectFullyDeleted(who);
    expect(await count(`select count(*) n from identity.account_deletions where state = 'complete' and stripe_customer_id is null and auth_subject is null`)).toBeGreaterThan(0);
  });

  it("with analytics in use: the reader's deletion completes, the record is held for erasure, a retry settles it", async () => {
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", ["phx", "integrationfixture"].join("_"));
    try {
      const who = await newAccount();
      signIn(who);
      stripeContext.mockReturnValue({ kind: "unavailable", availability: { kind: "unavailable" } });

      // The reader is told it is done, and it is: account and Auth user are gone.
      expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
      expect(await count(`select count(*) n from identity.accounts where id = $1`, [who.accountId])).toBe(0);
      expect(deleteAuthUser).toHaveBeenCalledWith(who.subject);

      // Held: the account id survives, as the key to the PostHog person.
      const held = await one<{ id: string; state: string; account_id: string; last_error: string; lease_until: unknown }>(
        `select id, state, account_id, last_error, lease_until from identity.account_deletions where auth_subject = $1`,
        [who.subject],
      );
      expect(held).toMatchObject({ state: "auth_deleted", account_id: who.accountId, last_error: "analytics_erasure_pending", lease_until: null });

      // Not yet: the sweep leaves a deletion alone for its first hour, so the reader's
      // last events are ingested before the erasure is requested.
      const neverCalled = vi.fn();
      const tooSoon = await settleHeldDeletions(sql, 50, { required: () => true, config: () => ({ missing: [] as string[] }), erase: neverCalled });
      expect(tooSoon).toEqual({ completed: 0, erasure_requested: 0, held: 0, skipped: 0, codes: [] });
      expect(neverCalled).not.toHaveBeenCalled();
      await sql.query(`update identity.account_deletions set auth_deleted_at = now() - interval '61 minutes' where id = $1`, [held!.id]);

      // PostHog down: still held, nothing lost.
      const config = { apiHost: "https://eu.posthog.com", projectId: "1", personalApiKey: "phx_x" };
      const failing = { required: () => true, config: () => config, erase: vi.fn(async () => ({ kind: "failed" as const, status: 503 })) };
      expect(await settleHeldDeletion(sql, held!.id, failing)).toEqual({ kind: "held", code: "analytics_erasure_failed" });
      expect((await deletionOf(who.subject))).toMatchObject({ state: "auth_deleted", account_id: who.accountId });

      // Back up, an hour on: the sweep requests the erasure by the account id,
      // completes, and drops the identifiers.
      const erase = vi.fn(async () => ({ kind: "queued" as const, personsFound: 1 }));
      const swept = await settleHeldDeletions(sql, 50, { ...failing, erase });
      expect(swept.erasure_requested).toBeGreaterThanOrEqual(1);
      expect(erase).toHaveBeenCalledWith(who.accountId, config);
      await expectFullyDeleted(who);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  for (const [label, sub, cape] of [
    ["active", "active", false],
    ["active with cancellation scheduled (becomes immediate)", "active", true],
    ["past_due", "past_due", false],
    ["unpaid", "unpaid", false],
    ["paused", "paused", false],
  ] as const) {
    it(`${label}: Stripe cancelled first, then account and Auth removed, billing history detached`, async () => {
      const who = await newAccount({ sub, ent: sub === "active" ? "active" : "inactive", cape });
      signIn(who);
      expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
      expect(stripeState.subs.filter((s) => s.customer === who.customer).every((s) => s.status === "canceled")).toBe(true);
      await expectFullyDeleted(who);
      // Retained, detached, never pointing at the deleted account.
      expect(await one(`select account_id, detached_at is not null as detached from identity.billing_customers where stripe_customer_id = $1`, [who.customer])).toEqual({ account_id: null, detached: true });
      expect(await count(`select count(*) n from identity.billing_subscriptions where stripe_customer_id = $1 and account_id is null and detached_at is not null`, [who.customer])).toBe(1);
      // The Stripe Customer's pointer to the deleted account is gone; nothing else changed.
      expect(stripeState.customerMetadata[who.customer]).toEqual({ urdais_application: "urdais" });
    });
  }

  it("already canceled: satisfied without cancelling again", async () => {
    const who = await newAccount({ sub: "canceled", ent: "inactive" });
    signIn(who);
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
    expect(stripeState.cancels).toBe(0);
    await expectFullyDeleted(who);
  });

  it("manual (comp) entitlement, no Stripe Customer: access removed with the account", async () => {
    const who = await newAccount({ ent: "active", source: "manual" });
    signIn(who);
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
    await expectFullyDeleted(who);
  });

  it("multiple subscriptions: every billable one is cancelled", async () => {
    const who = await newAccount({ sub: "active", ent: "active", extraSubs: ["past_due"] });
    signIn(who);
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
    expect(stripeState.subs.filter((s) => s.customer === who.customer).map((s) => s.status)).toEqual(["canceled", "canceled"]);
  });

  /* ------------------------------------------------------- fail closed */

  it("Stripe unreachable: account NOT deleted, still entitled, billing manageable", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    stripeState.down = true;
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "billing_not_terminated", anyCanceled: false });
    expect(await count(`select count(*) n from identity.accounts where id = $1`, [who.accountId])).toBe(1);
    expect((await one(`select status from identity.premium_entitlements where account_id = $1`, [who.accountId]))?.status).toBe("active");
    expect(await readCustomerMapping(sql, who.accountId)).not.toBeNull();
    expect((await deletionOf(who.subject))?.state).toBe("requested");
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it("cancellation refused by Stripe: account NOT deleted", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    stripeState.failCancel.add(`sub_${who.subject}_0`);
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "billing_not_terminated", anyCanceled: false });
    expect(await count(`select count(*) n from identity.accounts where id = $1`, [who.accountId])).toBe(1);
    // Retry once Stripe accepts it.
    stripeState.failCancel.clear();
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
    await expectFullyDeleted(who);
  });

  /* -------------------------------------------- partial failure and retry */

  it("cleanup fails after Stripe cancelled: premium already revoked; retry finishes without cancelling twice", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    stripeState.failUpdate = 1; // detaching the Stripe Customer fails once
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "incomplete" });
    expect((await deletionOf(who.subject))?.state).toBe("billing_terminated");
    expect((await one(`select status from identity.premium_entitlements where account_id = $1`, [who.accountId]))?.status).toBe("inactive");
    expect(stripeState.cancels).toBe(1);
    // Resume needs no confirmation and no fresh sign-in: the irreversible part is done.
    checkRecentAuthentication.mockResolvedValue({ kind: "stale" });
    expect(await deleteCurrentAccount({ confirmed: false })).toEqual({ kind: "complete" });
    expect(stripeState.cancels).toBe(1);
    await expectFullyDeleted(who);
  });

  it("Auth deletion fails: incomplete, the surviving session cannot get a new account; retry completes", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    deleteAuthUser.mockResolvedValueOnce({ kind: "failed", code: "unexpected_failure" });
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "incomplete" });
    expect((await deletionOf(who.subject))?.state).toBe("local_cleanup_complete");
    // The loophole from the investigation, closed: no silent re-provisioning.
    await expect(resolveUrdaisAccount(sql, { subject: who.subject, email: who.email })).rejects.toBeInstanceOf(AccountDeletionPendingError);
    expect(await count(`select count(*) n from identity.accounts where email = $1`, [who.email])).toBe(0);

    expect(await deleteCurrentAccount({ confirmed: false })).toEqual({ kind: "complete" });
    expect(deleteAuthUser).toHaveBeenCalledTimes(2);
  });

  it("retry after the Auth user is already gone: treated as done", async () => {
    const who = await newAccount();
    signIn(who);
    deleteAuthUser.mockResolvedValueOnce({ kind: "failed", code: "timeout" });
    await deleteCurrentAccount({ confirmed: true });
    deleteAuthUser.mockResolvedValueOnce({ kind: "already_absent" });
    expect(await deleteCurrentAccount({ confirmed: false })).toEqual({ kind: "complete" });
  });

  /* -------------------------------------------------------- idempotency */

  it("duplicate concurrent submissions converge on one record and one cancellation", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    const results = await Promise.all([deleteCurrentAccount({ confirmed: true }), deleteCurrentAccount({ confirmed: true })]);
    const kinds = results.map((r) => r.kind).sort();
    // One finishes; the other either finished first, saw the lease, or found nothing left.
    expect(kinds).toContain("complete");
    for (const kind of kinds) expect(["complete", "in_progress", "anonymous", "unavailable"]).toContain(kind);
    expect(stripeState.cancels).toBe(1);
    expect(await count(`select count(*) n from identity.billing_subscriptions where stripe_customer_id = $1`, [who.customer])).toBe(1);
    expect(await count(`select count(*) n from identity.billing_customers where stripe_customer_id = $1`, [who.customer])).toBe(1);
  });

  it("a submission after completion starts nothing new", async () => {
    const who = await newAccount();
    signIn(who);
    await deleteCurrentAccount({ confirmed: true });
    const before = await count(`select count(*) n from identity.account_deletions`);
    // The Auth user is gone in reality; if a stale cookie still resolved, the
    // account would be brand new -- but the confirmation + fresh sign-in gate holds.
    checkRecentAuthentication.mockResolvedValue({ kind: "stale" });
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "reauth_required" });
    expect(await count(`select count(*) n from identity.account_deletions`)).toBe(before);
  });

  /* ------------------------------------------------------------ webhook races */

  const event = (id: string, type: string, subscription: string, accountId: string, created: number) =>
    ({ id, type, livemode: false, created, data: { object: { id: subscription, customer: "", metadata: { urdais_account_id: accountId } } } }) as unknown as Stripe.Event;

  it("a webhook during deletion (past billing termination) cannot grant", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    stripeState.failUpdate = 1;
    await deleteCurrentAccount({ confirmed: true }); // stops at billing_terminated
    // A stale "active" re-delivery for the old subscription.
    const sub = stripeState.subs.find((s) => s.customer === who.customer)!;
    const saved = sub.status;
    sub.status = "active";
    const outcome = await processStripeEvent(fakeStripe, sql, event(`evt_${who.subject}_1`, "customer.subscription.updated", sub.id, who.accountId, Math.floor(Date.now() / 1000)), "test");
    sub.status = saved;
    expect(outcome).toMatchObject({ kind: "processed", detail: expect.stringContaining("withheld") });
    expect((await one(`select status from identity.premium_entitlements where account_id = $1`, [who.accountId]))?.status).toBe("inactive");
    expect(await deleteCurrentAccount({ confirmed: false })).toEqual({ kind: "complete" });
  });

  it("a webhook after deletion is recorded detached, recreates nothing, and is not retried", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
    const sub = stripeState.subs.find((s) => s.customer === who.customer)!;
    const now = Math.floor(Date.now() / 1000);

    const deleted = await processStripeEvent(fakeStripe, sql, event(`evt_${who.subject}_del`, "customer.subscription.deleted", sub.id, who.accountId, now), "test");
    expect(deleted.kind).toBe("processed");
    expect(await count(`select count(*) n from identity.billing_events where stripe_event_id = $1`, [`evt_${who.subject}_del`])).toBe(1);

    // Duplicate: acknowledged, ledger unchanged.
    const again = await processStripeEvent(fakeStripe, sql, event(`evt_${who.subject}_del`, "customer.subscription.deleted", sub.id, who.accountId, now), "test");
    expect(again).toMatchObject({ kind: "processed", detail: expect.stringContaining("already processed") });

    // Stale: older than what is stored.
    const stale = await processStripeEvent(fakeStripe, sql, event(`evt_${who.subject}_old`, "customer.subscription.updated", sub.id, who.accountId, now - 86_400), "test");
    expect(stale.kind).toBe("processed");

    // Nothing resurrected.
    expect(await count(`select count(*) n from identity.accounts where id = $1`, [who.accountId])).toBe(0);
    expect(await count(`select count(*) n from identity.premium_entitlements where account_id = $1`, [who.accountId])).toBe(0);
    expect(await count(`select count(*) n from identity.billing_subscriptions where stripe_subscription_id = $1 and account_id is null and detached_at is not null`, [sub.id])).toBe(1);
  });

  /* ------------------------------------------------------- recreation */

  it("the same email signing up again gets a fresh account with nothing inherited", async () => {
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });

    // A new Supabase user (new subject), same address.
    const reborn = await resolveUrdaisAccount(sql, { subject: `${who.subject}-new-auth-user`, email: who.email });
    expect(reborn.id).not.toBe(who.accountId);
    expect(await count(`select count(*) n from identity.premium_entitlements where account_id = $1`, [reborn.id])).toBe(0);
    expect(await count(`select count(*) n from identity.billing_subscriptions where account_id = $1`, [reborn.id])).toBe(0);
    // The retained Customer is not theirs; their first Checkout makes a new one.
    expect(await readCustomerMapping(sql, reborn.id)).toBeNull();
  });

  /* ------------------------------------------------------ isolation */

  it("deleting one account touches no other account", async () => {
    const bystander = await newAccount({ sub: "active", ent: "active" });
    const who = await newAccount({ sub: "active", ent: "active" });
    signIn(who);
    expect(await deleteCurrentAccount({ confirmed: true })).toEqual({ kind: "complete" });
    expect(stripeState.subs.find((s) => s.customer === bystander.customer)!.status).toBe("active");
    expect((await one(`select status from identity.premium_entitlements where account_id = $1`, [bystander.accountId]))?.status).toBe("active");
    expect(await readCustomerMapping(sql, bystander.accountId)).toEqual({ stripeCustomerId: bystander.customer, livemode: false });
  });
});
