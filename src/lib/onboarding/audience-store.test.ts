import { describe, expect, it, vi } from "vitest";

import { AUDIENCE_ROLES } from "@/lib/onboarding/audience";
import { upsertAccountAudience } from "@/lib/onboarding/audience-store";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

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

