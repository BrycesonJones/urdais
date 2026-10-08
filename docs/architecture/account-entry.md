# Account entry

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 1 October 2026, Phase 7A. Covers how a reader finds, creates and returns to their Urdais account. It is not the account page: that is Phase 7B.

> **Account identity and premium entitlement are separate.** An authenticated reader without an active entitlement still has a valid Urdais account and must not be sent back through authentication merely because premium access is denied.

## Phase 8 amendment — premium conversion and audience onboarding

Phase 8 adds two public pages to the premium-gate journey without changing direct
account entry:

| Route | Purpose |
| --- | --- |
| `/access/discover` | explains the four premium product areas; no pricing or protected data |
| `/access/audience` | optional single-select audience classification |
| `/access` | unchanged direct account-creation route |

Premium gates now link to `/access/discover`, carrying the validated `returnTo`.
Continue links to `/access/audience`; selection or Skip then continues to the
existing `/access` account form. The existing passwordless challenge, Plan / Pay,
Stripe Checkout, webhook-backed entitlement, and final product return are unchanged.

Both new routes call the existing server-side onboarding resolver. Anonymous readers
may render them. An authenticated reader without access bypasses both and goes to
`/access/ready`; an active subscriber goes to `/access/subscribed`. Direct signup,
sign-in, account and billing links keep their existing routes and behavior.

### Audience state and storage

The browser never submits an account id. Before authentication, the selected stable
role value is held for 30 minutes in an HTTP-only, SameSite=Lax cookie signed with
`URDAIS_ONBOARDING_STATE_SECRET` (minimum 32 characters). The payload contains only
the allow-listed role and issuance time—no email, auth subject, session token,
entitlement or return destination. Tampered, expired, unknown and future-dated
values (more than 60 seconds of clock skew) are ignored.

After OTP verification or the confirmation-link callback establishes a session, the
server consumes the pending state **at most once**: it reads the cookie, clears it,
and only then resolves the authoritative Urdais account through `resolveViewer()` and
upserts the role into `identity.account_audience_profiles`. If the account cannot be
resolved or the write fails, the choice is dropped rather than retained, so it can
never be attributed to a different account that later signs in on the same browser.
Sign-in itself is never failed by this step. The table is keyed by `account_id`,
has an allow-list constraint, is RLS-on with no browser policies, and references
`identity.accounts(id) on delete cascade`. Replays are idempotent. Skip writes no
default and clears only pending pre-auth state; it never clears an existing account
classification. Audience data is product analytics, never an entitlement or Stripe
Customer metadata.

Deployment requires migration `20261027100000_account_audience_profiles.sql` and a
shared server-only `URDAIS_ONBOARDING_STATE_SECRET` on every application instance.
No production migration or environment change is performed by the feature branch.

---

## 1. What changed in Phase 7A

| Before | After |
| --- | --- |
| Header ended in a global **Get Started** button linking to `/get-started`, a route that never existed | Header ends in an **account icon** linking to `/account` |
| Premium gate "Already have an account? **Sign in**" → `/auth/sign-in`, a password form explaining the migration to passwordless | → `/access/login`, the passwordless sign-in screen, `returnTo` unchanged |
| `/auth/sign-in` rendered the password form | permanently redirects to `/access/login`, carrying `returnTo` — the treatment `/auth/sign-up` already had |
| `/access/login` "Log in to Urdais", eyebrow, lead, a "Back" link, "New to Urdais?" | "Sign in to Urdais", email, Send code, "Don't have an account? Create account" |
| `/access` eyebrow, premium lead, "No password required." | "Create your account", email, Send code, "Already have an account? Sign in" |
| Auth screens inherited the `prefers-color-scheme` page background: white on a light-mode system | Their main column paints the dark Urdais surface (`#0a0a0a`, the footer's colour) |
| `/account` did not exist | a minimal placeholder: "You're signed in as …" and **Sign out** |

The Phase 7 premium conversion funnel described below was later extended by the
Phase 8 amendment above. OTP semantics, pending-email binding, resend, account
provisioning, entitlement checks, enforcement and every billing path remain intact.

---

## 2. The header

```
[Urdais] [Search ⌘K]                      Map  Docs  Contact  (👤)
                                                               └─ /account
```

One link, the same for every reader:

| Viewer | Click lands on |
| --- | --- |
| Anonymous | `/account` → 307 → `/access/login?returnTo=%2Faccount` |
| Authenticated, never subscribed | `/account` |
| Authenticated, active subscriber | `/account` |
| Authenticated, canceled / inactive | `/account` |
| Authenticated, `past_due` / otherwise not entitled | `/account` |

**The header reads no session.** It is a client component rendered on cached and dynamic pages alike, so any session state it showed could be stale — most visibly an authenticated header surviving sign-out. Instead `/account` decides on the server, at click time, with `resolveViewer`. Consequences:

- there is no authenticated header to go stale; after sign-out the very next click resolves anonymous;
- nothing in the browser is an authority — the icon is navigation, not authorization;
- no page had to become dynamic to render a header;
- the link is `prefetch={false}`, so merely rendering the header never asks the server who the reader is.

No entitlement decoration: no badge, crown or "Pro". Paid and unpaid accounts look identical in the header.

Accessibility: an `<a>` with `aria-label="Account"`, a decorative SVG (`aria-hidden`, `focusable="false"`), the header's shared `focus-visible` ring, last in the Primary nav's tab order, visible at every width.

---

## 3. Sign-in and account creation

```
/access/login                       /access
Sign in to Urdais                   Create your account
Email address  [            ]       Email address  [            ]
[ Send code ]                       [ Send code ]
Don't have an account? Create account   Already have an account? Sign in
```

The same `sendEmailOtp` call behind both (see `passwordless-authentication.md` §3 — that identity is the anti-enumeration property). Google appears above the email field on both only when it is configured. No password, no price, no Stripe, no profile questions, no migration history. Cross-links carry `returnTo`.

`/access/verify` lost its "CHECK YOUR EMAIL" eyebrow (it repeated the heading) and its "Log in" link reads "Sign in". The code field, its length handling (`configuredOtpLength()` — never a hard-coded six), resend and "Use a different email" are unchanged.

---

## 4. `returnTo`

Unchanged: `safeReturnTo` remains the only sanitiser, `/auth` and `/access` remain refused as destinations. `/account` is an ordinary internal destination.

**Account intent.** One addition in `resolveOnboarding` / `resolveOnboardingEntry`: when an *authenticated* reader would be redirected and their `returnTo` is `/account`, they go to `/account` instead of the onboarding state their account implies (Plan / Pay, or "already subscribed"). Without it, signing in from the header would end on a sales screen. The exceptions are deliberate:

- a legacy unverified account still goes to the email challenge first — that is authentication, not a sale;
- a state a reader *asks* for still renders (the rule changes where a redirect lands, never whether a state renders);
- only the exact path `/account` counts (with or without a query or fragment) — `/accounts` does not.

Journeys:

```
Premium conversion
  Power Analytics → ACCESS REQUIRED → Get Full Access
    → /access?returnTo=/markets/power-analytics → code
      → /access → /access/ready (Plan / Pay, $80/week) → Checkout → /markets/power-analytics

Existing account, from a gate
  … → Already have an account? Sign in → /access/login?returnTo=/markets/power-analytics
    → code → /access → /access/ready or /access/subscribed → …

Existing account, from the header
  (👤) → /account → /access/login?returnTo=/account → code
    → /access?returnTo=/account → /account

Already signed in
  (👤) → /account
```

Every redirect target is a state its viewer can render, so none bounces: `/account` sends only anonymous readers to sign-in, and sign-in sends only authenticated readers away — to `/account` when that was the destination.

---

## 5. `/account` — Phase 7A placeholder

> **Superseded in Phase 7B** by the Account Hub — see `account-hub.md`. Kept below as the record of what 7A shipped.

`src/app/account/page.tsx`. Server-rendered, `force-dynamic`, `noindex`.

- anonymous → `redirect("/access/login?returnTo=%2Faccount")`;
- authenticated, in any entitlement state → "Account", "You're signed in as {email}.", **Sign out** (the existing `signOutAction`, landing on `/`).

Nothing on it depends on entitlement, so a canceled subscriber sees exactly what a never-subscribed reader sees — nothing implies that cancelling removed the account. It writes nothing and reads nothing from the request.

> **Phase 7B seam.** `/account` becomes the account hub for identity and subscription status in Phase 7B. Replace `src/app/account/page.tsx` wholesale; keep `ACCOUNT_HREF` (`src/lib/routes.ts`), the anonymous redirect, and the account-intent rule in `src/lib/onboarding/server.ts`. The page currently borrows `OnboardingShell` for its chrome.

---

## 6. Legacy password authentication

Found and resolved:

| Item | Decision |
| --- | --- |
| `/auth/sign-in` page with the password form | **Replaced** by a permanent redirect to `/access/login` |
| `src/app/auth/legacy-password-form.tsx` | **Deleted** |
| `signInAction` in `src/app/auth/actions.ts` | **Deleted** — its only caller was the form |
| Premium gate "Sign in" → `/auth/sign-in` (`SIGN_IN_HREF`) | **Repointed** to `/access/login` |
| `/auth/confirm` failure redirect → `/auth/sign-in` | **Repointed** to `/access/login` |
| `/auth/status` "Sign in" link | **Repointed** to `/access/login` |
| `signInWithPassword` / `signUpWithPassword` in `src/lib/auth/operations.ts` | **Retained**, unreachable, still unit-tested |

The evidence for removing the form: no account depends on it. An emailed code signs in any account with an address, whatever credential it was created with, so a password account is not stranded. Production accounts were created passwordlessly. Local development does not need a password to avoid a mailbox: the local Supabase stack captures OTP mail (Inbucket, `supabase/config.toml`). The primitives stay until that is confirmed against production, then go together.

The earlier claim that "nothing in the customer flow links to" `/auth/sign-in` was wrong — every premium gate's secondary link did.
