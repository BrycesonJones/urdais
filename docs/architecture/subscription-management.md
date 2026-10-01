# Subscription management

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 1 October 2026, Phase 7C. Builds on `account-hub.md` (7B) and `stripe-billing.md` (Phases 5–6).

> Returning from Stripe Customer Portal does not change Urdais authorization. Signed Stripe webhook reconciliation changes canonical billing state, and Urdais entitlement state determines premium authorization.
>
> Customer Portal access always resolves the Stripe Customer from the authenticated Urdais account server-side.
>
> Payment-issue accounts recover through billing management, not by creating a second subscription.

---

## 1. Ownership

| Urdais owns | Stripe Customer Portal owns |
| --- | --- |
| account identity; the subscription summary on `/account`; premium authorization (the entitlement); the entry into billing management and the return from it; reconciling Stripe state into Urdais; presenting that state truthfully | payment methods and card replacement; billing details; invoices and receipts; cancellation; anything else enabled in the Portal configuration |

Urdais renders no card field, no invoice list and no cancel button of its own, and stores no card data.

---

## 2. The journey

```
/account ── Manage subscription / Manage billing  (POST, a form with no fields)
   └─ openBillingPortalAction → startBillingPortal()
        session → Supabase identity → resolveUrdaisAccount → identity.billing_customers
        livemode must match this deployment's Stripe mode
        stripe.billingPortal.sessions.create({ customer, return_url: <appUrl>/account })
   └─ 303 → billing.stripe.com (Stripe-hosted)
   └─ "Return to Urdais" → /account   (reads webhook-reconciled state; changes nothing)
```

**One primitive.** `startBillingPortal()` in `src/lib/billing/checkout.ts`. It was introduced in Phase 5 for `/access/subscribed`; 7C reuses it and changes it in four ways:

- **Takes no arguments.** There is no parameter through which a Customer, an account or a return target can arrive. The action reads nothing from the form.
- **Resolves the account directly** (identity → `resolveUrdaisAccount`) instead of through `resolveViewer`. A database outage is now reported as *unavailable*, not mistaken for *signed out*.
- **Checks the Customer's `livemode`** against the deployment's Stripe mode.
- **Never throws.** A Stripe error or a missing session URL is a typed `unavailable`.

**Fixed return.** `return_url` is always `<NEXT_PUBLIC_APP_URL>/account`, built from the deployment's origin and never from the request. With no return target that anyone can supply, an open redirect is impossible. Account management starts and ends at the account, so no premium destination is carried through it.

**Returning proves nothing.** `/account` trusts no query parameter and grants or revokes nothing on arrival. It renders the state the webhooks have reconciled. If a change made in the Portal has not reconciled yet, the page shows the previous state, and the note under the button says "Changes can take a moment to appear here."

**A form, not a link.** Creating a Portal session is a side effect, so it never happens on a GET (prefetch, crawler, emailed link). Phase 7B's `/account/subscription` seam therefore did not become a launcher. It now redirects to `/account`.

---

## 3. Who may open the Portal

| Account | Hub action | Portal |
| --- | --- | --- |
| anonymous | — (sign in) | refused (`anonymous`). The action sends the reader to `/access/login?returnTo=%2Faccount` |
| never subscribed | **Subscribe** | refused (`no_customer`). **A Customer is never created to "manage" billing.** Customers are created only inside `startCheckout` |
| operator comp | none | refused (`no_customer`) |
| active | **Manage subscription** | its own Customer |
| active, cancellation scheduled | **Manage subscription** | its own Customer (the reader can resume before the period ends) |
| `past_due`, `unpaid` | **Manage billing** | its own Customer, to fix the payment method. **Never Checkout** |
| `incomplete` | none | first payment never completed; Stripe expires it within a day |
| `paused` | none | cannot arise today; the Portal cannot resume it |
| canceled | **Subscribe again** | not offered from the hub (see §8) |
| status unavailable | none | — |

Failures stay on `/account` with a short, true message that never includes internal detail:

- `no_customer` → "There is no billing account to manage yet. Nothing has been changed."
- `mode_mismatch`, Stripe unreachable or refusing, database unavailable → "Billing management isn't available right now. Nothing has been changed. Try again shortly."

None of them redirects to Checkout, creates a Customer, or retries with a different Customer.

---

## 4. Reconciliation

No Portal-specific path exists. Portal changes reach Urdais as `customer.subscription.updated` / `customer.subscription.deleted` on the existing signed endpoint (`/api/stripe/webhook`). The handler re-reads the subscription from Stripe, claims the event in the append-only ledger, and applies status + entitlement in one transaction guarded by `last_event_at`.

Verified end to end against a real local Postgres, using the real `processStripeEvent` and real SQL with only Stripe's re-read faked:

| Event | Subscription | Entitlement | Premium | Hub |
| --- | --- | --- | --- | --- |
| Portal: cancel at period end | `active`, `cancel_at_period_end` | active | allowed | Active until {date}, Cancellation scheduled, Manage subscription |
| Portal: resume | `active` | active | allowed | Active, Manage subscription |
| renewal fails | `past_due` | **revoked immediately** | denied | Payment issue, Manage billing |
| duplicate delivery | — | unchanged | — | ledger refuses the replay |
| Portal: card fixed, Stripe collects | `active` | **re-granted automatically**, original `granted_at` kept | allowed | Active |
| stale `past_due` arriving late | — | unchanged | — | `last_event_at` guard |
| period ends | `canceled` (`deleted`) | revoked, `revoked_at` set | denied | Canceled, Subscribe again |

Throughout: one customer row and one subscription row; events append-only.

> **Observed in Phase 7D verification (1 October 2026, Stripe API `2026-08-26.dahlia`):** the real Portal's "cancel at period end" sets `cancel_at` = `current_period_end` and leaves `cancel_at_period_end: false`. The hub reads only `cancel_at_period_end`, so it shows that state as plain Active rather than "Cancellation scheduled". The entitlement is unaffected. The follow-up is to recognise both representations (see `account-deletion.md` §10).

`cancel_at_period_end` is recorded, displayed, and **never** an entitlement input. Payment-method changes alone do not change subscription status, so they produce no entitlement change. Their effect arrives when Stripe's retry succeeds and the status moves.

---

## 5. Invariants

- **One Customer per account.** `billing_customers` is keyed on `account_id`, so the mapping is one row per account in each environment's database. The Portal only reads that row. Repeated opens create Portal sessions (Stripe objects with no billing effect) and nothing else.
- **No cross-account Portal.** The Customer is derived from the session's account. Another signed-in account resolves to its own row or to none.
- **Test/live isolation.** The `livemode` stored with the mapping must match the deployment's mode, on top of `billingAvailability()`'s existing key-mode check. Local development with live keys still resolves to `unavailable`.

---

## 6. `/access/subscribed`

This page still belongs to the purchase journey: `/access/complete` and every already-entitled redirect land there with the reader's destination. It is **no longer a billing-management home**. Its Manage subscription button is replaced by a link to `/account`. The Portal returns only to `/account`.

---

## 7. Portal configuration — NOT YET INSPECTED

Urdais passes no `configuration` to `billingPortal.sessions.create`, so Stripe uses the account's **default** Portal configuration in each mode. That configuration lives in the Stripe Dashboard, not in this repository. It could not be read from the Phase 7C build environment, which has no Stripe credentials and no network route to the Stripe API.

Before this phase is relied on in production, an operator must read the live default configuration (read-only: `GET /v1/billing_portal/configurations?is_default=true`) and confirm:

| Feature | Product policy |
| --- | --- |
| `features.subscription_cancel.enabled` | true |
| `features.subscription_cancel.mode` | **`at_period_end`**. If it is `immediately`, changing it is a Dashboard change that needs approval |
| `features.subscription_cancel.proration_behavior` | `none` |
| `features.subscription_update.enabled` | **false**: one plan, no quantity changes, no plan switching |
| `features.payment_method_update.enabled` | true: the past_due recovery path depends on it |
| `features.invoice_history.enabled` | true |
| `features.customer_update` | email / address as preferred; Urdais never reads the Stripe email back as identity |
| `default_return_url` | irrelevant: Urdais always passes `return_url` |

If no default configuration has been saved in live mode, session creation fails, and the hub reports *Billing management isn't available right now*. It fails safely, but management will not work until a configuration exists.

---

## 8. Open product decisions

- **Billing history for canceled accounts.** A canceled account keeps its Customer, so the Portal would still show past invoices. The hub offers only *Subscribe again*, keeping one billing action per state. Adding a quiet "Billing history" link is a one-line change in `actionFor` once the Portal configuration is confirmed. What a canceled Customer can *do* in the Portal depends on `subscription_update`.
- **Incomplete.** No action is offered. If abandoned first payments turn out to be common, Stripe's hosted invoice page is the recovery path, not the Portal.

---

## 9. Phase 7D implications

> **Resolved in Phase 7D**: see `account-deletion.md`. Billing history is retained detached; a scheduled cancellation becomes immediate on deletion; open invoices are not voided.

- A canceled account still has a Stripe Customer with invoices. Deleting the Urdais account cascades away the `billing_customers` row that the Portal resolves through. After that, nobody can reach those invoices from Urdais.
- An account with a scheduled cancellation is still entitled and still billed until the period ends. "Delete account" during that window has to decide between waiting and cancelling immediately.
- A `past_due` account has an open invoice. Deletion should decide whether to void it.
- `billing_events` has no account reference and is append-only, so it survives any account deletion as-is.
