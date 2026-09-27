# Onboarding: Phase 4 verification record

**Status: internal operations document. Not routed publicly, not registered in the docs catalog.** Written 27 September 2026, Paid Access Phase 4, against UrdaisDev (`scwwjoyouohfrwylalha`).

What was exercised for real, what was exercised with a fixture, and what remains blocked. The distinction is the point of the document.

---

## 1. How it was run

Two local servers against UrdaisDev:

| Port | `URDAIS_PREMIUM_ENFORCEMENT` | Why |
| --- | --- | --- |
| 3101 | `active` | so the premium gate renders and "Get Full Access" can be followed for real |
| 3102 | unset (production default) | to confirm onboarding works while nothing is gated |

Headless Chrome through the real forms and real cookies. Scripts are in the session scratchpad: `e2e-onboarding.mjs`, `e2e-entitled-onboarding.mjs`, `e2e-onboarding-a11y.mjs`.

## 2. Verified for real

**Gate → onboarding.** The premium gate rendered on `/markets/compute-analytics`, and "Get Full Access" landed on `/access?returnTo=%2Fmarkets%2Fcompute-analytics`.

**The intro.** Stated the offer, showed **$80/week** and "No free trial" *before* any account existed, listed all five premium products, offered Continue and Log in, and contained no payment control.

**Both branches, destination intact.** Continue → `/access/create` with the destination; Back → `/access` with the destination; Log in → `/access/login`.

**Signup rejection.** A syntactically valid address that Supabase's validator refuses stayed on the form, showed an error, disclosed nothing about whether that address has an account, and established no session.

**Existing verified user.** Login landed on `/access/ready?returnTo=%2Fmarkets%2Fcompute-analytics`. The boundary said the account is ready, repeated **$80/week**, said "Checkout setup coming next" and "no charge has been made", and had no payment control and no disabled button. **Refresh stayed on the boundary.**

**Never re-authenticated.** For that signed-in reader, `/access`, `/access/create` and `/access/login` all redirected to `/access/ready`.

**Sign out.** `/access` returned to the anonymous intro with no stale ready state, and `/access/ready` was no longer reachable.

**Already entitled.** With an entitlement granted, login landed on `/access/subscribed`; it said they already have full access; it contained no "create account", "verify your email", "ready to continue", "checkout" or price; **every** other onboarding URL — `/access`, `/create`, `/login`, `/ready`, `/verify` — redirected there; and Continue followed the preserved `/markets/power-analytics`.

**Anonymous cannot reach any authenticated state.** `/access/ready`, `/access/subscribed` and `/access/verify` each 307 to `/access`.

**Confirmation callback.** An invalid token with `next=https://evil.test/phish` landed on `/auth/sign-in?error=link_invalid` with the hostile destination discarded.

**Production default.** Onboarding worked with enforcement off, and premium products stayed ungated.

**Accessibility.** All inputs labelled; password fields `type="password"` with correct autocomplete tokens; every control focusable; the error is a `role="alert"` tied to the form by `aria-describedby` with `aria-invalid` on the fields and no disclosure of which credential was wrong; meaningful `h1` on each screen; **no "Step N of M"** anywhere; visible focus styles; no long-running animation. No horizontal overflow at 390px.

**Nothing was created.** After every run the database held exactly what it held before:

```
identity.accounts            1
identity.premium_entitlements 1   (0 active)
auth.users                   2
```

One account despite many logins — no duplicate Urdais account. Zero active entitlements — onboarding granted nothing.

## 3. Verified with a fixture, and labelled as such

**The verification screen.** Reached by setting the `urdais_onboarding_email` cookie directly in the browser context, because a real signup cannot complete (below). It rendered, named the pending address, offered a resend, offered "Use a different email" and "Log in", and offered no way to self-declare verification.

This exercises the screen, not the delivery.

## 4. NOT verified — a real confirmation email

**No confirmation email has been delivered or clicked.** Three independent blockers, unchanged from Phase 2:

1. **Supabase's hosted validator rejects synthetic domains.** `@example.invalid` and `@example.com` are both refused with `email_address_invalid`, so no throwaway address can be registered.
2. **No deliverable test mailbox.** Using a real personal address was not appropriate without being asked.
3. **The default mailer only delivers to project team members** and is rate-limited to a couple of messages an hour.

What follows from that:

| Exercised for real | Not exercised |
| --- | --- |
| Signup rejection and error mapping | A successful `signUp` against a deliverable address |
| The verification screen and its actions | Receiving a confirmation email |
| `/auth/confirm` failure paths and redirect safety | `/auth/confirm` **success** with a live emailed token |
| Resend wiring and failure reporting | A resend arriving in an inbox |
| Everything after verification | |

Also worth recording: because `mailer_autoconfirm: false`, **"authenticated but unverified" is not reachable via password sign-in** on this project — Supabase refuses the sign-in. The state is implemented and unit-tested; it cannot be produced through that path.

**The flow was not weakened to work around any of this.** No auto-confirm, no disabled verification, no seeded production user, no accepted client-supplied verification state, no metadata trust, no hidden bypass.

## 5. Outstanding configuration

Unchanged from Phase 2, and still the blocker for public signup:

1. **Custom SMTP provider credentials** on each Supabase project. Without it account creation is effectively broken for the public. Needs provider credentials nobody has supplied.
2. **Redirect allow-list** — add `<origin>/auth/confirm` and set Site URL to the deployment origin.
3. **Vercel environment variables** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Until set, production runs as the public-only product: nothing breaks, there is simply no sign-in and `/access` shows the intro to everyone as an anonymous reader.
4. **Password policy** in the dashboard. The app maps Supabase's `weak_password` rejection rather than hardcoding a rule, so whatever is set there is what applies.

Then: **re-run the confirmation test with a deliverable address** and confirm a live token completes `/auth/confirm` and continues to `/access/ready`.

## 6. Repeating it

Servers:

```bash
URDAIS_PREMIUM_ENFORCEMENT=active PORT=3101 npx next start -p 3101   # gates on
PORT=3102 npx next start -p 3102                                     # production default
```

Entitlement, for the already-subscribed path (development only):

```sql
update identity.premium_entitlements
   set status = 'active', granted_at = now(), revoked_at = null
 where account_id = '<account uuid>';
-- and to undo
update identity.premium_entitlements
   set status = 'inactive', revoked_at = now()
 where account_id = '<account uuid>';
```

The test users are the Phase 2 fixtures; see `docs/operations/auth-phase-2-verification.md` §7 for their addresses, the shared password, and the GoTrue column quirks if you need to re-seed them.

**Never grant an entitlement on UrdaisProd to test anything.**
