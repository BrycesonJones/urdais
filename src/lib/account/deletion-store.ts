/**
 * The durable account-deletion record (`identity.account_deletions`) and the
 * local writes each stage makes.
 *
 * Stages, each committed on its own and each safe to repeat:
 *
 *   requested               the reader confirmed; nothing irreversible yet
 *   billing_terminated      Stripe can no longer bill; entitlement revoked (same tx)
 *   local_cleanup_complete  identity.accounts row deleted; billing rows detached
 *   auth_deleted            the Supabase Auth user is gone
 *   complete                identifiers nulled; the record is history
 *
 * Every transition is `where state = <previous>`, so a duplicate or concurrent
 * attempt that lost the race changes nothing. A lease (`lease_until`) keeps two
 * submissions from running the network-bound stages at the same time, without
 * holding a database lock across a Stripe call.
 */

import { revokeEntitlementForDeletion } from "@/lib/billing/store";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

export type DeletionState = "requested" | "billing_terminated" | "local_cleanup_complete" | "auth_deleted" | "complete";

export type DeletionRecord = {
  readonly id: string;
  readonly accountId: string | null;
  readonly authSubject: string | null;
  readonly stripeCustomerId: string | null;
  readonly state: DeletionState;
};

const STATES: readonly DeletionState[] = ["requested", "billing_terminated", "local_cleanup_complete", "auth_deleted", "complete"];

function readRecord(row: Record<string, unknown> | undefined): DeletionRecord | null {
  if (!row || typeof row.id !== "string" || !STATES.includes(row.state as DeletionState)) return null;
  return {
    id: row.id,
    accountId: typeof row.account_id === "string" ? row.account_id : null,
    authSubject: typeof row.auth_subject === "string" ? row.auth_subject : null,
    stripeCustomerId: typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : null,
    state: row.state as DeletionState,
  };
}

const COLUMNS = "id, account_id, auth_subject, stripe_customer_id, state";

export const IN_FLIGHT_DELETION_SQL = `
  select ${COLUMNS} from identity.account_deletions
   where auth_provider = $1 and auth_subject = $2
`;

export async function readInFlightDeletion(sql: TokenSqlExecutor, provider: string, subject: string): Promise<DeletionRecord | null> {
  return readRecord((await sql.query(IN_FLIGHT_DELETION_SQL, [provider, subject])).rows[0]);
}

export const DELETION_FOR_ACCOUNT_SQL = `
  select ${COLUMNS} from identity.account_deletions where account_id = $1
`;

export async function readDeletionForAccount(sql: TokenSqlExecutor, accountId: string): Promise<DeletionRecord | null> {
  return readRecord((await sql.query(DELETION_FOR_ACCOUNT_SQL, [accountId])).rows[0]);
}

/**
 * Open a deletion, or return the one already in flight for this identity.
 * The partial unique index makes a duplicate submission resolve to one record.
 */
export const OPEN_DELETION_SQL = `
  insert into identity.account_deletions (account_id, auth_provider, auth_subject, stripe_customer_id)
  values ($1, $2, $3, $4)
  on conflict (auth_provider, auth_subject) where auth_subject is not null do nothing
  returning ${COLUMNS}
`;

export async function openDeletion(
  sql: TokenSqlExecutor,
  input: { readonly accountId: string; readonly provider: string; readonly subject: string; readonly stripeCustomerId: string | null },
): Promise<DeletionRecord> {
  const created = readRecord((await sql.query(OPEN_DELETION_SQL, [input.accountId, input.provider, input.subject, input.stripeCustomerId])).rows[0]);
  if (created) return created;
  const existing = await readInFlightDeletion(sql, input.provider, input.subject);
  if (existing) return existing;
  throw new Error("deletion record vanished between insert and read");
}

/** Take the lease for up to two minutes. Null when another attempt holds it. */
export const ACQUIRE_LEASE_SQL = `
  update identity.account_deletions
     set lease_until = now() + interval '2 minutes', attempts = attempts + 1, last_error = null
   where id = $1 and state <> 'complete' and (lease_until is null or lease_until < now())
  returning ${COLUMNS}
`;

export async function acquireLease(sql: TokenSqlExecutor, id: string): Promise<DeletionRecord | null> {
  return readRecord((await sql.query(ACQUIRE_LEASE_SQL, [id])).rows[0]);
}

export const RELEASE_LEASE_SQL = `
  update identity.account_deletions set lease_until = null, last_error = $2 where id = $1
`;

/** Release the lease, recording a short failure code (never a raw provider error). */
export async function releaseLease(sql: TokenSqlExecutor, id: string, errorCode: string | null): Promise<void> {
  await sql.query(RELEASE_LEASE_SQL, [id, errorCode]);
}

/**
 * Billing is terminated: advance, and revoke premium in the same transaction.
 *
 * Updating the deletion row takes its lock, which waits for any webhook holding
 * it `for share` -- so no grant can land after this revocation.
 */
export const MARK_BILLING_TERMINATED_SQL = `
  update identity.account_deletions
     set state = 'billing_terminated', billing_terminated_at = now()
   where id = $1 and state = 'requested'
`;

export async function markBillingTerminated(sql: TokenSqlExecutor, record: DeletionRecord): Promise<void> {
  await inTransaction(sql, async () => {
    await sql.query(MARK_BILLING_TERMINATED_SQL, [record.id]);
    // Through the billing store, which stays the one module that writes
    // premium_entitlements.
    if (record.accountId) await revokeEntitlementForDeletion(sql, record.accountId);
  });
}

/**
 * Remove the account. The entitlement cascades away; billing customer and
 * subscription rows survive with `account_id` null and `detached_at` stamped.
 * A repeat finds no account and only advances the state.
 */
export const DELETE_ACCOUNT_SQL = `delete from identity.accounts where id = $1`;

export const MARK_LOCAL_CLEANUP_SQL = `
  update identity.account_deletions
     set state = 'local_cleanup_complete', local_cleanup_completed_at = now()
   where id = $1 and state = 'billing_terminated'
`;

export async function removeLocalAccount(sql: TokenSqlExecutor, record: DeletionRecord): Promise<void> {
  await inTransaction(sql, async () => {
    if (record.accountId) await sql.query(DELETE_ACCOUNT_SQL, [record.accountId]);
    await sql.query(MARK_LOCAL_CLEANUP_SQL, [record.id]);
  });
}

export const MARK_AUTH_DELETED_SQL = `
  update identity.account_deletions
     set state = 'auth_deleted', auth_deleted_at = now()
   where id = $1 and state = 'local_cleanup_complete'
`;

export async function markAuthDeleted(sql: TokenSqlExecutor, id: string): Promise<void> {
  await sql.query(MARK_AUTH_DELETED_SQL, [id]);
}

/** Finish: drop the identifiers. The Stripe Customer id stays as the audit trail. */
export const COMPLETE_DELETION_SQL = `
  update identity.account_deletions
     set state = 'complete', completed_at = now(), auth_subject = null, account_id = null, lease_until = null, last_error = null
   where id = $1 and state = 'auth_deleted'
`;

export async function completeDeletion(sql: TokenSqlExecutor, id: string): Promise<void> {
  await sql.query(COMPLETE_DELETION_SQL, [id]);
}

async function inTransaction(sql: TokenSqlExecutor, work: () => Promise<void>): Promise<void> {
  await sql.query("begin", []);
  try {
    await work();
    await sql.query("commit", []);
  } catch (error) {
    try {
      await sql.query("rollback", []);
    } catch {
      // A failed rollback leaves the connection unusable, not the data wrong.
    }
    throw error;
  }
}
