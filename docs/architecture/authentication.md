# Authentication

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 27 September 2026, Paid Access Phase 2. Identity only — no Stripe, no premium gates, no onboarding.

> **Superseded in part, 28 September 2026.** The customer credential is no longer a password — Urdais emails a one-time sign-in link, and Google OAuth is available once configured. See `docs/architecture/passwordless-authentication.md`. Everything below about *identity*, the account mapping, sessions, cookies and the trust boundary still holds, because none of it depended on how the reader proved who they were. The password-specific sections are marked where they are now historical.

Urdais authenticates with **Supabase Auth**. This document is what Phase 3 built its premium gates against.

---

## 1. The three layers, and why they are three

```
Supabase Auth          proves WHO someone is        (a verified session)
identity.accounts      Urdais's OWN account for them (provider-agnostic)
premium_entitlements   what that account MAY see    (decided by Phase 1)
```

Supabase is an identity provider, not Urdais's account table. That is the whole reason `identity.accounts` still has no foreign key to `auth.users`: Urdais owns its accounts, and a second provider could be added without a migration. It is also what keeps Stripe clean later — billing writes an entitlement row against a Urdais account id, and never needs to know what authenticated that person.

**Authentication does not imply entitlement.** A signed-in reader with no entitlement row is a non-subscriber and is refused every premium product. There is no `if (user) return premiumAccess` anywhere, and `src/lib/auth/viewer.test.ts` asserts it across all five premium products.

---

## 2. What was decided, and what was rejected

| Decision | Chosen | Rejected, and why |
| --- | --- | --- |
| Provider | Supabase Auth | — |
| Method | ~~Email + password~~ → **emailed sign-in link**, plus Google when configured | passkeys, SSO: still out of scope |
| Session refresh | **`src/proxy.ts`** | `middleware.ts` — deprecated in Next 16.3.4 |
| Identity read | **`getUser()`** | `getClaims()` — no verification state; `getSession()` — untrusted |
| Public key | **publishable (`sb_publishable_…`)** | legacy `anon` JWT — Supabase retires it end of 2026 |
| Cookie flags | **`httpOnly` forced** | the `@supabase/ssr` default — script-readable |
| Provisioning | lazy, on first server resolve | at sign-up — writes a row for every abandoned attempt |

### `proxy.ts`, not `middleware.ts`

Next 16.3.4 deprecated the middleware convention. Its own build source says so verbatim — `The "middleware" file convention is deprecated. Please use "proxy" instead.` — and it **throws** if both files exist. Supabase's published Next.js SSR guide still shows `middleware.ts`; Urdais follows the framework. Next resolves an export named `proxy` or a default export from `proxy.ts` or `src/proxy.ts`.

### `getUser()`, not `getClaims()`

`getClaims()` is Supabase's documented way to verify identity and is cheaper — with asymmetric signing keys it validates locally with no network call. It was rejected for one reason: **`AuthenticationState.emailVerified` cannot be sourced from it.** The access token's claims do not carry `email_confirmed_at`, and the only verification-shaped value in a token is `user_metadata.email_verified` — which **the user can write themselves** via `auth.updateUser`. Reading it would be a privilege escalation behind a plausible field name.

So `resolveSupabaseIdentity()` calls `getUser()`, which makes an authenticated request to the Auth server and returns a record from a column only the server writes. The cost is one round trip per resolution, paid only by requests that need to know who the reader is — public Urdais never calls it. `identity.test.ts` asserts that metadata is ignored.

`getClaims()` *is* used in the proxy, which needs a validity check and a rotation, not a user record.

### `httpOnly` is forced, and that has a consequence

`@supabase/ssr` omits `httpOnly` so `createBrowserClient` can read the session from `document.cookie`. Urdais makes no browser-side auth calls — sign-up, sign-in and sign-out are all Server Actions — so that tradeoff buys nothing and would leave the access token readable by any successful XSS. `src/lib/auth/cookies.ts` forces `httpOnly: true`, and `secure` follows the deployment origin so local http development still works.

**The constraint this imposes: client-side Supabase auth will not work.** That is the intended posture, not an accident to route around. A client-side sign-in would put an access decision in the browser. Use a Server Action. (The browser client helper was written and then deleted, because nothing needed it and shipping it would have invited exactly that.)

---

## 3. Client / server architecture

| Module | Runs | Responsibility |
| --- | --- | --- |
| `src/lib/auth/config.ts` | both | Reads the two public vars; refuses a secret or a legacy key |
| `src/lib/auth/server-client.ts` | server | Request-scoped Supabase client over `next/headers` cookies |
| `src/lib/auth/identity.ts` | server | `resolveSupabaseIdentity()` — verified subject + verification state |
| `src/lib/auth/accounts.ts` | server | `resolveUrdaisAccount()` — the `identity.accounts` mapping |
| `src/lib/auth/operations.ts` | server | sign-up / sign-in / sign-out, as typed outcomes |
| `src/lib/auth/session.ts` | proxy | `refreshSession()` — cookie rotation |
| `src/lib/auth/cookies.ts` | server | `httpOnly` / `secure` hardening |
| `src/lib/auth/return-to.ts` | both | Open-redirect defence |
| `src/lib/access/server.ts` | server | `resolveViewer()` — **the authority** |

`server-client.ts` swallows cookie-write failures on purpose: Next forbids setting a cookie during a Server Component render, and letting that throw would turn a routine token rotation into a 500 on a page that rendered fine. Durable rotation is the proxy's job.

---

## 4. Session and cookie behaviour

Supabase's own cookie mechanism, nothing hand-rolled. No tokens in `localStorage`, no custom cookies, no query parameters, no React state as a source of truth.

`src/proxy.ts` rotates the session, and the matcher is broad — a signed-in reader arriving at `/` with an hour-old token needs it refreshed there. **The cost is bounded by a cheap guard:** `refreshSession` looks for a `sb-*-auth-token` cookie first and returns immediately when there is none, so an anonymous visitor does zero Supabase work. The chunked form (`…auth-token.0`, `.1`, which is what a real session usually is) is matched too; missing it would sign people out an hour after signing in.

**The proxy never redirects.** Not for any route. Urdais stays anonymously browsable, and sending a signed-in reader anywhere is Phase 3's decision to make in a page.

---

## 5. `resolveViewer()` lifecycle

```
no valid Supabase session ────────────────────────────► ANONYMOUS_VIEWER
                                                          (no DB query at all)

valid session
  └─ resolveSupabaseIdentity()   subject, email, emailVerified
       └─ resolveUrdaisAccount() identity.accounts row, created on first sight
            └─ loadPremiumEntitlement()  entitlement, or null
                 └─ authenticated Viewer { accountId, emailVerified, entitlement }
```

It takes no arguments — every input is ambient and server-controlled — and it **never throws**. An unreachable database, a failed provisioning write, an unconfigured environment: each falls back to anonymous. That direction is deliberate. Losing premium a reader is owed is recoverable; granting premium they are not owed is not.

---

## 6. Account provisioning

```
auth_provider = 'supabase'
auth_subject  = the Supabase user UUID
email         = a denormalised SUPPORT COPY, never identity
```

Deterministic, idempotent, concurrency-safe, server-controlled.

- **Lookup is by `(auth_provider, auth_subject)` only.** A test asserts no SQL statement ever puts `email` in a `where` clause.
- **Read first, then write only if needed.** The steady state is one `SELECT` and no write — otherwise the `updated_at` trigger would fire on every authenticated page view.
- **`on conflict (auth_provider, auth_subject) do update`** on the insert path, so two simultaneous first requests from the same new user converge on one row instead of one failing the unique constraint.
- **An email change updates the support copy and nothing else.** It is an `UPDATE` keyed on `(provider, subject)`, so it cannot create, replace or re-key an account. Verified end to end: the account id was byte-identical across the whole session.
- Supabase remains authoritative for verification. There is no second `email_verified` column in `identity.accounts`.

Provisioning is lazy — first authenticated server resolve, not sign-up — so an address that starts a sign-up and never confirms leaves no Urdais account behind.

---

## 7. Security

Everything the browser sends is untrusted. A reader cannot obtain premium access by editing storage, mutating React state, adding a query parameter, mounting a component, or posting a form field. The only fields any action reads are `email`, `password` and `returnTo`.

| Threat | Defence |
| --- | --- |
| Forged account id | Never read from a request; derived from the verified subject |
| Forged auth subject | Comes from `getUser()`, i.e. from the Auth server |
| Forged entitlement | Read from Postgres by account id; a claim on the identity object is ignored |
| Self-verification | `email_confirmed_at` only; user-writable metadata ignored |
| Token theft via XSS | `httpOnly` cookies |
| Open redirect | `safeReturnTo` allow-lists internal paths |
| Browser reading `identity` | RLS on, no policies, no grants to `anon`/`authenticated` |
| Secret in the bundle | `config.ts` refuses `sb_secret_…` and `service_role` JWTs by shape |

**No RLS policy, grant or privilege was changed by this phase.** `identity` remains unreachable by `anon` and `authenticated`; identity and entitlement reads run on the server's privileged `pg` connection. `SUPABASE_SERVICE_ROLE_KEY` is not used and should not be set.

### Redirect safety

`safeReturnTo()` accepts only a root-relative internal path and discards everything else for `/`. Rejected: absolute URLs, `//host`, `/\host`, encoded slash variants, non-http schemes, control characters (header injection), `..` segments, and **any `/auth/*` path** — returning to sign-in after signing in is a loop and is the shape a redirect chain takes.

Note the consequence: `/auth/status` cannot be a `returnTo` target, so signing out lands on `/`.

---

## 8. Entitlement loading

Phase 1's `loadPremiumEntitlement(sql, accountId)`, unchanged, keyed on the **Urdais account id** — not the Supabase subject, which would work today and break the moment a second provider exists.

No real user has an entitlement. That is expected:

| Reader | Result |
| --- | --- |
| Anonymous | `authentication: anonymous`, `premiumEntitlement: null` |
| Signed in, no row | `authenticated`, `premiumEntitlement: null` → premium **denied** |
| Signed in, `inactive` | `authenticated`, entitlement present → premium **denied** |
| Signed in, `active` | `authenticated`, entitlement present → premium **allowed** |

Phase 1's `canAccess` decides all four with no auth-specific exception.

---

## 9. Environment

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Both public by design. **Without them Urdais runs exactly as it did before authentication existed** — every reader anonymous, every public product working, no way to sign in. Nothing breaks.

`NEXT_PUBLIC_APP_URL` must be the deployment's real origin: it builds the absolute confirmation-link URL (never taken from the request, so a forged `Host` cannot redirect a confirmation link off-site) and decides the `secure` cookie flag.

Do **not** set `SUPABASE_SERVICE_ROLE_KEY`. Nothing needs it.

---

## 10. Required Supabase dashboard configuration

Verified on UrdaisDev (`scwwjoyouohfrwylalha`) via `GET /auth/v1/settings`:

| Setting | UrdaisDev | Required |
| --- | --- | --- |
| Email provider | `true` | enabled |
| `disable_signup` | `false` | signups allowed |
| `mailer_autoconfirm` | `false` | **confirmation required** |
| OAuth providers | all `false` | none, this phase |
| `anonymous_users` | `false` | off |

Still to configure, per environment:

1. **Redirect allow-list** — add `<origin>/auth/confirm` under Authentication → URL Configuration, and set Site URL to the deployment origin. A confirmation link to a URL not on the list is refused by Supabase.
2. **Custom SMTP — required before any real user signs up.** Supabase's built-in email service is rate-limited to a couple of messages an hour and only delivers to project team members, so account creation is effectively broken for the public until a real SMTP provider is configured.
3. **Email template (recommended)** — point the confirmation template at the server-side form:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```
   `/auth/confirm` accepts both this and the default PKCE `code` shape, so it works either way. The template form is preferable: the token is used once, by the server, and never lands in a redirect chain.
4. **Password policy** — set the minimum length and character requirements. The app does not hardcode a policy; it maps Supabase's `weak_password` rejection to a message.

---

## 11. Local development

In `.env.local`:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://scwwjoyouohfrwylalha.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
DATABASE_URL=postgresql://…                # UrdaisDev
```

`npm run dev`, then `/auth/sign-up`, `/auth/sign-in`, `/auth/status`.

Docker is not required for the database work: `scripts/db/local.sh` runs the full migration history against a throwaway local Postgres cluster via `pg_ctl`. Supabase Auth itself has no local substitute without Docker, so sign-in testing needs UrdaisDev.

`/auth/status` renders the whole chain — session, account id, verification state, entitlement, and the access decision for all five premium products. It is the verification surface, not a gate: it reports decisions and withholds nothing.

See `docs/operations/auth-phase-2-verification.md` for the manual entitlement procedure and what was actually exercised.

---

## 12. The minimal auth surface, and its fate

| Route | Purpose | Phase 4 |
| --- | --- | --- |
| `/auth/sign-up` | Create an account | **Replaced** by onboarding |
| `/auth/sign-in` | Sign in | **Replaced or kept**, product decision |
| `/auth/confirm` | Email confirmation callback | **Keep** — Supabase links to it |
| `/auth/status` | Session diagnostic | **Delete**, or keep as an operator tool |

Deliberately plain, and not the designed journey. Phase 4 owns `Get Full Access → onboarding → create account → verify → Stripe`, and builds it on `src/lib/auth/operations.ts` — which is why the operations return typed outcomes rather than rendering anything.

`/auth/status` must **not** become the account/profile surface.

---

## 13. How Phase 3 should consume this

1. `const viewer = await resolveViewer()` — server-side, once per request; pass it to further checks rather than resolving repeatedly.
2. `canAccess(viewer, productId)` for the decision. Never read a status field directly.
3. Branch gate copy on `AccessDenialReason`: `authentication_required` → sign-in; `entitlement_required` → subscribe.
4. Send `returnTo` through `safeReturnTo`, and use `product.destination` for it.
5. **Gate before the loader runs.** Data loaded by a Server Component ships in the RSC payload, so a blur over a component handed real data leaks that data in full.
6. **Do not activate `DEFERRED_PREMIUM_ENFORCEMENT`.** Authentication existing is not permission. Stripe still does not, so there is no way to obtain an entitlement and a live gate would deny Compute Economics and Power Analytics to everyone. The ledger's activation conditions are unchanged.
