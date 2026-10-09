# PostHog production activation

**Status: runbook. Nothing in it has been executed.** Prepared 8 October 2026 against
`main` at `65fd4ad`. Every step that changes PostHog, Vercel or production needs
separate, explicit approval.

Background: docs/architecture/analytics.md (what is sent, consent, identity).
The privacy policy draft: `/privacy` (preview deployments only; see
`src/lib/privacy/policy.ts`).

## 0. Preconditions (decisions, not steps)

- [ ] Consent policy confirmed (§ Consent decisions in the PR description).
- [ ] Privacy policy: open items resolved and published, **or** an explicit decision
      to activate before publication (not recommended: the banner would have no policy
      to link to).
- [ ] PostHog hosting region chosen: US (`https://us.i.posthog.com`) or EU
      (`https://eu.i.posthog.com`). This is picked when the project is created and
      cannot be changed by editing a setting; moving regions means a new project.
- [ ] PostHog DPA reviewed and accepted for the organisation.

## 1. PostHog project

1. Sign in to the PostHog organisation that will own Urdais data and confirm the
   organisation and project names. Create a dedicated project for urdais.com if one
   does not exist; do not reuse a project holding other sites' data.
2. **Project key:** Project settings → General → "Project API key". It begins with
   `phc_`. It is public by design. Never use a personal API key (`phx_…`); the code
   refuses one.
3. **Host:** the ingestion host for the project's region (above). The app host
   (`us.posthog.com` / `eu.posthog.com`) is *not* the ingestion host.
4. **Cookieless server hash mode:** Project Settings → Web analytics → "Cookieless
   server hash mode". Without it PostHog **drops every declined visitor's events**.
   **Caveat:** PostHog documents that in this mode "the IP address is stripped before
   [GeoIP and bot detection] run… the world map in Web Analytics won't show data". It
   does not say whether that applies to every event in the project or only the
   cookieless ones. Check the world map after activation; if it is empty for consented
   visitors too, decide between geographic data and counting decliners.
5. **Session replay:** confirm it is off. It is also disabled in code
   (`disable_session_recording`, `disable_external_dependency_loading`), so a
   settings toggle cannot turn it on.
6. **Authorized URLs:** add `https://urdais.com`. This only lets the toolbar and some
   web analytics filters work; it does **not** restrict ingestion. PostHog: "anyone
   with your public project token can send spoofed events."
7. **IP storage:** Settings → Project → "IP data capture configuration" → "Discard
   client IP data" (PostHog's docs also place it under General or Privacy). When on,
   IPs are not stored; GeoIP still uses the IP first. EU organisations default to on.
   Recommended on. Record the choice in the privacy policy.
8. **GeoIP:** a Data pipelines transformation. It adds `$geoip_city_name`, country,
   subdivisions, `$geoip_postal_code`, latitude/longitude and accuracy radius to events
   and persons. Whether it is on by default for new projects is not settled by
   PostHog's docs; check Data pipelines. The privacy policy must match the choice.
9. **Retention:** PostHog states 1 year (free) / 7 years (paid) for events, and that it
   "cannot" be shortened. Record the applicable period in the privacy policy.
10. **DPA:** app.posthog.com/legal → "+ New" → "Data Processing Agreement (DPA)" →
    "Send for signature" (any plan; PostHog countersigns in advance). Subprocessors:
    posthog.com/subprocessors.
11. **Region is permanent in practice:** cross-region migration is offered only on the
    Scale/Enterprise plans and is run by PostHog. Choose US or EU (Frankfurt) before
    collecting data.
12. **Project settings cannot turn on client features.** The code sets
    `advanced_disable_flags`, which also disables PostHog's remote config, so toggles for
    heatmaps, web vitals, dead clicks or exception capture never reach the browser
    (and the last three would be blocked by `disable_external_dependency_loading`
    anyway). What is collected is decided in `src/lib/analytics/consent-client.ts` only.

## 2. Vercel

1. Project → Settings → Environment Variables. Add, **Production scope only**:
   - `NEXT_PUBLIC_POSTHOG_KEY` = the `phc_` key
   - `NEXT_PUBLIC_POSTHOG_HOST` = the ingestion host, `https://…`, no trailing path
2. Do not add them to Preview or Development: preview traffic would be counted as
   visitors.
3. **Redeploy production.** Both are `NEXT_PUBLIC_` variables, so Next inlines them
   into the browser bundle at build time; the running deployment cannot see a
   variable added after it was built. Deployments → latest Production → Redeploy
   (without the build cache), or merge any approved change to `main`.

## 3. Kill switch

Fastest first:

1. **Vercel Instant Rollback** to the production deployment built before the
   variables existed. Takes effect immediately; that build contains no key, so
   nothing is initialised.
2. Then remove both variables from Production and redeploy, so the next build is
   also inert.
3. If data that should not have been collected was ingested: delete it in PostHog.
   Persons → person → "Delete person", or
   `DELETE /api/projects/<id>/persons/<uuid>?delete_events=true` with a personal API key
   (never committed). Event deletion is asynchronous (PostHog runs it off-peak,
   typically weekends). Record what happened.

**Account deletion and analytics.** Deleting an Urdais account does not delete its
PostHog person. Until that is automated, an erasure request means deleting the person
whose distinct id is the account id, as above.

Turning analytics off never affects sign-in, billing or entitlements: the code
treats missing configuration as "off" and every analytics call is a no-op.

## 4. Verification after activation

Use a normal browser profile with no Do Not Track / GPC, PostHog's Activity view
open, and a private window per scenario. Live PostHog is required for all of it.

**Web analytics**

- [ ] Load `/` with `?utm_source=activation_test&utm_campaign=activation`: one
      `$pageview` with those UTM properties and `$referrer` `$direct`.
- [ ] Click through to an index and to `/map`: one `$pageview` each, plus
      `product_viewed` + `index_viewed` / `map_viewed`. No duplicates.
- [ ] Web analytics dashboard shows the visit, entry page and source within minutes.

**Consent**

- [ ] Default-on region (e.g. US): events arrive without choosing; banner offers
      Decline.
- [ ] Strict region (VPN to an EEA country, or any visitor where the country is
      unknown): **no** request to the PostHog host in DevTools → Network until a
      choice is made.
- [ ] Accept: events arrive with a persistent `distinct_id`; `ph_…` cookie present.
- [ ] Decline: events arrive with `distinct_id` `$posthog_cookieless` and
      `$cookieless_mode: true`; no `ph_…` cookie or `ph_…` storage. **If no events
      arrive, cookieless server hash mode is not enabled.**
- [ ] Withdraw (Accept → Privacy settings → Decline): `ph_…` storage removed, later
      events cookieless.
- [ ] GPC (e.g. Brave, or a browser setting): no request to the PostHog host at all.

**Conversion** — no real payment is needed:

- [ ] `premium_cta_clicked`: click "Get Full Access" on a locked page.
- [ ] `checkout_started`: press "Continue to Checkout" with a signed-in, unentitled
      test account and abandon on Stripe's page. One event, keyed on the account when
      consent is granted, personless otherwise.
- [ ] `subscription_completed`: do **not** create a live subscription for this. Either
      wait for the next genuine subscription, or verify on a preview deployment with
      Stripe test mode and its own PostHog project. Expect exactly one event per
      activation however many webhooks Stripe sends.

**Payloads**

- [ ] Open a captured event: no `token_hash`, `code`, `session_id` or email values in
      any `*url`/`*referrer` property; click ids show `<masked>`.

## 5. Consent policy assessment

Not legal advice. Sources are quoted in the PR description.

**Confirmed technical behaviour** (production build, every PostHog request captured):

- EEA/UK/CH or unknown country, undecided: **zero** requests to PostHog, nothing stored.
  PostHog's source agrees: with `advanced_disable_flags` the remote-config loader
  returns before any request, and `on_reject` captures nothing while pending.
- Accepted / default-on: persistent `$device_id`, `$session_id`, `$window_id`; raw
  user agent, screen/viewport, timezone, language, scroll depth, URLs, referrer, UTM,
  autocaptured element text and classes. Click ids arrive as `<masked>`.
- Declined: `distinct_id` `$posthog_cookieless`, `$device_id` null, no session/window
  ids, no `ph_` storage; the same descriptive properties otherwise. PostHog hashes
  team id, a daily salt (deleted after processing), IP, user agent and hostname.
- DNT/GPC: PostHog never starts.
- Withdrawal: `reset()`, opt-out, `ph_` storage removed; verified in a browser.
- Server events: account-keyed only with consent at checkout; otherwise personless.

**Supported by the sources**

- PostHog does not claim `on_reject` removes consent requirements; it claims
  `cookieless_mode` "helps comply" and that collection and storage must still be
  configured.
- California treats GPC as an opt-out of sale/sharing; Colorado treats it as the only
  valid universal opt-out mechanism for sale and targeted advertising. Urdais does
  neither and goes further by not starting PostHog at all.
- UK: since 5 February 2026 (Data (Use and Access) Act 2025, s.112) storage/access
  for statistical analysis is exempt from consent if users get clear information and
  a simple, free way to object.
- CNIL: audience measurement can be exempt from consent under conditions that include
  truncating the IP's last byte, 13-month tracker lifetime and 25-month data
  retention.

**Legal uncertainties needing human review**

1. **Counting decliners in the EEA.** EDPB Guidelines 2/2023 (¶43, ¶55) say reading
   the user agent or an IP from the device can fall under Art. 5(3) ePrivacy, while
   ¶56 says that "does not systematically mean that consent needs to be collected". No
   regulator has ruled on PostHog-style server hashing, or on whether "Decline" is an
   objection that must stop counting. The conservative variant is: in the
   prior-consent regions, Decline sends nothing (drop cookieless for them only).
2. **PostHog retention vs. CNIL's 25 months.** 7 years on paid plans, not shortenable.
3. **GeoIP precision** (city, postal code, coordinates) vs. the CNIL condition of IP
   truncation; PostHog's "Discard client IP data" stops storage but not GeoIP.
4. **UK could move out of the strict list** under DUAA s.112 (default-on with a clear
   objection route), which Urdais already offers. Doing so is a legal call.
5. **Other jurisdictions** (Brazil, Canada/Quebec, South Korea, India, US states) are
   default-on. CCPA thresholds ($26.6M revenue, 100,000 consumers) are unlikely to
   apply today, but a PostHog DPA is what makes PostHog a service provider.
6. **IP geolocation errors** (VPNs, travel) put some visitors in the wrong region.

**Recommended changes, none made, each needing approval**

- Enable "Discard client IP data" (no code change).
- Decide on GeoIP before activation, and check the cookieless world-map caveat.
- If counsel prefers the conservative EEA reading: drop cookieless counting for
  decliners in prior-consent regions only. This is a small change in
  `consent-client.ts` (opt out without `cookieless_mode` there).
- Automate PostHog person deletion on account deletion; until then, it is a manual
  step on erasure requests.

## 6. What was verified without PostHog

Against a production build with a fake key and every PostHog request intercepted
(see the PR): which requests are made in each consent state, every property sent,
pageview de-duplication, redaction, withdrawal clean-up, GPC. What cannot be checked
that way: PostHog's server side (cookieless hashing, GeoIP, ingestion, retention,
dashboards).
