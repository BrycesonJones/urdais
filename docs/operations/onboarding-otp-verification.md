# Email OTP — what was verified, and what is blocked

**Status: internal operations record.** Written 28 September 2026, PR #213 revision.
Supersedes the verification record in `onboarding-phase-4-verification.md` for
everything touching the credential.

> A send that succeeds is not the thing being verified. The thing being verified is
> that a real person can receive a Urdais code, type it in, and come out the other
> side with a real session and no password.

---

## 1. The blocker, stated first

**Supabase will send an email with no code in it unless the project's Magic Link
template is changed by hand.**

`signInWithOtp` always mints a token. What the message *shows* is decided entirely by
the template, and Supabase's built-in default contains `{{ .ConfirmationURL }}` — a
link — and no `{{ .Token }}`. The application cannot change this: it is hosted
authentication configuration, set per project through the dashboard.

Left as it is, the flow fails in the worst available way. The send succeeds, the code
screen renders, and the reader is asked to type six digits they were never shown.

### The exact change

**Supabase dashboard → the project → Authentication → Emails → Magic Link →** edit
the template body so it contains `{{ .Token }}`. The content this repository uses for
the local stack is `supabase/templates/magic_link.html`, and the hosted template
should match it:

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
| Authentication → Providers → Email → `otp_length` | 6 (default) | The application reads the configured length for its hint and accepts the whole 6–10 range Supabase permits, so any value works |
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

## 3. What a stub cannot prove, and is therefore still open

**The success path.** A stub can return a session object; it cannot prove that a
person received a code, that the code Supabase minted is the one `verifyOtp` accepts,
or that the session which results is a genuine Urdais session. That needs one real
send to a real mailbox, and the reader typing what arrived.

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

## 4. Earlier real sends, for the record

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
