import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUDIENCE_ROLES } from "@/lib/onboarding/audience";
import { persistPendingAudienceForViewer, upsertAccountAudience } from "@/lib/onboarding/audience-store";
import {
  AUDIENCE_STATE_SECRET_VAR,
  encodePendingAudience,
  PENDING_AUDIENCE_COOKIE,
  rememberPendingAudience,
} from "@/lib/onboarding/pending-audience";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

// One browser's cookie jar, shared by every request in a test.
const jar = vi.hoisted(() => new Map<string, string>());
const resolveViewer = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const databaseUrl = vi.hoisted(() => ({ value: "postgres://local.invalid/urdais" as string | null, throws: false }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));
vi.mock("@/lib/access/server", () => ({ resolveViewer }));
vi.mock("@/lib/tokens/read/database", () => ({
  resolveTokenDatabaseUrl: () => {
    if (databaseUrl.throws) throw new Error("misconfigured database environment");
    return databaseUrl.value;
  },
  tokenSqlExecutor: async () => ({ query }),
}));

describe("account audience persistence", () => {
  it("accepts every allow-listed category and keys the write to the server account", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const sql: TokenSqlExecutor = { query };

    for (const { value } of AUDIENCE_ROLES) {
      expect(await upsertAccountAudience(sql, "acct-from-session", value)).toBe("stored");
      expect(query).toHaveBeenLastCalledWith(expect.stringContaining("on conflict (account_id)"), ["acct-from-session", value]);
    }
  });

  it("rejects unknown and empty values before touching the database", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const sql: TokenSqlExecutor = { query };
    for (const value of ["", "administrator", null, undefined]) {
      expect(await upsertAccountAudience(sql, "acct-from-session", value)).toBe("rejected");
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("is idempotent because retries use one account-keyed upsert", async () => {
    const rows = new Map<string, string>();
    const sql: TokenSqlExecutor = {
      async query(_text, params) {
        rows.set(String(params[0]), String(params[1]));
        return { rows: [] };
      },
    };
    await upsertAccountAudience(sql, "acct-1", "investor_asset_manager");
    await upsertAccountAudience(sql, "acct-1", "investor_asset_manager");
    expect([...rows.entries()]).toEqual([["acct-1", "investor_asset_manager"]]);
  });
});


describe("pending audience consumption after authentication", () => {
  const SECRET = "test-secret-that-is-longer-than-thirty-two-characters";
  const signedIn = (accountId: string) => ({ authentication: { kind: "authenticated", accountId, emailVerified: true } });

  beforeEach(() => {
    jar.clear();
    vi.stubEnv(AUDIENCE_STATE_SECRET_VAR, SECRET);
    databaseUrl.value = "postgres://local.invalid/urdais";
    databaseUrl.throws = false;
    query.mockReset().mockResolvedValue({ rows: [] });
    resolveViewer.mockReset().mockResolvedValue(signedIn("acct-a"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stores the choice against the server-resolved account and clears the cookie", async () => {
    await rememberPendingAudience("frontier_ai_lab");
    expect(await persistPendingAudienceForViewer()).toBe("stored");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["acct-a", "frontier_ai_lab"]);
    expect(jar.has(PENDING_AUDIENCE_COOKIE)).toBe(false);
  });

  it("clears the cookie before the write, so a failed write cannot reach the next account", async () => {
    await rememberPendingAudience("frontier_ai_lab");
    query.mockImplementation(async () => {
      expect(jar.has(PENDING_AUDIENCE_COOKIE)).toBe(false);
      throw new Error("connection reset");
    });
    expect(await persistPendingAudienceForViewer()).toBe("unavailable");
    expect(jar.has(PENDING_AUDIENCE_COOKIE)).toBe(false);

    // A different person signs in on the same browser afterwards.
    query.mockReset().mockResolvedValue({ rows: [] });
    resolveViewer.mockResolvedValue(signedIn("acct-b"));
    expect(await persistPendingAudienceForViewer()).toBe("none");
    expect(query).not.toHaveBeenCalled();
  });

  it("consumes the choice even when no database is configured", async () => {
    await rememberPendingAudience("other");
    databaseUrl.value = null;
    expect(await persistPendingAudienceForViewer()).toBe("unavailable");
    expect(jar.has(PENDING_AUDIENCE_COOKIE)).toBe(false);
  });

  it("does not throw into the sign-in when the database environment is misconfigured", async () => {
    await rememberPendingAudience("other");
    databaseUrl.throws = true;
    await expect(persistPendingAudienceForViewer()).resolves.toBe("unavailable");
    expect(jar.has(PENDING_AUDIENCE_COOKIE)).toBe(false);
  });

  it("consumes the choice and writes nothing when the viewer does not resolve", async () => {
    await rememberPendingAudience("other");
    resolveViewer.mockResolvedValue({ authentication: { kind: "anonymous" } });
    expect(await persistPendingAudienceForViewer()).toBe("anonymous");
    expect(query).not.toHaveBeenCalled();
    expect(jar.has(PENDING_AUDIENCE_COOKIE)).toBe(false);
  });

  it("is a no-op for a sign-in without an audience choice", async () => {
    expect(await persistPendingAudienceForViewer()).toBe("none");
    expect(resolveViewer).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("consumes at most once", async () => {
    await rememberPendingAudience("academic_university");
    expect(await persistPendingAudienceForViewer()).toBe("stored");
    expect(await persistPendingAudienceForViewer()).toBe("none");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("discards tampered, foreign, expired and future-dated state without writing", async () => {
    const now = Math.floor(Date.now() / 1000);
    const forged = Buffer.from("v1|administrator|" + now, "utf8").toString("base64url");
    for (const value of [
      `${encodePendingAudience("other", now, SECRET)}x`,
      encodePendingAudience("other", now, `${SECRET}-other`),
      `${forged}.${encodePendingAudience("other", now, SECRET).split(".")[1]}`,
      encodePendingAudience("other", now - 30 * 60 - 5, SECRET),
      encodePendingAudience("other", now + 3600, SECRET),
      "not-a-cookie",
    ]) {
      jar.set(PENDING_AUDIENCE_COOKIE, value);
      expect(await persistPendingAudienceForViewer()).toBe("none");
      expect(jar.has(PENDING_AUDIENCE_COOKIE)).toBe(false);
    }
    expect(query).not.toHaveBeenCalled();
  });
});
