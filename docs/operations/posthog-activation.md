# PostHog production activation

**Status: runbook. Nothing in it has been executed.** Prepared 8 October 2026,
revised 10 October 2026 for the final privacy-readiness changes. Every step that
changes PostHog, Vercel or production needs separate, explicit approval.

Background: docs/architecture/analytics.md (what is sent, consent, identity). The
privacy policy draft: `/privacy` (preview deployments only; see
`src/lib/privacy/policy.ts`).

## The activation sequence

Each step is a gate: do not start one until the previous is done.

### 1. Complete privacy and legal decisions

- [ ] Consent policy confirmed, as implemented (§ Consent policy below), including the
      decision that decliners in the UK and Switzerland send nothing (conservative;
      reversible in one place).
- [ ] Default-on outside the EEA/UK/CH accepted, with the limitations in § Consent.
- [ ] Every "To confirm" item in the privacy policy answered (legal entity and address,
      privacy contact, retention periods, auth email provider, DPAs, legal bases,
      minimum age, change notification, the no-ads/no-sale commitment).
- [ ] Automated analytics erasure on account deletion is merged (§ Account deletion).

### 2. Finalize and publish the privacy policy

1. Replace every `<Todo>` in `src/app/privacy/page.tsx` with the confirmed text.
2. In `src/lib/privacy/policy.ts` set `PRIVACY_POLICY_STATUS = "published"` and
   `PRIVACY_POLICY_EFFECTIVE_DATE`. The policy test fails if one changes without the
   other. Publishing removes the draft banner and `noindex`, serves `/privacy` in
   production, and adds the links in the footer and the consent panel.
3. Merge through a reviewed PR. **Publish before or with activation, never after**:
   the banner links to the policy, and analytics must not run without one.

### 3. Confirm the PostHog project and hosting region

- A **dedicated** project for urdais.com in the organisation that will own the data;
  never one holding other sites' data. Confirm the organisation and project names.
- **EU (Frankfurt) is the preferred region.** Ingestion host `https://eu.i.posthog.com`;
  app and API host `https://eu.posthog.com`. US equivalents: `us.i.posthog.com`,
  `us.posthog.com`.
- **The region is effectively permanent**: PostHog offers cross-region migration only
  on its Scale/Enterprise plans, run by PostHog. Choose before collecting any data.
- EU hosting is not by itself a transfer guarantee: PostHog's subprocessors include US
  services (posthog.com/subprocessors), and its DPA relies on the EU-U.S. Data Privacy
  Framework plus the Standard Contractual Clauses.

### 4. Data processing agreement and retention

- **DPA:** app.posthog.com (or eu.posthog.com) → Organization → Legal
  (`/legal`) → "+ New" → "Data Processing Agreement (DPA)" → "Send for signature".
  Available on every plan; PostHog countersigns in advance.
- **Retention** (posthog.com/docs/data/events-retention):

  | Data | Retention |
  | --- | --- |
  | Events | **1 year** on the free plan, **7 years** on paid plans. PostHog: it "cannot" be made shorter, "and a shorter period is not available on request". |
  | Persons (profiles) | No separate period is documented. Treat as kept until deleted. *(Unverified.)* |
  | Cookieless observations | Ordinary events: same retention. The daily salt is deleted after that day's events are processed, so the hash cannot be recomputed. |
  | Session identifiers (`$session_id`, `$window_id`) | Event properties: same retention as events. In the browser: session storage until the tab closes; the `ph_…` cookie up to 1 year. |
  | Deletion requests | Person removed shortly after the request; its events deleted asynchronously (PostHog Cloud runs these off-peak, typically weekends), and only events captured before the request. |

  "Shortest practical retention" therefore means the **free plan's 1 year**, unless a
  paid plan is needed, in which case the policy must say 7 years. CNIL's guidance for
  consent-exempt audience measurement cites 25 months, so 7 years is a legal question.

### 5. Cookieless server hash mode (if decliners outside the EEA/UK/CH are to be counted)

Project Settings → Web analytics → "Cookieless server hash mode". It is only used by
visitors who **decline in a default-on region**; decliners in the EEA/UK/CH, unknown
regions and DNT/GPC browsers send nothing either way. Without it, those cookieless
events are dropped at ingestion. Caveat: PostHog says that in this mode "the IP
address is stripped before [GeoIP and bot detection] run… the world map in Web
Analytics won't show data", without saying whether that applies to every event or
only cookieless ones. Leaving it off is a legitimate choice: decliners then simply
are not counted.

### 6. IP and location settings

| Setting | Recommendation | Trade-off |
| --- | --- | --- |
| "Discard client IP data" (Settings → Project → IP data capture configuration; PostHog's docs also place it under General or Privacy) | **On** | IPs are not stored on events. It does **not** stop GeoIP, which reads the IP before it is discarded. EU organisations default to on. |
| GeoIP transformation (Data pipelines) | **Off initially** | PostHog derives location only from the IP, so with GeoIP off there is **no country, region or city data at all** — the Web analytics world map and every country breakdown are empty. When on, it adds city, postal code and coordinates, not just country. Whether it is on by default for new projects is not settled by PostHog's docs: check Data pipelines and turn it off if present. Re-enabling it later affects new events only. |

If country-level geography is needed later, the choices are GeoIP on (precise) and a
policy update, or a separate change sending a coarse country property from the
server; neither is built.

### 7. Authorized domain and session replay

- **Authorized URLs:** add `https://urdais.com`. It enables the toolbar and some web
  analytics filters; it does **not** restrict ingestion ("anyone with your public
  project token can send spoofed events"). PostHog documents no domain allowlist for
  ingestion.
- **Session replay:** confirm it is off in project settings. The code also disables it
  (`disable_session_recording`, `disable_external_dependency_loading`), and
  `advanced_disable_flags` disables PostHog's remote config, so no project setting can
  switch on replay, heatmaps, web vitals, dead clicks or exception capture in the
  browser.

### 8. Set the variables in Vercel Production

Project → Settings → Environment Variables, **Production scope only**. Set the
erasure credentials **first**: from the moment analytics is on, account deletions
wait for them.

1. `POSTHOG_PERSONAL_API_KEY` — a **personal** API key created in PostHog (Settings →
   Personal API keys) with the **`person:write`** scope only, limited to this project.
   Server-only secret: never `NEXT_PUBLIC_`.
2. `POSTHOG_PROJECT_ID` — the numeric project id (Project settings → General).
3. `NEXT_PUBLIC_POSTHOG_KEY` — the project key (`phc_…`). Never a personal key; the
   code refuses one.
4. `NEXT_PUBLIC_POSTHOG_HOST` — the ingestion host, e.g. `https://eu.i.posthog.com`.

Not Preview or Development: preview traffic would be counted as visitors. Keep the
erasure credentials for as long as PostHog may hold Urdais data, even if analytics is
later turned off.

### 9. Fresh production deployment

Both variables are `NEXT_PUBLIC_`, so Next inlines them into the browser bundle **at
build time**; a deployment built before they existed cannot see them. Deployments →
latest Production → Redeploy **without** the build cache (or merge an approved change
to `main`). Note the deployment id of the last build *before* activation: it is the
rollback target.

### 10. Verify ingestion and consent (§ Verification below)

### 11. Confirm the rollback works

With approval, rehearse once: Vercel Instant Rollback to the pre-activation deployment,
confirm in a browser that no request reaches the PostHog host, then promote the
activated deployment again. Record both deployment ids.

## Kill switch

Fastest first:

1. **Vercel Instant Rollback** to the production deployment built before the
   variables existed. Immediate; that build contains no key, so nothing initialises.
2. Remove the two `NEXT_PUBLIC_POSTHOG_*` variables from Production and redeploy, so
   the next build is inert too. **Keep `POSTHOG_PERSONAL_API_KEY` and
   `POSTHOG_PROJECT_ID`**: PostHog still holds data, and account deletions must still
   erase it.
3. If data that should not have been collected was ingested: delete it in PostHog
   (§ Account deletion for persons; events by filter in the UI) and record what
   happened.

Turning analytics off never affects sign-in, billing or entitlements: missing
configuration means "off", and every analytics call is a no-op.

## Consent policy (as implemented)

| Visitor | Browser | Server events |
| --- | --- | --- |
| EEA, undecided | nothing; no request to PostHog | not sent |
| EEA, accepts | full analytics | keyed on the account |
| EEA, declines | nothing (PostHog pending, or not started on later visits) | not sent |
| UK or Switzerland | as EEA, **including** decline = nothing | as EEA |
| Unknown or malformed country | as EEA | as EEA |
| US and other regions, undecided | full analytics, banner offers Decline | keyed on the account |
| US and other regions, declines | cookieless counting | anonymous count |
| DNT or GPC | PostHog never starts | not sent |

Withdrawal (accept → Privacy settings → decline) resets PostHog (identity, persisted
data, consent), removes leftover `ph_` cookies and storage, and then behaves as a
decline in that region. If the region is not yet known at that moment, the
conservative branch applies.

### Assessment

Not legal advice.

**UK and Switzerland, after a refusal.** UK: since 5 February 2026 (Data (Use and
Access) Act 2025, s.112, commenced by SI 2026/82) storage/access for statistical
analysis is exempt from consent if users get clear information and "a simple and free
means to object"; the ICO says that once a user objects "you must stop storing or
accessing information on their device". Whether "Decline" is that objection, and
whether cookieless hashing of IP and user agent is "accessing" the device, is not
addressed by the sources found. Switzerland was not researched to the same depth.
**Recommendation: conservative — implemented.** Reversing it is one decision in
`src/lib/analytics/consent.ts` (`consentDefaultFor`) and the client's decline branch.

**EEA.** EDPB Guidelines 2/2023 ¶43 and ¶55 bring reading the user agent or an IP
within Art. 5(3) ePrivacy in some cases; ¶56 adds that this "does not systematically
mean that consent needs to be collected". No regulator has ruled on PostHog-style
hashing. Hence decline = nothing.

**Default-on elsewhere — limitations.**

- **United States.** California treats GPC as an opt-out of sale/sharing; Colorado
  treats it as the valid universal opt-out for sale and targeted advertising. Urdais
  does neither, and honours GPC by not starting PostHog at all. First-party analytics
  through a service provider is generally not a "sale" or "sharing" (cross-context
  behavioural advertising) under the CCPA, but that depends on a service-provider
  contract — the PostHog DPA. CCPA applies above $26,625,000 revenue, 100,000
  California consumers/households, or 50% revenue from selling data; Urdais is
  unlikely to meet these today. Other state laws have their own thresholds and notice
  rules *(state-by-state list unverified)*. A notice at collection — the privacy
  policy, linked from the banner — must exist before collection starts.
- **Other jurisdictions** (Brazil, Canada/Quebec, South Korea, India, others) are
  default-on without individual review.
- **IP geolocation is approximate**: VPNs and travel put visitors in the wrong region.
  An EEA resident on a US exit node gets the US default; the banner still offers
  Decline.

## Account deletion and analytics

### What happens on deletion

| Data | On account deletion |
| --- | --- |
| Supabase Auth user | deleted |
| Urdais account, role answer, entitlement | deleted (cascade) |
| Billing rows | retained, detached from the account |
| Stripe Customer | retained; `urdais_account_id` metadata unset |
| Stripe subscriptions | cancelled; their `urdais_account_id` metadata cannot be edited and remains |
| PostHog person: profile, merged anonymous ids, person properties | **deletion requested** (`bulk_delete` by the account id) within about a day; PostHog removes it shortly after accepting |
| PostHog events of that person, browser and consented server events | **queued for deletion** (`delete_events`); PostHog runs it asynchronously, off-peak (typically weekends). Urdais records that PostHog **accepted** the request, not that every event is gone |
| PostHog identity on the deleting browser | reset (`/account/deleted`) |
| PostHog identity on other browsers the account was signed in on | reset the next time PostHog starts there (within ten minutes for an open tab that reloads), before anything is sent: the identity check below |
| Anonymous counts, cookieless events | nothing to delete: no identifier |
| `identity.account_deletions` | held at `auth_deleted` (account id kept) until PostHog accepts; then `complete`, identifiers nulled |

### How it works (`src/lib/account/analytics-erasure.ts`)

1. The workflow deletes billing, the account and the Supabase user exactly as before
   and reaches `auth_deleted`. The reader is told the deletion is done.
2. If this deployment uses PostHog (analytics configured, or erasure credentials
   present) the record is **held**: lease released, `last_error =
   'analytics_erasure_pending'`, account id kept. Otherwise it completes at once, as
   before.
3. `/api/cron/analytics-erasure` (daily, 12:30 UTC) takes every record held for **at
   least an hour**, oldest first, leases it, and asks PostHog to delete the person by
   the account id and queue its events. The hour matters: PostHog deletes only events
   **captured before** the request, so requesting at the moment of deletion would race
   the reader's last events still being ingested, and they would recreate the person.
4. Accepted (202): the deletion completes and drops the identifiers. Anything else:
   released with `analytics_erasure_failed` or `analytics_erasure_unconfigured`,
   account id kept, retried the next day. The route answers **500 while any remain
   held**, so an outage or a missing key shows in the cron log every day. It also
   completes any record left at `auth_deleted` for other reasons.
5. "Complete" means PostHog **accepted** the erasure request. Event deletion then runs
   on PostHog's schedule; Urdais neither waits for nor claims it. Confirm it in
   PostHog if a specific request needs evidence.

Properties:

- **Where the request lives:** the existing `identity.account_deletions` row (state
  `auth_deleted`, `account_id` kept, `last_error` the reason). Ordinary Postgres
  state: it survives deployments and restarts. No new table or migration.
- **Discovery:** the cron selects `state = 'auth_deleted'` rows older than an hour.
- **Never discarded early:** the row becomes `complete` only after PostHog answers 202.
  A crash mid-attempt leaves it at `auth_deleted`; its 2-minute lease simply expires.
- **Idempotent:** the lease admits one attempt at a time; a completed row can never be
  leased again; if completing fails after PostHog accepted, the retry asks again and
  PostHog does not duplicate an already-queued person deletion.
- **Batch:** 50 per run, oldest first.
- **Authenticated:** `Authorization: Bearer $CRON_SECRET`, compared in constant time;
  every request is refused (401) when `CRON_SECRET` is unset.
- The key never leaves the server and is never logged; only codes and counts are
  logged, never an account id. Deletion never waits on PostHog.

### Other signed-in browsers (`GET /api/analytics/identity`)

A browser PostHog has identified keeps the account id across visits. Before PostHog
starts on such a browser, the browser asks `/api/analytics/identity` which account the
current session belongs to (no input; null without a session cookie; never provisions
an account). If the answer is not that id — account deleted, signed out elsewhere,
session ended, or the check failed — PostHog starts already reset, so nothing is sent
under the old id and an erased person is not recreated. A matching answer is cached in
the tab for ten minutes.

### Manual erasure

For a request to erase analytics **without** deleting the account, or to check a
held record by hand: `npm run analytics:erase -- --account <uuid>` (dry run), then add
`--execute`. Needs the same two credentials in the shell.

## Verification

Use a normal browser profile with no Do Not Track / GPC, PostHog's Activity view open,
and a private window per scenario. Live PostHog is required for all of it.

**Web analytics**

- [ ] Load `/` with `?utm_source=activation_test&utm_campaign=activation`: one
      `$pageview` with those UTM properties.
- [ ] Client-side to an index and to `/map`: one `$pageview` each, plus
      `product_viewed` + `index_viewed` / `map_viewed`. No duplicates.
- [ ] Web analytics dashboard shows the visit, entry page and source. (No geography
      while GeoIP is off.)

**Consent**

- [ ] EEA (VPN), undecided: **no request** to the PostHog host in DevTools → Network.
- [ ] EEA, Decline: still **no request**, on this page and after reload.
- [ ] EEA, Accept: events arrive with a persistent `distinct_id`; `ph_…` cookie set.
- [ ] EEA, withdraw (Accept → Privacy settings → Decline): `ph_…` cookie and storage
      removed; no further requests.
- [ ] UK and Switzerland: as EEA. Unknown country: as EEA.
- [ ] US, undecided: events arrive; banner offers Decline.
- [ ] US, Decline: events arrive as `$posthog_cookieless` (only if step 5 is on).
- [ ] GPC browser: no request at all.

**Conversion** — no real payment is needed:

- [ ] `premium_cta_clicked`: "Get Full Access" on a locked page.
- [ ] `checkout_started`: a signed-in, unentitled test account presses "Continue to
      Checkout" and abandons on Stripe's page. Keyed on the account with consent; an
      anonymous count after a US decline; absent after an EEA decline.
- [ ] `subscription_completed`: never a live test payment. Wait for a genuine
      subscription, or use a preview deployment with Stripe test mode and its own
      PostHog project. Exactly one per activation however many webhooks arrive.

**Account deletion** (with a test account; no live payment):

- [ ] With analytics accepted, sign in, browse, delete the account. The record waits at
      `auth_deleted` (`analytics_erasure_pending`) until the next cron run at least an
      hour later.
- [ ] After that run: `identity.account_deletions` for it reaches `complete`, and the
      PostHog person with that distinct id disappears shortly after. Its events are
      deleted later, on PostHog's schedule.
- [ ] The cron log for `/api/cron/analytics-erasure` shows `held 0` and a 200.
- [ ] A second browser that was signed in to the same account sends its next events
      under a new anonymous id, not the account id.

**Payloads**

- [ ] No `token_hash`, `code`, `session_id` or email values in any `*url`/`*referrer`
      property; click ids show `<masked>`.

## What was verified without PostHog

Against a production build with a fake key and every PostHog request intercepted (see
the PRs): requests per consent state and region, every property sent, pageview
de-duplication, redaction, withdrawal clean-up, GPC, footerless Privacy settings.
What cannot be checked that way: PostHog's server side (cookieless hashing, GeoIP,
IP discard, ingestion, retention, deletion, dashboards).
