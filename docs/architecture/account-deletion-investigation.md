# Account deletion — investigation and proposal (Phase 7D, pre-implementation)

**Status: investigation only. Nothing in this document is implemented.** Written 1 October 2026 against `main` at `54ccd07`. Phase 7D stopped here because several of its stop conditions were met (§6). The decisions in §7 are needed before any deletion code is written.

> **Cancel subscription and Delete account are intentionally different operations.** Cancellation preserves access through the already-paid billing period. Account deletion terminates the Urdais relationship immediately and forfeits remaining paid access.
>
> **Urdais must never report an account successfully deleted while knowingly leaving that account with an active or potentially billable Stripe subscription.**
>
> **A recreated account using the same email is a new Urdais account and does not inherit the deleted account's entitlement or billing relationship.**

---

## 1. What deleting `identity.accounts` does today (verified)

Foreign keys in `identity`, read from `pg_constraint` after applying every migration:

| Table | FK | On delete |
| --- | --- | --- |
| `premium_entitlements.account_id` | → `accounts.id` | **CASCADE** |
| `billing_customers.account_id` (also its **primary key**) | → `accounts.id` | **CASCADE** |
| `billing_subscriptions.account_id` | → `accounts.id` | **CASCADE** |
| `billing_subscriptions (stripe_customer_id, livemode)` | → `billing_customers` | NO ACTION |
| `billing_events` | none | append-only by trigger; no UPDATE/DELETE grant |

Demonstrated on a local Postgres with every migration applied, using the real `processStripeEvent` and `resolveUrdaisAccount`:

1. Subscribed account: 1 account, 1 customer, 1 subscription, 1 entitlement, 1 event.
2. `delete from identity.accounts`: **0 / 0 / 0 / 0**, with **1 event** remaining. The customer mapping, the entire subscription history and the entitlement are destroyed. Only the ledger survives, and it holds no account reference: event id, type, livemode, created, subscription id.
3. **Late webhook after deletion.** Stripe's subscription metadata still carries `urdais_account_id`, so `resolveAccountId` returns the deleted id. `applySubscriptionEvent` then hits an FK violation on `billing_subscriptions`. The transaction rolls back, the event is not recorded, and the handler answers `failed`, so **Stripe retries for days**. It cannot resurrect anything, because the entitlement insert would fail on the same FK. But it is a retry storm, and a persistently failing endpoint can be disabled by Stripe, which would stop reconciliation for every customer.
4. **Same Supabase user signs in again** while the Auth user still exists: `resolveUrdaisAccount` silently provisions a **new** account, with no entitlement. That is correct for same-email recreation *after* Auth deletion. During a half-finished deletion it is a problem: an Auth user whose deletion failed would silently get a fresh account.

The cascade alone would decide the retention policy (destroy all billing history), which this phase forbids. Retention therefore needs a migration.

**Personal data inventory.**
- `accounts.email` is the only direct personal field in Urdais.
- `auth_subject` is the Supabase user UUID (pseudonymous).
- Billing rows hold only Stripe ids, statuses and timestamps.
- The ledger holds no personal data.
- Stripe Customers are created with the reader's **email** and metadata `urdais_account_id`.

---

## 2. Supabase Auth deletion: no supported path exists in the current architecture

The supported mechanism is `auth.admin.deleteUser(id)`, which requires a Supabase **secret key** (`sb_secret_…`). Urdais has none, by explicit design. `.env.example` reads: "SUPABASE_SERVICE_ROLE_KEY is deliberately NOT used and should not be set … If you ever find yourself adding one, check first that you are not about to move an access decision into the browser." `src/lib/auth/config.ts` actively rejects a secret key in the public variable.

Production's `DATABASE_URL` connects as `postgres.<ref>`, which can technically `delete from auth.users` (Supabase's FKs cascade identities, sessions, refresh tokens and one-time tokens). The 7D brief forbids raw `auth.users` manipulation unless the architecture already supports it, and it does not.

**This is stop condition "deleting the Supabase Auth user safely requires unsupported/raw manipulation".**

---

## 3. Stripe facts that shape deletion

- **Finding billable subscriptions.** Local `billing_subscriptions` can be stale. Stripe's `subscriptions.list({ customer, status: "all" })` is the authoritative read: anything not `canceled` / `incomplete_expired` is potentially billable.
- **Immediate cancellation.** `subscriptions.cancel(id, { prorate: false, invoice_now: false })` cancels immediately, issues no refund (forfeiture, as decided), and creates no final invoice. It also converts a scheduled `cancel_at_period_end` cancellation into an immediate one. Cancelling an already-canceled subscription errors, so the workflow must re-list rather than blindly cancel. That re-list is also what makes retries idempotent.
- **`past_due` / `unpaid`.** Cancelling the subscription does **not** void its already-finalized open invoice. Depending on account settings, Stripe may continue collection attempts on it. Whether deletion should **void** open invoices is a billing-policy decision (§7, D5).
- **Stripe Customer.** It should not be deleted: it holds invoices, payments and any dispute history, and deleting it would damage financial and support records. It retains the reader's **email** and the `urdais_account_id` metadata. Clearing the metadata (or the email) is a per-deletion **live Stripe mutation** (§7, D4).

---

## 4. Proposed design (for approval, not implemented)

### Retention model: detach, don't cascade (new migration)

| Data | On deletion | Why |
| --- | --- | --- |
| `accounts` row (email, auth subject) | **deleted** | personal; exists only to operate the account |
| Supabase Auth user, identities, sessions, refresh tokens | **deleted** | personal; ends authentication |
| `premium_entitlements` row | **deleted** (cascade kept) | an authorization object, not a record; subscription history covers "who paid" |
| `billing_customers` | **kept, detached**: `account_id` becomes nullable with `on delete set null`; PK moves to `stripe_customer_id`; `detached_at` added | links Urdais to Stripe's financial record for support, disputes and reconciliation; no personal data |
| `billing_subscriptions` | **kept, detached**: `account_id` nullable, `on delete set null`, `detached_at` | subscription history for disputes and reconciliation; ids, statuses, timestamps only |
| `billing_events` | **kept unchanged** | idempotency ledger; already account-free and append-only |
| `account_deletions` (new) | durable workflow record, keyed by deletion id | resumability (below). Holds the account id and auth subject only until completion, then nulls both |

No retention *period* is chosen. Detached rows are identifiable by `detached_at`, so a later documented policy can purge or keep them. RLS-on/no-policies, no public grants, service-role-only and append-only protections are all kept and re-asserted in the migration.

### Workflow (resumable, idempotent)

A durable `account_deletions` row with states `requested → billing_terminated → local_removed → complete`. Every step reads current truth and is safe to repeat.

1. Authenticated session + recent authentication (D3) + typed `DELETE`. The server resolves identity, account and Customer; the form carries nothing but the confirmation word.
2. Claim or resume the deletion record. A duplicate submit resumes the same record.
3. **Billing termination.** No Customer → nothing to do. Otherwise list the Customer's subscriptions at Stripe; cancel each potentially billable one immediately; **re-list and require zero billable** (plus open-invoice handling per D5). Any Stripe failure → **stop; account untouched and still manageable**; truthful error. Then mark `billing_terminated`.
4. From `billing_terminated` on, `resolveViewer` denies premium for that account, and `resolveUrdaisAccount` refuses to provision for that auth subject.
5. One transaction: delete entitlement, delete account (billing rows detach), mark `local_removed`.
6. Delete the Auth user (D1). On failure, the tombstone keeps that subject from getting a usable account; retry resumes at step 6.
7. Mark `complete`, null the stored identifiers, clear cookies, redirect to a public "Your Urdais account has been deleted." page.

**Webhook change.** If the named account does not exist, or the Customer mapping is detached, store the subscription **detached** and record the event, never writing an entitlement, and answer `processed`. That removes the retry storm in §1 (3) and makes resurrection structurally impossible.

**Same-email recreation.** A new Auth user means a new account. The detached Customer is never re-attached, so a later Checkout creates a new Customer.

---

## 5. What could not be verified here

The brief requires a Stripe **test-mode** lifecycle (active, scheduled, past_due, canceled, cancellation failure, retry, webhook race). This environment has no Stripe test credentials and no network route to `api.stripe.com`. The Phase 7C sandbox confirmed it is unreachable. Supabase Auth admin deletion likewise cannot be exercised without a secret key and a reachable project.

---

## 6. Stop conditions met

| Stop condition (7D §30) | Finding |
| --- | --- |
| Deleting the Supabase Auth user requires unsupported/raw manipulation | No secret key by design; the only existing path is raw `auth.users` SQL (§2) |
| FK cascades make billing retention impossible without a migration | Confirmed (§1) |
| Webhook reconciliation vs deleted state | Does not recreate, but fails and retries indefinitely (§1 (3)) |
| Another billing/product policy decision is required | Open-invoice handling, Stripe Customer metadata, recent-auth window (§7) |
| Production mutation | Clearing Stripe Customer metadata on deletion would be a live mutation per deletion (D4) |

---

## 7. Decisions needed

- **D1. Auth deletion mechanism.**
  - *Recommended:* add a server-only `SUPABASE_SECRET_KEY` (`sb_secret_…`), used by one module that calls only `auth.admin.deleteUser`. This is a new environment variable in Vercel production and reverses the documented "no secret key" decision.
  - *Alternative:* raw `delete from auth.users` over `DATABASE_URL`. It works in Supabase but is the path the brief forbids.
- **D2. Retention migration.** Approve detach-not-cascade (§4) and the `account_deletions` table.
- **D3. Recent authentication.** The Auth server returns `last_sign_in_at` on `getUser()`, a server-confirmed timestamp.
  - *Proposal:* deletion requires a sign-in within the last **15 minutes**; otherwise the reader re-verifies with the existing emailed-code flow, scoped to their own address, before the button works. Choose the window, and confirm re-verification is in scope.
- **D4. Stripe Customer on deletion.** Keep it (recommended). Choose: leave it untouched; clear `urdais_account_id` metadata; or also clear email/name. Either clearing option is a live Stripe write on every deletion.
- **D5. Open invoices of `past_due` / `unpaid` subscriptions.** Void them on deletion (the relationship is over; nothing further is collected), or leave Stripe's collection settings to decide.
- **D6. Test-mode verification.** Provide Stripe test keys, a network route to Stripe, and a Supabase dev project secret key to this environment. Otherwise the Stripe/Auth steps are verified by you locally against test mode, with my scripts.
