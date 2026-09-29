# Paid Access — production activation record

**Status: internal operations record.** 29 September 2026. Records the one production
schema change Paid Access needed, and the state of UrdaisProd after it.

> Production onboarding was live for roughly twenty minutes before this migration
> landed. It did not error. It **silently failed**, and that is the part worth
> remembering.

---

## 1. What was applied

`20261023100000_access_entitlement_foundation` — the Phase 1 entitlement foundation,
merged in PR #208 and unapplied on UrdaisProd ever since.

Applied through the documented path in `production-environments.md` §1,
`supabase db push`, which reads the version from the filename so the ledger records
`20261023100000` rather than the wall clock. Nothing was regenerated, repaired,
skipped, or marked as applied by hand.

### Confirmed before applying

| Check | Result |
| --- | --- |
| Repository migrations | 129 |
| Applied on UrdaisProd | 128 |
| Pending | exactly one: `20261023100000` |
| Drifted / production-only | **none** — the ledger contained nothing absent from the repository |
| File integrity | `sha256` identical to the file as merged in Phase 1 (`d669add`); `git diff` between that commit and `main` is empty |
| Dry run | `supabase db push --dry-run` offered exactly that one migration |

### Confirmed after

| Check | Result |
| --- | --- |
| Ledger vs repository | **identical**, 129 = 129, no difference in either direction |
| `migrations:check --production` | ok — 129 applied, 0 pending, 0 drifted, 0 production-only |
| `migrations:freshness` | ok — current |
| `tokens:production:check` | ready — every designated provider has a frozen benchmark |
| `identity.accounts` | exists, RLS enabled, **0 policies**, 0 rows |
| `identity.premium_entitlements` | exists, RLS enabled, **0 policies**, 0 rows |
| `anon` / `authenticated` / `public` grants on `identity` | **none** |
| `identity` schema usage | `postgres` and `service_role` only |
| `auth.users` | 0 — unchanged |

Zero policies under enabled RLS is the reviewed Phase 1 design, not an omission: every
read goes through `pg` on the privileged server connection, and RLS with no policy
denies everything to every other role. A policy would be a second, weaker path to the
same rows.

---

## 2. Why the failure mode mattered

`resolveViewer` wraps account provisioning in a `try`/`catch` and returns
`ANONYMOUS_VIEWER` on any failure. That is deliberate and correct — it withholds
premium rather than granting it, and it keeps a public page from returning 500 because
an entitlement read failed.

The consequence, with `identity` absent, was not an error anybody could act on:

```
enter a correct code → verifyOtp succeeds → session cookie set
  → /access → resolveViewer cannot provision → anonymous
    → renders the account form again
```

A reader would have seen the sign-in form come back, with no message, having done
everything right. The log line was there (`resolveViewer: entitlement resolution
failed`) but nothing reached the screen.

**The lesson is not that the fail-safe is wrong.** It is that "authenticated" and
"has a Urdais account" are separate facts, and a deployment can satisfy the first
while being structurally unable to satisfy the second. Premium enforcement being
inactive hid nothing here — the loop would have happened to anyone who signed up.

---

## 3. What this did not change

Premium enforcement remains **inactive**. `identity.premium_entitlements` is empty, so
even with enforcement on, no reader would be entitled. Applying the schema grants
nobody anything; it makes it possible to record that somebody has something, which is
what Phase 5 needs.

No production user was created and no production OTP was sent. The provider evidence
for both the new-user and returning-user flows is UrdaisDev's, recorded in
`onboarding-otp-verification.md`.
