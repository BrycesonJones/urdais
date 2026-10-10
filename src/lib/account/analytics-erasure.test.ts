import { describe, expect, it, vi } from "vitest";

import {
  analyticsErasureRequired,
  ERASURE_FAILED,
  ERASURE_UNCONFIGURED,
  settleHeldDeletion,
  settleHeldDeletions,
  type ErasureDeps,
} from "@/lib/account/analytics-erasure";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

const ACCOUNT = "0f8e1c3a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const CONFIG = { apiHost: "https://eu.posthog.com", projectId: "1", personalApiKey: "phx_x" };

/** A fake executor: one deletion record, lease and state tracked like the real SQL. */
function fakeDb(initial: { state: string; accountId: string | null; leased?: boolean }) {
  const row = { id: "del_1", state: initial.state, account_id: initial.accountId, auth_subject: "sub_1", stripe_customer_id: null, leased: initial.leased ?? false, last_error: null as string | null };
  const sql: TokenSqlExecutor = {
    async query(text: string, values: readonly unknown[] = []) {
      if (text.includes("set lease_until = now() + interval")) {
        if (row.leased || row.state === "complete") return { rows: [] };
        row.leased = true;
        row.last_error = null;
        return { rows: [{ ...row }] };
      }
      if (text.includes("set lease_until = null, last_error = $2")) {
        row.leased = false;
        row.last_error = (values[1] as string | null) ?? null;
        return { rows: [] };
      }
      if (text.includes("set state = 'complete'")) {
        if (row.state === "auth_deleted") Object.assign(row, { state: "complete", account_id: null, auth_subject: null, leased: false, last_error: null });
        return { rows: [] };
      }
      if (text.includes("where state = 'auth_deleted'")) return { rows: row.state === "auth_deleted" ? [{ id: row.id }] : [] };
      throw new Error(`unexpected SQL: ${text.slice(0, 60)}`);
    },
  };
  return { sql, row };
}

const deps = (over: Partial<ErasureDeps> = {}): ErasureDeps => ({
  required: () => true,
  config: () => CONFIG,
  erase: vi.fn(async () => ({ kind: "queued" as const, personsFound: 1 })),
  ...over,
});

describe("settleHeldDeletion", () => {
  it("erases by the held account id, then completes and drops the identifiers", async () => {
    const { sql, row } = fakeDb({ state: "auth_deleted", accountId: ACCOUNT });
    const d = deps();
    expect(await settleHeldDeletion(sql, "del_1", d)).toEqual({ kind: "erased" });
    expect(d.erase).toHaveBeenCalledWith(ACCOUNT, CONFIG);
    expect(row).toMatchObject({ state: "complete", account_id: null, auth_subject: null });
  });

  it("holds the record, account id intact, when PostHog fails — nothing is lost", async () => {
    const { sql, row } = fakeDb({ state: "auth_deleted", accountId: ACCOUNT });
    const d = deps({ erase: vi.fn(async () => ({ kind: "failed" as const, status: 503 })) });
    expect(await settleHeldDeletion(sql, "del_1", d)).toEqual({ kind: "held", code: ERASURE_FAILED });
    expect(row).toMatchObject({ state: "auth_deleted", account_id: ACCOUNT, leased: false, last_error: ERASURE_FAILED });
  });

  it("holds when the erasure credentials are missing, rather than completing without erasing", async () => {
    const { sql, row } = fakeDb({ state: "auth_deleted", accountId: ACCOUNT });
    const d = deps({ config: () => ({ missing: ["POSTHOG_PERSONAL_API_KEY"] }) });
    expect(await settleHeldDeletion(sql, "del_1", d)).toEqual({ kind: "held", code: ERASURE_UNCONFIGURED });
    expect(d.erase).not.toHaveBeenCalled();
    expect(row.account_id).toBe(ACCOUNT);
  });

  it("holds when the erasure throws, never propagating", async () => {
    const { sql, row } = fakeDb({ state: "auth_deleted", accountId: ACCOUNT });
    const d = deps({ erase: vi.fn(async () => { throw new Error("boom"); }) });
    expect(await settleHeldDeletion(sql, "del_1", d)).toEqual({ kind: "held", code: "database_error" });
    expect(row.account_id).toBe(ACCOUNT);
  });

  it("completes without contacting PostHog where analytics was never in use", async () => {
    const { sql, row } = fakeDb({ state: "auth_deleted", accountId: ACCOUNT });
    const d = deps({ required: () => false });
    expect(await settleHeldDeletion(sql, "del_1", d)).toEqual({ kind: "completed" });
    expect(d.erase).not.toHaveBeenCalled();
    expect(row.state).toBe("complete");
  });

  it("skips a record another attempt has leased, and one not yet at auth_deleted", async () => {
    const leased = fakeDb({ state: "auth_deleted", accountId: ACCOUNT, leased: true });
    expect(await settleHeldDeletion(leased.sql, "del_1", deps())).toEqual({ kind: "skipped" });
    const early = fakeDb({ state: "local_cleanup_complete", accountId: ACCOUNT });
    const d = deps();
    expect(await settleHeldDeletion(early.sql, "del_1", d)).toEqual({ kind: "skipped" });
    expect(d.erase).not.toHaveBeenCalled();
    expect(early.row.leased).toBe(false);
  });

  it("never touches a completed record", async () => {
    const { sql } = fakeDb({ state: "complete", accountId: null });
    expect(await settleHeldDeletion(sql, "del_1", deps())).toEqual({ kind: "skipped" });
  });
});

describe("settleHeldDeletions", () => {
  it("summarises the sweep with counts and codes only", async () => {
    const { sql } = fakeDb({ state: "auth_deleted", accountId: ACCOUNT });
    const summary = await settleHeldDeletions(sql, 50, deps({ erase: vi.fn(async () => ({ kind: "failed" as const, status: null })) }));
    expect(summary).toEqual({ completed: 0, erased: 0, held: 1, skipped: 0, codes: [ERASURE_FAILED] });
    expect(JSON.stringify(summary)).not.toContain(ACCOUNT);
  });
});

describe("analyticsErasureRequired", () => {
  const KEY = ["phc", "fixtureprojectkey"].join("_");
  it("is required when analytics is configured, or erasure credentials are", () => {
    expect(analyticsErasureRequired({ NODE_ENV: "production", NEXT_PUBLIC_POSTHOG_KEY: KEY, NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" })).toBe(true);
    // Analytics turned off later, but PostHog may still hold data.
    expect(analyticsErasureRequired({ NODE_ENV: "production", POSTHOG_PERSONAL_API_KEY: "phx_x" })).toBe(true);
  });

  it("is not required where PostHog was never in use", () => {
    expect(analyticsErasureRequired({ NODE_ENV: "production" })).toBe(false);
    expect(analyticsErasureRequired({ NODE_ENV: "test", NEXT_PUBLIC_POSTHOG_KEY: KEY, NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" })).toBe(false);
  });
});
