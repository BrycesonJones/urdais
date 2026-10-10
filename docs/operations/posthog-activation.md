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
- [ ] Account-deletion handling for analytics chosen (§ Account deletion): manual for
      now, or the automated design approved.

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

Project → Settings → Environment Variables, **Production scope only**:

- `NEXT_PUBLIC_POSTHOG_KEY` = the project key (`phc_…`). Never a personal key
  (`phx_…`); the code refuses one.
- `NEXT_PUBLIC_POSTHOG_HOST` = the ingestion host, e.g. `https://eu.i.posthog.com`.

Not Preview or Development: preview traffic would be counted as visitors.

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
2. Remove both variables from Production and redeploy, so the next build is inert too.
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

### What happens today

| Data | On account deletion |
| --- | --- |
| Supabase Auth user | deleted (`auth.admin.deleteUser`) |
| Urdais account (`identity.accounts`), role answer, entitlement | deleted (cascade) |
| Billing rows | retained, detached from the account |
| `identity.account_deletions` | retained; `account_id` and `auth_subject` **nulled at `complete`** |
| Stripe Customer | retained; `urdais_account_id` metadata unset |
| Stripe subscriptions | cancelled; their `urdais_account_id` metadata cannot be edited and **remains** |
| PostHog identity on the deleting browser | reset (`/account/deleted`) |
| PostHog identity on other browsers the account signed in on | **remains** until that browser reaches a page that resets it (any `/access` page) or signs out; until then its events keep the account id as distinct id |
| PostHog person (profile, merged anonymous ids, person properties) | **remains** |
| PostHog events keyed on the account (browser and consented server events) | **remain** |
| Anonymous counts, cookieless events | nothing to delete: no identifier |

So deleting an account **does** leave an analytics profile and a pseudonymous event
history. For a former subscriber it stays linkable through the Stripe subscription
metadata above.

### Manual procedure (available now)

1. The request must be handled **before** the Urdais account deletion completes:
   after `complete`, nothing in Urdais maps the person to a PostHog distinct id.
2. Find the account id (`identity.accounts.id`) for the requester's verified email.
3. With a personal API key scoped to `person:write` in the shell (never committed):
   `npm run analytics:erase -- --account <uuid>` (dry run), then add `--execute`.
4. It calls `POST /api/projects/{id}/persons/bulk_delete/` with
   `{ distinct_ids: [<uuid>], delete_events: true }` (PostHog's server source:
   `PersonViewSet.bulk_delete`, scope `person:write`, at most 1,000 ids, 202 Accepted).
   That deletes the **person** — profile and every merged distinct id, so anonymous
   activity from before sign-in on an identified browser too — and **queues** its
   **events** for asynchronous deletion. Profile deletion and event deletion are
   separate operations in PostHog; `delete_events` is what requests the second.
5. Then let the account deletion proceed. Billing records are untouched by this.

Verify the endpoint against a test project before first use (*the `/api/projects/`
prefix is from PostHog's documentation and source, not yet exercised*).

### Automated design (not implemented; needs approval)

- **Where:** inside the existing workflow, between `auth_deleted` and `complete`,
  while the account id is still held. On success, complete as today.
- **Never blocks deletion:** the reader's account and sign-in are already gone at
  `auth_deleted`; the reader is told the deletion is done.
- **Never loses the request:** if PostHog fails, the row stays at `auth_deleted` with
  `last_error = 'posthog_erasure_failed'` (fits the existing code constraint), keeping
  the account id. The existing states and columns suffice: **no migration**.
- **Retry:** a new cron route that leases rows at `auth_deleted` and retries erasure.
  A new endpoint and schedule — needs approval.
- **Credentials:** `POSTHOG_PERSONAL_API_KEY` (scope `person:write` only) and
  `POSTHOG_PROJECT_ID`, server-only, in Vercel Production.
- **Unknown:** whether the persons API has plan restrictions *(not stated in the
  sources found)*.
- Built and tested now, unwired: `src/lib/analytics/erasure.ts` and the operator
  script.

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

**Payloads**

- [ ] No `token_hash`, `code`, `session_id` or email values in any `*url`/`*referrer`
      property; click ids show `<masked>`.

## What was verified without PostHog

Against a production build with a fake key and every PostHog request intercepted (see
the PRs): requests per consent state and region, every property sent, pageview
de-duplication, redaction, withdrawal clean-up, GPC, footerless Privacy settings.
What cannot be checked that way: PostHog's server side (cookieless hashing, GeoIP,
IP discard, ingestion, retention, deletion, dashboards).
