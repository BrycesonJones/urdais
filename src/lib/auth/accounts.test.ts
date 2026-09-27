/**
 * Mapping a Supabase subject onto a Urdais account.
 *
 * The properties under test are the ones Phase 1's schema was designed for and
 * that the brief names as invariants: the account key is `(auth_provider,
 * auth_subject)`, email is not identity, and an email change must not produce a
 * second account. The concurrency case is here too, because "first authenticated
 * request" is exactly the moment two tabs race.
 */

import { describe, expect, it } from "vitest";

import { SUPABASE_AUTH_PROVIDER, resolveUrdaisAccount } from "@/lib/auth/accounts";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

type Call = { text: string; params: readonly unknown[] };

/**
 * A stand-in for `identity.accounts` that enforces the real unique constraint.
 *
 * Hand-written rather than mocked so that the upsert's conflict behaviour is
 * actually exercised: a mock returning canned rows would pass while the SQL was
 * wrong. The migration's own constraints are verified separately in
 * `supabase/tests/690_access_entitlement.sql`.
 */
function fakeAccounts(seed: { provider: string; subject: string; id: string; email: string | null }[] = []) {
  const rows = seed.map((r) => ({ ...r }));
  const calls: Call[] = [];
  let nextId = 1;

  const sql: TokenSqlExecutor = {
    async query(text, params) {
      calls.push({ text, params });
      const kind = (text.trim().split(/\s+/)[0] ?? "").toLowerCase();
      const provider = params[0] as string;
      const subject = params[1] as string;

      if (kind === "select") {
        const found = rows.find((r) => r.provider === provider && r.subject === subject);
        return { rows: found ? [{ id: found.id, email: found.email }] : [] };
      }

      if (kind === "insert") {
        const email = params[2] as string | null;
        const existing = rows.find((r) => r.provider === provider && r.subject === subject);
        if (existing) {
          // `on conflict … do update set email = excluded.email`
          existing.email = email;
          return { rows: [{ id: existing.id, email: existing.email }] };
        }
        const created = { provider, subject, id: `account-${nextId++}`, email };
        rows.push(created);
        return { rows: [{ id: created.id, email: created.email }] };
      }

      if (kind === "update") {
        const email = params[2] as string | null;
        const found = rows.find((r) => r.provider === provider && r.subject === subject);
        if (!found) return { rows: [] };
        found.email = email;
        return { rows: [{ id: found.id, email: found.email }] };
      }

      throw new Error(`unexpected statement: ${kind}`);
    },
  };

  return { sql, rows, calls };
}

describe("provisioning", () => {
  it("creates one account on first sight, under the supabase provider", async () => {
    const db = fakeAccounts();
    const account = await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "reader@example.invalid" });

    expect(account.id).toBe("account-1");
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.provider).toBe(SUPABASE_AUTH_PROVIDER);
    expect(db.rows[0]?.subject).toBe("uuid-1");
  });

  it("returns the same account on every later resolution", async () => {
    const db = fakeAccounts();
    const first = await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "reader@example.invalid" });
    const second = await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "reader@example.invalid" });
    const third = await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "reader@example.invalid" });

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(db.rows).toHaveLength(1);
  });

  it("is idempotent: a repeat resolution writes nothing", async () => {
    const db = fakeAccounts([{ provider: "supabase", subject: "uuid-1", id: "acct", email: "reader@example.invalid" }]);
    await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "reader@example.invalid" });

    // One SELECT and no write, which is the steady state on every authenticated
    // request. A write here would fire the updated_at trigger on every page view.
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text.trim().startsWith("select")).toBe(true);
  });

  it("is concurrency-safe: two simultaneous first requests converge on one row", async () => {
    const db = fakeAccounts();
    // Both see no row on their SELECT, so both proceed to the upsert. The second
    // hits the conflict and takes the existing id instead of failing.
    const [a, b] = await Promise.all([
      resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "reader@example.invalid" }),
      resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "reader@example.invalid" }),
    ]);

    expect(a.id).toBe(b.id);
    expect(db.rows).toHaveLength(1);
  });

  it("refuses an empty subject rather than creating a junk account", async () => {
    const db = fakeAccounts();
    await expect(resolveUrdaisAccount(db.sql, { subject: "   ", email: null })).rejects.toThrow(/empty auth subject/);
    expect(db.rows).toHaveLength(0);
  });
});

describe("email is not identity", () => {
  it("looks an account up by subject, never by email", async () => {
    const db = fakeAccounts([{ provider: "supabase", subject: "uuid-1", id: "acct", email: "reader@example.invalid" }]);
    await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "reader@example.invalid" });

    for (const call of db.calls) {
      // The address may be *written* as the support copy; it must never appear in
      // a lookup predicate.
      expect(call.text).not.toMatch(/where[\s\S]*email/i);
    }
  });

  it("keeps the same account when the email changes", async () => {
    const db = fakeAccounts();
    const before = await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "old@example.invalid" });
    const after = await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "new@example.invalid" });

    expect(after.id).toBe(before.id);
    expect(db.rows).toHaveLength(1);
    // The support copy followed; the identity did not move.
    expect(after.email).toBe("new@example.invalid");
    expect(db.rows[0]?.subject).toBe("uuid-1");
  });

  it("does not create a second account for a shared address under one provider", async () => {
    const db = fakeAccounts();
    await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "shared@example.invalid" });
    await resolveUrdaisAccount(db.sql, { subject: "uuid-2", email: "shared@example.invalid" });

    // Two subjects, two accounts, one address. The address is not a key in either
    // direction.
    expect(db.rows).toHaveLength(2);
    expect(new Set(db.rows.map((r) => r.id)).size).toBe(2);
  });

  it("normalises the stored address so the check constraint cannot reject a sign-in", async () => {
    const db = fakeAccounts();
    const account = await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: "  Reader.A@Example.INVALID " });
    expect(account.email).toBe("reader.a@example.invalid");
  });

  it("stores null rather than an empty string for a user with no address", async () => {
    const db = fakeAccounts();
    const account = await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: null });
    expect(account.email).toBeNull();

    const blank = await resolveUrdaisAccount(db.sql, { subject: "uuid-2", email: "   " });
    expect(blank.email).toBeNull();
  });
});

describe("the provider dimension", () => {
  it("treats the same subject under another provider as a different identity", async () => {
    const db = fakeAccounts();
    const supabase = await resolveUrdaisAccount(db.sql, { subject: "shared-subject", email: null }, "supabase");
    const other = await resolveUrdaisAccount(db.sql, { subject: "shared-subject", email: null }, "workos");

    // Phase 1's semantics, preserved: identity is the pair, not the subject.
    expect(other.id).not.toBe(supabase.id);
    expect(db.rows).toHaveLength(2);
  });

  it("defaults to supabase without the caller naming it", async () => {
    const db = fakeAccounts();
    await resolveUrdaisAccount(db.sql, { subject: "uuid-1", email: null });
    expect(db.calls[0]?.params[0]).toBe("supabase");
  });
});
