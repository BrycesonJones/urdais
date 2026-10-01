# Account Hub

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 1 October 2026, Phase 7B. Replaces the Phase 7A `/account` placeholder (`account-entry.md` §5).

> `/account` displays billing state but does not determine premium authorization. Premium authorization remains governed by the canonical entitlement system.
>
> Viewing `/account` is read-only with respect to Stripe and billing state.
>
> An authenticated account without premium entitlement remains a valid Urdais account.

---

## 1. Four separate questions

| Question | Answered by | Where |
| --- | --- | --- |
| **Authentication**: who is signed in? | the Supabase session, checked with the Auth server | `resolveSupabaseIdentity` |
| **Account**: which Urdais account is that? | `identity.accounts`, keyed on (provider, auth subject) | `resolveUrdaisAccount` |
| **Billing**: what is their subscription doing? | `identity.billing_subscriptions`, reconciled by signed Stripe webhooks | `readAccountSubscriptions` → `presentSubscription` |
| **Authorization**: may they read premium? | `identity.premium_entitlements` | `hasPremiumEntitlement` / `canAccess` |

The hub answers the first three for display. It reads the fourth, the same way every premium surface does, and **never contradicts it**. It never *makes* an authorization decision either: nothing it renders opens a premium product.

---

## 2. Read model

`src/lib/account/hub.ts` — `resolveAccountHub(): Promise<AccountHub>`

```
resolveSupabaseIdentity()        anonymous → { kind: "anonymous" }      → /access/login?returnTo=%2Faccount
  resolveUrdaisAccount(sql, id)  ┐ failure → { kind: "unavailable", profile }
  loadPremiumEntitlement(sql)    ┘
  readAccountSubscriptions(sql)    failure → subscription { kind: "unavailable", reason: "read_failed" }
  presentSubscription(...)         pure mapping, src/lib/account/subscription-presentation.ts
→ { kind: "ready", profile: { email, emailVerified }, subscription, action }
```

- **No arguments.** The account is the one the session names. No request input (account id, Stripe id, status) is read anywhere on `/account` or `/account/subscription`.
- **No Stripe.** Subscription state comes from the webhook-reconciled table. The only configuration read is `billingAvailability()`, which returns the configured canonical Price id without a network call. It is used to confirm a subscription is on the canonical Price before quoting `$80/week`.
- **No billing writes.** One `SELECT` against `identity.billing_subscriptions`. The only write reachable is `resolveUrdaisAccount`'s existing provisioning upsert. Every authenticated page shares it, and it is idempotent on (provider, subject), so it cannot create a second account.

---

## 3. Presentation mapping

Decided in one place, `presentSubscription`. The page renders states; it never inspects a Stripe status.

The **current subscription** is chosen from all of the account's rows (newest first) by priority. Live (`active`, `trialing`) comes first, then a payment problem (`past_due`, `unpaid`, `incomplete`, `paused`), then `canceled`. `incomplete_expired` is ignored: no period was ever paid.

| Current subscription | Entitlement grants | State | Status shown | Action |
| --- | --- | --- | --- | --- |
| none | no | `none` | No active subscription | **Subscribe** |
| none | yes, `manual` | `complimentary` | Active (included with your account) | — |
| `active` / `trialing` | yes | `active` | Active · $80/week | **Manage subscription** |
| `past_due` / `unpaid` / `incomplete` | no | `payment_issue` | Payment issue | — |
| `paused` | no | `paused` | Paused | — |
| `canceled` | no | `canceled` | Canceled | **Subscribe again** |
| non-entitling | yes, `manual` | `complimentary` | Active (included) | — |
| entitling | **no** | `unavailable` (inconsistent) | Status unavailable | — |
| none / non-entitling | yes, `stripe` | `unavailable` (inconsistent) | Status unavailable | — |
| a status this build does not know | either | `unavailable` (inconsistent) | Status unavailable | — |
| read failed | — | `unavailable` (read_failed) | Status unavailable | — |

Rules this table encodes:

- **Never Active when denied.** If the entitlement denies, nothing is labelled Active, whatever the subscription row says. An `inconsistent` result is logged for operators.
- **Never "never subscribed" on failure.** A read failure, or records that disagree, render *Status unavailable* with no action. They never render *No active subscription* + Subscribe, which could invite a subscriber to buy twice.
- **No Subscribe beside a live subscription.** `past_due`, `unpaid`, `incomplete` and `paused` offer nothing. A second Checkout there would be a duplicate subscription, and recovering the existing one is management (Phase 7C).
- **`past_due` policy unchanged.** Denied immediately, no grace period, not relabelled Canceled.
- **`cancel_at_period_end`** stays Active, with "set to end on {date}". This matches the entitlement policy, which ignores the flag.
- **Price** is shown only when the subscription's `stripe_price_id` equals the configured canonical Price. The Phase 6 validation subscription (`$1/week`) would otherwise have been mislabelled `$80/week`.

### Which statuses can actually occur

The schema accepts all eight Stripe statuses. In Urdais's current model:

| Status | Reachable? |
| --- | --- |
| `active`, `canceled` | yes, observed in production (Phase 6) |
| `past_due`, `unpaid` | yes, through failed weekly renewals |
| `incomplete`, `incomplete_expired` | possible briefly, if a first Checkout payment needs action and is abandoned |
| `trialing` | no: Urdais sells no trial and `priceMatchesPremium` refuses a Price with one. Mapped to Active because the entitlement policy grants it |
| `paused` | no: nothing in Urdais pauses, and pausing is not configured. Mapped honestly anyway |

---

## 4. Never subscribed vs canceled

Decided from `identity.billing_subscriptions`, **not** from the entitlement:

- **never subscribed**: no subscription rows (or only `incomplete_expired`). Subscribe.
- **canceled**: at least one `canceled` row and no live one. Subscribe again. The history is shown, not hidden.

The entitlement alone cannot separate these: a revoked operator comp is also an inactive entitlement with nothing behind it. The production account from the Phase 6 lifecycle (one `canceled` subscription on the validation Price, entitlement `inactive` with `revoked_at` set and `granted_at` preserved) renders **Urdais Premium / Canceled / Your premium access has ended. / Subscribe again**.

---

## 5. Actions

**Subscribe / Subscribe again** link to `/access/ready?returnTo=%2Faccount`, which is Plan / Pay, the canonical purchase path. It is a link, not a form: nothing is created until the reader presses Plan / Pay's own control (`SubscribeButton` → `startCheckoutAction` → `startCheckout`). That path keeps all its existing protections: server-side account, canonical Price checked against `$80/week`, no trial, duplicate-subscription refusal, and sanitised return paths. A Stripe Customer is still created only inside `startCheckout`. Plan / Pay is addressed directly because `/access?returnTo=/account` returns a signed-in reader to `/account` (Phase 7A account intent, which now also covers routes beneath `/account`).

Plan / Pay's footer used to say premium "is still readable without a subscription today". That was true before activation and false since; under active enforcement it now offers only "Not now? Go back".

**Manage subscription** (active only) links to `/account/subscription`. See §7.

**Sign out** is the existing `signOutAction`, landing on `/`. It ends the Supabase session only: no Stripe call, no entitlement change, no billing or account row touched.

---

## 6. Failure behaviour

| Failure | Result |
| --- | --- |
| No session / Auth server unreachable | anonymous → redirect to sign in. No account data is rendered |
| Database not configured, or account / entitlement read fails | Profile (from the Auth server) and Sign out render; Subscription shows *Status unavailable*, no action |
| Billing read fails | Profile renders; Subscription shows *Status unavailable*, no action |
| Billing records disagree with the entitlement | *Status unavailable*, no action, warning logged; authorization unaffected |
| Stripe unavailable / billing not configured | Hub renders normally from local state; only the `$80/week` label, which needs the configured Price to verify, is withheld. Plan / Pay shows its existing "Checkout is not open" notice |

---

## 7. Phase 7C seam — subscription management

> **Implemented in Phase 7C**: see `subscription-management.md`. Manage subscription (active) and Manage billing (`past_due` / `unpaid`) open Stripe's Customer Portal for the account's existing Customer and return to `/account`. `/account/subscription` now redirects to `/account`. The 7B text below is kept as the record.

`/account/subscription` (`src/app/account/subscription/page.tsx`, `ACCOUNT_SUBSCRIPTION_HREF`) is authenticated-only. It currently says management from the account "isn't available yet", that nothing has been changed, and how to contact Urdais. It has no form, no button, and no billing call.

**Phase 7C replaces that page's implementation**, not the hub:

- hand off to the Stripe Customer Portal. `startBillingPortal` (`src/lib/billing/checkout.ts`) and `openBillingPortalAction` already exist and are live on `/access/subscribed`;
- point the Portal `return_url` at `/account` (today it returns to `/access/subscribed`);
- give `payment_issue` (and `paused`) a Manage billing action, because these readers have no recovery path inside Urdais today. They are not entitled, so they never see `/access/subscribed`;
- confirm webhook reconciliation of Portal-originated changes (cancel at period end, payment method update, immediate cancel).

`actionFor` in `subscription-presentation.ts` is where 7C adds that action.

---

## 8. Phase 7D boundary — account lifecycle

No delete control exists, functional or not. Nothing in 7B decides deletion with or without billing history, active-subscription handling, Stripe Customer treatment, auth-user deletion, `identity.accounts` treatment, billing/event/entitlement retention, idempotency or partial-failure recovery.

Facts 7D will need:

- `billing_customers`, `billing_subscriptions` and `premium_entitlements` all cascade on `identity.accounts` deletion.
- `billing_events` does not reference accounts and is append-only by trigger.
- Deleting an account row therefore silently discards billing history unless 7D decides otherwise first.
