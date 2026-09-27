# Authentication: Phase 2 verification record

**Status: internal operations document. Not routed publicly, not registered in the docs catalog.** Written 27 September 2026, Paid Access Phase 2, against UrdaisDev (`scwwjoyouohfrwylalha`).

What was actually exercised, what was not, and how to repeat it. The distinction matters: one part of the flow could not be tested end to end, and this document says which.

---

## 1. Environment

UrdaisDev was **99 migrations behind** when this phase began — its ledger held 30 rows, newest `20260914050000`, against 129 in the repository. It was brought current with `supabase db push`, which applies sequentially and aborts on the first failure. All 99 applied, exit 0, no failures, and no historical migration was edited, skipped or marked-as-applied.

The ledger was then compared **version by version** against the repository, not by row count — the documented check, because a wall-clock-stamped row is the drift signature that equal counts hide:

```
repo versions:   129
ledger versions: 129
diff: IDENTICAL
```

UrdaisProd was not touched. It remains one migration behind (`20261023100000`), which is expected and deliberate.

## 2. Supabase Auth configuration, as read from the project

`GET /auth/v1/settings`:

| Setting | Value | Meaning |
| --- | --- | --- |
| `external.email` | `true` | email/password enabled |
| `disable_signup` | `false` | signups allowed |
| `mailer_autoconfirm` | **`false`** | **email confirmation is required** |
| every OAuth provider | `false` | none enabled, as intended |
| `anonymous_users` | `false` | off |
| `passkeys_enabled` | `false` | off |

## 3. What was verified end to end

Driven through the real app in headless Chrome — real form, real cookies, real navigation. Scripts are in the session scratchpad (`e2e-auth.mjs`, `e2e-entitlement.mjs`, `e2e-policy.mjs`).

**Anonymous reader.** Reports anonymous; no session cookie; all five premium products denied `authentication_required`; `/`, `/markets`, `/map`, `/docs`, `/markets/model-economics`, `/markets/compute-analytics`, `/markets/power-analytics` all 200.

**Sign in.** Succeeded through the form. Redirected to the validated `returnTo` (`/markets/compute-analytics`, the real Phase 3 scenario). Session cookie set and **`httpOnly`**. Verification state reported `yes`. A `identity.accounts` row was provisioned with `auth_provider='supabase'` and `auth_subject` exactly equal to the Supabase user UUID.

**Authentication is not entitlement.** Signed in with no entitlement row: premium access `denied`, and all five products denied with `entitlement_required` rather than `authentication_required`.

**Session persistence.** Survived a reload, navigation across public pages, and a cold browser context carrying the cookies.

**Account stability.** Same account id on every later resolution. `created_at = updated_at` on the row afterwards, proving the steady-state read path writes nothing.

**Sign out.** Reports anonymous, session cookie cleared, premium denied for authentication again.

**Manual entitlement (§15).** With an `active`/`manual` row: entitlement surfaced, premium access `granted`, all five products allowed from the one entitlement. Revoked to `inactive`: all five denied again. Throughout, `/markets/compute-analytics`, `/markets/power-analytics` and `/map` returned 200 to entitled **and** anonymous readers — premium enforcement is still inactive, as intended.

**Configured sign-in policy.** An unconfirmed address is refused and told to confirm. A wrong password and an address with no account produce the **same** message, so the form cannot be used to enumerate accounts.

**Confirmation callback.** `/auth/confirm` redirects rather than crashing on every bad input: invalid token → `error=link_invalid`; no token → `error=link_missing`; `next=https://evil.test/phish` and `next=//evil.test` discarded; a valid internal `next` preserved as `returnTo`.

## 4. What was NOT verified — and why

**A real confirmation email was never delivered or clicked.** Three independent blockers:

1. **Supabase's hosted address validator rejects synthetic domains.** Both `@example.invalid` and `@example.com` were refused with `email_address_invalid`, so a throwaway test address cannot be registered through the signup endpoint.
2. **No deliverable test mailbox.** Using a real personal address was not appropriate without being asked.
3. **The default SMTP service only delivers to project team members** and is rate-limited to a couple of messages an hour, so even a valid address would not reliably receive anything until custom SMTP is configured.

So the test users were seeded **directly into `auth.users`** on UrdaisDev, with `email_confirmed_at` set (and a second left null). Sign-in against the real Supabase Auth API then worked normally.

What this means for confidence:

| Exercised for real | Not exercised |
| --- | --- |
| Sign-in, sessions, cookies, refresh | `auth.signUp()` against the hosted validator |
| Verified vs unverified state handling | Receiving a confirmation email |
| `/auth/confirm` failure paths and redirect safety | `/auth/confirm` **success** path with a live token |
| Account provisioning and idempotency | |
| Entitlement grant and revocation | |

`verifyOtp` / `exchangeCodeForSession` are implemented and their failure paths are verified, but **the successful confirmation of a real emailed token has not been observed.** Treat that as outstanding.

Note a consequence of `mailer_autoconfirm = false`: "authenticated but unverified" is **not reachable via password sign-in** on this project — Supabase refuses the sign-in. The state is handled and unit-tested, but it cannot occur on this configuration through that path.

## 5. Outstanding external configuration

Before any real person can create a Urdais account:

1. **Custom SMTP** on each project. Without it, account creation is effectively broken for the public. This is the blocking item.
2. **Redirect allow-list**: add `<origin>/auth/confirm`, and set Site URL to the deployment origin.
3. **Vercel environment variables** on the Urdais project: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Until they are set, production runs as the public-only product — nothing breaks, there is simply no sign-in.
4. **Password policy** in the dashboard.
5. **Then re-run the confirmation test** with a deliverable address and confirm a live token completes `/auth/confirm`.

## 6. Repeating the manual entitlement check

There is deliberately no "grant premium" endpoint and no admin UI. Use SQL against the development database.

```sql
-- Who am I? /auth/status shows the account id after signing in.
select id, auth_provider, auth_subject, email from identity.accounts;

-- Grant. This is the shape Stripe will later write, with source='stripe'
-- and an external_reference.
insert into identity.premium_entitlements (account_id, status, source, granted_at)
values ('<account uuid>', 'active', 'manual', now())
on conflict (account_id) do update
  set status = 'active', source = 'manual', granted_at = now(), revoked_at = null;

-- Revoke.
update identity.premium_entitlements
   set status = 'inactive', revoked_at = now()
 where account_id = '<account uuid>';
```

Reload `/auth/status` after each. Premium access should flip between `granted` and `denied`, and all five products with it.

**Never run this against UrdaisProd** to give someone access. When there is a reason to comp an account, it is still this statement — but it is a deliberate operator action on production, not a test.

## 7. Development fixtures left in place

Two rows in `auth.users` on **UrdaisDev only**, seeded by SQL as described above:

| Address | State | Purpose |
| --- | --- | --- |
| `phase2-verified@urdais-test.dev` | `email_confirmed_at` set | the signed-in path |
| `phase2-unconfirmed@urdais-test.dev` | never confirmed | the refusal path |

Password for both: `urdais-phase2-Test-passphrase-9911`. Not a secret — these accounts exist only on the development project, hold no entitlement, and the domain does not resolve.

They were kept rather than deleted so Phase 3 can exercise a gate without repeating the seeding. Delete them whenever they stop being useful:

```sql
delete from auth.users where email like 'phase2-%@urdais-test.dev';
```

The `identity.accounts` row cascades with it. If you re-seed, remember that GoTrue cannot scan `NULL` into its string columns — `confirmation_token`, `recovery_token`, `email_change` and `email_change_token_new` must be `''`, and an `auth.identities` row must exist, or sign-in fails with `unexpected_failure`.
