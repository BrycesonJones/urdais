/**
 * Durable billing state, and the transaction that keeps it agreeing with the
 * entitlement it drives.
 *
 * ## The failure this module is shaped around
 *
 * A webhook that writes the subscription and then crashes before writing the
 * entitlement leaves a paying customer locked out, and the reverse leaves a
 * cancelled one with access. So the event claim, the subscription upsert and the
 * entitlement write are **one transaction**. Either all three happened or none
 * did, and Stripe's retry finds a clean slate.
 *
 * ## Idempotency is an insert, not a check
 *
 * `claimEvent` inserts the Stripe event id, which is the primary key. Winning the
 * insert is what grants the right to process. A read-then-write
 * ("have I seen this event?") races against Stripe's own concurrent retries — two
 * deliveries can both read "no" before either writes — and the whole point is to
 * survive exactly that.
 *
 * The claim is **inside** the transaction, so a processing failure rolls it back
 * and the retry is able to try again. Marking an event processed before the work
 * succeeds is how an event gets permanently dropped.
 *
 * ## Ordering is compared, not assumed
 *
 * Stripe does not guarantee delivery order. Every subscription write carries the
 * event's own `created` time and is applied only when it is at least as new as
 * the last one stored, so a late `updated` cannot resurrect stale access after a
 * `deleted`. That comparison is in the `on conflict … where`, not in application
 * code, so a concurrent pair of handlers cannot both pass it.
 */

import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";
import type { BillingSubscriptionSnapshot } from "@/lib/billing/subscription-state";
import { snapshotEntitles } from "@/lib/billing/subscription-state";

/* ------------------------------------------------------------------ customers */

export const CUSTOMER_BY_ACCOUNT_QUERY = `
  select stripe_customer_id
    from identity.billing_customers
   where account_id = $1
`;

export const ACCOUNT_BY_CUSTOMER_QUERY = `
  select account_id
    from identity.billing_customers
   where stripe_customer_id = $1
`;

/**
 * Claim this account's Stripe Customer, or return the one already claimed.
 *
 * `on conflict (account_id) do nothing` plus a read-back is what makes two
 * simultaneous first checkouts safe: both may have created a Customer at Stripe,
 * exactly one wins the row, and both callers end up using the winner. The loser's
 * Stripe Customer is left unattached — harmless, has no subscription, and far
 * better than two mappings for one reader.
 */
export const CLAIM_CUSTOMER_SQL = `
  insert into identity.billing_customers (account_id, stripe_customer_id, livemode)
  values ($1, $2, $3)
  on conflict (account_id) do nothing
  returning stripe_customer_id
`;

export async function readCustomerId(sql: TokenSqlExecutor, accountId: string): Promise<string | null> {
  const { rows } = await sql.query(CUSTOMER_BY_ACCOUNT_QUERY, [accountId]);
  const value = rows[0]?.stripe_customer_id;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function readAccountIdForCustomer(sql: TokenSqlExecutor, stripeCustomerId: string): Promise<string | null> {
  const { rows } = await sql.query(ACCOUNT_BY_CUSTOMER_QUERY, [stripeCustomerId]);
  const value = rows[0]?.account_id;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * The Customer id this account is mapped to after the call.
 *
 * Returns the winner's id, which may not be the one passed in.
 */
export async function claimCustomerId(
  sql: TokenSqlExecutor,
  accountId: string,
  stripeCustomerId: string,
  livemode: boolean,
): Promise<string> {
  const { rows } = await sql.query(CLAIM_CUSTOMER_SQL, [accountId, stripeCustomerId, livemode]);
  const claimed = rows[0]?.stripe_customer_id;
  if (typeof claimed === "string" && claimed.trim() !== "") return claimed;

  // Lost the race, or already mapped. The existing row is authoritative.
  const existing = await readCustomerId(sql, accountId);
  if (existing) return existing;
  throw new Error("billing customer mapping vanished between insert and read");
}

/* -------------------------------------------------------------------- events */

export const CLAIM_EVENT_SQL = `
  insert into identity.billing_events
    (stripe_event_id, event_type, livemode, stripe_created_at, stripe_subscription_id)
  values ($1, $2, $3, $4, $5)
  on conflict (stripe_event_id) do nothing
  returning stripe_event_id
`;

export type EventClaim = "claimed" | "duplicate";

export async function claimEvent(
  sql: TokenSqlExecutor,
  event: {
    readonly id: string;
    readonly type: string;
    readonly livemode: boolean;
    readonly createdAt: string;
    readonly subscriptionId: string | null;
  },
): Promise<EventClaim> {
  const { rows } = await sql.query(CLAIM_EVENT_SQL, [
    event.id,
    event.type,
    event.livemode,
    event.createdAt,
    event.subscriptionId,
  ]);
  return rows.length > 0 ? "claimed" : "duplicate";
}

/* ------------------------------------------------------------- subscriptions */

/**
 * Upsert, guarded by the event's own timestamp.
 *
 * The `where` is the out-of-order defence. A first insert has nothing to compare
 * against; an update applies only when this event is at least as new as the last
 * one applied. `>=` rather than `>` because Stripe stamps events at second
 * resolution and two genuine changes can share a second — refusing the second of
 * those would drop a real state change.
 */
export const UPSERT_SUBSCRIPTION_SQL = `
  insert into identity.billing_subscriptions (
    stripe_subscription_id, account_id, stripe_customer_id, status, stripe_price_id,
    cancel_at_period_end, current_period_end, canceled_at, ended_at, livemode, last_event_at
  )
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  on conflict (stripe_subscription_id) do update set
    account_id           = excluded.account_id,
    stripe_customer_id   = excluded.stripe_customer_id,
    status               = excluded.status,
    stripe_price_id      = excluded.stripe_price_id,
    cancel_at_period_end = excluded.cancel_at_period_end,
    current_period_end   = excluded.current_period_end,
    canceled_at          = excluded.canceled_at,
    ended_at             = excluded.ended_at,
    livemode             = excluded.livemode,
    last_event_at        = excluded.last_event_at
  where identity.billing_subscriptions.last_event_at is null
     or excluded.last_event_at >= identity.billing_subscriptions.last_event_at
  returning stripe_subscription_id
`;

export type SubscriptionWrite = "applied" | "stale";

export async function upsertSubscription(
  sql: TokenSqlExecutor,
  accountId: string,
  snapshot: BillingSubscriptionSnapshot,
  eventAt: string | null,
): Promise<SubscriptionWrite> {
  const { rows } = await sql.query(UPSERT_SUBSCRIPTION_SQL, [
    snapshot.stripeSubscriptionId,
    accountId,
    snapshot.stripeCustomerId,
    snapshot.status,
    snapshot.stripePriceId,
    snapshot.cancelAtPeriodEnd,
    snapshot.currentPeriodEnd,
    snapshot.canceledAt,
    snapshot.endedAt,
    snapshot.livemode,
    eventAt,
  ]);
  return rows.length > 0 ? "applied" : "stale";
}

/* --------------------------------------------------------------- entitlement */

/**
 * Grant, in the Phase 1 table, with Phase 1's constraints intact.
 *
 * `granted_at` is preserved across re-grants via `coalesce`, so a subscription
 * that lapses and resumes keeps the date access first began rather than reporting
 * the most recent webhook as the start of the relationship.
 *
 * `revoked_at` must be null for an `active` row — the schema says so — and is
 * cleared here rather than left behind from an earlier revocation.
 */
export const GRANT_ENTITLEMENT_SQL = `
  insert into identity.premium_entitlements
    (account_id, status, source, external_reference, granted_at, revoked_at)
  values ($1, 'active', 'stripe', $2, now(), null)
  on conflict (account_id) do update set
    status             = 'active',
    source             = 'stripe',
    external_reference = excluded.external_reference,
    granted_at         = coalesce(identity.premium_entitlements.granted_at, excluded.granted_at),
    revoked_at         = null
`;

/**
 * Revoke.
 *
 * `greatest` keeps `revoked_at >= granted_at`, which the schema requires. Taking
 * `now()` alone would be correct in every ordinary case and would violate the
 * constraint in the one case where a grant carries a clock-skewed future date —
 * and a constraint violation here means the webhook fails and Stripe retries
 * forever.
 */
export const REVOKE_ENTITLEMENT_SQL = `
  insert into identity.premium_entitlements
    (account_id, status, source, external_reference, granted_at, revoked_at)
  values ($1, 'inactive', 'stripe', $2, null, now())
  on conflict (account_id) do update set
    status             = 'inactive',
    source             = 'stripe',
    external_reference = excluded.external_reference,
    revoked_at         = greatest(now(), coalesce(identity.premium_entitlements.granted_at, now()))
`;

export async function writeEntitlementFor(
  sql: TokenSqlExecutor,
  accountId: string,
  snapshot: BillingSubscriptionSnapshot,
): Promise<"granted" | "revoked"> {
  if (snapshotEntitles(snapshot)) {
    await sql.query(GRANT_ENTITLEMENT_SQL, [accountId, snapshot.stripeSubscriptionId]);
    return "granted";
  }
  await sql.query(REVOKE_ENTITLEMENT_SQL, [accountId, snapshot.stripeSubscriptionId]);
  return "revoked";
}

/* ------------------------------------------------------- the atomic operation */

export type ApplyOutcome =
  | { readonly kind: "applied"; readonly entitlement: "granted" | "revoked" }
  | { readonly kind: "duplicate" }
  | { readonly kind: "stale" };

/**
 * Record the event, store the subscription and move the entitlement — atomically.
 *
 * The three writes are one transaction for the reason in the module comment. On
 * any failure the whole thing rolls back, including the event claim, and the
 * caller returns a non-success status so Stripe retries.
 */
export async function applySubscriptionEvent(
  sql: TokenSqlExecutor,
  input: {
    readonly accountId: string;
    readonly snapshot: BillingSubscriptionSnapshot;
    readonly event: { readonly id: string; readonly type: string; readonly livemode: boolean; readonly createdAt: string };
  },
): Promise<ApplyOutcome> {
  await sql.query("begin", []);
  try {
    const claim = await claimEvent(sql, {
      id: input.event.id,
      type: input.event.type,
      livemode: input.event.livemode,
      createdAt: input.event.createdAt,
      subscriptionId: input.snapshot.stripeSubscriptionId,
    });

    if (claim === "duplicate") {
      // Already processed. Commit rather than roll back: there is nothing to undo,
      // and the caller must answer Stripe with success so it stops retrying.
      await sql.query("commit", []);
      return { kind: "duplicate" };
    }

    const write = await upsertSubscription(sql, input.accountId, input.snapshot, input.event.createdAt);

    if (write === "stale") {
      // A newer event already described this subscription. The event is recorded
      // as processed — it was — and nothing else changes, because the stored state
      // is fresher than what this event carries.
      await sql.query("commit", []);
      return { kind: "stale" };
    }

    const entitlement = await writeEntitlementFor(sql, input.accountId, input.snapshot);
    await sql.query("commit", []);
    return { kind: "applied", entitlement };
  } catch (error) {
    try {
      await sql.query("rollback", []);
    } catch {
      // A rollback that fails leaves the connection unusable, not the data wrong.
    }
    throw error;
  }
}

/* ------------------------------------------------------------ reconciliation */

export const SUBSCRIPTIONS_FOR_ACCOUNT_QUERY = `
  select stripe_subscription_id, status, cancel_at_period_end, current_period_end, livemode
    from identity.billing_subscriptions
   where account_id = $1
   order by coalesce(last_event_at, created_at) desc
`;

export async function readSubscriptionsForAccount(
  sql: TokenSqlExecutor,
  accountId: string,
): Promise<{ id: string; status: string; livemode: boolean }[]> {
  const { rows } = await sql.query(SUBSCRIPTIONS_FOR_ACCOUNT_QUERY, [accountId]);
  return rows.flatMap((row) => {
    const id = row.stripe_subscription_id;
    const status = row.status;
    if (typeof id !== "string" || typeof status !== "string") return [];
    return [{ id, status, livemode: row.livemode === true }];
  });
}
