# Paid access: the entitlement foundation

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 27 September 2026, Phase 1 of paid access; §1 revised the same day when Phase 2 landed authentication. Architecture only — no Stripe, no onboarding, no paywall UI, and no production gate is active.

This document is the specification Phase 2 builds against. If you are adding a
premium gate to a surface, everything you need is here and you should not invent
a second access model.

---

## 1. The one fact that shaped everything — now resolved

> **Superseded by Phase 2.** Urdais authenticates with Supabase Auth as of
> 27 September 2026. See `docs/architecture/authentication.md`. The paragraphs
> below record why this foundation looks the way it does, and remain the reason
> several of its choices are worth keeping.

**When Phase 1 was written, Urdais had no authentication system.** There was no
Supabase Auth client in `package.json`, no session cookie, no middleware, no
sign-in route, and no reference to `auth.users` in any of the 107 migrations
preceding it. Every reader was anonymous and every published product was public.

That decided the shape of this foundation, and each consequence still holds:

- `resolveViewer()` was anonymous-only, and said so rather than pretending.
  **Phase 2 replaced its body**; the signature and every caller are unchanged,
  which was the point of isolating it.
- The entitlement tables are provider-agnostic — no foreign key to `auth.users`
  — because nobody had chosen a provider. Phase 2 chose Supabase and **kept that
  design**, storing `('supabase', <user uuid>)`. A second provider still needs no
  migration.
- **No guard is wired to any route.** This has not changed and must not: an
  authenticated reader still cannot obtain an entitlement, because Stripe does
  not exist. Activating a gate would deny Compute Economics and Power Analytics
  to everyone, with no way to subscribe. See §7.

Reading order for the rest of the system: ~~authentication phase~~ (done) →
Phase 3 gates → Stripe phase → activation.

---

## 2. Product access classifications

Two classes, and only two.

| Class | Who may read it |
| --- | --- |
| `public` | Everyone — anonymous, signed in, subscriber alike |
| `premium` | A signed-in account holding the Urdais premium entitlement |

There is no third class. "Public but behind a signup wall" and "public but rate
limited" are not products Urdais has, and adding a class for one would encode a
decision nobody has made.

### The five premium products

| Product id | Surface |
| --- | --- |
| `compute_economics` | `/markets/compute-analytics` |
| `power_analytics` | `/markets/power-analytics` |
| `map_gpu_compute` | Map layer — GPU Compute Clusters |
| `map_power_infrastructure` | Map layer — Power Infrastructure |
| `map_semiconductor_fabs` | Map layer — Semiconductor Fabs |

**Everything else is public** and stays public: all nine index markets (UCPI,
UTVI, UGAI, UAVI, UMPI, UPPI, UEPI, UACI, UBWI), Model Economics, the docs and
methodology library, the news rails, the home page, the map workspace itself,
and the map's data-centre layer.

Note that *publicly presented* and *publicly accessible* are different
questions. `publiclyPresented` in `@/data/market-catalog` hides UGAI, UAVI, UACI
and UPPI from public surfaces; that is a publication decision and is unrelated
to access class. All four are registered `public` here.

### Identifiers

Stable, snake_case, machine-readable, never a UI label. They will appear in
`returnTo` URLs and eventually in Stripe metadata, so treat one as published:
**add and deprecate, never rename.**

---

## 3. Authentication is not entitlement

Two questions, deliberately kept apart:

```
Authentication   who is this reader?        AuthenticationState
Entitlement      what may they see?         PremiumEntitlement
```

Collapsing them produces the default failure of every homegrown paywall — a
signed-in reader treated as a paying reader. The types make that unrepresentable
in one direction and cheap to get right in the other:

```ts
type AuthenticationState =
  | { kind: "anonymous" }
  | { kind: "authenticated"; accountId: string; emailVerified: boolean };

type Viewer = {
  authentication: AuthenticationState;
  premiumEntitlement: PremiumEntitlement | null;
};
```

`hasPremiumEntitlement()` requires authentication before it looks at the
entitlement at all: an active entitlement attached to an anonymous viewer
answers `false`. There is no such thing as an anonymous subscriber, and that
function is the one place it could be believed.

`emailVerified` is recorded and **not enforced**. If a phase ever wants to
require verification, it should be one explicit edit to `canAccess` — there is a
test asserting the current non-enforcement so that change has to be deliberate.

---

## 4. One entitlement

Urdais sells a single subscription that unlocks every premium product.

- `premium_entitlements` is keyed by **account**, not by `(account, product)`.
- `PremiumEntitlement` has **no product field**, and `canAccess` never consults
  a product when deciding whether the *reader* is entitled.

So a tier, a per-product purchase, a seat or an organisation each requires a new
primary key and a deliberate migration. None can arrive by accident.

`EntitlementStatus` is `"active" | "inactive"` today. More will come — a Stripe
subscription can be `past_due` or `canceled` at period end, and those are
operationally distinct even when both deny. **No caller compares against a
status literal.** They go through one predicate:

```ts
const GRANTS_ACCESS: ReadonlySet<EntitlementStatus> = new Set(["active"]);
```

Adding a status means editing that set, and nothing else.

---

## 5. The canonical access check

One function. Every gate, guard and conditional render in Urdais resolves to it.

```ts
canAccess(viewer: Viewer, productId: string): AccessDecision
```

Pure, synchronous, total: reads nothing, awaits nothing, throws nothing. Usable
unchanged in a route handler, a Server Component, a client component and a test.

```
public  product  →  allowed for anonymous, signed-in, and subscriber
premium product  →  allowed only for a signed-in subscriber
unknown product  →  denied, always, including for a subscriber
```

A denial carries a reason, because the three are not interchangeable:

| Reason | HTTP | What Phase 2 should do |
| --- | --- | --- |
| `authentication_required` | 401 | Send to sign-in, then `returnTo` |
| `entitlement_required` | 403 | Send to subscribe — signing in again will not help |
| `unknown_product` | 404 | Nothing; this is a bug or a probe |

### Fail-safe on unknown ids

`isPublicProduct()` is **not** the negation of `isPremiumProduct()`. Both answer
`false`/`true` respectively for an unregistered id: an unknown product is
neither known-public nor safe to serve, so every branch falls through to a
denial. A mistyped id withholds data; it never publishes it.

### What you must not write

```ts
if (subscription_status === "active") { … }   // no
if (product === "compute_economics") { … }    // no
const PREMIUM = ["compute_economics", …];     // no — there is one registry
```

---

## 6. Server vs. client

| | Server | Client |
| --- | --- | --- |
| Builds the `Viewer` | **yes, only here** | never |
| May call `canAccess` | yes | yes |
| Decides whether data is sent | **yes** | never |
| Decides what is rendered | yes | yes |

Treat all browser state as untrusted. A reader must not obtain premium data by
editing local storage, mutating React state, adding a query parameter, manually
mounting a component, or calling a premium endpoint directly. None of those are
inputs to `resolveViewer()` — it takes no `Request` argument precisely so that a
caller cannot hand it a reconstructed one.

`@/lib/access/server` and `@/lib/access/entitlement-store` are server-only. A
test walks `src/` and fails if any `"use client"` module imports either.

Frontend access helpers decide **presentation**. They are never the boundary.

**Corollary for Phase 2, and the easiest thing to get wrong:** in the App
Router, data loaded by a Server Component ships to the browser in the RSC
payload. Rendering a blur over a premium component that was handed real data
leaks that data in full. Gate **before** the loader runs, not after — see the
`note` on each ledger entry in §7.

---

## 7. Server-side enforcement: built, not activated

Implemented and tested in this phase:

```ts
// In a route handler:
const denied = await denyUnlessEntitled("power_analytics");
if (denied) return denied;               // 401 / 403 / 404, no payload

// In a Server Component:
const decision = await resolveAccess("compute_economics");
if (!decision.allowed) return <PremiumGate decision={decision} />;
```

**Nothing imports these yet, and a test asserts that.** The reason has narrowed
but not gone away: authentication now exists, but with no checkout a live gate is
still an outage with no remedy. The test checks for calls to
`denyUnlessEntitled`/`resolveAccess` rather than for imports of the module, since
Phase 2 legitimately added `/auth/status`, which reads `resolveViewer` to report
what the server believes. Reporting a decision is not enforcing one.

`DEFERRED_PREMIUM_ENFORCEMENT` in `@/lib/access/server` is the typed ledger of
every path that must be guarded, with the enforcement each needs:

| Path | Product | Enforcement |
| --- | --- | --- |
| `src/app/markets/compute-analytics/page.tsx` | `compute_economics` | deny |
| `src/app/api/compute/capacity/series/route.ts` | `compute_economics` | deny |
| `src/app/markets/power-analytics/page.tsx` | `power_analytics` | deny |
| `src/app/api/power-delivery/gap/route.ts` | `power_analytics` | deny |
| `src/app/api/interconnection-queue/route.ts` | `power_analytics` | deny |
| `src/app/map/page.tsx` | `map` | **filter** |
| `src/app/api/map/facilities/route.ts` | `map` | **filter** |

A test asserts every path in the ledger exists, so it cannot rot.

### Activation conditions

Activate a gate only when **all** of these hold:

1. ~~Authentication ships and `resolveViewer()` returns real accounts.~~
   **Done, Phase 2.**
2. Checkout ships, so a denied reader has a way to become an entitled one.
3. The operator can grant a `manual` entitlement to founder and support accounts.

Activating earlier denies a live product to everyone. Guarding the page but not
its API endpoint is worse than guarding neither — it looks done.

---

## 8. Map access

**The map is public and stays public.** The workspace, the basemap, the legend
and the data-centre layer are all public products. Only three of the four
facility categories are premium.

So the map is enforced by **filtering**, not refusing:

| Category | Product | Class |
| --- | --- | --- |
| `data_center` | `map_data_centers` | public |
| `gpu_compute_cluster` | `map_gpu_compute` | premium |
| `power_infrastructure` | `map_power_infrastructure` | premium |
| `semiconductor_fab` | `map_semiconductor_fabs` | premium |

`productForMapCategory()` is total over `FACILITY_CATEGORIES`, and a test
asserts the coverage — a fifth category added to the map taxonomy fails the
suite rather than appearing unclassified (and therefore denied) on the map.

For Phase 5, server-side: drop points in `PREMIUM_MAP_CATEGORIES` from the
response for an unentitled reader, so premium coordinates never reach the
browser. `/api/map/facilities` matters more than the page — it is directly
fetchable — and note that `validatePublicFacilities` runs over that response, so
the filtered model must still satisfy the facility contract.

For Phase 2, presentation: the legend rows for premium categories are the upsell
affordance. A premium layer a reader cannot see must still be *visible as a
thing that exists*, or the map silently looks emptier rather than gated.

---

## 9. Database

New schema `identity`, two tables. Migration
`20261023100000_access_entitlement_foundation.sql`.

```
identity.accounts
  id                 uuid pk
  auth_provider      text     -- 'supabase', 'workos', … normalised lowercase
  auth_subject       text     -- that issuer's own id for the person, opaque
  email              text     -- support lookup only; NOT unique, NOT identity
  created_at / updated_at
  unique (auth_provider, auth_subject)

identity.premium_entitlements
  account_id         uuid pk  → identity.accounts(id) on delete cascade
  status             text     -- 'active' | 'inactive'
  source             text     -- 'manual' | 'stripe'
  external_reference text     -- Stripe subscription id, later. Opaque.
  granted_at / revoked_at / created_at / updated_at
```

**Why a new schema.** An account is the one row in this database that describes
a person rather than a market. Keeping it out of `reference` and `pipeline`
means a future least-privilege read-path role can be granted those two without
ever being able to see who subscribes.

**Why provider-agnostic.** Keying on `auth.users(id)` would decide the
authentication provider inside an append-only migration, before anyone has made
that decision. `(auth_provider, auth_subject)` fits Supabase Auth as
`('supabase', '<uuid>')` and fits anything else too.

**Both tables are empty and will stay empty until authentication ships.** That
is correct, not pending: an empty `accounts` is exactly "nobody has signed in",
and an empty `premium_entitlements` is exactly "nobody subscribes" — which is
the true state of the product today.

Constraints that exist to make an indefensible row unwritable:

- one entitlement per account (the primary key)
- `active` ⇒ `granted_at is not null` and `revoked_at is null`
- `revoked_at >= granted_at`
- `source = 'stripe'` ⇒ `external_reference is not null` — otherwise a manual
  comp mislabelled `stripe` is unreconcilable against billing

**Security.** The existing model, unchanged: internal schema, no PostgREST
exposure, RLS enabled on both tables with **no policies**, nothing granted to
`anon` or `authenticated` at any level, `service_role` only. No existing policy,
grant or RLS setting elsewhere in the database is modified. The migration
asserts all of this in a `do $$` block rather than trusting it.

Reading is `loadPremiumEntitlement(sql, accountId)`. It never writes —
provisioning is the billing phase's module, and a read path that could also
grant will eventually grant by accident. A row whose `status` or `source` this
build does not recognise is treated as **no entitlement**: across a deploy skew
the worst outcome is a subscriber briefly seeing a gate, never a non-subscriber
receiving data.

---

## 10. How Stripe will fit, later

Stripe becomes **one writer of `premium_entitlements`**, and nothing more.

```
checkout completed   → upsert  status='active',  source='stripe',
                               external_reference=<subscription id>,
                               granted_at=now()
subscription deleted → update  status='inactive', revoked_at=now()
payment failed       → update  status=<a new status added to GRANTS_ACCESS's complement>
```

What must remain true after that phase:

- No module outside the billing code imports a Stripe SDK or names a Stripe
  concept. A caller asking whether someone may read Compute Economics must not
  learn that a payment processor exists. There is a test asserting the three
  access modules stay clean.
- Webhook handlers write the table; they never answer an access question.
- `manual` grants keep working. Founder, support and comp accounts must not
  require a Stripe customer.

An append-only entitlement **event log** was deliberately not built here. It is
likely right once billing exists — reconciliation wants the history, not just
the current state — and it is a clean additive migration at that point. Doing it
now would be modelling a workflow nobody has written.

---

## 11. Phase 2 checklist

1. Read the access class from the registry. Never from a local list.
2. Resolve the decision **server-side**, before loading premium data.
3. Branch the gate's copy on `AccessDenialReason`, not on a boolean.
4. Use `product.destination` for `returnTo`. Do not build a second route table.
5. On the map, filter layers — do not lock the page.
6. Do not activate a production guard until §7's three conditions hold.

## 12. Where things live

| | |
| --- | --- |
| Product registry | `src/lib/access/products.ts` |
| Entitlement model + `canAccess` | `src/lib/access/entitlement.ts` |
| Server guard + deferred ledger | `src/lib/access/server.ts` |
| Database read | `src/lib/access/entitlement-store.ts` |
| Migration | `supabase/migrations/20261023100000_access_entitlement_foundation.sql` |
| Database test | `supabase/tests/690_access_entitlement.sql` |
