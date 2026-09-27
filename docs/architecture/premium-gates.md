# Premium gates

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 27 September 2026, Paid Access Phase 3. The gates are **real and wired**; premium enforcement is **switched off**, and production is commercially open.

> **A blurred UI is not the access-control boundary. Premium data is withheld server-side before it is loaded or serialised.**

---

## 1. The sequencing this phase exists to serve

Stripe does not exist, so nobody can buy an entitlement. A live gate would therefore show every visitor "Get Full Access" with no way to get it — worse than no gate at all.

So Phase 3 builds the whole system and leaves one switch off:

```
gate implementation exists          ✅  wired into every premium surface
commercial enforcement is active    ❌  URDAIS_PREMIUM_ENFORCEMENT is unset
```

That lets onboarding be built against real gate entry points and Stripe against a real entitlement path, and only then is the switch flipped. There is never a window in which a reader is refused with nothing to buy.

---

## 2. The activation boundary

One variable, read in one module, consulted through one function.

| | |
| --- | --- |
| Variable | `URDAIS_PREMIUM_ENFORCEMENT` (server-only, **not** `NEXT_PUBLIC_`) |
| Active value | exactly `active`, case-insensitive, trimmed |
| Default | **inactive** — absent, empty, `true`, `1`, `on`, `yes` all read as inactive |
| Module | `src/lib/access/activation.ts` |

The default direction is deliberate: the failure mode of a typo is "keeps working as it does today", not "paywalls the live site".

**Nothing outside that module reads the variable.** No page, route or component contains an `if (process.env.…)`. Everything goes through `resolvePremiumGate` (or `resolveMapAccess`), which is what makes it impossible to activate the page gate while forgetting the API — the failure the whole design is arranged around.

There is no query parameter, cookie, header or localStorage key that turns enforcement on or off. A `?premium=true` bypass would be a public backdoor into every premium product, and a secret URL is the same thing with extra steps.

### Verifying with it on

Set `URDAIS_PREMIUM_ENFORCEMENT=active` in a preview or development environment. That is the only mechanism, and it is server-side. For an entitled reader, grant the entitlement by SQL as Phase 2 documents.

---

## 3. The canonical call

```ts
// A Server Component
const gate = await resolvePremiumGate("compute_economics");
if (!gate.allowed) {
  if (gate.reason === "unknown_product") notFound();
  return <PremiumLockedPage … reason={gate.reason} />;
}
const model = await loadPremiumThing();   // only ever reached when allowed

// A Route Handler
const denied = await denyUnlessEntitled("power_analytics");
if (denied) return denied;

// The map
const access = await resolveMapAccess();
const points = filterMapPoints(allPoints, access);
```

`PremiumGate` has three shapes, and the first is distinct on purpose:

| Shape | Meaning |
| --- | --- |
| `{ enforced: false, allowed: true }` | Nobody is checking. Current production. |
| `{ enforced: true, allowed: true, product }` | This reader is entitled. |
| `{ enforced: true, allowed: false, reason, product }` | Refused, with why. |

"Nobody is checking" must not be confusable with "this reader is entitled", or a later phase filters the map for a subscriber.

**When enforcement is inactive, no viewer is resolved at all.** That is not tidiness: resolving one costs a Supabase round trip and two database queries, and adding those to every Compute Economics and Power Analytics request today — for a verdict that is always "allowed" — would be a live performance regression bought for nothing.

---

## 4. Gate before loading — the security boundary

The wrong implementation is indistinguishable by eye:

```ts
const model = await loadComputeEconomicsReadModel();      // ← already too late
return denied ? <Locked model={model}/> : <Product model={model}/>;
```

In the App Router, anything a Server Component loads is serialised into the RSC payload the browser receives. That page shows the same lock to the same reader **and ships every price to them**, behind a CSS blur they can delete in developer tools.

So the gate is awaited first and the loader appears only on the allowed branch. A denied reader on Power Analytics does not even cause a database connection to be opened.

Two tests, not a visual one, hold this:

- the loader mock is asserted **not called** (`gate.test.tsx` for both pages)
- a **sentinel value** the loader would have returned is asserted absent from the rendered HTML

`createTokenSqlExecutor` is asserted not called for Power Analytics, which covers all five of its loaders at once and is stronger than checking each.

---

## 5. The locked shell contains no premium data

`src/components/premium/premium-locked-page.tsx` takes **no data props at all** — only a title, a description and the denial reason — so it is not possible to pass it premium data by mistake. Its skeleton is generated from array lengths: bars, a chart frame with no series, tiles with no numbers.

There is no snapshot of a real price, no cached API response, no historical series and no coordinate anywhere in it. The `blur-sm` applies to placeholder bars; it is decoration, and the access decision happened on the server before this component was chosen.

The title and description stay legible and outside the obscured region, because a locked page that will not say what it is cannot be evaluated by the person deciding whether to pay. The bars are deliberately abstract rather than plausible fake figures — someone will screenshot a plausible figure.

---

## 6. Denial reasons

| Reason | HTTP | Gate | Presentation |
| --- | --- | --- | --- |
| `authentication_required` | 401 | Yes | "Get Full Access" + a secondary "Sign in" |
| `entitlement_required` | 403 | Yes | "Get Full Access", **no** sign-in link |
| `unknown_product` | 404 | **No** | `notFound()` — never an upsell |

Both denials make the same offer, because both readers need to subscribe. The difference is the secondary affordance: an anonymous reader might already have an account; someone already signed in has nothing to gain from a sign-in link.

The primary CTA deliberately does **not** go to sign-in for an anonymous reader. Whether they need to create an account or sign in is onboarding's decision.

`unknown_product` throws rather than returning copy (`gateCopy`), so an unregistered product can never be advertised as something Urdais sells.

### Copy

```
ACCESS REQUIRED
This page requires an Urdais subscription.
Full access unlocks this product and every premium product across Urdais.
[ Get Full Access ]
```

The map layer variant differs in two lines, and its layer list is derived from the registry's own product names so it cannot list the wrong layers:

```
This map layer requires an Urdais subscription.
Full access unlocks GPU Compute Clusters, Power Infrastructure, and Semiconductor Fabs, and every premium Urdais product.
```

---

## 7. What is gated

| Path | Product | Enforcement |
| --- | --- | --- |
| `/markets/compute-analytics` | `compute_economics` | deny (locked shell) |
| `/api/compute/capacity` | `compute_economics` | deny |
| `/api/compute/capacity/series` | `compute_economics` | deny |
| `/markets/power-analytics` | `power_analytics` | deny (locked shell) |
| `/api/power-delivery/gap` | `power_analytics` | deny |
| `/api/interconnection-queue` | `power_analytics` | deny |
| `/api/transmission-headroom` | `power_analytics` | deny |
| `/api/grid-buildout` | `power_analytics` | deny |
| `/api/flexible-capacity` | `power_analytics` | deny |
| `/map` | `map` | **filter** |
| `/api/map/facilities` | `map` | **filter** |

**Four of these were not in Phase 1's ledger** — `compute/capacity`, `transmission-headroom`, `grid-buildout`, `flexible-capacity` — because the products shipped after it was written. That is why `server.test.ts` now asserts that every `route.ts` under a premium API namespace appears in the ledger, rather than trusting the list.

### Available Compute Capacity belongs to Compute Economics

`/api/compute/capacity{,/series}` serve **Available Compute Capacity**. It is classified under `compute_economics` — **confirmed 27 September 2026**, rather than being split out as its own product or left public.

Worth knowing when you next touch it: its section component (`available-capacity-section.tsx`) is rendered on **no page**, so this classification currently governs the two API routes alone. Its dataset is also empty by design, because no permitted source exposes a capacity quantity. When the section is eventually surfaced, it belongs behind the Compute Economics gate with the rest of that product — not as a separate entitlement.

---

## 8. The map: filtered, never refused

The map is a public product that contains premium products. Refusing the route would take the public map away to protect part of it.

| Category | Product | Class |
| --- | --- | --- |
| `data_center` | `map_data_centers` | public |
| `gpu_compute_cluster` | `map_gpu_compute` | premium |
| `power_infrastructure` | `map_power_infrastructure` | premium |
| `semiconductor_fab` | `map_semiconductor_fabs` | premium |

`resolveMapAccess()` produces a partition — `visibleCategories` and `lockedCategories` — decided per category through `canAccess` rather than by one "is a subscriber" boolean. The two are equivalent today and stop being equivalent the moment a category's classification changes.

**Server-side, before serialisation:**

- `filterMapPoints` drops locked points before they cross to the client component
- `filterFacilityModel` drops locked facilities from the API response **and zeroes their `coverage.byCategory` counts** — otherwise the response tells an unsubscribed reader exactly how many GPU clusters and fabs are being withheld. `served` is recomputed; `published` is left alone, since dataset size is a public fact about Urdais's coverage.
- The filtered model still satisfies `validatePublicFacilities`, so a gated map is not a 500.

**Client-side, presentation only:** a locked category **stays in the legend**. Withholding the points while hiding the name would make the map look emptier rather than gated, and nobody can decide to buy something they cannot tell exists. Sending the category *names* is not a leak — the premium products are advertised publicly. Sending their coordinates would be.

A locked legend row:

- is **not** `disabled` — a disabled control is unfocusable, which would leave a keyboard user unable to reach the one affordance that explains the lock
- carries **no `aria-pressed`** — it is not a toggle, and announcing it as an unpressed switch would say the layer is merely switched off
- says "Premium, subscription required" **in words**, so the lock never depends on colour or the icon
- opens the gate over the map, which keeps its position and zoom

The gate dialog is only rendered when something is actually locked, so with enforcement off the public map ships none of its markup.

---

## 9. Modal semantics come from the platform

`PremiumLayerDialog` is built on `<dialog>` with `showModal()`, the same way `SearchModal` is. Focus trapping, Escape, the top layer, background inertness and focus restoration are the browser's implementation rather than four hand-rolled listeners that each have an edge case. Verified in a real browser: focus lands inside, the legend behind is genuinely inert, Escape closes, the map survives.

---

## 10. `returnTo`

Built in one place (`src/lib/access/gate-links.ts`) and validated by Phase 2's `safeReturnTo` — the only redirect sanitiser in Urdais. A second one is how the two drift and one becomes an open redirect.

| Gate | `returnTo` |
| --- | --- |
| Compute Economics | `/markets/compute-analytics` |
| Power Analytics | `/markets/power-analytics` |
| Premium map layer | `/map?layer=<category>` |

### `/access` is the real onboarding journey

> **Updated by Phase 4.** It was a placeholder that said subscriptions were not available yet. It is now the onboarding entry point — see `docs/architecture/onboarding.md`.

Every CTA still leads to `/access`, and that is the whole value of routing it through `accessHref`: the gates were written against that destination and were not touched when what sits behind it became real. `/access` resolves the reader's authoritative state and routes them — offer and choice for an anonymous reader, the step their account needs for a signed-in one, "you already have full access" for a subscriber.

Onboarding ends at a checkout boundary that states plainly that payment is not available yet. Phase 5 replaces that boundary, and the gates will not need touching then either.

---

## 11. Activation prerequisites

Do not set `URDAIS_PREMIUM_ENFORCEMENT=active` in production until **all** of:

1. Stripe checkout exists and a reader can actually buy the entitlement.
2. Onboarding exists, and `accessHref` points at it instead of `/access`.
3. An operator can grant a `manual` entitlement to founder, support and comp accounts.
4. Supabase custom SMTP is configured — otherwise a gated reader cannot even complete the account creation the purchase requires.
5. ~~The Available Compute Capacity classification in §7 has been confirmed.~~
   **Done** — confirmed as part of `compute_economics`, 27 September 2026.

Activating earlier denies a shipped product to everyone. Activating the pages but not the APIs is impossible by construction, which is the one failure mode that cannot happen here.

---

## 12. Where things live

| | |
| --- | --- |
| Activation switch | `src/lib/access/activation.ts` |
| Server gate + ledger | `src/lib/access/server.ts` |
| Map partition + filters | `src/lib/access/map-access.ts` |
| Gate copy | `src/lib/access/gate-copy.ts` |
| CTA destinations | `src/lib/access/gate-links.ts` |
| Gate panel | `src/components/premium/access-required-panel.tsx` |
| Locked page shell | `src/components/premium/premium-locked-page.tsx` |
| Map layer dialog | `src/components/premium/premium-layer-dialog.tsx` |
| Placeholder CTA target | `src/app/access/page.tsx` |
