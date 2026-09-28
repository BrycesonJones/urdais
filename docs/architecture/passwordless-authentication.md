# Passwordless authentication

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 28 September 2026, revising Paid Access Phases 2 and 4. Supersedes the email + password model described in `docs/architecture/authentication.md`.

> The emailed link is not verification layered on a password account. **It is the credential.**

---

## 1. What changed

| | Before | Now |
| --- | --- | --- |
| Customer credential | email + password | emailed one-time sign-in link |
| Verification | a step after signup | the same event as authentication |
| Second method | — | Google OAuth, when configured |
| Entry | gate → `/access` intro → Continue → form | gate → **form** |
| Price during onboarding | `$80/week` on the intro and the boundary | none; moves to Plan / Pay |

Removing the password field was the smaller half. The larger one is that possession of the mailbox now *is* proof of identity, so there is no longer a "create account, then verify" sequence to model — one email does both.

---

## 2. Magic link, not a numeric code

Both are Supabase-supported and both were considered. Urdais sends a **link**.

**Why.** `signInWithOtp` sends whatever the project's Magic Link template contains, and the default contains `{{ .ConfirmationURL }}`. A six-digit code requires adding `{{ .Token }}` to that template in the dashboard. The SMTP provider was configured; the templates were not. A code-based flow would therefore have emailed people a message with no code in it — dead on arrival, and the email-delivery blocker would have stayed open for another round trip. The link path also rides on `/auth/confirm`, which already exists, is tested, and refuses off-site destinations.

**What the code option would have bought**, honestly:

- **Same-device guarantee.** A code is typed into the browser that asked for it. A link opens wherever the mail client sends it, so someone who starts on a laptop and taps the link on a phone ends up authenticated on the phone.
- **Immunity to link prefetching.** Corporate mail scanners (Safe Links and similar) fetch URLs in messages, which can consume a single-use link before the recipient clicks it. This is a real failure mode for exactly the enterprise readers Urdais is aimed at.

**Switching later** is two changes and no new architecture: add `{{ .Token }}` to the Magic Link template, then verify the code with `verifyOtp({ email, token, type: "email" })` in a Server Action and render an input beside the resend. The primitive, the state machine and the routes are unchanged. Copy is derived from the mechanism in `@/lib/auth/operations`, so it cannot be left saying "link" after a switch.

---

## 3. One primitive, two screens

```ts
// /access  — "Create your account"
// /access/login — "Log in to Urdais"
await sendEmailSignInLink(client, { email, emailRedirectTo });
```

`signInWithOtp` signs a new address up and an existing one in. `shouldCreateUser` is left at its default of `true` on **both** screens, and that is the anti-enumeration property rather than a shortcut: if the login screen passed `false`, an unknown address would behave differently from a known one and the form would answer *does this person have a Urdais account* to anyone who asked.

So the two screens differ only in heading and cross-link. The distinction is real to the reader and invisible to the server — which is also why they are never swapped automatically. Detecting that an address is unknown and switching someone to "create account" would disclose exactly what the identical call protects.

---

## 4. The flow

```
premium product → ACCESS REQUIRED → Get Full Access
  → /access                     Create your account  (email, or Google)
    → /access/verify            Check your email
      → click link
        → /auth/confirm         session established
          → /access             resolves the new viewer
            → /access/ready     ready for checkout
```

Five states, five routes, unchanged in shape from Phase 4 except that the intro is gone and `verification_required` is now `email_challenge`:

| State | Path |
| --- | --- |
| `create_account` | `/access` |
| `login` | `/access/login` |
| `email_challenge` | `/access/verify` |
| `ready_for_checkout` | `/access/ready` |
| `already_entitled` | `/access/subscribed` |

`/access/verify` keeps its path so existing links resolve, though the screen is now the authentication challenge rather than a post-signup notice.

### `/access` is canonical

Anonymous readers get the form rendered **in place** — no redirect, no intervening screen, because the gate already established intent. Anyone with a session is redirected to whichever state their account implies. A bookmark, a stale link and a fresh click therefore all resolve correctly.

`email_challenge` is the one anonymous state that is not a form: a reader awaiting their link has no session, because the link is what creates one. The screen redirects to the form when there is no address to name — a typed URL or a cleared cookie should not produce an empty instruction.

---

## 5. Existing users

**Production holds zero auth users**, so nothing had to be migrated. The only password accounts are two development fixtures on UrdaisDev.

Password authentication was therefore **retained, not deleted** — §20 of the brief cautions against removing Supabase functionality globally, and there were two concrete reasons:

- an account created before this change still has a password, and deleting the only path that can use one would strand it;
- it is what lets the authenticated, entitled and signed-out states be verified end to end without a mailbox, which is otherwise impossible once every customer path requires receiving real email.

`/auth/sign-in` keeps the password form as an **operator surface**. Nothing in the customer flow links to it, it says on the page that it is not the usual way in, and a test asserts nothing under `/access/` imports the password operations. `/auth/sign-up` is gone: it permanently redirects to `/access`, carrying the destination.

Delete both once no password account remains.

---

## 6. Google

Architecturally complete, and **not rendered until the provider is configured.**

```
Continue with Google → signInWithOAuth (server-side, skipBrowserRedirect)
  → Supabase → Google → Supabase → /auth/confirm?code=… → session
```

Server-initiated: `skipBrowserRedirect` makes Supabase return the authorization URL and the server redirects to it, so the browser never constructs the OAuth request and cannot choose the provider, the scopes or the callback. The callback is `/auth/confirm`, which already exchanges a PKCE code and refuses an off-site `next`.

### Availability is read from Supabase, not from a flag

`@/lib/auth/google` asks the project's own `GET /auth/v1/settings` whether `external.google` is true. An environment flag was rejected for the failure it invites: a flag can be switched on before Google is configured, and then Urdais renders a button that predictably fails.

It **fails closed** — unconfigured project, unreachable endpoint, malformed answer, provider off, all mean "not available" — and caches for the process lifetime, because the answer changes when someone edits a dashboard, not between requests. **Enabling Google therefore takes effect on the next deployment.**

When unavailable the button is *absent*, not disabled. A disabled control for something that may never exist asks the reader to wonder what they are missing.

Availability is re-checked inside the action as well as at render, because a form can be submitted by something that never rendered the page.

### To enable it

1. **Google Cloud Console** → create an OAuth 2.0 Client ID (Web application).
2. Set the **Authorized redirect URI** to the Supabase callback, which is the project's own:
   `https://<project-ref>.supabase.co/auth/v1/callback`
   — for UrdaisProd, `https://cyqtaydtfuwaexjkuynq.supabase.co/auth/v1/callback`; for UrdaisDev, `https://scwwjoyouohfrwylalha.supabase.co/auth/v1/callback`.
3. **Supabase dashboard** → Authentication → Providers → Google → enable, and paste the client ID and secret.
4. Confirm `<origin>/auth/confirm` is on the redirect allow-list (Authentication → URL Configuration). It already must be for email links.
5. **Redeploy**, because availability is cached per process.

No Urdais environment variable is involved, and no Google credential belongs in this repository.

---

## 7. Diagnosing a refused send

When Supabase refuses to send, the reader sees "Too many attempts. Wait a few minutes
and try again." That message cannot say *which* limit was hit, and the three have
different fixes — so the server logs the provider's own code:

```
auth: sign-in link refused (reason=rate_limited code=over_email_send_rate_limit status=429)
```

The code and status only: the address and the provider's message both carry the
reader's email into the log.

| code | means | fix |
| --- | --- | --- |
| `over_email_send_rate_limit` | the project's **hourly email budget** is spent | raise Authentication → Rate Limits → "emails per hour", and confirm custom SMTP is on — the built-in mailer allows about two an hour |
| `over_request_rate_limit` | too many auth requests from this caller | wait |
| `email_address_invalid` | the hosted validator will not send to that address | the reader's problem; shown as "that address does not look valid" |

Note that **configuring custom SMTP does not raise the email rate limit by itself** —
it is a separate setting in the same dashboard, and a project can have working SMTP
and still refuse the third message in an hour.

---

## 8. SMTP stays outside the application

```
Urdais → Supabase Auth → configured SMTP provider → the reader
```

Urdais never holds the SMTP password or an email-provider API key. There is no `RESEND_API_KEY` or equivalent, and none should be added: the application asks Supabase to send, and Supabase owns the transport.

---

## 9. Security

Unchanged from Phases 1–4, with one addition and one tightening.

| | |
| --- | --- |
| Identity | Supabase, server-side, via `resolveViewer` |
| Credential | the emailed link; possession of the mailbox |
| Verification | `email_confirmed_at`; `user_metadata` never read |
| Account | `identity.accounts`, keyed on `(provider, subject)` |
| Entitlement | onboarding writes none |
| Redirects | `safeReturnTo`, the one sanitiser, refusing `/auth*` and `/access*` |
| Cookies | httpOnly, server-written; no Supabase browser client |
| Google availability | read from Supabase, fails closed, cached |

Only `email` and `returnTo` are read from any customer form. There is no password field to hide and no password submitted.

The **pending-email cookie** is unchanged in role: httpOnly, server-set, used to name the address on the challenge screen and to resend to it, and **never** an identity or a verification state. A query parameter would let anyone build a challenge page for someone else's address and press resend.

---

## 10. Phase 5 is untouched

`resolveCheckoutHandoff` still derives `accountId` from the session and refuses `anonymous`, `unverified` and `already_entitled`. Nothing about the authentication change reaches it: it reads the viewer, and a viewer established by a magic link is the same shape as one established by a password.

`@/lib/access/pricing` is retained and is now rendered nowhere. It is the Phase 5 seam alongside the handoff — `$80/week` in minor units, so Stripe's Price is reconciled against a number rather than parsed out of prose.
