# Email OTP — what was verified

**Status: internal operations record.** Written 28 September 2026, PR #213 revision;
the end-to-end run in §3 passed on **29 September 2026** against UrdaisDev. Supersedes
the verification record in `onboarding-phase-4-verification.md` for everything
touching the credential.

> A send that succeeds is not the thing being verified. The thing being verified is
> that a real person can receive a Urdais code, type it in, and come out the other
> side with a real session and no password. **That now happens.**

UrdaisDev is configured and passing. **UrdaisProd is not** — §1 is what it still
needs, and it is the same two dashboard edits.

---

## 1. The configuration without which nothing works

**Supabase sends an email with no code in it unless BOTH email templates are changed
by hand, per project.** Done on UrdaisDev; still outstanding on UrdaisProd.

`signInWithOtp` always mints a token. What the message *shows* is decided entirely by
the template, and Supabase's built-in default contains `{{ .ConfirmationURL }}` — a
link — and no `{{ .Token }}`. The application cannot change this: it is hosted
authentication configuration, set per project through the dashboard.

Left as it is, the flow fails in the worst available way. The send succeeds, the code
screen renders, and the reader is asked to type six digits they were never shown.

### The exact change — two templates, not one

**Supabase dashboard → the project → Authentication → Emails →** edit **both**
`Confirm signup` **and** `Magic Link` so each body contains `{{ .Token }}`, with the
same subject. `signInWithOtp` chooses between them by whether the address is already
confirmed, not by which screen the reader used, so setting one leaves half the readers
with the wrong email — and the half left broken is the *first* email anybody gets.

The content this repository uses for the local stack is
`supabase/templates/confirmation.html` and `supabase/templates/magic_link.html`, which
are deliberately identical. The hosted templates should match:

```html
<h2>Your Urdais verification code</h2>

<p>Enter this code to finish signing in:</p>

<p style="font-size: 28px; font-weight: 600; letter-spacing: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">{{ .Token }}</p>

<p>It expires in one hour. If you did not ask for it, you can ignore this email — nothing has been created or changed.</p>
```

Subject: `Your Urdais verification code`.

Nothing else needs to change. Specifically:

| Setting | Required value | Why it is already right |
| --- | --- | --- |
| Authentication → Providers → Email → `otp_length` | any value 6–10 (**UrdaisDev is 8**) | Validation accepts the whole range Supabase permits, so any value works. Set `URDAIS_OTP_LENGTH` on the deployment to match, or the screen simply omits the digit count |
| `otp_expiry` | 3600 (default) | The copy says "expires in one hour" |
| Authentication → URL Configuration | unchanged | Nothing emailed is followed any more; the redirect allow-list now matters only to Google |
| SMTP | unchanged | Already Resend, already verified for `urdais.com` |
| Rate limit | unchanged | 30/hour on UrdaisDev |

**This change was not made.** It is hosted configuration, the brief reserves it, and
it is one dashboard edit that should be made deliberately rather than discovered in a
diff. The current hosted template was not read either — there is no management
credential in this environment, and reading it would not change the instruction above.

**UrdaisProd needs the same edit** before the flow works there. It is a separate
project with its own templates.

---

## 2. What was verified, and how

Everything below ran against a **stubbed Supabase Auth server**
(`scratchpad/stub-auth.mjs`) rather than the hosted project: real browser, real
Next.js server, real Server Actions, real cookies, no email sent and no database
written. That isolation is the point — the real email budget is reserved for the one
send that proves the thing a stub cannot.

`npm run lint` · `npm run typecheck` · `npm run build` · `npx vitest run` — clean,
5,000+ tests passing.

### Unit and integration

| Area | File |
| --- | --- |
| Code shape, paste tolerance, configured length | `src/lib/auth/otp.test.ts` |
| `sendEmailOtp` / `verifyEmailOtp`, provider codes, log safety | `src/lib/auth/operations.test.ts` |
| The Server Actions, including which address a code is checked against | `src/app/access/actions.test.ts` |
| The screens, and the magic-link copy that must not come back | `src/app/access/onboarding.test.tsx` |

### In a browser (`scratchpad/e2e-otp.mjs`, `e2e-otp-refusal.mjs`)

All passing:

- Gate → "Get Full Access" → the account form, one step, no intro, button reads
  **Send code**, no mention of a link anywhere.
- Requesting a code reaches `/access/verify`, which names the address, preserves the
  destination, and asks nobody to click anything.
- Exactly **one** provider call per request, carrying the normalised address, with
  `create_user: true` on both screens (the anti-enumeration property) and **no**
  `redirect_to` — nothing is followed.
- The code field: a real `<label>`, `inputmode="numeric"`,
  `autocomplete="one-time-code"`, `maxlength="10"`, and a hint stating the configured
  length.
- A refused code keeps the reader on the screen with the address intact, shows one
  honest message in a live region tied to the form by `aria-describedby`, and marks
  the field invalid. The provider is asked exactly once, **with the pending address,
  never one submitted beside the code**, `type: "email"`.
- Two digits are refused with a message about the code's *shape* — a different and
  more accurate claim than "incorrect" — and never reach the provider.
- `123 456` pasted is sent as `123456`, not rejected.
- Resend mails the pending address and confirms it; a refused send says "Too many
  attempts", stays on the form, and is never dressed up as success.
- "Use a different email" clears the record; `/access/verify` then has nothing to show
  and redirects.
- Keyboard-only throughout; the code field is first in the tab order; no password
  field; nothing lets a reader declare themselves verified.

### Log safety

The server log was scanned after every run above. Zero occurrences of any submitted
address or any submitted code. What it does contain:

```
auth: otp send refused (reason=rate_limited code=over_email_send_rate_limit status=429)
auth: otp verify refused (reason=code_rejected code=otp_expired status=403)
```

Reason, provider code and status. Never the address, never the token, never the
provider's own message — which routinely contains the address.

---

## 3. The real end-to-end run — PASSED

**2026-09-29T01:06Z, UrdaisDev, through the real UI.** A real person received a real
code and emerged with a real Urdais session, with no password and without leaving the
page. That is the claim this whole phase existed to establish.

| | |
| --- | --- |
| Send | one, `POST /otp` → 200, template `Confirm signup` (new address) |
| Code | **8 digits** — UrdaisDev's `otp_length` is 8, not the default 6 |
| Verify | `verifyOtp({ type: "email" })` accepted the signup-confirmation token |
| Session | `sb-<ref>-auth-token`, **httpOnly**, SameSite=Lax |
| `email_confirmed_at` | set — unconfirmed rows went 2 → 1 |
| Landing | `/access` resolved the new viewer to **`/access/ready`** |
| Pending-email cookie | cleared once the session existed |

Provisioning, checked rather than seeded:

| | before | after |
| --- | --- | --- |
| `auth.users` | 3 | **3** — the row from the send was reused, not duplicated |
| `identity.accounts` | 1 | **2** — exactly one new row |
| `premium_entitlements` | 1 | **1** — unchanged |

The new account `eb387ca8…` is `auth_provider = supabase`, its `auth_subject` equals
the `auth.users.id`, exactly **one** row exists for that subject, and it has **zero**
entitlement rows. The single pre-existing entitlement row belongs to a different
account and is `inactive`. `/auth/status` reported `entitlement_required` for all five
premium products — authenticated, and correctly still not entitled. **Onboarding
granted nothing.**

### The 8-digit code is the finding worth keeping

`otp_length` is per-project hosted configuration, **not exposed on any endpoint the
application can read**. UrdaisDev is set to 8.

The sign-in worked on the first attempt *because* validation accepts the whole 6–10
range Supabase permits instead of assuming six. Had it hard-coded the default, a
dashboard setting would have been an outage — the server rejecting a perfectly good
code before Supabase ever saw it, presenting to every reader as "wrong code".

The presentation layer was not so careful: the hint said "6-digit code from the email"
above a box expecting eight. Harmless to the mechanism, still a defect, and now fixed —
the screen names a digit count only where `URDAIS_OTP_LENGTH` declares one.

### Two notes on how the run was conducted

The browser session from the send did not survive a restart, so the **pending-email
cookie was re-set directly** rather than spending a second email. That is not an OTP
bypass: the cookie is a plain unsigned value by design, it only selects which address
the code is checked against, and Supabase still had to accept the code.

An earlier attempt at the send **failed before reaching the form** —
`MallocNanoZone=0` in the environment conflicts with Chrome's allocator and hung the
browser at startup. No email was spent, confirmed from two independent sides. The
harness now has a dry-run mode that walks to the submit button and stops, so a launch
flake can never again cost a send.

---

## 4. What remains

**The returning-login path.** The address is now confirmed, so the next
`signInWithOtp` for it will select the **Magic Link** template rather than
`Confirm signup` — the other half of §1, still unexercised. One send proves it.

---

## 5. What a stub cannot prove, and is therefore still open

**Superseded by §3 — the success path is now proven against the real provider.** The
reasoning is kept because it is why the run was structured this way: a stub can return
a session object, but it cannot prove that a person received a code, that the code
Supabase minted is the one `verifyOtp` accepts, or that the resulting session is a
genuine Urdais session.

It was deliberately **not** faked here. Driving a stubbed success would also have
created an `identity.accounts` row for an invented subject in a real database, which
is the provisioning the real test is supposed to observe.

### The one real run, when the template is changed

1. One send, from the real form, to the founder's own mailbox. One only — a refusal
   stops the run rather than starting a retry loop.
2. The founder reads the code from the email and provides it. It is not read from
   logs, not inferred, not fabricated, and the OTP is not bypassed.
3. The code is typed into the real form, in the browser, and must produce a session
   and `/access/ready`.
4. Provisioning is then checked, not seeded: exactly one new `auth.users` row, exactly
   one new `identity.accounts` row mapped to it, no duplicates, and **no entitlement**
   — onboarding ends before payment and grants nothing.

---

## 6. The first real delivery, and what it proved

**2026-09-28T23:26:20Z** — `POST /otp` → 500, `gomail: ... 550 "The urdais.com domain
is not verified"`. Resend rejected the sender.

**2026-09-29T00:13:35Z** — `POST /otp` → 200 in 708 ms, no error, audit action
`user_confirmation_requested`. **The email was delivered.** Transport is settled:
Supabase → Resend → the mailbox works, DNS and sender domain included.

The message was wrong, not missing. It carried Supabase's built-in **Confirm signup**
body — *"Follow the link below to confirm this email address and finish signing up"* —
because the address was brand new, and only the Magic Link template had been changed.
That is the two-template selection rule in §1, observed rather than theorised: the
audit action in the log says `user_confirmation_requested`, which is the signup path,
not the magic-link one.

Worth keeping, because the same trap is waiting on UrdaisProd: **the flow appears to
work in testing and breaks for every genuinely new customer.** Anyone testing with an
already-confirmed address would see the right email and conclude the job was done.

### gotrue's mailer is synchronous, which is a usable diagnostic

The 500 above surfaced an SMTP-level rejection *in the HTTP response*. There is no
queue that swallows a later failure, so on this API a 200 means gomail completed
without error and the remote SMTP server accepted the message. That is stronger than
"request accepted" — but it is still not delivery, and it says nothing about which
template was used or whether the body was usable. Both facts were needed here.

---

## 7. Earlier real sends, for the record

Both predate the OTP conversion and neither delivered.

| Attempt | Result | Cause |
| --- | --- | --- |
| 1 | HTTP 429, `over_email_send_rate_limit` | default mailer, ~2/hour |
| 2 | HTTP 500, no provider code | Supabase auth logs: `gomail: could not send email 1: 550 "The urdais.com domain is not verified"` — Resend rejected the sender |

The second is the case worth remembering: **a 500 with no code at all**, invisible
from the application and unfixable inside it. The diagnostic logging added for this
phase is what located it, in the hosted auth logs, within one query. `urdais.com` has
since been verified in Resend.

No `auth.users` row is created by a failed send, so neither attempt left anything
behind.
