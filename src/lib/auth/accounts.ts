/**
 * Mapping a Supabase Auth identity onto a Urdais account.
 *
 * This is the seam Phase 1 was built around. Supabase proves *who someone is*;
 * this module turns that proof into the `identity.accounts` row that Urdais's own
 * entitlement system is keyed on. Supabase never becomes Urdais's account table,
 * which is why `identity.accounts` still has no foreign key to `auth.users` and
 * why a different provider could be added without a migration.
 *
 * ## The account key is `(auth_provider, auth_subject)`, and email is not identity
 *
 * `auth_subject` is the Supabase user's UUID, which never changes for the life of
 * the user. `email` is a denormalised support copy: it is read to help an operator
 * find someone, and it is never used to look an account up. That distinction is
 * the whole reason a user can change their email address without becoming a
 * different Urdais subscriber — a property `emailChangeKeepsAccount` in the tests
 * pins down directly.
 *
 * The support copy is refreshed on resolution when it has drifted, which is the
 * only moment Urdais reliably learns that Supabase's value changed: there is no
 * webhook for it and polling `auth.users` would be a second source of truth.
 *
 * ## Why this writes through `pg` and not the Supabase client
 *
 * RLS is on with no policies and neither `anon` nor `authenticated` holds any
 * privilege on the `identity` schema, so a browser session literally cannot read
 * or write these rows — by construction, not by convention. Provisioning runs on
 * the server's privileged `pg` connection, the same one every other Urdais read
 * uses. Phase 1's RLS posture is therefore unchanged by this phase: no policy was
 * added, and no grant was widened.
 */

import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

/** The provider name Supabase-authenticated accounts are stored under. */
export const SUPABASE_AUTH_PROVIDER = "supabase";

export type UrdaisAccount = {
  readonly id: string;
  /** The support copy as it now stands in the database. */
  readonly email: string | null;
};

const SELECT_ACCOUNT = `
  select id, email
    from identity.accounts
   where auth_provider = $1 and auth_subject = $2
`;

/**
 * Insert-or-return. `on conflict` is what makes two simultaneous first requests
 * from the same new user safe: the loser of the race updates instead of failing
 * the unique constraint, and both observe the same id.
 *
 * The email is set on conflict as well, so the concurrent path syncs the support
 * copy for free rather than leaving it to the next request.
 */
const UPSERT_ACCOUNT = `
  insert into identity.accounts (auth_provider, auth_subject, email)
       values ($1, $2, $3)
  on conflict (auth_provider, auth_subject) do update
          set email = excluded.email
    returning id, email
`;

const SYNC_EMAIL = `
  update identity.accounts
     set email = $3
   where auth_provider = $1 and auth_subject = $2
returning id, email
`;

/**
 * An unfinished account deletion for this identity (Phase 7D).
 *
 * A deletion removes the account row before it deletes the Auth user, so for a
 * moment -- or, if Auth deletion fails, until it is retried -- a valid session
 * exists with no account. Provisioning a fresh account for it then would silently
 * hand a half-deleted identity a new, usable Urdais account. A completed deletion
 * has dropped the subject, so it never blocks the same email signing up again
 * with a new Auth user.
 */
const DELETION_IN_FLIGHT = `
  select 1
    from identity.account_deletions
   where auth_provider = $1 and auth_subject = $2
`;

/** Thrown instead of provisioning an account for an identity being deleted. */
export class AccountDeletionPendingError extends Error {
  constructor() {
    super("this identity has an account deletion in progress");
    this.name = "AccountDeletionPendingError";
  }
}

function readAccount(rows: readonly Record<string, unknown>[]): UrdaisAccount | null {
  const row = rows[0];
  if (!row || typeof row.id !== "string") return null;
  return { id: row.id, email: typeof row.email === "string" ? row.email : null };
}

/**
 * The Urdais account for this Supabase subject, provisioning it on first sight.
 *
 * Deterministic, idempotent and concurrency-safe: the same subject always
 * resolves to the same account id, a repeat call writes nothing, and two
 * concurrent first calls converge on one row.
 *
 * Shaped to cost one query in the steady state. A read comes first because the
 * overwhelmingly common case is an existing account whose email has not changed;
 * going straight to the upsert would instead write — and fire the `updated_at`
 * trigger — on every authenticated request.
 *
 * `subject` must come from a verified Supabase session. There is no code path in
 * Urdais that passes a browser-supplied value here, and `accounts.test.ts`
 * asserts the callers.
 */
export async function resolveUrdaisAccount(
  sql: TokenSqlExecutor,
  identity: { readonly subject: string; readonly email: string | null },
  provider: string = SUPABASE_AUTH_PROVIDER,
): Promise<UrdaisAccount> {
  const subject = identity.subject.trim();
  if (subject === "") throw new Error("cannot provision an account for an empty auth subject");

  // The column is constrained to a normalised lowercase address, so normalise
  // here rather than letting the check constraint reject a legitimate sign-in.
  const email = identity.email?.trim().toLowerCase() || null;

  const existing = readAccount((await sql.query(SELECT_ACCOUNT, [provider, subject])).rows);

  if (!existing) {
    if ((await sql.query(DELETION_IN_FLIGHT, [provider, subject])).rows.length > 0) throw new AccountDeletionPendingError();
    const created = readAccount((await sql.query(UPSERT_ACCOUNT, [provider, subject, email])).rows);
    if (!created) throw new Error("account provisioning returned no row");
    return created;
  }

  if (existing.email === email) return existing;

  // Drifted support copy. The account identity is untouched: this is an UPDATE
  // keyed on (provider, subject), so it can only ever rewrite one column of the
  // row that already existed. It cannot create, replace or re-key an account.
  const synced = readAccount((await sql.query(SYNC_EMAIL, [provider, subject, email])).rows);
  // A null here means the row vanished between the two statements — a deleted
  // account mid-request. Returning the stale read is wrong; the id is still
  // correct, so report what we know and let the caller's entitlement read come
  // back empty.
  return synced ?? existing;
}
