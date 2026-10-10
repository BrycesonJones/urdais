# Account deletion

**Status: internal architecture and operations document. Not routed publicly, not registered in the docs catalog.** Written 1 October 2026, Phase 7D. Supersedes the proposal in `account-deletion-investigation.md`, which remains the record of what was found before implementation.

> **Cancel subscription and Delete account are intentionally different operations.** Cancellation preserves access through the already-paid billing period. Account deletion terminates the Urdais relationship immediately and forfeits remaining paid access.
>
> **Account deletion stops future subscription billing but does not automatically refund prior payments, prorate unused time, forgive debt, or void an already-issued invoice.**
>
> **Urdais must never report an account successfully deleted while knowingly leaving that account with an active or potentially future-billable Stripe subscription.**
>
> **A deleted account is a terminal authorization state. Late Stripe events cannot recreate the account or entitlement.**
>
> **A recreated account using the same email is a new Urdais account and does not inherit historical billing or entitlement.**

---

## 1. Cancel vs delete

| | Cancel subscription (Customer Portal, 7C) | Delete account (7D) |
| --- | --- | --- |
| When it takes effect | end of the paid period (the Portal sets `cancel_at`; see §11) | now |
| Premium access | kept until the period ends | ends now |
| Unused paid time | used | **forfeited**, no refund, no proration |
| Already-issued unpaid invoice | unchanged | **not forgiven or voided**; stays open, automatic collection stops (§5) |
| Urdais account | kept | deleted |
| Supabase Auth user | kept | deleted |
| Billing history | attached | retained, **detached** |

---

## 2. Data deleted and data retained

| Data | After deletion | Why |
| --- | --- | --- |
| `identity.accounts` row (email, auth subject) | **deleted** | personal; exists only to operate the account |
| Supabase Auth user, identities, sessions, refresh tokens | **deleted** (Admin API) | ends authentication everywhere |
| `premium_entitlements` row | **deleted** (cascade) | authorization object, not a record |
| `billing_customers` row | **retained, detached**: `account_id` null, `detached_at` set | the Stripe Customer reference: invoices, refunds, disputes, reconciliation |
| `billing_subscriptions` rows | **retained, detached** | subscription ids, statuses, periods, timestamps |
| `billing_events` | **unchanged** | append-only idempotency ledger; already holds no account or personal data |
| `account_deletions` row | **retained**, identifiers nulled at completion | audit of when billing was terminated and the account removed; keeps the terminated Customer id |
| Stripe Customer | **retained**; `urdais_account_id` metadata **unset** | Stripe's financial record. Email and history are left untouched |
| Stripe Subscriptions | **cancelled, retained by Stripe** | their own `urdais_account_id` metadata cannot be edited once cancelled; late events carrying it are handled as detached |

**Personal data retained by Urdais after a completed deletion: none.**
- No email.
- No Supabase user id: `auth_subject` is nulled at completion.
- No Urdais account id on any row: `account_id` is null on billing rows and on the deletion record.

What remains is Stripe identifiers, statuses and timestamps. Stripe itself retains the Customer's email under its own obligations.

**No retention period is chosen.** Detached rows are identifiable by `detached_at`. A future, documented policy can purge or keep them without touching any live account. Legal/accounting retention durations are an open question (§10).

---

## 3. Schema (`20261026100000_account_deletion_retention.sql`)

- **`billing_customers`**
  - PK moved from `account_id` to `stripe_customer_id`.
  - `account_id` is nullable, with FK `on delete set null`.
  - Partial unique index on `account_id where not null`, so there is still one Customer per live account.
  - `detached_at` added.
- **`billing_subscriptions`**: `account_id` nullable, FK `on delete set null`, `detached_at` added.
- **Detachment stamping.** A `BEFORE UPDATE` trigger sets `detached_at` when the FK's SET NULL fires.
- **Never re-attached.** The check `(account_id is null) = (detached_at is not null)` means a detached row can never be given an account again. A recreated account, or a webhook naming the deleted account, structurally cannot inherit history.
- **`premium_entitlements`**: still `on delete cascade`.
- **`account_deletions`**: the workflow record.
  - State check, plus a per-stage timestamp check.
  - Identifiers must be null at `complete`.
  - `last_error` restricted to short codes, never provider text.
  - Partial unique indexes: one in-flight deletion per identity and per account.
  - `service_role` has select/insert/update, **no delete**.
- **Preserved**: RLS on, zero policies, no `anon`/`authenticated`/`PUBLIC` grants, and the append-only ledger. The migration asserts these, and `supabase/tests/710_account_deletion.sql` tests them.

---

## 4. Workflow (`src/lib/account/deletion.ts`)

```
preflight   authenticated · typed "DELETE" · session authenticated ≤ 15 min ago ·
            SUPABASE_SECRET_KEY configured · Stripe reachable if the account has a Customer
            ── any failure: nothing changed
requested   identity.account_deletions row opened (or the in-flight one resumed)
            Stripe: list ALL subscriptions of the account's Customer; cancel every
            potentially billable one (prorate:false, invoice_now:false); RE-LIST and
            require none billable
            ── failure: account intact, still entitled, billing still manageable
billing_terminated      + entitlement revoked, same transaction
            Stripe Customer: unset urdais_account_id
            delete identity.accounts → entitlement cascades, billing rows detach
local_cleanup_complete
            auth.admin.deleteUser(subject)   (404 = already done)
auth_deleted
            ── analytics in use (PostHog or erasure credentials configured): held
               here, account id kept, last_error 'analytics_erasure_pending'; the
               reader is told it is done. PostHog erasure is tried after the
               response and daily by /api/cron/analytics-erasure until accepted.
complete    auth_subject and account_id nulled
```

- **Stripe is authoritative at the boundary.** Local rows may be stale, so the decision uses Stripe's own list, and the re-list *after* cancelling is the verdict. Multiple subscriptions are all cancelled; one that fails leaves the deletion at `requested`.
- **Billing management survives until billing is terminated.** No local or Auth deletion happens before `billing_terminated`.
- **Premium ends at the irreversible boundary.** The revocation commits with `billing_terminated`. A deletion that stalls later never leaves access active.
- **Never cross-account.** Only the Customer mapped to the session's account is listed or modified.

### Behaviour by state

| State | Deletion |
| --- | --- |
| never subscribed | no Stripe call; deleted |
| active | cancelled immediately; deleted |
| active, cancellation scheduled | converted to immediate cancellation; remaining paid time forfeited; deleted |
| `past_due` / `unpaid` | cancelled immediately (no new billing periods); open invoice not voided (§5); deleted |
| `paused` / `incomplete` / `trialing` | cancelled immediately; deleted |
| already canceled | satisfied; deleted |
| manual (comp) entitlement | access revoked; deleted |
| Stripe unreachable / Customer in the other mode / cancellation refused | **not deleted**; truthful error |

### Recent authentication (step-up)

- **Window.** Deletion starts only if **this session** authenticated within 15 minutes, inclusive at exactly 15:00 (`src/lib/auth/recent-auth.ts`). Otherwise `/account/delete` offers "Email a code to {your address}".
- **Code flow.** The code is sent to, and verified against, the session's own address with the existing passwordless primitives. Success returns to `/account/delete`. Wrong, expired or replayed codes are refused by Supabase and stay on the code form.
- **Signal: the session's `amr` timestamp from verified claims (`getClaims()`), not `user.last_sign_in_at`.**
  - **This deliberately differs from the original Phase 7D instruction**, which named `last_sign_in_at`. The change was approved on 1 October 2026.
  - `last_sign_in_at` is a property of the **user**, refreshed by a sign-in on *any* device. It therefore cannot establish that **this session** authenticated recently: a stale or stolen session elsewhere would pass whenever the owner signed in on their phone.
  - The access token's `amr` entries are **per session**. They record how and when this session authenticated, they survive token refresh (which is not re-authentication), and they are reset by verifying an emailed code.
  - The token is verified before its claims are read, and its `sub` must match the identity being deleted. A browser-supplied timestamp is never trusted.
- **Resuming** a deletion already past `billing_terminated` needs only the session. The irreversible part is done.

---

## 5. Open invoices after cancellation (verified in Stripe test mode)

Stripe documents that cancelling a subscription "disables creating new invoices and stops automatic collection of all outstanding invoices from the subscription". Its `open` and `draft` invoices get `auto_advance = false`, which pauses automatic collection and reminder emails. The invoice is **not voided**: it stays open and can still be paid or collected manually.

So after deletion:
- **No new periods.** No new billing periods are created.
- **No automatic charges.** No automatic retry charges the old invoice.
- **The debt is not forgiven.**

The confirmation page says this to `past_due` / `unpaid` readers only. Urdais does not void, refund or mark anything uncollectible.

*Evidence:* reproduced in Stripe test mode on 1 October 2026 with a test clock (§11, scenario 3). After deletion the renewal invoice stayed `open` with `auto_advance=false`, `next_payment_attempt` null and the full amount outstanding. Advancing the clock three weeks through the retry window produced no further charge attempt, PaymentIntent or invoice.

---

## 6. Webhook races

`applySubscriptionEvent` (`src/lib/billing/store.ts`) now, inside its transaction:

1. Takes `for key share` on the named account. If the account no longer exists, the subscription is stored **detached** against the retained Customer, the event is recorded, **no entitlement is written**, and the answer is success. That ends the FK-violation retry storm found in the investigation.
2. Takes `for share` on the account's deletion record. Past `requested`, the entitlement is **withheld** whatever the status says. Because the deletion's state change takes that row's lock, a grant can never commit after the deletion's revocation.
3. With neither an account nor a retained Customer, nothing is written and the event is `rejected`, as before.

Duplicate events are refused by the ledger's primary key. Stale events are refused by the `last_event_at` guard. Nothing in the webhook path can insert into `identity.accounts`.

---

## 7. Same-email recreation

A new sign-up after deletion is a new Supabase user (new subject), and so a new `identity.accounts` row. It has no entitlement, no subscriptions, and no Customer: the detached Customer can never be re-attached, so the first Checkout creates a new one through the normal path. Email is never used to infer ownership of history.

While a deletion is unfinished, `resolveUrdaisAccount` refuses to provision a new account for that identity (`AccountDeletionPendingError`). `resolveViewer` turns that into anonymous, which denies premium, and the hub shows "Account deletion in progress — Finish deleting account".

After completion, nothing in Urdais remembers the deleted subject. A browser still holding that user's unexpired token is refused only because `getUser()` asks Supabase, which answers `user_not_found`. That answer must therefore always be fresh: a replayed earlier success recreates the account (§11, "Recreated accounts"). `next.config.ts` disables Next's development HMR fetch cache for this reason.

---

## 8. Configuration

| Variable | Where | Notes |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | server only (never `NEXT_PUBLIC_`) | `sb_secret_…` of the **same** project as `NEXT_PUBLIC_SUPABASE_URL`. Used only by `src/lib/auth/admin.ts` for `auth.admin.deleteUser` |

**Production is unaffected until the key is set.** Without it, `/account/delete` says deletion isn't available, and the action refuses before doing anything. It never cancels billing and then stalls, and it never falls back to SQL against `auth.users`.

To activate (requires explicit approval):
1. Add `SUPABASE_SECRET_KEY` (UrdaisProd secret key) to Vercel **Production** only.
2. Apply `20261026100000_account_deletion_retention.sql` to UrdaisProd.
3. Redeploy.

Production verification is a separate, approved step.

---

## 9. Operations

### A stuck deletion

```sql
select id, state, attempts, last_error, requested_at, billing_terminated_at,
       local_cleanup_completed_at, auth_deleted_at, lease_until
  from identity.account_deletions
 where state <> 'complete'
 order by requested_at;
```

| State | Meaning | Recovery |
| --- | --- | --- |
| `requested`, `last_error` set | billing could not be verified or terminated; account intact | the reader retries; or an operator checks the Customer in Stripe |
| `billing_terminated` | Stripe terminated, premium revoked; metadata detach or local delete failed | the reader presses "Finish deleting account" on `/account` |
| `local_cleanup_complete` | account removed; Auth user not yet deleted (the session still works but gets no account) | the reader finishes; or an operator deletes the Auth user in the Supabase dashboard, then sets `state='auth_deleted', auth_deleted_at=now()` and lets the daily analytics-erasure cron complete it |
| `auth_deleted`, `last_error` `analytics_erasure_pending` / `_failed` | account and Auth user gone; waiting for PostHog to accept the analytics erasure (src/lib/account/analytics-erasure.ts). Expected, not stuck | none: the daily cron retries. Persisting `analytics_erasure_failed` means PostHog is refusing; check the key's `person:write` scope and the project id |
| `auth_deleted`, `last_error` `analytics_erasure_unconfigured` | as above, but `POSTHOG_PERSONAL_API_KEY` / `POSTHOG_PROJECT_ID` are missing | set them in Vercel Production; the next cron run settles every held row |
| `auth_deleted`, no `last_error` | only the final bookkeeping remains | the daily analytics-erasure cron completes it (the reader can no longer sign in to retry) |

Never delete an `account_deletions` row (the grant forbids it), never re-attach a detached billing row (the constraint forbids it), and never void or refund as part of recovery.

### Rollback

The migration is forward-only. Deletion can be **disabled** by unsetting `SUPABASE_SECRET_KEY`: the feature reports unavailable and nothing else changes. Completed deletions are not reversible, by design.

### Test-mode lifecycle check (to run where Stripe is reachable)

With **test** keys (`sk_test_…`), a test Price, and the UrdaisDev project:
1. Subscribe a fresh account with card `4242…`. Delete it, and confirm in Stripe that the subscription is `canceled` with no proration item.
2. Subscribe, schedule cancellation in the Portal, then delete. Confirm it becomes `canceled` immediately.
3. Use a test clock and card `…0341` to reach `past_due`. Delete. Confirm the subscription is `canceled` and the open invoice still `open` with `auto_advance=false`. Advance the clock and confirm no charge attempt.
4. Confirm `/account` is anonymous, the Auth user is gone in the UrdaisDev dashboard, and a new sign-up with the same email gets a new account and, at Checkout, a new Customer.

Run on 1 October 2026; all four pass. Results are in §11.

---

## 10. Open questions (not decided here)

- Legal/accounting retention period for detached billing rows and completed deletion records.
- Whether Stripe Customer email should eventually be redacted at Stripe for deleted accounts. It is untouched by decision in 7D.
- Whether an outstanding invoice should ever be written off for deleted accounts. It is not, by decision in 7D.

Follow-ups recorded outside 7D (§11):
- **7C scheduled-cancellation presentation.** Stripe's Portal schedules end-of-period cancellation as `cancel_at` with `cancel_at_period_end: false`. `/account` reads only `cancel_at_period_end`, so it shows that state as plain Active. The fix should recognise both representations, because `cancel_at_period_end: true` has also been observed through the API.
- **Deleted-identity tombstone (defense in depth).** A keyed, one-way digest of provider + Auth subject, kept after completion and checked by provisioning alongside the in-flight guard. Completed deletion would then permanently refuse that historical identity, without retaining a readable subject. Same-email sign-up stays allowed, because a new Supabase user gets a new subject. Needs its own review of key management, retention, collisions and recreation behaviour.

---

## 11. External verification (1 October 2026)

Run locally against **UrdaisDev** and the **Urdais Stripe sandbox** (API version `2026-08-26.dahlia`). The app was configured in `test` mode for `development`. UrdaisProd, live Stripe and the Phase 6 Customer were not touched. Migration `20261026100000` was applied to UrdaisDev with `supabase db push` after a version-by-version ledger diff (131 → 132, nothing else pending, nothing database-only). Browser steps used the real UI; Stripe, database and Auth state were read directly. Accounts A–F were disposable test identities.

### Lifecycle results

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Active subscription (A) | Subscription `canceled` at the deletion instant, reason `cancellation_requested`. No proration line, no new invoice, no pending items, balance 0. Deletion record went `requested` → `complete` in about 2.2 s on attempt 1. |
| 2 | Portal-scheduled cancellation (B) | See "Portal scheduled cancellation" below. Deletion cancelled it **immediately** (`ended_at` = deletion time, `cancel_at` cleared). Stripe refuses an upcoming-invoice preview for it. No refund, credit note or proration. |
| 3 | `past_due` (C, test clock, card `…0341`) | Subscription `canceled`. Renewal invoice stays `open`, `auto_advance=false`, `next_payment_attempt` null, full amount remaining. Clock advanced three weeks: `attempt_count` stayed 1, no new charge, PaymentIntent or invoice. The confirmation page showed the unpaid-invoice copy, and the hub showed "Payment issue". |
| 4 | Already canceled (D) | No Stripe cancellation call during deletion. Billing reached `billing_terminated` by verification alone. |
| — | Never subscribed | No Stripe Customer, no Stripe call, `complete` in about 0.6 s. |

In every billed case the Stripe Customer was **retained**. Only `urdais_account_id` was removed from its metadata, between `billing_terminated` and `local_cleanup_complete`. Locally, the Customer and subscription rows were kept with `account_id` null and `detached_at` set. The entitlement, account, Auth user and **all Auth sessions** were removed.

### Portal scheduled cancellation (observed)

On this API version the Customer Portal's "cancel at end of period" produced `status: active`, **`cancel_at_period_end: false`**, `cancel_at` = `current_period_end`, `canceled_at` set, reason `cancellation_requested`. The entitlement correctly stayed active, since status is its only input. Deletion is unaffected: it cancels every non-terminal subscription regardless of either field. The 7C presentation gap this exposes is recorded in §10.

### Auth, sessions and recovery

- **Step-up.** Inside 15 minutes the confirmation was offered directly. Past 15 minutes, reloading `/account/delete` asked for a code, and verifying it returned to the confirmation.
- **Other sessions.** Supabase Admin deletion removed the user and every session. A second browser holding a still-valid access token resolved anonymous: `getUser()` returned `403 user_not_found`. Once that token had expired, the proxy's refresh got `refresh_token_not_found` and the cookies were cleared.
- **Partial failure.** With a deliberately invalid (well-formed) `SUPABASE_SECRET_KEY`, deletion stopped at `local_cleanup_complete` with `last_error = auth_admin_error`, and showed the "subscription canceled … couldn't finish" message. The hub showed "Account deletion in progress — Finish deleting account". With the key restored, **Finish** completed on attempt 2 without repeating any Stripe call. The fault was a local environment change only and was reverted.
- **Same-email recreation.** A new sign-up with A's address got a new Auth user id, a new account and, at Checkout, a **new** Stripe Customer. A's Customer stayed detached with no subscriptions.

### Webhooks

- **Concurrent.** `customer.subscription.deleted` arriving between `billing_terminated` and local cleanup was stored with the entitlement **withheld**.
- **Late.** With the listener stopped during C's deletion, the real event was delivered after the account was gone. It was stored detached (`past_due` → `canceled`), with no account and no entitlement.
- **Idempotent.** Redelivering an already-processed event returned 200 with no ledger or state change. A tampered signature returned 400.

### Recreated accounts after deletion (found and fixed)

**What happened.** Two accounts were recreated for already-deleted Auth subjects:
- **B**, at 14:51:35 UTC, about 21 minutes after B's deletion completed. This was unexplained at the time.
- **E**, at 16:27:03 UTC, during a deliberate reproduction.

Both rows are kept in UrdaisDev as evidence. Neither has billing or an entitlement.

**What the evidence showed for E.** A temporary forensic trigger on `identity.accounts` (UrdaisDev only, not a migration, since removed) captured the writes:

| # | UTC | Write | Writer |
| --- | --- | --- | --- |
| 1 | 16:22:30.746 | INSERT (E signs up) | app's pooled backend, pid 1895017 |
| 2 | 16:27:03.872 | INSERT (E recreated after deletion) | same backend |
| 3 | 16:27:03.920 | UPDATE (concurrent render, conflict path) | same backend |
| 4 | 16:50:02.556 | INSERT (F signs up) | app's pooled backend, pid 1897203 |

All four writes used `resolveUrdaisAccount`'s own upsert statement. No external writer appeared. Supabase Auth logs show every `/auth/v1/user` call for E's token after deletion returned `403 user_not_found`, and none was made before write 2.

**Root cause.** The rows were written by `resolveUrdaisAccount`, called with a stale identity that Supabase never vouched for:
1. The write coincided with a Next.js **development hot reload**, which re-rendered a tab still holding E's unexpired token.
2. Next's Server Components HMR cache (`experimental.serverComponentsHmrCache`, on by default in dev) answered `getUser()`'s `GET /auth/v1/user` with the **200 stored while E existed**, without contacting Supabase.
3. With no account row and no in-flight deletion, provisioning inserted a new row.

In Next 16.3.4 that cache ignores the fetch's `cache` / `revalidate` options, and the only per-request bypass (`next: { internal: true }`) is private.

**What wasn't affected.** Deployed (non-dev) builds don't use this cache. The deletion itself had completed correctly.

**Fix.** `next.config.ts` sets `experimental.serverComponentsHmrCache: false`, so no request gets an HMR cache and every Auth lookup reaches Supabase. `getUser()` remains the authority; JWT claims are not substituted for it. `src/lib/auth/deleted-identity-replay.test.ts` drives Next's real patched fetch and request-cache decision with this config, and the real `resolveViewer` on `user_not_found`.

**Verification of the fix.** Repeated with a fresh account F:
- The setup matched E: two sessions, and the stale tab loaded `/account` while F existed.
- F was then deleted, and a hot reload was triggered the same way.
- Every render with F's still-valid token got a fresh `user_not_found` and resolved anonymous. `resolveUrdaisAccount` was never called, and no row or forensic write appeared.

**B.** Consistent with the same mechanism but not independently proven:
- Same insert-then-update pattern.
- The write came before any `/user` response in its burst, and all of B's `/user` calls returned 403.
- An unexplained session-mode PostgreSQL connection appears near it in the logs. That is correlation only, not shown to be the writer.

**Defense in depth.** Provisioning currently relies entirely on Supabase rejecting a deleted subject. The tombstone follow-up in §10 would refuse it independently.
