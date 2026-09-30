# Stripe subscription billing

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 29 September 2026, Paid Access Phase 5. Test mode only; **no live Stripe object exists and nothing has been charged.**

> A Stripe Checkout success redirect is a string in a browser's address bar.
> **The webhook is the authority.** Everything below follows from that one sentence.

---

## 1. What Urdais sells

One thing.

| | |
| --- | --- |
| Product | **Urdais Premium** |
| Price | **$80.00 USD / week**, recurring, `interval_count: 1` |
| Trial | none |
| Unlocks | all five premium products, from one subscription |

```
one Stripe subscription → one Urdais premium entitlement → all premium products
```

There is no annual plan, no monthly plan, no tier, no seat, no metered component and no coupon. Each of those would need a new primary key in `identity.premium_entitlements`, which is keyed on the account alone — so none of them can appear by accident.

`@/lib/access/pricing` holds the price for **display**; the Stripe Price is the billing authority. `describePriceMismatch` compares them before every Checkout Session, and refuses rather than charging when they disagree — because the half that is wrong is always the half the customer read.

### Test-mode objects

| | |
| --- | --- |
| Product | `prod_VLudFxecD5IgCv` — Urdais Premium |
| Price | `price_1ULCoUAbbaFaWyWpSWLWmdKn` — 8000 USD minor units, every 1 week |
| Tax code | `txcd_10701400` — Website Information Services, Business Use |

Created and reconciled by `npm run billing:setup`, which discovers by metadata before creating so a second run reuses both. Neither id is a secret.

### The tax code is a business decision

Stripe's **Managed Payments** is enabled on this account, which makes Stripe the merchant of record and therefore requires every Product to declare what it is. Without a tax code `checkout.sessions.create` fails outright — this was discovered by that failure, not anticipated.

`txcd_10701400` was chosen because Urdais sells access to market and infrastructure data that a professional reader logs in and reads on a website. It is deliberately **not** a SaaS code: Urdais is not software the customer operates, and classifying it as such would misdescribe it in every jurisdiction Stripe remits to. The founder confirmed Information Services as the correct family on 29 September 2026.

The nearest alternative is `txcd_10701410`, "Electronically Delivered Information Services – Business Use", which differs on whether the website itself is the delivery mechanism. The other way out is to turn Managed Payments **off**, in which case Urdais becomes the merchant of record, no tax code is required, and remitting tax becomes Urdais's own responsibility. Both are founder decisions; neither is one this code should take.

---

## 2. The object model

```
identity.accounts ──1:1── identity.billing_customers ──→ Stripe Customer
        │                          │
        │                          └──1:N── identity.billing_subscriptions ──→ Stripe Subscription
        │
        └──1:1── identity.premium_entitlements   (what the access layer reads)

identity.billing_events   append-only ledger of processed Stripe events
```

Three new tables, in `identity` rather than a new `billing` schema: these rows describe people rather than markets, which is the reason Phase 1 gave for `identity`, and every useful query joins to `identity.accounts`. A second schema would need the same revokes, the same default privileges and the same grants, and would isolate nothing further.

**`premium_entitlements` is unchanged.** Phase 1 already allowed `source = 'stripe'` with the subscription id in `external_reference`, and constrained a Stripe-sourced entitlement to name one. Billing drives the primitive that already existed.

### `livemode` on every row, and inside a foreign key

Stripe's own flag, stored rather than inferred, so a test subscription can never be mistaken for a paid one after a credential change. A `CHECK` cannot see another table, so the mode is carried into the subscription → customer foreign key:

```sql
foreign key (stripe_customer_id, livemode)
  references identity.billing_customers (stripe_customer_id, livemode)
```

A test subscription therefore cannot attach to a live customer — the one billing error with no clean remedy after the fact.

### Security posture

Identical to Phase 1, and asserted inside the migration: internal schema, RLS enabled on all three tables with **zero policies**, nothing granted to `anon` or `authenticated` at any level, `service_role` the only role that reaches them. `billing_events` grants only `select, insert` — an audit ledger that can be updated is not a ledger, and a trigger refuses `update` and `delete` outright.

---

## 3. Account ↔ Customer

The stable relationship is **account id ↔ customer id**. Never email.

Email is mutable on both sides: a reader changes it in Stripe, or two providers assert the same address, and an email-keyed lookup then attaches one person's subscription to another's account. Stripe's view of the customer's email is initialisation copy so receipts land somewhere useful, and it is never read back to decide who anybody is. Supabase remains the authentication authority.

### Under concurrency

Two simultaneous first checkouts can both reach Stripe before either writes. Both create a Stripe Customer; the primary key on `account_id` lets exactly one become the mapping, and both callers continue with the winner:

```sql
insert into identity.billing_customers (account_id, stripe_customer_id, livemode)
values ($1, $2, $3)
on conflict (account_id) do nothing
returning stripe_customer_id
```

The loser is an unattached Customer with no subscription and no payment method — visible in the dashboard, harmless, and far better than two mappings for one reader. Checking first and creating second does not fix that race; it only narrows it. Observed in the Phase 5 E2E: several Subscribe presses produced exactly one mapping row.

---

## 4. Checkout

Stripe-hosted. Urdais renders no card field, loads no browser Stripe client, and holds no PCI surface. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` exists in the environment and is **unused** — documented so its presence is not mistaken for a missing integration.

Everything that decides who is charged and how much is derived server-side:

| value | source |
| --- | --- |
| the Urdais account | the session, via `resolveCheckoutHandoff` |
| the Stripe Customer | the account's mapping row |
| the Price | `STRIPE_PREMIUM_PRICE_ID`, reconciled against the display copy |
| `returnTo` | the request, through `safeReturnTo` |

The browser supplies exactly one field: `returnTo`. A hidden field carrying an account id is a subscription somebody else pays for; a Price chosen by the browser is a $0.50 subscription.

The account id is attached to Stripe twice — `client_reference_id` on the Session and `metadata` on both the Session and the Subscription — so a webhook about either object can find the account without trusting browser state.

**An entitled reader is refused**, and that is the duplicate-subscription guard rather than a nicety. Someone following a stale CTA or pressing back after paying is the ordinary way a customer pays twice, which is a refund conversation rather than a bug report. It is enforced three times: the route decides whether to render, `resolveCheckoutHandoff` re-derives it because a form submission is a second entry point, and `startCheckout` re-derives it again because a form can be submitted by something that never rendered the page.

### Success and cancel

`success_url` → `/access/complete`. `cancel_url` → `/access/ready`, destination preserved, nothing changed, and no copy implying a charge.

---

## 5. `/access/complete` grants nothing

**The critical invariant.** A success URL can be typed, and a reader who abandoned Checkout at the card form can reach it by pressing back. If arriving there were enough, the subscription would be optional.

So the page asks one question — *does this account hold an active entitlement?* — of the same authority every premium surface asks. It reads no query parameter as evidence of payment.

The `session_id` is a **lookup key** handed to Stripe, and the answer is checked to belong to this reader's own Customer before anything is written. A session id lifted from somebody else's URL resolves to a different Customer and is refused.

If Stripe has not made the subscription active yet, the page says so and offers to check again — pointing at **itself**, not at Plan / Pay, because sending somebody who has just paid to a screen with a Subscribe button on it is how they buy the same subscription twice.

---

## 6. The webhook is the authority

`POST /api/stripe/webhook`, Node runtime, `force-dynamic`.

### Signature verification

`await request.text()` gives the exact bytes Stripe signed, handed to `constructEvent` untouched. No `request.json()`, no normalisation, no re-serialisation — parsing and re-encoding changes key order and whitespace, which changes the bytes, which invalidates a signature that was perfectly good and makes it look like Stripe misbehaving.

Verified against real Stripe signatures in `route.test.ts`: an absent signature, an invented one, one made with the wrong secret, a valid signature over a *different* body, and one outside Stripe's timestamp tolerance are all refused, and none reaches the processor.

### The event set, and why it is this small

| event | why |
| --- | --- |
| `checkout.session.completed` | the first moment account, Customer and Subscription are known together, carrying the metadata the server wrote |
| `customer.subscription.created` | the subscription exists |
| `customer.subscription.updated` | every status change, and the cancel-at-period-end flag |
| `customer.subscription.deleted` | the end, and final revocation |

**Invoice events are deliberately unhandled.** `invoice.payment_failed` cannot change whether an account is entitled without Stripe also moving the subscription's status, and Stripe keeps a subscription `active` through its configured retry schedule on purpose. Handling both would mean two code paths deciding one question, and the invoice path would revoke access during a window Stripe still considers good standing. Entitlement follows subscription status; that is the whole policy.

Anything else is acknowledged with 200 and ignored, so Stripe stops sending it.

### Status codes are instructions

| situation | status | why |
| --- | --- | --- |
| processed, duplicate, ignored | 200 | done; stop sending |
| bad or missing signature | 400 | retrying cannot produce a valid one |
| no account for the subscription | 400 | retrying will not make one exist |
| database or Stripe API failure | 500 | transient; please retry |
| not configured | 500 | an operator must act, and silence would hide it |

Returning 200 on a failure is the one genuinely dangerous answer: Stripe stops retrying, the entitlement is never written, and a subscriber who paid is locked out with nothing in the dashboard to explain it.

### Every handler re-reads from Stripe

The payload is used for *identity* — which subscription, which event, when — and never for state. Stripe does not guarantee delivery order, so a payload can describe a subscription two states ago. One extra API call per event removes the class of bug.

---

## 7. Idempotency and ordering

**Idempotency is an insert, not a check.** The Stripe event id is the primary key of `billing_events`; winning the insert is what grants the right to process. A read-then-write races Stripe's own concurrent retries — two deliveries can both read "not seen" before either writes — which is exactly the case it exists to survive.

The claim is **inside** the transaction, so a processing failure rolls it back and the retry can try again. Marking an event processed before the work succeeds is how an event gets permanently dropped.

**Ordering is compared, not assumed.** Every subscription write carries the event's own `created` time and applies only when it is at least as new as the last one stored:

```sql
on conflict (stripe_subscription_id) do update set …
where identity.billing_subscriptions.last_event_at is null
   or excluded.last_event_at >= identity.billing_subscriptions.last_event_at
```

In SQL, not in application code, so two concurrent handlers cannot both pass it. `>=` rather than `>` because Stripe stamps events at second resolution and two genuine changes can share a second. A stale event is still recorded as processed — it was — and changes nothing, so a late `updated` cannot resurrect access after a `deleted`.

**One transaction** covers the claim, the subscription upsert and the entitlement write. A webhook that stores the subscription and then crashes would lock out a paying customer; the reverse would leave a cancelled one with access.

---

## 8. Billing status → entitlement

One module: `src/lib/billing/subscription-state.ts`. Everything defers to it, so the question has one answer rather than one per call site.

| Stripe status | entitlement | why |
| --- | --- | --- |
| `active` | **granted** | the period is paid for |
| `trialing` | **granted** | Stripe considers the period covered. Urdais sells no trial; if one is ever configured, locking out a customer in good standing is the wrong failure |
| `past_due` | denied | see below |
| `unpaid` | denied | Stripe gave up collecting |
| `incomplete` | denied | the first payment never completed |
| `incomplete_expired` | denied | and never will |
| `canceled` | denied | over |
| `paused` | denied | not collecting, so not entitled |
| anything unrecognised | denied | **fail closed** |

The entitling set is enumerated positively, so a status added after this build shipped cannot join it by being unrecognised.

### `past_due` denies — the contestable line

Monthly products commonly grant a grace period. Urdais bills **weekly**, so `past_due` means the current week went unpaid after Stripe exhausted its retry schedule, and a grace period would be a large fraction of the thing being sold. Recovery is immediate and in the reader's hands: update the card and Stripe retries.

### `cancel_at_period_end` is not an input

Asking to cancel is not the same as having stopped paying, and Stripe keeps the status `active` until the paid period elapses. Reading the flag would revoke access somebody paid for the moment they pressed cancel. It is stored for operators and for copy; the decision is the status alone.

Verified against real Stripe: setting `cancel_at_period_end: true` recorded the flag and **kept the entitlement active**; cancelling for real revoked it.

---

## 9. Reconciliation

For when a webhook is delayed, or a local run has no forwarding.

It asks **Stripe**, not the browser. It writes through the same `applySubscriptionEvent` path with the same ledger, so a reconciliation and a webhook racing cannot both grant. Its ledger id is `reconcile:<subscription>:<status>:<period end>` — deterministic, so reconciling unchanged state is a duplicate rather than a new row implying a new business event, and distinguishable from a delivered event.

---

## 10. Test and live cannot be silently mixed

The mode comes from the secret key's own prefix — `sk_test_` / `sk_live_` — not from a separate flag that can drift from the credential. A wrong separate flag is exactly how production ends up selling subscriptions that do not exist.

| environment | required mode |
| --- | --- |
| production (`VERCEL_ENV=production`) | **live** |
| preview | test |
| development | test |

A mismatch is `unavailable`, not an error. **Production today holds no live credentials, so Plan / Pay renders with no purchase control** and says so plainly — which is what lets this phase deploy without changing what a production reader can do. A disabled button would be worse than none: it invites clicking and reads as a bug.

`VERCEL_ENV` is preferred over `NODE_ENV` because a preview deployment is `NODE_ENV=production` while being emphatically not production, and treating it as such would demand live keys on every branch build.

Event and object `livemode` flags are both checked on every webhook.

---

## 11. Subscription management

Stripe Customer Portal, server-created, Customer derived from the authenticated account. Urdais builds no card-management UI and no cancel button of its own — each would be a second place billing state is presented, and the one that is wrong is always the one the customer read. Offered on `/access/subscribed`, and only where Stripe is reachable, so an operator comp with no Stripe customer is not shown a button that could only fail.

---

## 12. Environment variables

| variable | class | notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | **server-only secret** | can spend money and read every customer. Never `NEXT_PUBLIC_*`, never logged |
| `STRIPE_WEBHOOK_SECRET` | **server-only secret** | the only reason a webhook can be trusted |
| `STRIPE_PREMIUM_PRICE_ID` | non-secret server config | differs between test and live, so not hard-coded |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public, **unused** | Checkout is hosted; no browser Stripe client exists |

Names and placeholders are in `.env.example`; no value is committed. A source scan in `billing-boundary.test.ts` asserts no client component reads a secret, no secret is ever `NEXT_PUBLIC_`, and no real credential appears anywhere in `src`.

### Local webhook testing

```
stripe listen --api-key "$STRIPE_SECRET_KEY" \
  --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted
```

`--api-key` avoids `stripe login`, so no interactive browser step is needed. The command prints the signing secret to use as `STRIPE_WEBHOOK_SECRET`. Signature verification is never weakened to avoid this setup.

---

## 13. Phase 6: live activation

Nothing below has been done, and none of it should be until Phase 5 is approved.

1. **Create the live Product and Price.** `npm run billing:setup` refuses live mode deliberately; the live objects are created with a human present, matching `$80.00 USD` weekly and the confirmed tax code.
2. **Confirm the tax classification** — `txcd_10701400`, or switch to `txcd_10701410`, or turn Managed Payments off and accept merchant-of-record responsibility.
3. **Set `STRIPE_SECRET_KEY`** to the live key in Vercel Production only.
4. **Set `STRIPE_PREMIUM_PRICE_ID`** to the live Price id in Vercel Production.
5. **Create the live webhook endpoint** at `https://urdais.com/api/stripe/webhook`, subscribed to exactly the four events in §6.
6. **Set `STRIPE_WEBHOOK_SECRET`** to that endpoint's signing secret.
7. **Redeploy**, because `NEXT_PUBLIC_*` values are inlined at build time and the mode check reads the environment.
8. **Verify live Checkout** renders the right product and price, and that `/access/ready` now offers a purchase control.
9. **One controlled real payment**, if desired, then verify the entitlement and cancel it.
10. **Verify cancellation and refund behaviour** against the documented policy.
11. **Only then** consider `URDAIS_PREMIUM_ENFORCEMENT=active` — and only against the separate prerequisites in `premium-gates.md`.

Until step 3, production billing is `unavailable` and the offer is not purchasable, which is the intended state.
