/** Server-only persistence for the account-level audience classification. */

import { isAudienceRole } from "@/lib/onboarding/audience";
import { resolveViewer } from "@/lib/access/server";
import { forgetPendingAudience, readPendingAudience } from "@/lib/onboarding/pending-audience";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

export const UPSERT_ACCOUNT_AUDIENCE_SQL = `
  insert into identity.account_audience_profiles (account_id, primary_role)
       values ($1, $2)
  on conflict (account_id) do update
          set primary_role = excluded.primary_role
`;

export async function upsertAccountAudience(
  sql: TokenSqlExecutor,
  accountId: string,
  role: unknown,
): Promise<"stored" | "rejected"> {
  if (!isAudienceRole(role)) return "rejected";
  await sql.query(UPSERT_ACCOUNT_AUDIENCE_SQL, [accountId, role]);
  return "stored";
}

/**
 * Attach pending state to the account that the server already authenticated.
 * There is deliberately no account-id parameter in a form or cookie.
 */
export async function persistPendingAudienceForAccount(accountId: string): Promise<"none" | "stored" | "unavailable"> {
  const role = await readPendingAudience();
  if (!role) return "none";

  const databaseUrl = resolveTokenDatabaseUrl();
  if (!databaseUrl) return "unavailable";

  try {
    const sql = await tokenSqlExecutor(databaseUrl);
    const result = await upsertAccountAudience(sql, accountId, role);
    if (result !== "stored") return "unavailable";
    await forgetPendingAudience();
    return "stored";
  } catch (error) {
    const detail = error instanceof Error ? error.name : "unknown";
    console.error(`audience onboarding: persistence failed (${detail})`);
    return "unavailable";
  }
}

/** Resolve identity afresh after authentication; callers never provide an id. */
export async function persistPendingAudienceForViewer(): Promise<"anonymous" | "none" | "stored" | "unavailable"> {
  const viewer = await resolveViewer();
  if (viewer.authentication.kind !== "authenticated") return "anonymous";
  return persistPendingAudienceForAccount(viewer.authentication.accountId);
}
