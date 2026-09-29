# Passwordless authentication

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 28 September 2026, revising Paid Access Phases 2 and 4. Supersedes the email + password model described in `docs/architecture/authentication.md`.

> The emailed code is not verification layered on a password account. **It is the credential.**

---

## 1. What changed

| | Before | Now |
| --- | --- | --- |
| Customer credential | email + password | emailed one-time verification code |
| Verification | a step after signup | the same event as authentication |
| Second method | — | Google OAuth, when configured |
| Entry | gate → `/access` intro → Continue → form | gate → **form** |
| Price during onboarding | `$80/week` on the intro and the boundary | none; moves to Plan / Pay |

Removing the password field was the smaller half. The larger one is that possession of the mailbox now *is* proof of identity, so there is no longer a "create account, then verify" sequence to model — one email does both.

---

## 2. A numeric code, not a magic link

Both are `signInWithOtp`. The difference is entirely in the email template and in
what the reader is asked to do with what arrives. Urdais sends a **numeric code**.

**Why.** The deciding property is that a code is typed into the browser that asked
for it:

- **Same device, same tab.** The reader never leaves Urdais. A link opens wherever
  the mail client sends it, so someone who starts on a laptop and taps the link on a
  phone is authenticated on the phone and stranded on the laptop.
- **Immune to link prefetching.** Corporate mail scanners (Safe Links and similar)
  fetch URLs in messages and can consume a single-use link before the recipient
  clicks it. That is a real failure mode for exactly the enterprise readers Urdais is
  aimed at, and it presents as "the link didn't work" with nothing in the logs to
  explain it.
- **No redirect surface in the credential.** A link carries a destination. A code
  carries nothing, so there is no `emailRedirectTo` on the send and one fewer place
  an open redirect could be introduced.

The cost is one extra field and one extra submission. That is the whole trade.

### The template is the part that is not code — and there are two of them

`signInWithOtp` always mints a token. **What the email shows is decided by the
template, not by the call** — `{{ .Token }}` renders the code,
`{{ .ConfirmationURL }}` renders a link to the same token. Both built-in defaults
contain only the latter, so a project left alone emails a message **with no code in
it** while the screen asks for one.

**One call, two templates.** This is the part that surprises: `signInWithOtp` chooses
between them by the state of the *address*, not by which screen the reader used.

| Address | Template Supabase sends | Audit action |
| --- | --- | --- |
| not yet confirmed — a brand-new address included | **Confirm signup** | `user_confirmation_requested` |
| already confirmed, signing in again | **Magic Link** | magic-link request |

So the create-account and log-in screens stay identical in *code* while producing two
different *emails*, and the split does not follow the screens. Setting only Magic Link
fixes only returning readers — and leaves the **first** email anybody ever receives
still saying "Confirm your email address / follow the link below", which is exactly
the failure this project hit on its first real send.

> **Supabase dashboard → Authentication → Emails →** give **both** `Confirm signup`
> **and** `Magic Link` a body containing `{{ .Token }}`, with the same subject.
> `supabase/templates/confirmation.html` and `supabase/templates/magic_link.html` are
> the exact content and are deliberately identical; they configure the local stack
> only. The hosted projects are set by hand, per project, because
> `supabase config push` would overwrite every other hosted auth setting with the
> local file's values.

Keep the two identical. Creating an account and logging in are the same act to the
reader, and two different-looking emails for one act is a bug they report.

**`verifyOtp({ email, token, type: "email" })` covers both**, so no application code
branches on which template fired. Supabase documents `type: "email"` for the
signup-confirmation token specifically — it is their recommended guard against link
prefetching — and the same call verifies a magic-link token. That is why the one
primitive in `@/lib/auth/operations` needs no knowledge of the reader's history.

### The length is hosted configuration, and the app cannot read it

`otp_length` (Authentication → Providers → Email) decides how many digits, from 6 to
10. **It is not exposed on any endpoint the application can query** — `/auth/v1/settings`
does not carry it — so Urdais can be *told* the length but can never *know* it.

That cuts two ways, and the first real sign-in demonstrated both. UrdaisDev is set to
**8**:

- **Validation accepts the whole range**, so the 8-digit code was accepted and the
  end-to-end sign-in worked on the first attempt. Had validation hard-coded six, a
  dashboard setting would have become an outage presenting to every reader as "wrong
  code" — with the server rejecting a perfectly good code before Supabase saw it.
- **The hint had hard-coded six**, so the screen read "6-digit code from the email"
  above a box expecting eight. Harmless to the mechanism, and still a defect: it tells
  the reader their correct code is the wrong shape.

So the hint now names a number only where a deployment declares `URDAIS_OTP_LENGTH`,
and otherwise says "Enter the code from the email." An unset deployment says something
true but vague; a configured one says something true and specific. Neither says
something false. Set `URDAIS_OTP_LENGTH` per deployment to match that project.

### Incorrect and expired are deliberately one message

Supabase answers a wrong code and an expired one with the same `otp_expired` error
code. There is no distinct invalid-OTP code in its error set. Splitting them in the
copy would mean guessing, and a guess is wrong about half the time — telling
someone their code expired when they mistyped it, or the reverse. One honest
message covers both, and the remedy is identical either way:

> That code is incorrect or has expired. Request a new one and try again.

---

## 3. One primitive, two screens

```ts
// /access  — "Create your account"
// /access/login — "Log in to Urdais"
await sendEmailOtp(client, { email });
```

`signInWithOtp` signs a new address up and an existing one in. `shouldCreateUser` is left at its default of `true` on **both** screens, and that is the anti-enumeration property rather than a shortcut: if the login screen passed `false`, an unknown address would behave differently from a known one and the form would answer *does this person have a Urdais account* to anyone who asked.

So the two screens differ only in heading and cross-link. The distinction is real to the reader and invisible to the server — which is also why they are never swapped automatically. Detecting that an address is unknown and switching someone to "create account" would disclose exactly what the identical call protects.

---

## 4. The flow

```
premium product → ACCESS REQUIRED → Get Full Access
  → /access                     Create your account  (email, or Google)
    → /access/verify            Check your email — enter the code
      → verifyOtp               session established, in the same tab
        → /access               resolves the new viewer
          → /access/ready       ready for checkout
```

Five states, five routes, unchanged in shape from Phase 4 except that the intro is gone and `verification_required` is now `email_challenge`:

| State | Path |
| --- | --- |
| `create_account` | `/access` |
| `login` | `/access/login` |
| `email_challenge` | `/access/verify` |
| `ready_for_checkout` | `/access/ready` |
| `already_entitled` | `/access/subscribed` |

`/access/verify` keeps its path so existing links resolve, though the screen is now the authentication challenge itself — where the credential is entered — rather than a post-signup notice.

**`/auth/confirm` is retained**, and is no longer reached by anything emailed. It is the PKCE callback Google returns to, so deleting it would delete the OAuth path. Its `next` still passes through `safeReturnTo`.

### `/access` is canonical

Anonymous readers get the form rendered **in place** — no redirect, no intervening screen, because the gate already established intent. Anyone with a session is redirected to whichever state their account implies. A bookmark, a stale link and a fresh click therefore all resolve correctly.

`email_challenge` is the one anonymous state reached without a session: a reader awaiting their code has none, because submitting the code is what creates one. The screen redirects to the form when there is no address to name — a typed URL or a cleared cookie should not produce an empty instruction, and there would be nothing to verify a submitted code *against*.

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
4. Confirm `<origin>/auth/confirm` is on the redirect allow-list (Authentication → URL Configuration). Google is now the only thing that returns there.
5. **Redeploy**, because availability is cached per process.

No Urdais environment variable is involved, and no Google credential belongs in this repository.

---

## 7. Diagnosing a refused send

When Supabase refuses to send, the reader sees "Too many attempts. Wait a few minutes
and try again." That message cannot say *which* limit was hit, and the three have
different fixes — so the server logs the provider's own code:

```
auth: otp send refused (reason=rate_limited code=over_email_send_rate_limit status=429)
```

The code and status only: the address and the provider's message both carry the
reader's email into the log.

| code | means | fix |
| --- | --- | --- |
| `over_email_send_rate_limit` | the project's **hourly email budget** is spent | raise Authentication → Rate Limits → "emails per hour", and confirm custom SMTP is on — the built-in mailer allows about two an hour |
| `over_request_rate_limit` | too many auth requests from this caller | wait |
| `email_address_invalid` | the hosted validator will not send to that address | the reader's problem; shown as "that address does not look valid" |
| `otp_disabled` | email sign-in is switched off for the project | Authentication → Providers → Email |

A send can also fail at the SMTP hop with a **500 and no code at all**. The provider's own reason is only in the Supabase auth logs, and it is worth looking there before assuming anything about the application: a real instance of this was `550 "The urdais.com domain is not verified"` from Resend, which is invisible from the outside and unfixable from the application.

The code and status are logged on verification too:

```
auth: otp verify refused (reason=code_rejected code=otp_expired status=403)
```

The submitted code is **never** logged. Neither is the address.

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
| Credential | the emailed code; possession of the mailbox |
| Verification | `email_confirmed_at`; `user_metadata` never read |
| Account | `identity.accounts`, keyed on `(provider, subject)` |
| Entitlement | onboarding writes none |
| Redirects | `safeReturnTo`, the one sanitiser, refusing `/auth*` and `/access*` |
| Cookies | httpOnly, server-written; no Supabase browser client |
| Google availability | read from Supabase, fails closed, cached |

Only `email`, `code` and `returnTo` are read from any customer form. There is no password field to hide and no password submitted.

**A submitted code is checked against the server's pending address, never against an address submitted beside it.** An action that accepted both would let someone brute-force codes against a mailbox they do not own; taking the address from the httpOnly pending record means the only mailbox anyone can attack is one they already control the cookie for, and Supabase rate-limits verification independently.

The **pending-email cookie** is unchanged in role: httpOnly, server-set, used to name the address on the challenge screen and to resend to it, and **never** an identity or a verification state. A query parameter would let anyone build a challenge page for someone else's address and press resend.

---

## 10. Phase 5 is untouched

`resolveCheckoutHandoff` still derives `accountId` from the session and refuses `anonymous`, `unverified` and `already_entitled`. Nothing about the authentication change reaches it: it reads the viewer, and a viewer established by a verification code is the same shape as one established by a password.

`@/lib/access/pricing` is retained and is now rendered nowhere. It is the Phase 5 seam alongside the handoff — `$80/week` in minor units, so Stripe's Price is reconciled against a number rather than parsed out of prose.
