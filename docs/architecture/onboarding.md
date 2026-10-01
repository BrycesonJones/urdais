# Onboarding

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 27 September 2026, Paid Access Phase 4. Onboarding is **real**; it ends one step before payment, and there is no Stripe.

> **Revised 28 September 2026.** The intro screen is removed, authentication is passwordless — an emailed **verification code**, entered without leaving Urdais — and the price moved to Plan / Pay. See `docs/architecture/passwordless-authentication.md`; the sections below on state, `returnTo`, the checkout boundary and the Phase 5 handoff are unchanged.

> Onboarding gets a reader to the point where a subscription *could* be bought. It never grants one.

---

## 1. The journey

```
premium product
  → Get Full Access
    → /access                 create your account: email, or Google
      → /access/login         sign in  (the same primitive, different heading)
        → /access/verify      enter the emailed code — the code IS the credential
          → /access/ready     READY FOR CHECKOUT
            → [Phase 5: Plan / Pay + Stripe]

        → /access/subscribed  already have full access
```

There is no intro screen and no price: the gate established intent, and what a
subscription costs belongs beside the payment it explains.

Five states, five real routes. That is what makes the specification's hard requirements fall out rather than needing machinery: **back works** because each state is a history entry, **refresh works** because nothing is held in memory, and a URL someone bookmarks resolves against their account as it is *now*.

---

## 2. The state machine

`src/lib/onboarding/state.ts`. One named state per situation, derived from the authoritative viewer — never a set of `showSignup` / `showVerify` booleans, which is how a flow ends up in two states at once or none.

| Viewer | State |
| --- | --- |
| anonymous | `create_account` (or `login` / `email_challenge`) |
| authenticated, entitled | `already_entitled` |
| authenticated, unverified | `email_challenge` — only a legacy password account |
| authenticated, verified, no entitlement | `ready_for_checkout` |

`onboardingStateFor(viewer)` is pure and total. `isStateReachable` decides whether a requested state is legitimate for that reader, and `redirectStateFor` always names a state they *can* occupy — which is what makes a redirect terminate rather than bounce. A test walks every (viewer × state) pair and asserts the second hop always renders.

**The one choice the server cannot make** is `create_account` vs `login`, because Urdais does not tell an anonymous visitor whether their address already has an account. That would be the enumeration disclosure Phase 2 avoided. So `/access` offers both and the reader picks — the conventional behaviour, and here also the private one.

### Precedence, and a judgement call

Entitlement is checked **before** verification. A reader with an active entitlement on an unconfirmed address — today only possible as an operator comp — sees "you already have full access", not "verify your email". `canAccess` already grants them premium, so a verification screen would gate nothing and imply they cannot use what they can. The specification did not settle this; it is flagged here and pinned by a test.

---

## 3. Server authority

`src/lib/onboarding/server.ts` is the only thing the routes call. Each asks *may I render this state?* and gets either a viewer or a redirect.

Because the answer comes from Phase 2's `resolveViewer` — session → account → entitlement — the journey **cannot be advanced by editing a URL**:

| Typed URL | Anonymous | Unverified | Subscriber |
| --- | --- | --- | --- |
| `/access/ready` | → `/access` | → `/access/verify` | → `/access/subscribed` |
| `/access/login` | renders | → `/access/verify` | → `/access/subscribed` |
| `/access` | renders the account form | → `/access/verify` | → `/access/subscribed` |
| `/access/verify` (nothing pending) | → `/access` | renders | → `/access/subscribed` |

Verified in a browser, not just in tests.

### Refresh and resume

There is no progress to lose. Sign in and refresh: the server sees an authenticated viewer and resumes at the right state. Verify by email and come back: the server sees verified and continues. Sign out: the next request resolves anonymous, and a stale "Ready for Checkout" is impossible because the page was never client state.

---

## 4. The three entry states

**Anonymous new user** — account form → check your email → type the code → ready.

**Anonymous existing user** — log in (the same email-only form) → check your email → type the code → ready. Authenticating proves *who* they are and nothing about what they may read; the next screen comes from their account's real state.

**Already authenticated** — never asked to authenticate again (Invariant 3). `/access` and `/access/login` both redirect to whichever state their account implies — or, since Phase 7A, to `/account` when that was their destination (the header's account icon; see `account-entry.md` §4).

---

## 5. Verification

Reached two ways, differing in whether a session exists:

- **straight after asking for a code** — there is no session yet, because submitting the code is what creates one. The address comes from a short-lived httpOnly cookie set by the action (`src/lib/onboarding/pending-email.ts`).
- **signed in, unconfirmed** — only a legacy password account. The address comes from the Auth server, which is authoritative.

**The verification *state* is never taken from the page, the cookie or a form.** It is `email_confirmed_at`, read through `resolveViewer`. `user_metadata.email_verified` is writable by the user via `updateUser` and is never read — Phase 2 established that, and a test asserts it still holds.

There is deliberately **no "I've verified" button**. A reader cannot assert their own verification, and a button that re-checked would be a refresh with extra steps. The only control that advances this screen is the one that submits a credential.

### Why the pending address is a cookie

A query parameter would let anyone construct `/access/verify?email=someone@else.test` and press resend, making Urdais a way to mail arbitrary addresses. An httpOnly cookie cannot be planted by a link or read by script.

It is not *unforgeable* — a crafted request can send any cookie — and that is acceptable rather than overlooked: the signup endpoint will already mail any address anyone types, so a forged cookie grants no new capability, and Supabase rate-limits both paths. **It decides what to print, which address to resend to, and which address a submitted code is verified against — and nothing else.** That third use is not an expansion: verifying against the pending address is *narrower* than accepting an address from the form, which is what it replaces. A forged cookie still grants nothing, because the attacker must already control the mailbox the code was sent to. If it ever decides more than these three, that change is a vulnerability.

### Resend

Sending the code again is `sendEmailOtp` a second time — there is no separate resend primitive, because resending a credential is issuing one, and the previous code stops working. The address comes from the session or the pending record, never from the form. The button disables while in flight; Supabase's rate limit is the real ceiling and maps to a "wait a few minutes" message.

**A failure is reported as a failure.** Saying "sent" when Supabase refused leaves someone waiting for mail that will never arrive.

---

## 6. Verification continues onboarding

A successful `verifyOtp` redirects to **`/access`, not the premium page**. Proving an address finishes one step, not the journey. Sending them straight to the premium destination would drop them where they started having never seen the checkout boundary, and would spend the destination Phase 5 needs *after* payment.

```
email → check your email → type the code → session established
       → /access?returnTo=… → resolves verified viewer → /access/ready
```

It redirects to `/access` rather than deciding the next state inline: computing the new state inside the request that created it would put the state machine in two places, and the fresh request resolves the brand-new viewer correctly whatever it turns out to be — ready, or already entitled.

`/auth/confirm` is Phase 2's route and is **no longer reached by anything emailed**. It remains as Google's PKCE callback; deleting it would delete the OAuth path. It still clears the pending record once a real session exists, and its `next` still passes through `safeReturnTo`.

---

## 7. `returnTo`

Carried in the query string of every state and **re-validated at each hop** by Phase 2's `safeReturnTo` — the only sanitiser in Urdais. A value Urdais generated on the previous hop still reached the browser in between.

```
/access?returnTo=/markets/compute-analytics
/access/create?returnTo=…   /access/login?returnTo=…
/access/verify?returnTo=…   /access/ready?returnTo=…
```

Phase 5 carries it through Stripe and returns the newly entitled reader there.

**Phase 4 tightened the sanitiser**: it already refused `/auth/*` as a destination; it now refuses `/access*` too. Returning to onboarding after finishing onboarding is the same loop, and both roots are refused in the one sanitiser rather than in the two journeys separately.

---

## 8. The checkout boundary

> **Superseded 29 September 2026 by Paid Access Phase 5.** `/access/ready` is no
> longer a boundary that says payment is unavailable — it is **Plan / Pay**, the real
> subscription offer, and the only screen in Urdais that quotes a price. The
> enforcement described below (two independent re-derivations of the same three
> conditions) is unchanged and now has a third: `startCheckout` re-derives them
> again, because a form can be submitted by something that never rendered the page.
> See `docs/architecture/stripe-billing.md`.
>
> The paragraph below about what the screen "must never contain" still holds for card
> fields and fake payment controls. It no longer holds for the price, which belongs
> here precisely because the payment is here.

`/access/ready`. Only an authenticated, verified, non-entitled reader sees it, enforced **twice**: `resolveOnboarding` decides whether to render, and `resolveCheckoutHandoff` independently re-derives the same three conditions — because Phase 5 attaches a form action here, and a submission is a second entry point that must not rely on the page having checked.

What it says:

> **You're ready to continue**
> Your Urdais account is set up and ready for premium access.
>
> **Checkout setup coming next**
> Payment is not available yet, so there is nothing to complete on this page. Your account is ready, and no charge has been made.

What it must never contain, asserted by test: card fields, CVC, anything Stripe, a "pay now" control, a fake session id, **or a disabled button styled like a payment action** — a disabled control invites clicking and reads as a bug; a stated fact does not.

**Reaching it writes nothing.** After a full E2E run the database held one account, one entitlement row with zero active, and two auth users: exactly what existed before.

---

## 9. Already entitled

`/access/subscribed`. Shown instead of any part of the purchase journey, from every onboarding URL. Once Stripe exists this is what stops a second subscription being created by someone following a stale CTA or pressing back — the ordinary way duplicate subscriptions happen, and a refund conversation rather than a bug report.

No signup, no login, no verification prompt, no checkout action, and **no price** — there is nothing to sell them. The only thing offered is the way onward, using their preserved destination.

---

## 10. Phase 5 handoff

**Implemented in Phase 5.** `src/lib/onboarding/checkout-handoff.ts` is unchanged and is now consumed by `@/lib/billing/checkout`, which honoured the contract below: `accountId` is derived from the session and is not posted back. See `docs/architecture/stripe-billing.md`.

```ts
const handoff = await resolveCheckoutHandoff();
if (handoff.kind !== "ready") return;
await createCheckoutSession({ accountId: handoff.accountId, returnTo: handoff.returnTo });
```

`accountId` is **derived from the session, never posted back**. A hidden form field carrying an account id is a subscription someone else pays for. Phase 5 must keep that property.

It refuses rather than returning a partial answer, for `anonymous`, `unverified` and `already_entitled` — the last being the duplicate-subscription guard.

### Price

`src/lib/access/pricing.ts` is the one presentation source: **$80/week, no free trial**, stored in minor units (`8000`) the way Stripe counts them. Phase 5 reconciles it against the Stripe Price before every Checkout Session and refuses rather than charging when they disagree. **Frontend copy is not the billing authority.**

Shown on **one** screen: Plan / Pay, beside the payment it explains. The intro is gone, the account and login forms quote nothing, and the already-entitled screen shows it nowhere — there is nothing to sell somebody who already subscribes. A test asserts exactly one onboarding file quotes a price.

The copy deliberately says nothing about tax, proration, renewal or cancellation — none of that is established, and a sentence implying terms that do not exist is worse than none.

---

## 11. The onboarding question was omitted

Section 5 offered "What best describes you?" as optional. It is **not implemented**, deliberately.

Persisting it needs somewhere to put it, and there is nowhere appropriate. `identity.accounts` is provider-agnostic *identity* — `(auth_provider, auth_subject)` plus a support-copy email — not a marketing profile, and adding a segmentation column or table would be a migration for marketing data, which the brief says requires explicit approval. Collecting it without persisting it would be a screen that asks a question and throws the answer away.

The core flow matters more, and the specification allows omitting it for V1. Add it when there is a decided home for the answer.

---

## 12. Security

Every Phase 1–3 boundary is preserved, and asserted across the whole onboarding surface by source scan rather than file by file:

| | |
| --- | --- |
| Identity | Supabase server-side, via `resolveViewer` |
| Account | `identity.accounts`, server-controlled, keyed on `(provider, subject)` |
| Verification | `email_confirmed_at` only; `user_metadata` never read |
| Entitlement | onboarding writes none — no reference to `premium_entitlements` anywhere in it |
| Redirects | `safeReturnTo`, the one sanitiser |
| Cookies | Phase 2's httpOnly server-action model; no Supabase browser client |
| Premium enforcement | unchanged, and still inactive |

Only `email`, `code` and `returnTo` are read from any customer form. An account id, verification flag or entitlement submitted as a field is ignored — and so is an `email` submitted alongside a `code`, which is verified against the server's pending address instead.

**No migration.** **No environment variable.** **Production premium enforcement remains inactive**, so a normal visitor still never meets a gate — `/access` being functional does not change that.

---

## 13. What remains externally blocked

**Superseded by the OTP revision.** Custom SMTP (Resend) is now configured on UrdaisDev and `urdais.com` is verified; what was blocked here is recorded, with the real-delivery result, in `docs/operations/onboarding-otp-verification.md`. The flow is built against the real architecture with no weakening: no auto-confirm, no disabled verification, no accepted client-supplied state, no bypass.

What was exercised, and how, is recorded in `docs/operations/onboarding-phase-4-verification.md`. The outstanding item is **custom SMTP provider credentials**, which is also what blocks public signup generally.
