import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieNames = vi.hoisted(() => ({ value: [] as string[] }));
const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const readUrdaisAccountId = vi.hoisted(() => vi.fn());
const resolveUrdaisAccount = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => cookieNames.value.map((name) => ({ name, value: "x" })) }) }));
vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/auth/accounts", () => ({ readUrdaisAccountId, resolveUrdaisAccount }));
vi.mock("@/lib/tokens/read/database", () => ({ resolveTokenDatabaseUrl: () => "postgresql://test", tokenSqlExecutor: async () => ({}) }));

import { GET } from "@/app/api/analytics/identity/route";

const body = async () => (await GET()).json();

beforeEach(() => {
  cookieNames.value = [];
  resolveSupabaseIdentity.mockReset();
  readUrdaisAccountId.mockReset();
  resolveUrdaisAccount.mockReset();
});

describe("GET /api/analytics/identity", () => {
  it("answers null without a session cookie, and asks Supabase nothing", async () => {
    expect(await body()).toEqual({ accountId: null });
    expect(resolveSupabaseIdentity).not.toHaveBeenCalled();
  });

  it("answers the session's existing account id, never provisioning one", async () => {
    cookieNames.value = ["sb-ref-auth-token"];
    resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "sub_1", email: "a@example.invalid", emailVerified: true } });
    readUrdaisAccountId.mockResolvedValue("acct_1");
    expect(await body()).toEqual({ accountId: "acct_1" });
    expect(readUrdaisAccountId).toHaveBeenCalledWith(expect.anything(), "sub_1");
    expect(resolveUrdaisAccount).not.toHaveBeenCalled();
  });

  it("answers null for an ended session, a deleted account, or any failure", async () => {
    cookieNames.value = ["sb-ref-auth-token.0"];
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous" });
    expect(await body()).toEqual({ accountId: null });
    resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "sub_gone" } });
    readUrdaisAccountId.mockResolvedValue(null);
    expect(await body()).toEqual({ accountId: null });
    readUrdaisAccountId.mockRejectedValue(new Error("db"));
    expect(await body()).toEqual({ accountId: null });
  });

  it("is never cached", async () => {
    expect((await GET()).headers.get("cache-control")).toBe("private, no-store");
  });
});
