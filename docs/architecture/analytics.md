# Product analytics (PostHog)

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 8 October 2026. The integration is built and **off** until `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` are set in Vercel Production.

Urdais sends web and product analytics to PostHog. This document records what is
sent, from where, and the decisions behind it. The code is in `src/lib/analytics/`,
`src/components/analytics/` and `src/instrumentation-client.ts`.

## On or off

Analytics runs only when **all** of these hold (`src/lib/analytics/config.ts`):

- `NEXT_PUBLIC_POSTHOG_KEY` is a PostHog **project** key (`phc_…`);
- `NEXT_PUBLIC_POSTHOG_HOST` is an `https` origin;
- the build is a production build (`NODE_ENV=production`).

Anything else turns it off, silently and completely. `next dev` and `vitest` never
send. Both variables are inlined at build time, so changing them needs a redeploy.

Set them in Vercel's **Production** scope only. Preview deployments are production
builds and would otherwise count preview traffic as visitors.

A personal API key (`phx_…`) in `NEXT_PUBLIC_POSTHOG_KEY` is refused. Refusing it
cannot un-ship a key that was inlined into the bundle; if that ever happens, rotate
the key in PostHog.

## What PostHog captures by itself

Initialised once in `src/instrumentation-client.ts`, before hydration, through `startAnalytics` (`src/lib/analytics/consent-client.ts`). What is captured depends on consent; see below.

| Capture | Setting |
| --- | --- |
| `$pageview` on load and on every client-side navigation | `capture_pageview: "history_change"` |
| `$pageleave` | default |
| Clicks, form submits (never input values) | autocapture, default |
| Referrer, landing page, UTM parameters | automatic on every event |

Nothing in Urdais records `$pageview` by hand. A second recorder is how pageviews
double.

## Custom events

| Event | Fired by | Where |
| --- | --- | --- |
| `product_viewed` | browser | `TrackProductView`, on the rendered branch of each product page |
| `index_viewed` | browser | `/markets/[symbol]` (publicly listed indexes only; 404s record nothing) |
| `analytics_viewed` | browser | `/markets/model-economics`, `/markets/compute-analytics`, `/markets/power-analytics` |
| `map_viewed` | browser | `/map` |
| `premium_cta_clicked` | browser | "Get Full Access" in the page gate and the map-layer gate |
| `checkout_started` | **server** | `startCheckoutAction`, only after Stripe has created a Checkout Session |
| `subscription_completed` | **server** | the Stripe webhook, or `/access/complete` reconciliation — whichever activated access |

Properties are low-cardinality and come from the access registry
(`src/lib/access/products.ts`): `product_id`, `product_name`, `product_category`
(`index`, `analytics`, `map`), `access_tier` (the product's class, `public` or
`premium`), plus `locked` on views (the reader saw the gate), `cta_surface`
(`page`, `map_layer`) and `source_page` (a path).

### `subscription_completed` fires once per activation

Stripe sends several entitling events per purchase, retries, and may race the
post-checkout reconciliation. All of them grant. So the conversion is not "a grant"
but "the grant that changed the entitlement row from not-active to active":
`ACTIVATE_ENTITLEMENT_SQL` (`src/lib/billing/store.ts`) is the existing grant with
`where status <> 'active' returning account_id`, evaluated against the locked row in
the same transaction as the event claim. Exactly one transaction sees the
transition. A replayed event is a ledger duplicate and never reaches it.

The event's uuid is derived from the subscription id as a second line of defence.

A lapse and a resubscription is a new activation, and is recorded as a new
conversion.

The success redirect is never treated as payment. See `src/lib/billing/webhook.ts`.

## Consent

`src/lib/analytics/consent.ts` (rules), `consent-client.ts` (browser), `request-consent.ts` (server), `src/components/analytics/consent-banner.tsx` (UI).

| Visitor | Browser analytics | Server events (`checkout_started`, `subscription_completed`) |
| --- | --- | --- |
| Accepted | full PostHog: persistent anonymous id; identified on sign-in | keyed on the account |
| Declined, default-on region | **cookieless**: no cookie or identifier stored on the device (only the choice itself); visitors counted by PostHog's daily server-side hash; never identified | anonymous count (random id, no person) |
| Declined, EEA / UK / CH, or country unknown | **nothing**: PostHog left pending, or not started at all on later visits | **not sent** |
| Not decided, EEA / UK / CH, or country unknown | **nothing** captured, nothing stored, no request to PostHog | **not sent** |
| Not decided, elsewhere | full PostHog, with the banner offering Decline | keyed on the account |
| Do Not Track or Global Privacy Control | PostHog never starts | **not sent** |

- **The choice** is a first-party cookie, `urdais_analytics_consent=granted|denied`
  (1 year, `SameSite=Lax`). It records a decision, which is the one thing that must
  be stored to honour a refusal, and the server reads it for checkout events.
- **The region** comes from Vercel's `x-vercel-ip-country` header, read by
  `GET /api/privacy/consent-default`. The banner calls it once per full page load, and
  only while the visitor has not chosen. Reading it in the root layout would make every
  page, the static docs included, render per request. Urdais has no geolocation of its own.
  A missing header (local, non-Vercel) means the conservative default.
- **The prior-consent list** (EEA, UK, Switzerland) is a product/legal judgement in
  `PRIOR_CONSENT_COUNTRIES`, not something code can verify. A missing or malformed
  code, and the two-letter placeholders geolocation databases use for "not a
  country" (`XX`, `ZZ`, and the region-level `EU`, `AP`), all get the strict default.
- **Trusting the header.** Vercel documents that it overwrites `x-forwarded-for` to
  prevent spoofing, but says nothing explicit about `x-vercel-ip-country`; it has not
  been tested against a deployment (previews are behind Vercel Authentication).
  Check with `vercel curl -H "x-vercel-ip-country: DE" <preview>/api/privacy/consent-default`
  from outside the EEA: `"granted"` means the client value was ignored. The exposure
  is limited either way: the header only sets the requesting visitor's *own*
  pre-choice default, so a spoofed value can opt in only the person sending it.
- **Consistency:** the region is looked up once per full page load, never on
  client-side navigation, and a browser already counted under a default-on region
  keeps its id on later loads.
- **SDK configuration:** `cookieless_mode: "on_reject"`, verified against posthog-js
  1.438. Pending captures nothing, and pending also *deletes* persisted data, which is
  why a browser already counted by regional default is never cycled through pending
  to re-check its region. PostHog's `respect_dnt` is not used: under `on_reject` it
  maps DNT to "rejected", which would make a DNT browser cookieless-*tracked*.
- **When capture becomes allowed** (accept, decline, or the default-on answer
  arriving), the SDK sends the pageview it held back. Nothing in Urdais sends one by hand.
- **Changing your mind:** "Privacy settings" reopens the panel, signed in or not. It is
  in the site footer, in the map's top-left corner (the map has no footer; no map
  control uses that corner), and at the foot of the premium onboarding frame
  (`/access/discover`, `/access/audience`, also footerless). The one footerless page
  without it is `/auth/status`, the operator diagnostic. Opened from any of them, the
  panel takes focus, closes on Escape and returns focus to the control. Declining
  after accepting resets PostHog (identity and persisted data) and removes its leftover
  `ph_*` session window ids.
- **The banner** offers Accept and Decline with identical size and style, has no
  dismiss-without-choosing on the first ask, and is not modal.

### Server events follow the same choice

A server event never names a visitor who has not consented (`ServerConsent` in
`src/lib/analytics/consent.ts`): `granted` keys it on the account; `anonymous` (a
refusal in a default-on region) sends it **personless** — a random distinct id,
`$process_person_profile: false`, nothing derived from the account or
subscription; `none` (any prior-consent or unknown-region visitor without a grant,
or DNT/GPC) sends nothing. Stripe metadata written before this three-way rule
(`not_granted`) reads as `none`.

- `checkout_started` reads the request's consent (cookie, `DNT` / `Sec-GPC` headers,
  regional default).
- The Stripe webhook has no cookie. The checkout records the consent in force at that
  moment as Stripe metadata `urdais_analytics_consent` on the Session and the
  Subscription. Billing reads nothing from it. A subscription without it (created
  before this change, or outside Checkout) counts as `not_granted`.
- On `/access/complete` (reconciliation) the reader's request is available, so the
  conversion follows the **stricter** of the checkout-time consent and the current
  request's consent.
- **Limitation:** consent withdrawn between starting checkout and activation is not
  seen by a **webhook** conversion, which has only the checkout-time record. It
  affects at most that one event.

### What the code cannot settle

These are decisions or facts outside the code. They are recorded here so nobody
mistakes the implementation for legal advice:

- **Cookieless counting of decliners.** Used only outside the EEA, UK and Switzerland
  (and never where the country is unknown). PostHog positions cookieless mode as
  storing nothing on the device, but its hash still processes IP address and user
  agent, which needs a lawful basis and a privacy-notice entry. In the prior-consent
  regions a decline sends nothing, because whether cookieless counting after a
  refusal is lawful there is unsettled (EDPB Guidelines 2/2023 ¶43, ¶55–56).
- **Default-on outside the EEA/UK/CH.** Some US states give users an opt-out right
  that Global Privacy Control must honour (handled: PostHog never starts), and other
  jurisdictions (e.g. Brazil, Canada, Quebec, South Korea, India) have their own
  rules. The list treats them as default-on; extend `PRIOR_CONSENT_COUNTRIES` if
  counsel says otherwise.
- **IP geolocation is approximate.** VPNs and travel put visitors in the wrong
  region. An EEA resident on a US VPN gets the US default; the banner still offers
  Decline.
- **PostHog as processor.** A data processing agreement with PostHog, and EU-hosted
  ingestion (`https://eu.i.posthog.com`) if wanted, are account-level decisions.
- **The privacy policy** must describe all of this. Urdais has no privacy-policy page
  in this repository.

## Identity

Sessions are httpOnly cookies and the browser has no Supabase client, so the browser
cannot know who is signed in. The pages that already resolve the viewer on the
server render `<AnalyticsIdentity accountId=… />`:

| Page | Result |
| --- | --- |
| `/access`, `/access/discover`, `/access/audience`, `/access/login` | anonymous: reset if PostHog thinks this browser is identified |
| `/access/ready`, `/access/subscribed`, `/access/complete`, `/account` | identify with the account id, **only with consent** |
| `/account/deleted` | reset |
| Sign-out (`SignOutForm` on `/account`) | reset on submit, then re-apply the visitor's consent (`reset()` clears it) |

**Stale identities.** Before PostHog starts on a browser it previously identified,
the browser asks `GET /api/analytics/identity` which account the current session
belongs to, at most every ten minutes per tab. Anything but that same id (account
deleted, signed out elsewhere, session ended, the check failing) and PostHog starts
already reset, so nothing is sent under the old id. On account deletion the PostHog
person and its events are erased: docs/operations/posthog-activation.md § Account
deletion and analytics.

Every sign-in lands on one of the identifying pages. With consent, the browser is
identified on the first page after sign-in and PostHog merges its anonymous history;
a reader who accepts later is identified then. The distinct id is
`identity.accounts.id`, the same id consented server events use. No email, name or
payment detail is sent, and person profiles exist for identified users only.

## Privacy

- **Session replay is off**, and surveys, product tours and conversations with it.
  `disable_external_dependency_loading` stops PostHog loading any further script, so
  a project-settings toggle cannot turn replay on. Turning it on is a code change.
- **No feature-flag requests** (`advanced_disable_flags`): Urdais uses none, and
  `/flags` would otherwise be called on every load with a distinct id.
- **URLs are sanitised** before sending (`src/lib/analytics/privacy.ts`): fragments
  are dropped and `token_hash`, `code`, `session_id`, access/refresh tokens and
  `email` parameters are redacted in every property whose name ends in `url` or
  `referrer` (current URL, referrer, `$initial_*`, `$session_entry_*`, …), on the
  event and on the person. UTM parameters are kept.
- Ad click ids (gclid, fbclid, …) are masked.
- The email on `/account` is marked `ph-no-capture`.
- Server events disable GeoIP, which would otherwise locate Vercel.

## PostHog project setup (manual)

1. Confirm the project belongs to Urdais; copy its **project** key (`phc_…`) and its
   ingestion host into Vercel Production only. Never the personal key (`phx_…`).
2. Project settings → Web analytics → **enable "Cookieless server hash mode"** if
   decliners in default-on regions should be counted. Without it, their events are
   dropped at ingestion (decliners in the EEA/UK/CH send nothing either way).
3. Project settings → authorized domains: add `https://urdais.com`.
4. Leave Session replay off. Project settings cannot turn client features on:
   `advanced_disable_flags` also disables PostHog's remote config, so heatmaps, web
   vitals, dead clicks and exception capture stay off whatever the settings say (the
   last three also need external scripts, which are disabled). Configure IP storage,
   GeoIP and retention as in docs/operations/posthog-activation.md.
5. Optionally filter internal traffic (Urdais operators) by person or IP.

## Dashboards

Build these in PostHog; nothing here can be created from code.

**Website overview** — PostHog's built-in Web analytics dashboard covers unique
visitors, pageviews, top pages, entry (landing) pages, channels, referring domains,
UTM sources/campaigns and countries (GeoIP from the browser request; server events
have none).

**Product engagement** — Product analytics → new dashboard:

| Insight | Definition |
| --- | --- |
| Most-viewed indices | Trends, `index_viewed`, total count, breakdown `product_name` |
| Most-viewed analytics products | Trends, `analytics_viewed`, breakdown `product_name` |
| Map engagement | Trends, `map_viewed` (unique users and total) |
| Premium vs free engagement | Trends, `product_viewed`, breakdown `access_tier` |
| Gate views | Trends, `product_viewed` where `locked = true`, breakdown `product_name` |
| Premium CTA clicks | Trends, `premium_cta_clicked`, breakdown `product_name` and `cta_surface` |

**Subscription funnel** — Funnel `premium_cta_clicked → checkout_started →
subscription_completed`, aggregated by unique users, conversion window 7 days.
PostHog shows step-to-step and overall conversion. Breakdowns:
`$initial_utm_campaign`, `$initial_referring_domain`, `$initial_pathname` (landing page)
on the person, or `product_category` on the first step.

**Conversion counts** (Trends) — `checkout_started` and `subscription_completed`
totals. These include personless events, so they count more than the funnel does,
but they are **not complete**: checkouts and conversions by visitors who declined or
had not chosen in the EEA/UK/CH (or an unknown region), or who send DNT/GPC, are not
sent at all. Stripe remains the authoritative count of subscriptions.

### Attribution limits

- **Declined and undecided visitors cannot be in a per-person funnel.** Their browser
  events are cookieless or absent and their server events are personless or absent,
  so the funnel covers consenting visitors only. The Trends totals count consenting
  visitors plus decliners outside the EEA/UK/CH; EEA/UK/CH decliners and undecided
  visitors are not counted at all.
- **Cookieless visitors are counted per day.** PostHog's hash rotates daily, so a
  visitor who returns tomorrow is a new visitor, and multi-day attribution is lost.
- **Undecided visitors in prior-consent regions are not counted at all** until they
  choose.
- **Ad blockers** drop browser events (there is no `/ingest` reverse proxy).
- **Sign-in on another device** starts a new anonymous history, which identify then
  merges only if that device has consent.

## Not done, deliberately

- No reverse proxy (`/ingest` rewrite). Ad blockers will drop some events. A proxy
  route would also run through `src/proxy.ts` on every batch; add it as its own
  change if the loss matters.
- No feature flags, experiments or error tracking.
- No third-party consent platform: one cookie, one banner and PostHog's own consent
  API cover the requirement.
