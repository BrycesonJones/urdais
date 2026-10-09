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

Initialised once in `src/instrumentation-client.ts`, before hydration.

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

## Identity

Sessions are httpOnly cookies and the browser has no Supabase client, so the browser
cannot know who is signed in. The pages that already resolve the viewer on the
server render `<AnalyticsIdentity accountId=… />`:

| Page | Result |
| --- | --- |
| `/access`, `/access/discover`, `/access/audience`, `/access/login` | anonymous: reset if PostHog thinks this browser is identified |
| `/access/ready`, `/access/subscribed`, `/access/complete`, `/account` | identify with the account id |
| `/account/deleted` | reset |
| Sign-out (`SignOutForm` on `/account`) | reset on submit |

Every sign-in lands on one of the identifying pages, so the browser is identified on
the first page after sign-in and PostHog merges its anonymous history. The distinct
id is `identity.accounts.id` — the same id the server events use. No email, name or
payment detail is sent; person profiles are created for identified users only.

## Privacy

- **Session replay is off**, and surveys, product tours and conversations with it.
  `disable_external_dependency_loading` stops PostHog loading any further script, so
  a project-settings toggle cannot turn replay on. Turning it on is a code change.
- **URLs are sanitised** before sending (`src/lib/analytics/privacy.ts`): fragments
  are dropped and `token_hash`, `code`, `session_id`, access/refresh tokens and
  `email` parameters are redacted in every property whose name ends in `url` or
  `referrer` (current URL, referrer, `$initial_*`, `$session_entry_*`, …), on the
  event and on the person. UTM parameters are kept.
- Ad click ids (gclid, fbclid, …) are masked.
- Do Not Track is respected.
- The email on `/account` is marked `ph-no-capture`.
- Server events disable GeoIP, which would otherwise locate Vercel.

There is no consent banner in Urdais today, and this integration does not add one.
PostHog persists an anonymous id in a first-party cookie and localStorage. If Urdais
needs opt-in consent for some audience, `opt_out_capturing_by_default` plus a
banner, or `cookieless_mode: "on_reject"`, are the PostHog mechanisms.

## PostHog dashboard setup (manual)

1. Create (or choose) the project; copy its project key and host into Vercel
   Production.
2. Leave Session replay off in project settings. Features that load extra scripts
   (replay, surveys, web vitals) do nothing while
   `disable_external_dependency_loading` is set, whatever the settings say.
3. Project settings → Web analytics: add `urdais.com` as an authorized domain.
4. Build a funnel: `premium_cta_clicked` → `checkout_started` →
   `subscription_completed`, aggregated by person.
5. Filter internal traffic (Urdais operators) by person or IP if desired.

## Not done, deliberately

- No reverse proxy (`/ingest` rewrite). Ad blockers will drop some events. A proxy
  route would also run through `src/proxy.ts` on every batch; add it as its own
  change if the loss matters.
- No feature flags, experiments or error tracking.
