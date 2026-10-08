/** Server-only persistence for the account-level audience classification. */

import { isAudienceRole, type AudienceRole } from "@/lib/onboarding/audience";
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
 * Attach a role to the account that the server already authenticated.
 * There is deliberately no account-id parameter in a form or cookie.
 */
export async function persistAudienceForAccount(
  accountId: string,
  role: AudienceRole,
): Promise<"stored" | "unavailable"> {
  try {
    // Inside the guard: resolving the URL reads the environment and can throw, and
    // optional analytics must never fail a sign-in that has already succeeded.
    const databaseUrl = resolveTokenDatabaseUrl();
    if (!databaseUrl) return "unavailable";
    const sql = await tokenSqlExecutor(databaseUrl);
    const result = await upsertAccountAudience(sql, accountId, role);
    return result === "stored" ? "stored" : "unavailable";
  } catch (error) {
    const detail = error instanceof Error ? error.name : "unknown";
    console.error(`audience onboarding: persistence failed (${detail})`);
    return "unavailable";
  }
}

/**
 * Consume the pre-auth audience choice, at most once, after authentication.
 *
 * The cookie is cleared before the account is resolved or anything is written,
 * whatever it held and whatever happens next. The choice is optional analytics:
 * losing it to a transient database failure is acceptable, while leaving it in
 * the browser for whichever account signs in next would attribute one person's
 * answer to another. Identity is resolved afresh; callers never provide an id.
 */
export async function persistPendingAudienceForViewer(): Promise<"anonymous" | "none" | "stored" | "unavailable"> {
  const role = await readPendingAudience();
  await forgetPendingAudience();
  if (!role) return "none";

  const viewer = await resolveViewer();
  if (viewer.authentication.kind !== "authenticated") return "anonymous";
  return persistAudienceForAccount(viewer.authentication.accountId, role);
}
