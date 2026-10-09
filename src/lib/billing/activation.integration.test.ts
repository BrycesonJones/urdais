/**
 * `ACTIVATE_ENTITLEMENT_SQL` against a REAL PostgreSQL with every migration applied.
 *
 * The statement runs inside the billing transaction, so a mistake in it would fail
 * webhooks, not just analytics. The unit tests check its shape against a fake
 * executor; this file checks what Postgres actually does with it: the real
 * constraints, a lapse and resume, and two transactions racing for one account.
 *
 * Skipped unless URDAIS_BILLING_TEST_DATABASE_URL names a disposable database,
 * e.g. the local harness:
 *
 *   npm run db:reset && npm run db:migrate
 *   URDAIS_BILLING_TEST_DATABASE_URL=$(scripts/db/local.sh url) npx vitest run src/lib/billing/activation.integration.test.ts
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACTIVATE_ENTITLEMENT_SQL, REVOKE_ENTITLEMENT_SQL, writeEntitlementFor } from "@/lib/billing/store";
import type { BillingSubscriptionSnapshot } from "@/lib/billing/subscription-state";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

const DATABASE_URL = process.env.URDAIS_BILLING_TEST_DATABASE_URL ?? "";

function snapshot(subscriptionId: string, status = "active"): BillingSubscriptionSnapshot {
  return {
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: "cus_integration",
    status,
    stripePriceId: "price_integration",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    livemode: false,
  } as unknown as BillingSubscriptionSnapshot;
}

describe.skipIf(!DATABASE_URL)("entitlement activation against a real database", () => {
  const a = new pg.Client(DATABASE_URL);
  const b = new pg.Client(DATABASE_URL);
  const sql: TokenSqlExecutor = { query: (text, values = []) => a.query(text, [...values]) };

  beforeAll(async () => {
    await a.connect();
    await b.connect();
  });
  afterAll(async () => {
    await a.end();
    await b.end();
  });

  async function newAccount(): Promise<string> {
    const { rows } = await a.query(
      "insert into identity.accounts (auth_provider, auth_subject, email) values ('supabase', $1, null) returning id",
      [`activation-${crypto.randomUUID()}`],
    );
    return rows[0].id;
  }

  async function entitlement(accountId: string) {
    const { rows } = await a.query(
      "select status, source, external_reference, granted_at, revoked_at from identity.premium_entitlements where account_id = $1",
      [accountId],
    );
    return rows[0];
  }

  /** Two transactions run the activation for one account; returns how many saw the transition. */
  async function race(accountId: string): Promise<number> {
    await a.query("begin");
    await b.query("begin");
    const first = await a.query(ACTIVATE_ENTITLEMENT_SQL, [accountId, "sub_a"]);
    // Blocks on the first transaction's row (or unique-index) lock until it commits.
    const second = b.query(ACTIVATE_ENTITLEMENT_SQL, [accountId, "sub_b"]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await a.query("commit");
    const secondResult = await second;
    await b.query("commit");
    return (first.rowCount ?? 0) + (secondResult.rowCount ?? 0);
  }

  it("reports a first grant as an activation and writes the same row the plain grant does", async () => {
    const accountId = await newAccount();
    expect(await writeEntitlementFor(sql, accountId, snapshot("sub_1"))).toEqual({ entitlement: "granted", activated: true });
    expect(await entitlement(accountId)).toMatchObject({ status: "active", source: "stripe", external_reference: "sub_1", revoked_at: null });
  });

  it("re-grants an active row without an activation, still following the latest subscription", async () => {
    const accountId = await newAccount();
    await writeEntitlementFor(sql, accountId, snapshot("sub_1"));
    expect(await writeEntitlementFor(sql, accountId, snapshot("sub_2"))).toEqual({ entitlement: "granted", activated: false });
    expect((await entitlement(accountId)).external_reference).toBe("sub_2");
  });

  it("treats a resume after revocation as a new activation and keeps the original grant date", async () => {
    const accountId = await newAccount();
    await writeEntitlementFor(sql, accountId, snapshot("sub_1"));
    const firstGrant = (await entitlement(accountId)).granted_at as Date;
    expect(await writeEntitlementFor(sql, accountId, snapshot("sub_1", "canceled"))).toEqual({ entitlement: "revoked", activated: false });
    expect(await writeEntitlementFor(sql, accountId, snapshot("sub_2"))).toEqual({ entitlement: "granted", activated: true });
    const resumed = await entitlement(accountId);
    expect(resumed.granted_at.getTime()).toBe(firstGrant.getTime());
    expect(resumed.revoked_at).toBeNull();
  });

  it("lets exactly one of two racing transactions see the activation, for a new account", async () => {
    expect(await race(await newAccount())).toBe(1);
  });

  it("lets exactly one of two racing transactions see the activation, for an inactive row", async () => {
    const accountId = await newAccount();
    await a.query(REVOKE_ENTITLEMENT_SQL, [accountId, "sub_0"]);
    expect(await race(accountId)).toBe(1);
    expect((await entitlement(accountId)).status).toBe("active");
  });
});
